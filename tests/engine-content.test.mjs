import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES, TECHNIQUES, exerciseById, getExercises } from '../js/content/exercises.js';
import { validateScore, expectedStrings } from '../js/engine/score.js';
import { Runner } from '../js/engine/runner.js';
import { Guitar } from '../js/device/guitar.js';
import { STANDARD } from '../js/music/theory.js';
import { patternById, STRUM_PATTERNS, TIME_SIGNATURES } from '../js/content/patterns.js';

const made = [];
after(() => made.forEach((r) => r.destroy()));

test('biblioteca: ids únicos, scores válidos e todas as técnicas cobertas', () => {
  assert.ok(EXERCISES.length >= 80, `só ${EXERCISES.length} exercícios`);
  assert.equal(new Set(EXERCISES.map((e) => e.id)).size, EXERCISES.length, 'ids duplicados');
  for (const e of EXERCISES) assert.deepEqual(validateScore(e.score), [], e.id);
  for (const t of TECHNIQUES) assert.ok(getExercises({ technique: t.id }).length >= 3, `técnica ${t.id} com poucos exercícios`);
  for (let l = 1; l <= 4; l++) assert.ok(getExercises({ level: l }).length > 0, `sem nível ${l}`);
});

test('honestidade: dedos PIMA, setas em nota única e técnicas sem detecção sempre sinalizados como guia', () => {
  for (const e of EXERCISES) {
    const digits = e.score.events.some((x) => x.notes?.some((n) => n.digit));
    const pick = e.score.events.some((x) => x.pick);
    const guideEv = e.score.events.filter((x) => x.guide);
    if (digits || pick || guideEv.length) { assert.equal(e.guide, true, `${e.id} deve estar marcado como guia`); assert.ok(e.limitations.length, `${e.id} sem aviso de limitação`); }
    for (const g of guideEv) { assert.ok(!g.check.strings && !g.check.pitch && !g.check.timing, `${e.id}: evento-guia sendo avaliado`); }
  }
  const tech = getExercises({ technique: 'technique' });
  assert.ok(tech.every((e) => e.limitations.some((l) => /AG01|aparelho|não (envia|informa)/i.test(l))), 'técnicas expressivas sem aviso honesto');
  assert.ok(tech.some((e) => e.score.events.some((x) => x.tech === 'hammer')) && tech.some((e) => e.score.events.some((x) => x.tech === 'bend')));
});

test('padrões de batida têm o número certo de posições por compasso', () => {
  for (const p of STRUM_PATTERNS) assert.equal(p.slots.length, 8, p.id);
  assert.equal(patternById('pop').slots, 'D-DU-UDU');
  assert.equal(TIME_SIGNATURES.length, 6);
});

// Toca cada exercício "perfeitamente" pelo Runner (relógio falso) e exige 100%.
function perfectRun(ex) {
  const c = { t: 50 }, guitar = new Guitar(), records = [];
  const r = new Runner({ guitar, audio: null, learn: { record: (x) => records.push(x) }, clock: () => c.t, silent: true, settings: () => ({ latency: 0, pitchOffset: 0, rigor: 'strict' }) }, ex.score, { autoUpdate: false, countIn: 0 });
  made.push(r);
  const at = (beat) => { c.t = r.transport.t0 + (beat - r.transport.pos0) * 60 / r.transport.effectiveBpm; r.update(); };
  const hit = (s, n) => guitar.handle({ type: 'noteon', ch: s, a: n, b: 40 }, performance.now());
  r.start();
  if (r.mode === 'wait') {
    for (const e of r.score.events) {
      for (const s of expectedStrings(e)) hit(s, STANDARD[s] + (e.notes?.find((n) => n.string === s)?.fret ?? e.strum.frets[s]));
      guitar.emit('strum', { t: performance.now(), notes: [], dir: 'S', count: 1 });
    }
    return { r, records };
  }
  for (const e of r.score.events.filter((x) => x.check.strings)) {
    at(e.beat);
    let order = expectedStrings(e); if (e.kind === 'strum' && e.strum.dir === 'U') order = [...order].reverse();
    for (const s of order) hit(s, STANDARD[s] + (e.notes?.find((n) => n.string === s)?.fret ?? e.strum.frets[s]));
  }
  at(r.score.lengthBeats + 3);
  return { r, records };
}

test('tocar cada exercício perfeitamente dá 100% (conteúdo coerente com o avaliador)', () => {
  const bad = [];
  for (const ex of EXERCISES) {
    const { r, records } = perfectRun(ex), s = r.summary();
    if (r.state !== 'finished' || s.accuracy !== 100 || s.miss || s.extras || !records.length) bad.push(`${ex.id}: estado=${r.state} acc=${s.accuracy} miss=${s.miss} extras=${s.extras} esperados=${s.expected}`);
  }
  assert.deepEqual(bad, []);
});

test('exercício com técnica sem detecção: o gesto-guia nunca conta como perdido', () => {
  const ex = exerciseById('tech-hammer'), { r } = perfectRun(ex), s = r.summary();
  const guides = ex.score.events.filter((e) => e.guide).length, scored = ex.score.events.length - guides;
  assert.ok(guides > 0); assert.equal(s.expected, scored); assert.equal(s.miss, 0);
});

test('tocar nada = 0% e tocar tudo errado pontua pouco (sem precisão fictícia)', () => {
  const ex = exerciseById('pick-open-up'), c = { t: 50 }, guitar = new Guitar();
  const r = new Runner({ guitar, audio: null, learn: null, clock: () => c.t, silent: true, settings: () => ({ latency: 0, pitchOffset: 0, rigor: 'normal' }) }, ex.score, { autoUpdate: false, countIn: 0 });
  made.push(r); r.start(); c.t = r.transport.t0 + 60; r.update();
  assert.equal(r.summary().accuracy, 0); assert.ok(r.summary().miss >= 10);
});
