// Player de música: HTMLAudioElement (preservesPitch => velocidade sem mudar o tom), loop A–B,
// metrônomo e acompanhamento de acordes sincronizados ao tempo da música. Tudo respeita pausa, busca e velocidade.
import { chordAt, loopJump, normalizeLoop } from './timeline.js';
import { voicingNotes } from './chordnames.js';

export const RATE_MIN = 0.5, RATE_MAX = 1.5;
const LOOKAHEAD = 0.14; // s de música à frente

export class SongPlayer extends EventTarget {
  // app: contexto; song: metadados (referência viva, pode ser atualizada via player.song = ...); blob: áudio
  constructor(app, song, blob, { chordLookup = () => null } = {}) {
    super();
    this.app = app; this.song = song; this.chordLookup = chordLookup;
    this.url = URL.createObjectURL(blob);
    this.el = new Audio(this.url);
    this.el.preload = 'auto'; this.el.preservesPitch = true; this.el.webkitPreservesPitch = true;
    this.mixer = { music: { vol: 0.9, mute: false }, metro: { vol: 0.6, mute: true }, chords: { vol: 0.6, mute: true } };
    this.loop = song.loop ? { ...song.loop } : { a: 0, b: 0, enabled: false };
    this.timers = new Set(); this.lastBeat = -1; this.lastSym = null; this.metroOut = null;
    this.el.addEventListener('ended', () => { this.stopSched(); this.emit('state'); });
    this.el.addEventListener('loadedmetadata', () => this.emit('ready'));
    this.applyMix();
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  get playing() { return !this.el.paused && !this.el.ended; }
  get time() { return this.el.currentTime; }
  get duration() { return this.el.duration || this.song.duration || 0; }
  get rate() { return this.el.playbackRate; }

  // ---- transporte ----
  async play() {
    if (this.el.ended) this.el.currentTime = this.loop.enabled ? this.loop.a : 0;
    await this.el.play(); this.startSched(); this.loopRaf(); this.emit('state');
  }
  pause() { this.el.pause(); this.stopSched(); this.emit('state'); }   // pausa tudo: música, clique e acordes
  toggle() { return this.playing ? this.pause() : this.play(); }
  seek(t) { this.el.currentTime = Math.max(0, Math.min(this.duration, t)); this.resetSched(); this.emit('time', { t: this.el.currentTime }); }
  skip(dt) { this.seek(this.time + dt); }
  restart() { this.seek(this.loop.enabled ? this.loop.a : 0); }
  setRate(r) { this.el.playbackRate = Math.max(RATE_MIN, Math.min(RATE_MAX, r)); this.el.preservesPitch = true; this.resetSched(); this.emit('state'); }

  // ---- loop A–B ----
  setLoop(a, b, enabled = true) { const n = normalizeLoop(a, b, this.duration); this.loop = { ...n, enabled }; this.emit('loop', this.loop); }
  toggleLoop() { if (this.loop.b > this.loop.a) { this.loop = { ...this.loop, enabled: !this.loop.enabled }; this.emit('loop', this.loop); } }
  clearLoop() { this.loop = { a: 0, b: 0, enabled: false }; this.emit('loop', this.loop); }

  loopRaf() {
    cancelAnimationFrame(this.raf);
    const step = () => {
      if (!this.playing) { this.emit('time', { t: this.time }); return; }
      const j = loopJump(this.time, this.loop);
      if (j !== null) this.seek(j); else this.emit('time', { t: this.time });
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  // ---- mixer (só trilhas reais) ----
  setTrack(name, patch) { Object.assign(this.mixer[name], patch); this.applyMix(); if (name !== 'music') this.resetSched(); this.emit('mix'); }
  applyMix() {
    const m = this.mixer.music; this.el.volume = m.mute ? 0 : m.vol;
    if (this.metroOut) this.metroOut.gain.value = this.mixer.metro.mute ? 0 : this.mixer.metro.vol;
  }

  // ---- agendamento sincronizado ----
  startSched() {
    const ctx = this.app.audio.context;
    if (!this.metroOut) { this.metroOut = ctx.createGain(); this.metroOut.connect(this.app.audio.master); }
    this.applyMix(); this.resetSched();
    clearInterval(this.sched); this.sched = setInterval(() => this.pump(), 25);
  }
  stopSched() {
    clearInterval(this.sched); this.sched = null;
    this.timers.forEach(clearTimeout); this.timers.clear();
    if (this.metroOut) { const t = this.app.audio.context.currentTime; this.metroOut.gain.cancelScheduledValues(t); this.metroOut.gain.setValueAtTime(0, t); }
    cancelAnimationFrame(this.raf);
  }
  resetSched() {
    this.timers.forEach(clearTimeout); this.timers.clear(); this.lastSym = null;
    const bpm = this.song.bpm?.value, off = this.song.bpm?.offset || 0;
    this.lastBeat = bpm ? Math.floor((this.time - off) * bpm / 60 - 1e-6) : -1;
    if (this.metroOut) { const t = this.app.audio.context.currentTime; this.metroOut.gain.cancelScheduledValues(t); this.metroOut.gain.setValueAtTime(this.mixer.metro.mute ? 0 : this.mixer.metro.vol, t); }
  }

  pump() {
    const bpm = this.song.bpm?.value; if (!bpm || !this.playing) return;
    const off = this.song.bpm.offset || 0, beat = 60 / bpm, now = this.time, ctx = this.app.audio.context, rate = this.rate;
    const horizon = now + LOOKAHEAD * rate;
    for (let k = this.lastBeat + 1; off + k * beat <= horizon; k++) {
      const bt = off + k * beat; this.lastBeat = k;
      if (bt < now - 0.02) continue;
      if (this.loop.enabled && bt >= this.loop.b) continue;                 // não toca além do fim do loop
      const dtAudio = Math.max(0, (bt - now) / rate), acTime = ctx.currentTime + dtAudio;
      if (!this.mixer.metro.mute) this.click(acTime, k % 4 === 0);
      if (!this.mixer.chords.mute) this.accompany(bt, k, dtAudio);
    }
  }
  click(time, accent) {
    const ctx = this.app.audio.context, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1175;
    g.gain.setValueAtTime(0.0001, time); g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, time + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    o.connect(g).connect(this.metroOut); o.start(time); o.stop(time + 0.06);
  }
  // acordes: em cada troca e a cada 2 batidas; por timer cancelável (pausa nunca "toca por inércia")
  accompany(bt, k, delaySec) {
    const { chord } = chordAt(this.song.chords || [], bt + 0.03);
    if (!chord?.symbol) { this.lastSym = null; return; }
    if (chord.symbol === this.lastSym && k % 2 !== 0) return;
    const accent = chord.symbol !== this.lastSym; this.lastSym = chord.symbol;
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (!this.playing) return;
      const notes = this.chordLookup(chord.symbol)?.notes || voicingNotes(chord.symbol);
      this.app.audio.strum(notes, this.app.audio.context.currentTime, 'D', (accent ? 0.34 : 0.22) * this.mixer.chords.vol);
    }, Math.max(0, delaySec * 1000 - 4));
    this.timers.add(id);
  }

  dispose() { this.pause(); this.el.removeAttribute('src'); this.el.load(); URL.revokeObjectURL(this.url); }
}
