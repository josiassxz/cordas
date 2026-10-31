// Transport: relógio musical pausável. Única fonte de verdade de tempo para exercícios, ritmo e metrônomo.
//
// Modelo: posição em BATIDAS (beats). Negativa durante a contagem. Enquanto "running",
//   posição = pos0 + (tempoAudio - t0) * bpmEfetivo / 60.   Ao pausar, pos0 congela e o relógio para.
// Estados: stopped -> running <-> paused. Eventos: 'tick' {beat,time,isBeat,isBar,countIn}, 'state', 'tempo'.
// Pausa também silencia o clique já agendado (via ganho próprio), então nada toca "por inércia".

export class Transport extends EventTarget {
  constructor(audio, o = {}) {
    super();
    this.audio = audio;
    this.bpm = o.bpm ?? 80;
    this.speed = o.speed ?? 1;            // 0.25..2 (prática em velocidade reduzida)
    this.beatsPerBar = o.beatsPerBar ?? 4;
    this.subdivision = o.subdivision ?? 2; // ticks por batida (2 = colcheias)
    this.click = o.click ?? true;
    this.latencyMs = o.latencyMs ?? 0;     // atraso do BLE a compensar na avaliação
    this.lookahead = 0.12;
    this.clock = o.clock || (() => this.audio.context.currentTime);
    this.silent = !!o.silent;              // testes: sem áudio
    this.state = 'stopped';
    this.subClick = !!o.subClick;          // clique suave nas subdivisões
    this.volume = o.volume ?? 1;
    this.pos0 = 0; this.t0 = 0; this.nextTick = 0; this.timer = null; this.out = null; this.guideOut = null;
  }

  get effectiveBpm() { return this.bpm * this.speed; }
  get running() { return this.state === 'running'; }
  now() { return this.clock(); }
  timeOf(beat) { return this.t0 + (beat - this.pos0) * 60 / this.effectiveBpm; }
  position(at = this.now()) { return this.running ? this.pos0 + (at - this.t0) * this.effectiveBpm / 60 : this.pos0; }
  get bar() { return Math.floor(this.position() / this.beatsPerBar); }

  setState(s) { this.state = s; this.dispatchEvent(new CustomEvent('state', { detail: { state: s } })); }

  start({ countInBeats = this.beatsPerBar } = {}) {
    this.pos0 = -countInBeats;
    this.t0 = this.now() + 0.12;
    this.nextTick = Math.ceil(this.pos0 * this.subdivision - 1e-9) / this.subdivision;
    this.makeBus();
    this.setState('running');
    this.timer = setInterval(() => this.pump(), 25);
    this.pump();
  }

  pause() {
    if (!this.running) return;
    this.pos0 = this.position();
    clearInterval(this.timer); this.timer = null;
    this.dropBus();
    this.setState('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.t0 = this.now() + 0.08;
    this.nextTick = Math.ceil(this.pos0 * this.subdivision - 1e-9) / this.subdivision;
    this.makeBus();
    this.setState('running');
    this.timer = setInterval(() => this.pump(), 25);
  }

  toggle() { if (this.running) this.pause(); else if (this.state === 'paused') this.resume(); }

  stop() {
    clearInterval(this.timer); this.timer = null;
    this.dropBus();
    this.pos0 = 0;
    this.setState('stopped');
  }

  restart(opts) { this.stop(); this.start(opts); }

  // Muda tempo sem perder a posição.
  rebase(fn) {
    const wasRunning = this.running, p = this.position();
    fn();
    if (wasRunning) { this.pos0 = p; this.t0 = this.now(); }
    this.dispatchEvent(new CustomEvent('tempo', { detail: { bpm: this.bpm, speed: this.speed } }));
  }
  setBpm(v) { this.rebase(() => { this.bpm = Math.max(20, Math.min(300, v)); }); }
  setSpeed(v) { this.rebase(() => { this.speed = Math.max(0.25, Math.min(2, v)); }); }

  // Converte o instante de um evento do dispositivo (performance.now) em posição em batidas.
  beatAtPerf(perfT) {
    if (!this.running) return null;
    const at = this.now() - (performance.now() - perfT) / 1000 - this.latencyMs / 1000;
    return this.position(at);
  }

  pump() {
    if (!this.running) return;
    const limit = this.now() + this.lookahead;
    for (let guard = 0; guard < 64 && this.timeOf(this.nextTick) < limit; guard++) {
      const beat = this.nextTick, time = this.timeOf(beat);
      const isBeat = Math.abs(beat - Math.round(beat)) < 1e-9;
      const isBar = isBeat && ((Math.round(beat) % this.beatsPerBar) + this.beatsPerBar) % this.beatsPerBar === 0;
      this.dispatchEvent(new CustomEvent('tick', { detail: { beat, time, isBeat, isBar, countIn: beat < 0 } }));
      if (!this.silent && this.out) {
        if (this.click && isBeat) this.blip(time, isBar);
        else if (this.click && this.subClick) this.blip(time, false, true);
      }
      this.nextTick += 1 / this.subdivision;
    }
  }

  // ---- barramentos próprios: a cada início/retomada nasce um novo; ao pausar/parar o antigo é DESLIGADO
  // da saída, então nenhum clique nem nota-guia já agendados chega a soar (nada toca "por inércia").
  makeBus() {
    this.dropBus();
    if (this.silent) return;
    const ctx = this.audio.context;
    this.out = ctx.createGain(); this.out.gain.value = this.volume; this.out.connect(this.audio.master);
    this.guideOut = ctx.createGain(); this.guideOut.connect(this.audio.instrumentBus || this.audio.master);
  }
  dropBus() {
    for (const k of ['out', 'guideOut']) { const g = this[k]; if (!g) continue; try { g.gain.cancelScheduledValues(0); g.gain.value = 0; g.disconnect(); } catch { /* já solto */ } this[k] = null; }
  }
  setVolume(v) { this.volume = Math.max(0, Math.min(1.5, v)); if (this.out) this.out.gain.value = this.volume; }
  blip(time, accent, soft = false) {
    const ctx = this.audio.context, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1175;
    const peak = soft ? 0.14 : accent ? 0.5 : 0.3;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    o.connect(g).connect(this.out);
    o.start(time); o.stop(time + 0.06);
  }
}
