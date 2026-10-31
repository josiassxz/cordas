// Avaliador puro: compara notas recebidas do dispositivo (corda, nota, posição em batidas) com o Score.
// Sem DOM, sem relógio: o chamador informa a posição `beat` de cada nota (Transport.beatAtPerf).
import { STANDARD, matchChord } from '../music/theory.js';
import { expectedStrings, expectedPitch, isScored } from './score.js';

export const GRADE_WEIGHT = { perfect: 1, good: 0.75, ok: 0.45, miss: 0 };

// Janelas de acerto em ms, proporcionais ao andamento efetivo: em tempos rápidos ficam mais estreitas.
export function windowsMs(bpmEff, subdivision = 2) {
  const slot = 60000 / bpmEff / subdivision;
  return { perfect: Math.min(55, slot * 0.15), good: Math.min(110, slot * 0.3), ok: Math.min(200, slot * 0.45) };
}
const SPREAD = { min: 150, max: 450 }; // cordas de uma palhetada chegam espalhadas no tempo
const gradeOf = (aMs, w) => (aMs <= w.perfect ? 'perfect' : aMs <= w.good ? 'good' : 'ok');
const capOk = (g) => (g === 'perfect' || g === 'good' ? 'ok' : g);

export class Evaluator {
  // o: { pitchOffset, rigor:'root'|'normal'|'strict', passes, bpm (efetivo), strings }
  constructor(score, o = {}) {
    this.score = score; this.len = score.lengthBeats;
    this.passes = o.passes ?? Infinity; this.offset = o.pitchOffset ?? 0; this.rigor = o.rigor ?? 'normal';
    this.tuning = o.strings ?? STANDARD; this.bpm = o.bpm ?? score.bpm; this.sub = score.subdivision;
    this.events = score.events.map((ev, i) => ({ ev, i })).filter((x) => isScored(x.ev));
    this.states = new Map(); this.cursor = { p: 0, k: 0 }; this.pending = []; this.results = []; this.extras = 0; this.avoidHits = 0;
  }

  setTempo(bpmEff) { this.bpm = bpmEff; }
  get win() { return windowsMs(this.bpm, this.sub); }
  toBeats(ms) { return ms * this.bpm / 60000; }
  // Eventos com várias cordas (palhetada ou notas simultâneas) chegam espalhados no tempo.
  spreadB(ev) { return ev.kind === 'strum' || expectedStrings(ev).length > 1 ? this.toBeats(Math.min(SPREAD.max, Math.max(SPREAD.min, (60000 / this.bpm / this.sub) * 0.9))) : 0; }
  stateOf(p, k) {
    const { ev, i } = this.events[k], key = `${p}:${i}`;
    let st = this.states.get(key);
    if (!st) this.states.set(key, st = { key, p, i, ev, beat: p * this.len + ev.beat, matched: new Map(), order: [], firstBeat: null, avoid: 0, resolved: false });
    return st;
  }

  // Registra uma nota ligada. Devolve o feedback imediato: [{type:'hit'|'wrongPitch'|'avoid'|'extra', string, note, key?, expectedNote?}]
  noteOn({ string, note, beat }) {
    if (!this.events.length) return [];
    const okB = this.toBeats(this.win.ok);
    if (beat < this.events[0].ev.beat - okB) return [];
    const pb = Math.floor(beat / this.len);
    let best = null, bestDist = Infinity, near = false, avoidSt = null;
    for (let p = Math.max(0, pb - 1); p <= pb + 1 && p < this.passes; p++) {
      for (let k = 0; k < this.events.length; k++) {
        const st = this.stateOf(p, k);
        if (st.resolved || beat < st.beat - okB || beat > st.beat + okB + this.spreadB(st.ev)) continue;
        if (st.ev.avoid?.includes(string)) avoidSt ||= st;
        if (!expectedStrings(st.ev).includes(string)) { near = true; continue; }
        const m = st.matched.get(string);
        if (m?.ok) continue;
        if (st.firstBeat != null && expectedStrings(st.ev).length > 1 && beat > st.firstBeat + this.spreadB(st.ev)) continue;
        const d = Math.abs(beat - (st.firstBeat ?? st.beat));
        if (d < bestDist) { best = st; bestDist = d; }
      }
    }
    if (!best) {
      if (avoidSt) { avoidSt.avoid++; this.avoidHits++; return [{ type: 'avoid', string, note, key: avoidSt.key }]; }
      this.extras++; return [{ type: 'extra', string, note, near }];
    }
    const exp = expectedPitch(best.ev, string, this.offset, this.tuning);
    const checked = best.ev.check.pitch && exp != null && (best.ev.kind === 'note' || this.rigor === 'strict');
    const pitchOk = !checked || note === exp;
    best.matched.set(string, { ok: pitchOk, note, beat });
    if (pitchOk && best.firstBeat == null) best.firstBeat = beat;   // o tempo conta a partir da 1ª nota CORRETA
    best.order.push(string);
    const fb = [{ type: pitchOk ? 'hit' : 'wrongPitch', string, note, expectedNote: exp, key: best.key }];
    if (expectedStrings(best.ev).every((s) => best.matched.get(s)?.ok)) this.resolve(best);
    return fb;
  }

  // Finaliza (como perdidos ou parciais) os eventos cuja janela já expirou antes de `beat`. Devolve os resultados.
  advance(beat) {
    const okB = this.toBeats(this.win.ok);
    while (this.cursor.p < this.passes) {
      const { p, k } = this.cursor;
      if (k >= this.events.length) { this.cursor = { p: p + 1, k: 0 }; continue; }
      const st = this.stateOf(p, k);
      if (!st.resolved) { if (st.beat + okB + this.spreadB(st.ev) >= beat) break; this.resolve(st); }
      this.cursor.k++;
    }
    const out = this.pending; this.pending = []; return out;
  }
  drain() { const out = this.pending; this.pending = []; return out; }

  resolve(st) {
    st.resolved = true;
    const ev = st.ev, exp = expectedStrings(ev);
    const okStrings = exp.filter((s) => st.matched.get(s)?.ok);
    const coverage = exp.length ? okStrings.length / exp.length : 1;
    const delta = st.firstBeat == null ? null : (st.firstBeat - st.beat) * 60000 / this.bpm;
    let grade = 'miss', dirOk = null, dir = null;
    if (okStrings.length) {
      grade = ev.check.timing && delta != null ? gradeOf(Math.abs(delta), this.win) : 'perfect';
      if (coverage < 1) grade = coverage < 0.5 ? 'miss' : capOk(grade);
      if (st.avoid) grade = capOk(grade);
      const order = st.order.filter((s) => st.matched.get(s)?.ok);
      if (order.length >= 2) { dir = order[0] <= order[order.length - 1] ? 'D' : 'U'; }
      if (ev.check.dir && ev.strum?.dir && dir) { dirOk = dir === ev.strum.dir; if (!dirOk && grade === 'perfect') grade = 'good'; }
    }
    const strings = {};
    for (const s of exp) { const m = st.matched.get(s); strings[s] = m ? (m.ok ? 'ok' : 'pitch') : 'miss'; }
    const r = { key: st.key, p: st.p, i: st.i, beat: st.beat, grade, delta, coverage, dirOk, dir, strings, avoid: st.avoid, stringsOk: okStrings.length, stringsTotal: exp.length, timed: !!ev.check.timing };
    this.results.push(r); this.pending.push(r);
    return r;
  }

  summary() {
    const rs = this.results, n = rs.length;
    const count = (g) => rs.filter((r) => r.grade === g).length;
    const timed = rs.filter((r) => r.grade !== 'miss' && r.timed && r.delta != null);
    const dirs = rs.filter((r) => r.dirOk !== null);
    return {
      expected: n, perfect: count('perfect'), good: count('good'), ok: count('ok'), miss: count('miss'), extras: this.extras, avoidHits: this.avoidHits,
      accuracy: n ? Math.round(rs.reduce((a, r) => a + GRADE_WEIGHT[r.grade], 0) / n * 100) : 0,
      timingMeanMs: timed.length ? timed.reduce((a, r) => a + r.delta, 0) / timed.length : null,
      stringsOk: rs.reduce((a, r) => a + r.stringsOk, 0), stringsTotal: rs.reduce((a, r) => a + r.stringsTotal, 0),
      dirAccuracy: dirs.length ? Math.round(dirs.filter((r) => r.dirOk).length / dirs.length * 100) : null,
    };
  }
}

// Modo "esperar": avalia uma tentativa (conjunto de notas tocadas) contra um evento, sem tempo.
export function evalAttempt(ev, played, { pitchOffset = 0, rigor = 'normal', strings = STANDARD } = {}) {
  const exp = expectedStrings(ev), got = new Map();
  for (const n of played) got.set(n.string, n.note);
  const missing = exp.filter((s) => !got.has(s));
  const wrongPitch = exp.filter((s) => {
    if (!got.has(s)) return false;
    const p = expectedPitch(ev, s, pitchOffset, strings);
    return ev.check.pitch && p != null && (ev.kind === 'note' || rigor === 'strict') && got.get(s) !== p;
  });
  const avoid = (ev.avoid || []).filter((s) => got.has(s));
  const extras = [...got.keys()].filter((s) => !exp.includes(s) && !avoid.includes(s));
  const ok = !missing.length && !wrongPitch.length && !avoid.length && (ev.kind === 'strum' || !extras.length);
  return { ok, missing, wrongPitch, avoid, extras, good: exp.filter((s) => got.has(s) && !wrongPitch.includes(s)) };
}

// Acorde tocado num trecho (v1): usa matchChord sobre todas as notas ouvidas.
export function chordCheck(notes, chord, rigor) {
  if (notes.length < 2) return { ok: false, heard: false };
  return { ok: matchChord(notes, { root: chord.root, q: chord.q }, rigor).ok, heard: true };
}
