import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScore, validateScore } from '../js/engine/score.js';
import { Evaluator, evalAttempt, windowsMs } from '../js/engine/evaluator.js';
import { STANDARD } from '../js/music/theory.js';

// 120 bpm => 1 batida = 500 ms; janela "ok" = 112,5 ms = 0,225 batida; "good" 75 ms; "perfect" 37,5 ms.
const mk = (events, extra = {}) => normalizeScore({ id: 't', title: 't', bpm: 120, lengthBeats: 8, level: 1, events, ...extra });
const note = (beat, string, fret, extra = {}) => ({ beat, notes: [{ string, fret }], ...extra });
const strumAll = (beat, dir = 'D', extra = {}) => ({ beat, strum: { dir, strings: [0, 1, 2, 3, 4, 5], frets: [0, 0, 0, 0, 0, 0] }, ...extra });
const ev = (score, o = {}) => new Evaluator(score, { bpm: 120, ...o });
const play = (e, string, note, beat) => e.noteOn({ string, note, beat });

test('janelas de acerto encolhem com o andamento', () => {
  assert.ok(windowsMs(60).ok > windowsMs(120).ok);
  assert.ok(windowsMs(240).perfect < windowsMs(120).perfect);
  assert.ok(windowsMs(60).perfect <= 55 && windowsMs(60).ok <= 200);
});

test('nota certa na corda certa no tempo = perfeita', () => {
  const e = ev(mk([note(0, 4, 0)]));
  const fb = play(e, 4, 59, 0.02);
  assert.equal(fb[0].type, 'hit');
  const r = e.drain()[0];
  assert.equal(r.grade, 'perfect'); assert.equal(r.strings[4], 'ok');
});

test('timing: 50 ms de atraso = boa; fora da janela = perdida', () => {
  let e = ev(mk([note(0, 4, 0), note(4, 4, 0)]));
  play(e, 4, 59, 0.1);                       // 0,1 batida = 50 ms
  const r = e.drain()[0];
  assert.equal(r.grade, 'good'); assert.ok(Math.abs(r.delta - 50) < 1e-6);
  e = ev(mk([note(0, 4, 0), note(4, 4, 0)]));
  const fb = play(e, 4, 59, 1);              // 500 ms depois: nenhuma janela
  assert.equal(fb[0].type, 'extra');
  const out = e.advance(2);
  assert.equal(out[0].grade, 'miss');
});

test('corda errada = nota extra (perto de um evento) e o evento vira perdido', () => {
  const e = ev(mk([note(0, 4, 0)]));
  const fb = play(e, 3, 55, 0);
  assert.deepEqual([fb[0].type, fb[0].near], ['extra', true]);
  assert.equal(e.advance(5)[0].grade, 'miss');
  assert.equal(e.summary().extras, 1);
});

test('nota errada na corda certa = wrongPitch, sem acerto', () => {
  const e = ev(mk([note(0, 4, 0)]));
  assert.equal(play(e, 4, 60, 0)[0].type, 'wrongPitch');
  assert.equal(e.advance(5)[0].grade, 'miss');
  assert.equal(e.results[0].strings[4], 'pitch');
});

test('pitchOffset calibrado desloca a nota esperada', () => {
  const e = ev(mk([note(0, 0, 3)]), { pitchOffset: -1 });
  assert.equal(play(e, 0, STANDARD[0] + 3 - 1, 0)[0].type, 'hit');
});

test('nota fora de qualquer janela é extra', () => {
  const e = ev(mk([note(0, 4, 0), note(4, 4, 0)]));
  assert.equal(play(e, 4, 59, 2)[0].type, 'extra');
});

test('cordas a evitar tocadas = erro e nota limitada a "ok"', () => {
  const s = mk([{ beat: 0, strum: { dir: 'D', strings: [2, 3, 4, 5], frets: [-1, -1, 0, 2, 3, 2] }, avoid: [0, 1] }]);
  const e = ev(s);
  assert.equal(play(e, 1, 45, 0)[0].type, 'avoid');
  [[2, 50], [3, 57], [4, 62], [5, 66]].forEach(([st, n], i) => play(e, st, n, 0.02 * i));
  const r = e.drain()[0];
  assert.ok(['ok', 'miss'].includes(r.grade) && r.avoid === 1);
  assert.equal(e.summary().avoidHits, 1);
});

test('palhetada: cobertura parcial limita a nota; metade das cordas ainda conta', () => {
  let e = ev(mk([strumAll(0)], { lengthBeats: 4 }), { rigor: 'normal' });
  [0, 1, 2, 3, 4, 5].forEach((s, i) => play(e, s, STANDARD[s], 0.05 * i));
  assert.equal(e.drain()[0].grade, 'perfect');
  e = ev(mk([strumAll(0)], { lengthBeats: 4 }));
  [0, 1, 2].forEach((s, i) => play(e, s, STANDARD[s], 0.05 * i));
  const r = e.advance(4)[0];
  assert.equal(r.coverage, 0.5); assert.equal(r.grade, 'ok');
  e = ev(mk([strumAll(0)], { lengthBeats: 4 }));
  [0, 1].forEach((s, i) => play(e, s, STANDARD[s], 0.05 * i));
  assert.equal(e.advance(4)[0].grade, 'miss');
});

test('direção inferida pela ordem das cordas rebaixa perfeita para boa', () => {
  const down = ev(mk([strumAll(0, 'D')], { lengthBeats: 4 }));
  [0, 1, 2, 3, 4, 5].forEach((s, i) => play(down, s, STANDARD[s], 0.02 * i));
  const rd = down.drain()[0]; assert.equal(rd.dirOk, true); assert.equal(rd.grade, 'perfect');
  const up = ev(mk([strumAll(0, 'D')], { lengthBeats: 4 }));
  [5, 4, 3, 2, 1, 0].forEach((s, i) => play(up, s, STANDARD[s], 0.02 * i));
  const ru = up.drain()[0]; assert.equal(ru.dirOk, false); assert.equal(ru.grade, 'good');
});

test('rigor: pitch de palhetada só é exigido no modo estrito', () => {
  const s = mk([strumAll(0)], { lengthBeats: 4 });
  const loose = ev(s, { rigor: 'normal' });
  [0, 1, 2, 3, 4, 5].forEach((st, i) => play(loose, st, STANDARD[st] + 1, 0.02 * i));
  assert.equal(loose.drain()[0].grade, 'perfect');
  const strict = ev(s, { rigor: 'strict' });
  [0, 1, 2, 3, 4, 5].forEach((st, i) => play(strict, st, STANDARD[st] + 1, 0.02 * i));
  assert.equal(strict.advance(5)[0].grade, 'miss');
});

test('repetições (passadas): evento da passada seguinte é avaliado separadamente', () => {
  const e = ev(mk([note(0, 4, 0)], { lengthBeats: 4 }), { passes: 3 });
  play(e, 4, 59, 0); play(e, 4, 59, 4.02);
  assert.equal(e.drain().length, 2);
  assert.equal(e.advance(100).length, 1);             // terceira passada nunca tocada = perdida
  assert.equal(e.summary().expected, 3);
});

test('eventos só-guia não são avaliados', () => {
  const s = mk([note(0, 3, 0), note(1, 3, 2, { tech: 'hammer', guide: true, check: { strings: false, pitch: false, timing: false } })]);
  assert.deepEqual(validateScore(s), []);
  const e = ev(s, { passes: 1 }); play(e, 3, 55, 0);
  assert.equal(e.advance(10).length, 1, 'só o evento avaliável gera resultado'); assert.equal(e.summary().expected, 1);
});

test('modo esperar: tentativa correta, nota errada, falta de corda, corda a evitar', () => {
  const s = mk([{ beat: 0, strum: { dir: 'D', strings: [2, 3, 4, 5], frets: [-1, -1, 0, 2, 3, 2] }, avoid: [0, 1] }]);
  const E = s.events[0], P = (st, n) => ({ string: st, note: n });
  assert.equal(evalAttempt(E, [P(2, 50), P(3, 57), P(4, 62), P(5, 66)]).ok, true);
  assert.deepEqual(evalAttempt(E, [P(2, 50), P(3, 57), P(4, 62)]).missing, [5]);
  assert.deepEqual(evalAttempt(E, [P(2, 50), P(3, 57), P(4, 62), P(5, 66), P(0, 40)]).avoid, [0]);
  const single = mk([note(0, 4, 0)]).events[0];
  assert.equal(evalAttempt(single, [P(4, 59), P(3, 55)]).ok, false, 'corda extra reprova nota única');
  assert.deepEqual(evalAttempt(single, [P(4, 60)], {}).wrongPitch, [4]);
});

test('validateScore aponta erros reais', () => {
  const bad = normalizeScore({ id: 'x', title: 'x', bpm: 10, level: 9, events: [{ beat: 99, notes: [{ string: 7, fret: 1 }] }] });
  const errs = validateScore(bad);
  assert.ok(errs.length >= 3, errs.join('; '));
});

test('notas simultâneas (melodia + baixo) chegam espalhadas e contam como um evento só', () => {
  const s = mk([{ beat: 0, notes: [{ string: 4, fret: 0 }, { string: 0, fret: 3 }] }], { lengthBeats: 4 });
  const e = ev(s, { passes: 1 });
  assert.equal(play(e, 4, 59, 0.0)[0].type, 'hit');
  assert.equal(play(e, 0, 43, 0.06)[0].type, 'hit', 'baixo 30 ms depois não é "extra"');
  const r = e.drain()[0]; assert.equal(r.coverage, 1); assert.equal(r.grade, 'perfect');
});

test('nota única errada pode ser corrigida tocando de novo dentro da janela', () => {
  const e = ev(mk([note(0, 4, 0)]), { passes: 1 });
  assert.equal(play(e, 4, 60, 0)[0].type, 'wrongPitch');
  assert.equal(play(e, 4, 59, 0.1)[0].type, 'hit');
  assert.equal(e.drain()[0].grade, 'good');
});
