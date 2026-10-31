// Motor de áudio do Corda.
//   vozes (Karplus-Strong) -> instrumentBus -> CADEIA DE EFEITOS -> master (volume) -> limitador -> saída
//   clique do metrônomo/Transport -> master (FORA dos efeitos, para ficar sempre limpo)
// API estável usada pelo app: context, master, volume, click, pluck, strum. Novos: preset, setPreset, tempo, level, A/B.
import { midiToHz } from '../music/theory.js';
import { karplusStrong, peakOf } from './dsp.js';
import { BUILTIN_BY_ID, validatePreset, voiceParams, voiceKey, getPreset } from './presets.js';
import { createChain } from './chain.js';

const VOICE_SECONDS = 2.2, CACHE_MAX = 400;

export class AudioEngine {
  // opts.context: injeta um BaseAudioContext (testes com OfflineAudioContext)
  constructor(opts = {}) {
    this.ctx = opts.context || null;
    this.cache = new Map();
    this._volume = 0.8;
    this._tempo = 100;
    this.preset = BUILTIN_BY_ID['b:steel'];
    this.ab = { a: null, b: null, active: 'a' };
    this.store = null;
    this.hydrated = false;
    this.graph = null;
  }

  // ---------- grafo ----------
  get context() {
    if (!this.ctx) this.ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)({ latencyHint: 'interactive' });
    if (!this.graph) this.build();
    if (this.ctx.state === 'suspended' && typeof this.ctx.startRendering !== 'function') this.ctx.resume?.().catch?.(() => {});   // contextos offline não retomam
    return this.ctx;
  }

  build() {
    const ctx = this.ctx;
    this.hydrate();
    this.master = ctx.createGain(); this.master.gain.value = this._volume;
    this.limiter = ctx.createDynamicsCompressor();
    Object.assign(this.limiter.threshold, { value: -3 }); this.limiter.knee.value = 0; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.1;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 1024;
    this.master.connect(this.limiter).connect(ctx.destination);
    this.master.connect(this.analyser);
    this.instrumentBus = ctx.createGain();
    this.chain = createChain(ctx, this.preset, this._tempo);
    this.instrumentBus.connect(this.chain.input);
    this.chain.output.connect(this.master);
    this.graph = true;
  }

  // ---------- volume e andamento ----------
  get volume() { return this._volume; }
  set volume(v) {
    this._volume = Math.min(1, Math.max(0, v));
    if (this.master) this.master.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.02);
  }
  get tempo() { return this._tempo; }
  set tempo(bpm) { this._tempo = bpm; if (this.chain && this.preset.delay.sync) this.chain.update(this.preset, bpm); }   // delay sincronizado

  // Nível de pico (0..1) do que está saindo, para medidores.
  level() {
    if (!this.analyser) return 0;
    const a = new Float32Array(this.analyser.fftSize); this.analyser.getFloatTimeDomainData(a);
    return Math.min(1, peakOf(a));
  }

  // ---------- timbre ----------
  setPreset(p) {
    const v = validatePreset(p).preset;
    this.preset = v;
    if (this.chain) this.chain.update(v, this._tempo);
    if (this.store) { this.store.set('tones.current', v.id); this.store.set('tones.working', v); }
    return v;
  }
  // Comparação A/B: troca instantânea entre dois presets.
  setAB(a, b) { this.ab = { a, b, active: 'a' }; return this.setPreset(a); }
  toggleAB() { if (!this.ab.a || !this.ab.b) return null; this.ab.active = this.ab.active === 'a' ? 'b' : 'a'; return this.setPreset(this.ab[this.ab.active]); }

  bindStore(store) {
    this.store = store; this.hydrated = false; this.hydrate();
    if (this.chain) this.chain.update(this.preset, this._tempo);
    store.addEventListener?.('change', (e) => { if (e.detail.path === 'settings.volume') this.volume = store.get('settings.volume', 0.8); });
    this.volume = store.get('settings.volume', this._volume);
  }
  // Carrega o timbre salvo. Sem store ligado, lê o localStorage direto (somente leitura), para o som já sair com o timbre escolhido.
  hydrate() {
    if (this.hydrated) return; this.hydrated = true;
    try {
      let data = null;
      if (this.store) data = { tones: this.store.get('tones', {}) };
      else if (globalThis.localStorage) data = JSON.parse(globalThis.localStorage.getItem('corda.v2') || 'null');
      const t = data?.tones; if (!t) return;
      const found = t.working ? validatePreset(t.working).preset : (t.current && (BUILTIN_BY_ID[t.current] || (t.presets || []).find((p) => p.id === t.current)));
      if (found) this.preset = validatePreset(found).preset;
    } catch { /* dados antigos/corrompidos: segue com o padrão */ }
  }

  // ---------- sons ----------
  click(time, accent = false, soft = false) {
    const ctx = this.context;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1175;
    const peak = soft ? 0.12 : accent ? 0.55 : 0.34;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    o.connect(g).connect(this.master);                          // direto no master: sem efeitos
    o.start(time); o.stop(time + 0.06);
  }

  voiceBuffer(midi) {
    const ctx = this.context, key = `${midi}|${voiceKey(this.preset.voice)}`;
    let b = this.cache.get(key);
    if (b) return b;
    const data = karplusStrong(ctx.sampleRate, midiToHz(midi), VOICE_SECONDS, { ...voiceParams(this.preset.voice), seed: midi * 31 });
    b = ctx.createBuffer(1, data.length, ctx.sampleRate); b.getChannelData(0).set(data);
    if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, b);
    return b;
  }

  pluck(midi, time = this.context.currentTime, gain = 0.5, dest = this.instrumentBus) {
    const ctx = this.context, s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = this.voiceBuffer(midi); g.gain.value = gain;
    s.connect(g).connect(dest || this.instrumentBus);
    s.start(time);
  }

  // Palhetada: dir 'D' (grave→agudo) ou 'U'.
  strum(notes, time = this.context.currentTime, dir = 'D', gain = 0.32, spread = 0.022, dest) {
    const list = dir === 'U' ? [...notes].reverse() : notes;
    list.forEach((n, i) => this.pluck(n, time + i * spread, gain, dest));
  }

  // Preset por id (fábrica ou do usuário) — atalho para telas.
  usePresetId(id) { const p = this.store ? getPreset(this.store, id) : BUILTIN_BY_ID[id]; return p ? this.setPreset(p) : null; }
}
export { AudioEngine as Audio };
