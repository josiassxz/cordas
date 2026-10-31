// Sessão de ritmo: metrônomo com contagem, grade de colcheias e avaliação de cada palhetada.
const WINDOW = { perfect: 55, good: 110 };

export class RhythmSession {
  constructor(o) {
    this.audio = o.audio;
    this.bpm = o.bpm;
    this.pattern = [...o.pattern]; // 8 caracteres: D U -
    this.bars = o.bars;
    this.chords = o.chords || null; // acordes por compasso (opcional)
    this.latency = o.latency || 0; // ms de atraso do BLE a compensar
    this.guide = !!o.guide;
    this.on = o.on || {};
    this.slotDur = 60 / this.bpm / 2;
    this.countSlots = 8;
    this.total = this.bars * 8;
    this.results = new Map(); // slot -> { grade, delta, dirOk }
    this.extras = 0;
    this.barChord = new Map();
    this.nextToSchedule = -this.countSlots;
    this.lastSlot = -Infinity;
    this.finished = false;
  }

  slotTime(slot) { return this.base + (slot + this.countSlots) * this.slotDur; }

  start() {
    const ctx = this.audio.context;
    this.base = ctx.currentTime + 0.25;
    this.audio0 = ctx.currentTime;
    this.perf0 = performance.now();
    this.sched = setInterval(() => this.schedule(), 25);
    this.raf = requestAnimationFrame(() => this.tick());
  }

  stop(silent) {
    clearInterval(this.sched);
    cancelAnimationFrame(this.raf);
    this.finished = true;
    if (!silent) this.on.stopped?.();
  }

  schedule() {
    const ctx = this.audio.context;
    while (this.nextToSchedule < this.total && this.slotTime(this.nextToSchedule) < ctx.currentTime + 0.15) {
      const slot = this.nextToSchedule++, t = this.slotTime(slot);
      const inBar = ((slot % 8) + 8) % 8;
      if (inBar % 2 === 0) this.audio.click(t, inBar === 0);
      if (this.guide && slot >= 0 && this.pattern[inBar] !== '-') {
        const chord = this.chords?.[Math.floor(slot / 8) % this.chords.length];
        if (chord) this.audio.strum(chord.notes, t, this.pattern[inBar], 0.22);
      }
    }
  }

  tick() {
    if (this.finished) return;
    const ctx = this.audio.context, now = ctx.currentTime;
    const slot = Math.floor((now - this.base) / this.slotDur) - this.countSlots;
    if (slot !== this.lastSlot) { this.lastSlot = slot; this.on.slot?.(slot); }
    // marca como perdidas as batidas esperadas que já passaram da janela
    const limit = Math.min(0.2, this.slotDur * 0.9);
    for (let s = 0; s < this.total; s++) {
      if (this.pattern[s % 8] === '-' || this.results.has(s)) continue;
      if (now > this.slotTime(s) + limit) { this.results.set(s, { grade: 'miss' }); this.on.result?.({ slot: s, grade: 'miss' }); }
    }
    if (now > this.slotTime(this.total) + 0.2) return this.finish();
    this.raf = requestAnimationFrame(() => this.tick());
  }

  // perfT: performance.now() do início da palhetada
  onset(perfT, dir) {
    if (this.finished) return null;
    const audioT = this.audio0 + (perfT - this.perf0) / 1000 - this.latency / 1000;
    const slotF = (audioT - this.base) / this.slotDur - this.countSlots;
    const slot = Math.round(slotF);
    if (slot < 0 || slot >= this.total) return null;
    const delta = (slotF - slot) * this.slotDur * 1000; // ms; negativo = adiantado
    const win = Math.min(200, this.slotDur * 1000 * 0.9);
    const expected = this.pattern[slot % 8];
    if (Math.abs(delta) > win) return null;
    if (expected === '-') { this.extras++; const r = { slot, grade: 'extra', delta }; this.on.result?.(r); return r; }
    const prev = this.results.get(slot);
    if (prev && prev.grade !== 'miss') return null;
    const a = Math.abs(delta);
    const grade = a <= WINDOW.perfect ? 'perfect' : a <= WINDOW.good ? 'good' : 'ok';
    const dirOk = dir === 'S' ? null : dir === expected;
    const r = { slot, grade, delta, dirOk };
    this.results.set(slot, r);
    this.on.result?.(r);
    return r;
  }

  barOf(perfT) {
    const audioT = this.audio0 + (perfT - this.perf0) / 1000 - this.latency / 1000;
    return Math.floor(((audioT - this.base) / this.slotDur - this.countSlots + 0.5) / 8);
  }

  noteChord(bar, ok) {
    if (bar < 0 || bar >= this.bars) return;
    this.barChord.set(bar, this.barChord.get(bar) || ok);
    this.on.chord?.({ bar, ok });
  }

  finish() {
    if (this.finished && this.summary) return;
    this.stop(true);
    const rs = [...this.results.values()];
    const count = (g) => rs.filter((r) => r.grade === g).length;
    const expected = rs.length;
    const hits = rs.filter((r) => r.grade !== 'miss');
    const weights = { perfect: 1, good: 0.75, ok: 0.45, miss: 0 };
    const score = expected ? rs.reduce((a, r) => a + (weights[r.grade] ?? 0), 0) / expected : 0;
    const dirs = hits.filter((r) => r.dirOk !== null && r.dirOk !== undefined);
    this.summary = {
      accuracy: Math.round(score * 100),
      perfect: count('perfect'), good: count('good'), ok: count('ok'), miss: count('miss'),
      extras: this.extras, expected,
      meanDelta: hits.length ? hits.reduce((a, r) => a + r.delta, 0) / hits.length : 0,
      dirAccuracy: dirs.length ? Math.round((dirs.filter((r) => r.dirOk).length / dirs.length) * 100) : null,
      chordOk: [...this.barChord.values()].filter(Boolean).length,
      chordTotal: this.chords ? this.bars : 0,
    };
    this.on.finish?.(this.summary);
  }
}
