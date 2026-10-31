// Transport: relógio musical pausável. Única fonte de verdade de tempo para exercícios, ritmo e metrônomo.
//
// Modelo: posição em BATIDAS (beats). Negativa durante a contagem. Enquanto "running",
//   posição = pos0 + (tempoAudio - t0) * bpmEfetivo / 60.   Ao pausar, pos0 congela e o relógio para.
// Estados: stopped -> running <-> paused. Eventos: 'tick' {beat,time,isBeat,isBar,countIn}, 'state', 'tempo'.
// Pausa também silencia o clique já agendado (via ganho próprio), então nada toca "por inércia".

// REGRA ÚNICA DE RELÓGIO (vale para o app inteiro, em qualquer tela):
//   pausar   -> todos os relógios são pausados (silêncio total)
//   iniciar / continuar / reiniciar -> todos os OUTROS são pausados; só o deste exercício toca
//   parar    -> todos são encerrados
// LIVE = tocando agora; OPEN = tocando ou pausado (ainda não encerrado).
const LIVE = new Set(), OPEN = new Set();

export class Transport extends EventTarget {
  static pauseAll(except = null) { for (const t of [...LIVE]) if (t !== except && !t.exempt) t.pause(); }   // exempt: relógio de uma ferramenta aberta de propósito (ex.: calibração), que toca mesmo com o exercício pausado
  static stopAll(except = null) { for (const t of [...OPEN]) if (t !== except) t.stop(); }
  static get liveCount() { return LIVE.size; }
  static live() { return [...LIVE].map((t) => ({ bpm: t.bpm, state: t.state, origem: t.origin })); }   // diagnóstico: quem criou cada relógio vivo
  constructor(audio, o = {}) {
    super();
    this.audio = audio;
    this.bpm = o.bpm ?? 80;
    this.speed = o.speed ?? 1;            // 0.25..2 (prática em velocidade reduzida)
    this.beatsPerBar = o.beatsPerBar ?? 4;
    this.subdivision = o.subdivision ?? 2; // ticks por batida (2 = colcheias)
    this.click = o.click ?? true;
    this.latencyMs = o.latencyMs ?? 0;     // atraso do BLE a compensar na avaliação
    this.lookahead = 0.2;   // folga maior: aguenta o navegador ocupado (canvas, GC) sem falhar/atrasar cliques
    this.clock = o.clock || (() => this.audio.context.currentTime);
    this.silent = !!o.silent;              // testes: sem áudio
    this.state = 'stopped';
    this.subClick = !!o.subClick;          // clique suave nas subdivisões
    this.volume = o.volume ?? 1;
    this.pos0 = 0; this.t0 = 0; this.nextTick = 0; this.timer = null; this.out = null; this.guideOut = null;
    this.origin = (new Error().stack || '').split('\n').slice(2, 6).map((l) => l.trim().replace(/https?:\/\/[^/]+/, '')).join(' < ');   // quem criou este relógio (para achar metrônomo fantasma)
    this.sched = [];   // cliques já agendados (cancelável quando o andamento muda)
  }

  get effectiveBpm() { return this.bpm * this.speed; }
  get running() { return this.state === 'running'; }
  now() { return this.clock(); }
  timeOf(beat) { return this.t0 + (beat - this.pos0) * 60 / this.effectiveBpm; }
  position(at = this.now()) { return this.running ? this.pos0 + (at - this.t0) * this.effectiveBpm / 60 : this.pos0; }
  get bar() { return Math.floor(this.position() / this.beatsPerBar); }

  setState(s) { this.state = s; if (s === 'running') LIVE.add(this); else LIVE.delete(this); if (s === 'stopped') OPEN.delete(this); else OPEN.add(this); this.dispatchEvent(new CustomEvent('state', { detail: { state: s } })); }

  start({ countInBeats = this.beatsPerBar, after = 0, at = null } = {}) {
    Transport.pauseAll(this);   // só este relógio toca
    this.pos0 = at ?? -countInBeats;   // `at`: recomeça já nesta posição (recuperação do relógio)
    this.t0 = Math.max(this.now() + 0.12, Math.min(after || 0, this.now() + 1.6));   // `after`: mantém o pulso do clique anterior (sem 2º metrônomo fora de fase)
    this.nextTick = Math.ceil(this.pos0 * this.subdivision - 1e-9) / this.subdivision;
    this.makeBus();
    this.setState('running');
    clearInterval(this.timer); this.timer = setInterval(() => this.pump(), 25);
    this.pump();
  }

  pause() {
    if (!this.running) { Transport.pauseAll(); return; }   // mesmo que este já esteja parado, nada mais pode continuar tocando
    this.pos0 = this.position();
    clearInterval(this.timer); this.timer = null;
    this.dropBus();
    this.setState('paused');
    Transport.pauseAll();
  }

  resume() {
    if (this.state !== 'paused') return;
    Transport.pauseAll(this);
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

  // Instante do próximo clique se o pulso continuasse (para reiniciar sem quebrar o compasso do metrônomo)
  // = o primeiro clique de tempo que AINDA NÃO soou (ele é cancelado ao parar), senão o seguinte ao último que soou
  continuation() {
    if (!this.running || !this.lastBeatTime) return 0;
    const now = this.now(), pending = (this.beatTimes || []).find((t) => t > now);
    return pending ?? this.lastBeatTime + 60 / this.effectiveBpm;
  }
  restart(opts) { const after = this.continuation(); this.stop(); this.start({ ...opts, after }); }

  // Muda compasso/subdivisão sem parar: o próximo clique já segue a nova grade.
  setMeter({ beats, sub } = {}) {
    if (beats) this.beatsPerBar = beats;
    if (sub) this.subdivision = sub;
    if (this.running) { this.cancelFuture(); this.nextTick = Math.ceil(this.position() * this.subdivision + 1e-4) / this.subdivision; }
    this.dispatchEvent(new CustomEvent('tempo', { detail: { bpm: this.bpm, speed: this.speed } }));
  }
  // Muda tempo sem perder a posição.
  rebase(fn) {
    const wasRunning = this.running, p = this.position();
    fn();
    if (wasRunning) { this.pos0 = p; this.t0 = this.now(); this.cancelFuture(); this.nextTick = Math.ceil(p * this.subdivision + 1e-4) / this.subdivision; }
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
      if (isBeat) { this.lastBeatTime = time; (this.beatTimes ||= []).push(time); if (this.beatTimes.length > 8) this.beatTimes.shift(); }
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
  // Clique: o tempo FORTE (1º do compasso) é bem mais alto, mais agudo e mais longo; os demais são curtos e suaves; subdivisão é bem baixinha.
  blip(time, accent, soft = false) {
    const ctx = this.audio.context, o = ctx.createOscillator(), g = ctx.createGain();
    const peak = soft ? 0.12 : accent ? 0.9 : 0.3, len = accent ? 0.09 : soft ? 0.03 : 0.045;
    o.type = accent ? 'triangle' : 'sine';
    o.frequency.value = accent ? 1568 : soft ? 988 : 1047;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + len);
    o.connect(g).connect(this.out);
    o.start(time); o.stop(time + len + 0.02);
    const now = ctx.currentTime; this.sched = this.sched.filter((e) => e.time > now - 0.2); this.sched.push({ time, o, g });
  }
  // Cancela os cliques que ainda NÃO soaram (usado ao mudar BPM/velocidade/compasso): senão eles tocariam no andamento antigo.
  cancelFuture() {
    const now = this.audio?.context?.currentTime ?? 0;
    for (const e of this.sched) if (e.time > now) { try { e.o.stop(); e.o.disconnect(); e.g.disconnect(); } catch { /* já terminou */ } }
    this.sched = this.sched.filter((e) => e.time <= now);
  }
}
