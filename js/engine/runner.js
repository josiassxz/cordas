// Runner: executa um Score. Une Transport (tempo), Evaluator (avaliação) e eventos do dispositivo.
// Não toca DOM (a interface está em practice.js/highway.js). Estados: idle -> countin -> running <-> paused -> finished.
// Pausa congela o relógio (Transport), o guia sonoro e a avaliação (notas durante a pausa são ignoradas).
import { Transport } from './transport.js';
import { Evaluator, evalAttempt, GRADE_WEIGHT } from './evaluator.js';
import { normalizeScore, isScored, expectedStrings, expectedPitch, expectedFret } from './score.js';
import { matchChord, detectChord, noteAt } from '../music/theory.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const parseRepeat = (r) => (r === 'loop' || r === Infinity ? Infinity : r === 'once' || r == null ? 1 : Math.max(1, Math.floor(+r) || 1));
const GUIDE_AHEAD = 0.08;     // s de antecedência para agendar o som-guia (curto: pausa o respeita)
const TAIL_BEATS = 1;         // folga após o fim para avaliar a última nota

export class Runner {
  // deps: { guitar, audio, settings:()=>({latency,pitchOffset,rigor}), learn?, clock?, silent?, makeTransport? }
  // opts: { bpm, speed, repeat, countIn, guide, click, wait, kind, onFinish, autoUpdate }
  constructor(deps, rawScore, opts = {}) {
    this.deps = deps; this.opts = opts;
    this.score = normalizeScore(rawScore);
    this.mode = opts.wait === true ? 'wait' : (opts.mode || this.score.mode);
    this.bpm = opts.bpm ?? this.score.bpm;
    this.speed = opts.speed ?? 1;
    this.passes = parseRepeat(opts.repeat);
    this.guide = !!opts.guide; this.click = opts.click ?? this.mode !== 'wait';
    this.listeners = {}; this._state = 'idle'; this.finished = false;
    this.attach = this.attach.bind(this);
    this.results = new Map(); this.chordResults = []; this.noteLog = []; this.pass = 0; this.activeMs = 0; this.floor = -Infinity;
    this.waitResults = []; this.chordCursor = { p: 0, k: 0 }; this.waitIdx = 0; this.summaryCache = null;
    this.waitList = this.score.events.map((ev, i) => ({ ev, i })).filter((x) => isScored(x.ev));
  }

  // ---------- eventos ----------
  on(type, fn) { (this.listeners[type] ||= new Set()).add(fn); return () => this.listeners[type]?.delete(fn); }
  emit(type, detail) { this.listeners[type]?.forEach((fn) => fn(detail)); }
  setState(s) { this._state = s; this.emit('state', { state: s }); }
  get state() { return this._state; }
  get canBpm() { return this.mode !== 'wait'; }
  get effectiveBpm() { return this.transport ? this.transport.effectiveBpm : this.bpm * this.speed; }

  // ---------- ciclo de vida ----------
  start() {
    this.reset();
    const st = this.deps.settings();
    this.evaluator = new Evaluator(this.score, { pitchOffset: st.pitchOffset ?? 0, rigor: st.rigor ?? 'normal', passes: this.passes, bpm: this.bpm * this.speed });
    this.attach(true);
    if (this.mode === 'wait') {
      this.waitList = this.score.events.map((ev, i) => ({ ev, i })).filter((x) => isScored(x.ev));
      this.waitIdx = 0; this.waitTries = 0; this.waitBuf = []; this.pass = 0;
      this.setState('running');
    } else {
      const make = this.deps.makeTransport || ((o) => new Transport(this.deps.audio, o));
      this.transport = make({ bpm: this.bpm, speed: this.speed, beatsPerBar: this.score.beatsPerBar, subdivision: this.score.subdivision, click: this.click, latencyMs: st.latency ?? 0, clock: this.deps.clock, silent: this.deps.silent });
      const countIn = this.opts.countIn ?? this.score.beatsPerBar;
      this.transport.start({ countInBeats: countIn });
      this.guideLast = -Infinity;
      this.setState(countIn > 0 ? 'countin' : 'running');
    }
    this.lastTick = performance.now();
    if (this.opts.autoUpdate !== false) this.timer = setInterval(() => this.update(), 30);
    return this;
  }

  reset() {
    clearInterval(this.timer); this.transport?.stop();
    this.results = new Map(); this.chordResults = []; this.noteLog = []; this.pass = 0; this.activeMs = 0;
    this.floor = -Infinity; this.finished = false; this.summaryCache = null; this.chordCursor = { p: 0, k: 0 }; this.waitResults = [];
  }

  attach(on) {
    const g = this.deps.guitar; if (!g) return;
    const fns = [['noteon', (e) => this.onNote(e.detail)], ['strum', (e) => this.onStrum(e.detail)]];
    if (on === true) { this.handlers = fns; fns.forEach(([t, f]) => g.addEventListener(t, f)); }
    else { this.handlers?.forEach(([t, f]) => g.removeEventListener(t, f)); this.handlers = null; }
  }

  pause() {
    if (this.finished || !['running', 'countin'].includes(this._state)) return;
    this.update();
    this.transport?.pause();
    this.prevState = this._state; this.setState('paused');
  }
  resume() {
    if (this._state !== 'paused') return;
    this.transport?.resume();
    this.lastTick = performance.now();
    if (this.transport) { this.floor = this.transport.pos0; this.guideLast = this.floor; }
    this.setState(this.prevState === 'countin' && this.position() < 0 ? 'countin' : 'running');
  }
  toggle() { if (this._state === 'paused') this.resume(); else if (this._state === 'idle' || this._state === 'finished') this.start(); else this.pause(); }
  restart() { const keep = { ...this.opts }; this.attach(false); this.opts = keep; this.start(); }
  stop() { this.finish('stopped'); }
  destroy() { clearInterval(this.timer); this.attach(false); this.transport?.stop(); this.finished = true; this.listeners = {}; }

  setSpeed(x) { this.speed = clamp(x, 0.25, 2); this.transport?.setSpeed(this.speed); this.evaluator?.setTempo(this.effectiveBpm); this.emit('tempo', { bpm: this.bpm, speed: this.speed }); }
  setBpm(v) { this.bpm = clamp(Math.round(v), 20, 300); this.transport?.setBpm(this.bpm); this.evaluator?.setTempo(this.effectiveBpm); this.emit('tempo', { bpm: this.bpm, speed: this.speed }); }
  setRepeat(r) { this.passes = parseRepeat(r); if (this.evaluator) this.evaluator.passes = this.passes; this.emit('tempo', {}); }
  setGuide(on) { this.guide = !!on; if (this.transport) this.guideLast = this.transport.position(); }
  setClick(on) { this.click = !!on; if (this.transport) this.transport.click = !!on; }

  // ---------- posição e progresso ----------
  position() {
    if (this.mode === 'wait') { const w = this.waitList?.[Math.min(this.waitIdx, this.waitList.length - 1)]; return (w ? w.ev.beat : 0) + (this.pass || 0) * this.score.lengthBeats; }
    return this.transport ? Math.max(this.transport.position(), this.floor ?? -Infinity) : 0;   // após retomar, nunca recua
  }
  get progress() {
    const len = this.score.lengthBeats;
    if (this.mode === 'wait') { const n = this.waitList?.length || 1; return this.passes === Infinity ? this.waitIdx / n : clamp((this.pass * n + this.waitIdx) / (this.passes * n), 0, 1); }
    const pos = Math.max(0, this.position());
    return this.passes === Infinity ? (pos % len) / len : clamp(pos / (this.passes * len), 0, 1);
  }
  get currentPass() { return this.pass; }

  // ---------- laço principal ----------
  update() {
    if (this.finished || this.mode === 'wait' || !this.transport || !['running', 'countin'].includes(this._state)) return;
    const now = performance.now(); this.activeMs += Math.min(100, now - this.lastTick); this.lastTick = now;
    const pos = this.position(), len = this.score.lengthBeats;
    if (this._state === 'countin' && pos >= 0) this.setState('running');
    this.evaluator.setTempo(this.transport.effectiveBpm);
    if (pos >= 0) {
      const p = Math.floor(pos / len);
      while (this.pass < p) { this.pass++; this.onPass(this.pass); }
    }
    this.collect(this.evaluator.advance(pos));
    this.advanceChords(pos);
    if (this.guide && this._state === 'running') this.scheduleGuide(pos);
    this.emit('progress', { pos, fraction: this.progress, pass: this.pass });
    if (Number.isFinite(this.passes) && pos >= this.passes * len + TAIL_BEATS) this.finish('done');
  }

  onPass(p) {
    const r = this.score.ramp;
    if (r && p % (r.everyPasses || 1) === 0 && this.bpm < r.max) this.setBpm(Math.min(r.max, this.bpm + r.step));
    this.emit('pass', { pass: p });
  }

  collect(list) { for (const r of list) { this.results.set(r.key, r); this.emit('result', r); } }

  // ---------- entrada do dispositivo ----------
  onNote({ string, note, t }) {
    if (this.finished) return;
    if (this.mode === 'wait') {
      if (this._state !== 'running') return;
      this.waitBuf.push({ string, note });
      const cur = this.waitList[this.waitIdx]?.ev; if (!cur) return;
      const exp = expectedStrings(cur);
      const pitch = expectedPitch(cur, string, this.evaluator.offset);
      const type = cur.avoid?.includes(string) ? 'avoid' : !exp.includes(string) ? 'extra' : pitch != null && cur.check.pitch && cur.kind === 'note' && pitch !== note ? 'wrongPitch' : 'hit';
      this.emit('feedback', { type, string, note, fret: expectedFret(cur, string), expectedNote: pitch });
      return;
    }
    if (!this.transport || !['running', 'countin'].includes(this._state)) return;
    const beat = this.transport.beatAtPerf(t);
    if (beat == null) return;
    this.evaluator.setTempo(this.transport.effectiveBpm);
    this.noteLog.push({ string, note, beat });
    if (this.noteLog.length > 400) this.noteLog.splice(0, 200);
    const fb = this.evaluator.noteOn({ string, note, beat });
    fb.forEach((f) => this.emit('feedback', { ...f, fret: f.expectedNote != null ? f.expectedNote - noteAt(string, 0, this.evaluator.offset) : undefined }));
    this.collect(this.evaluator.drain());
  }

  onStrum() {
    if (this.mode !== 'wait' || this._state !== 'running' || this.finished) return;
    const buf = this.waitBuf; this.waitBuf = [];
    const w = this.waitList[this.waitIdx]; if (!w || !buf.length) return;
    const st = this.deps.settings();
    const a = evalAttempt(w.ev, buf, { pitchOffset: st.pitchOffset ?? 0, rigor: st.rigor ?? 'normal' });
    this.emit('attempt', { ...a, tries: this.waitTries, index: this.waitIdx });
    if (!a.ok) { this.waitTries++; return; }
    const grade = this.waitTries === 0 ? 'perfect' : this.waitTries === 1 ? 'good' : 'ok';
    const strings = Object.fromEntries(expectedStrings(w.ev).map((s) => [s, 'ok']));
    const r = { key: `${this.pass}:${w.i}`, p: this.pass, i: w.i, beat: w.ev.beat + this.pass * this.score.lengthBeats, grade, delta: null, coverage: 1, dirOk: null, strings, avoid: 0, stringsOk: expectedStrings(w.ev).length, stringsTotal: expectedStrings(w.ev).length, tries: this.waitTries };
    this.waitResults.push(r); this.results.set(r.key, r); this.emit('result', r);
    this.waitTries = 0; this.waitIdx++;
    if (this.waitIdx >= this.waitList.length) {
      this.pass++; this.waitIdx = 0;
      if (this.pass >= this.passes) this.finish('done'); else this.emit('pass', { pass: this.pass });
    }
    this.emit('progress', { pos: this.position(), fraction: this.progress, pass: this.pass });
  }

  // ---------- acordes por trecho (compatível com a v1: matchChord por compasso) ----------
  advanceChords(pos) {
    const cs = this.score.chords; if (!cs?.length) return;
    const len = this.score.lengthBeats, st = this.deps.settings();
    for (;;) {
      const { p, k } = this.chordCursor;
      if (p >= this.passes) return;
      const c = cs[k], end = p * len + (cs[k + 1]?.beat ?? len);
      if (pos < end + 0.25) return;
      const start = p * len + c.beat;
      const notes = this.noteLog.filter((n) => n.beat >= start - 0.3 && n.beat < end - 0.05).map((n) => n.note);
      const root = c.root, q = c.q;
      const ok = root != null && notes.length >= 2 ? matchChord(notes, { root, q }, st.rigor ?? 'normal').ok : false;
      const r = { pass: p, seg: k, chordId: c.chordId, ok, heard: notes.length >= 2 ? detectChord(notes)?.name || null : null };
      this.chordResults.push(r); this.emit('chord', r);
      this.chordCursor = k + 1 >= cs.length ? { p: p + 1, k: 0 } : { p, k: k + 1 };
    }
  }

  // ---------- guia sonoro ----------
  scheduleGuide(pos) {
    const t = this.transport, ahead = GUIDE_AHEAD * t.effectiveBpm / 60, limit = pos + ahead, len = this.score.lengthBeats;
    if (this.guideLast === -Infinity) this.guideLast = pos;
    const off = this.deps.settings().pitchOffset ?? 0;
    for (let p = Math.floor(this.guideLast / len); p * len <= limit && p < this.passes; p++) {
      for (const ev of this.score.events) {
        const abs = p * len + ev.beat;
        if (abs <= this.guideLast || abs > limit || ev.kind === 'rest') continue;
        const time = t.timeOf(abs);
        if (ev.kind === 'strum') this.deps.audio?.strum?.(ev.strum.strings.map((s) => noteAt(s, ev.strum.frets?.[s] ?? 0, off)), time, ev.strum.dir, 0.22);
        else ev.notes.forEach((n) => this.deps.audio?.pluck?.(noteAt(n.string, n.fret, off), time, 0.3));
      }
    }
    this.guideLast = limit;
  }

  // ---------- consultas para a interface ----------
  // Próximo evento avaliável ainda não resolvido (para mostrar no braço e alimentar o modo demo).
  upcoming() {
    const len = this.score.lengthBeats;
    if (this.mode === 'wait') { const w = this.waitList?.[this.waitIdx]; return w ? { ev: w.ev, i: w.i, p: this.pass, key: `${this.pass}:${w.i}` } : null; }
    const pos = this.position(), p0 = Math.max(0, Math.floor(pos / len));
    for (let p = p0; p < Math.min(this.passes, p0 + 2); p++) {
      for (let i = 0; i < this.score.events.length; i++) {
        const ev = this.score.events[i];
        if (!isScored(ev) || this.results.has(`${p}:${i}`)) continue;
        if (p * len + ev.beat >= pos - 0.3) return { ev, i, p, key: `${p}:${i}` };
      }
    }
    return null;
  }
  // Traste por corda (-1 = não tocar) do próximo evento: usado pelo modo demo (Espaço) para tocar o certo.
  demoFrets() {
    const u = this.upcoming(); if (!u) return null;
    const f = Array(6).fill(-1);
    if (u.ev.kind === 'strum') u.ev.strum.strings.forEach((s) => { f[s] = u.ev.strum.frets?.[s] ?? 0; });
    else u.ev.notes.forEach((n) => { f[n.string] = n.fret; });
    return f;
  }
  chordAt(beat) {
    const cs = this.score.chords; if (!cs?.length) return null;
    const b = ((beat % this.score.lengthBeats) + this.score.lengthBeats) % this.score.lengthBeats;
    let cur = cs[0]; for (const c of cs) if (c.beat <= b + 1e-9) cur = c; return cur;
  }

  // ---------- fim e resumo ----------
  finish(reason = 'done') {
    if (this.finished) return this.summaryCache;
    if (this.mode !== 'wait' && this.transport) {
      const pos = this.position();
      this.evaluator.setTempo(this.transport.effectiveBpm);
      this.collect(reason === 'done' ? this.evaluator.advance(this.passes * this.score.lengthBeats + 10) : this.evaluator.advance(Math.max(0, pos)));
      this.advanceChords(reason === 'done' ? this.passes * this.score.lengthBeats + 10 : Math.max(0, pos));
    }
    this.attach(false); clearInterval(this.timer); this.transport?.stop();
    this.finished = true; this.setState('finished');
    const summary = this.summary(reason); this.summaryCache = summary;
    const enough = reason === 'done' || summary.expected >= 6;
    if (enough) this.deps.learn?.record?.(this.record(summary));
    this.emit('finish', summary); this.opts.onFinish?.(summary);
    return summary;
  }

  summary(reason = 'done') {
    let s;
    if (this.mode === 'wait') {
      const rs = this.waitResults, n = rs.length, c = (g) => rs.filter((r) => r.grade === g).length;
      s = { expected: n, perfect: c('perfect'), good: c('good'), ok: c('ok'), miss: 0, extras: 0, avoidHits: 0, accuracy: n ? Math.round(rs.reduce((a, r) => a + GRADE_WEIGHT[r.grade], 0) / n * 100) : 0, timingMeanMs: null, stringsOk: rs.reduce((a, r) => a + r.stringsOk, 0), stringsTotal: rs.reduce((a, r) => a + r.stringsTotal, 0), dirAccuracy: null };
    } else s = this.evaluator.summary();
    return {
      ...s, reason, mode: this.mode, bpm: this.bpm, speed: this.speed, passes: this.pass + (reason === 'done' ? 0 : 1),
      durationSec: Math.round(this.activeMs / 1000),
      chordsOk: this.chordResults.filter((c) => c.ok).length, chordsTotal: this.chordResults.length,
    };
  }

  record(s) {
    return {
      kind: this.opts.kind || (this.score.technique === 'rhythm' ? 'rhythm' : this.score.technique === 'chord-change' ? 'chords' : 'exercise'),
      refId: this.score.id, title: this.score.title, technique: this.score.technique, level: this.score.level,
      bpm: s.bpm, speed: s.speed, durationSec: s.durationSec, accuracy: s.accuracy, timingMeanMs: s.timingMeanMs,
      hits: { perfect: s.perfect, good: s.good, ok: s.ok, miss: s.miss, extra: s.extras },
      stringsOk: s.stringsOk, stringsTotal: s.stringsTotal,
      ...(s.chordsTotal ? { chordsOk: s.chordsOk, chordsTotal: s.chordsTotal } : {}),
    };
  }
}
