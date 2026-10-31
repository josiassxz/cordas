import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, place, setDir, setChord, removeAt, moveEvent, rangeOf, regrid, buildSemiScore, dropSlots, totalSlots } from '../js/views/semitab.js';
import { validateScore } from '../js/engine/score.js';

// formas sintéticas (o teste não depende da biblioteca de acordes)
const shapes = (sym) => ({ symbol: sym, root: sym === 'G' ? 7 : 2, q: 'maj', strings: [1, 2, 3, 4, 5], frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] });

test('semi-tablatura: soltar acorde coloca uma palhetada; modos de preenchimento', () => {
  const st = DEFAULT_STATE();                       // 4/4, 2 por tempo, 4 compassos -> 32 fatias
  assert.equal(totalSlots(st), 32);
  place(st, 3, 'G'); assert.deepEqual(Object.keys(st.events), ['3']); assert.equal(st.events[3].dir, 'D');
  st.drop = 'beat'; place(st, 9, 'D');              // 2º compasso: um por tempo (fatias 8, 10, 12, 14)
  assert.deepEqual(dropSlots(st, 9), [8, 10, 12, 14]);
  st.drop = 'slice'; assert.equal(dropSlots(st, 17).length, 8);
});

test('seleção em bloco: ↓, ↑, inverter, trocar acorde, apagar e mover', () => {
  const st = DEFAULT_STATE(); st.drop = 'beat'; place(st, 0, 'G');          // 4 palhetadas ↓ no 1º compasso
  const sel = new Set(rangeOf(0, 7));                                        // seleção cobre eventos e fatias vazias
  setDir(st, sel, 'U'); assert.deepEqual([0, 2, 4, 6].map((i) => st.events[i].dir), ['U', 'U', 'U', 'U']);
  setDir(st, new Set([2, 6]), 'toggle'); assert.deepEqual([0, 2, 4, 6].map((i) => st.events[i].dir), ['U', 'D', 'U', 'D']);
  setChord(st, new Set([4, 6]), 'D'); assert.deepEqual([4, 6].map((i) => st.events[i].sym), ['D', 'D']); assert.equal(st.events[4].dir, 'U', 'trocar o acorde mantém a direção');
  moveEvent(st, 0, 1); assert.ok(st.events[1] && !st.events[0]);
  removeAt(st, new Set([1, 2])); assert.deepEqual(Object.keys(st.events), ['4', '6']);
});

test('semi-tablatura vira um Score válido, com a faixa de acordes e a direção de cada palhetada', () => {
  const st = DEFAULT_STATE(); st.name = 'Teste';
  st.events = { 0: { sym: 'G', dir: 'D' }, 2: { sym: 'G', dir: 'U' }, 8: { sym: 'D', dir: 'D' } };
  const sc = buildSemiScore(st, shapes);
  assert.equal(validateScore(sc).length, 0, validateScore(sc).join('; '));
  assert.deepEqual(sc.events.map((e) => [e.beat, e.strum.dir]), [[0, 'D'], [1, 'U'], [4, 'D']]);
  assert.deepEqual(sc.chords.map((c) => [c.beat, c.chordId]), [[0, 'G'], [4, 'D']], 'só muda a faixa quando o acorde muda');
  assert.equal(sc.lengthBeats, 16); assert.equal(sc.subdivision, 2);
});

test('mudar compasso/subdivisão mantém cada palhetada no mesmo instante musical', () => {
  const st = DEFAULT_STATE(); st.events = { 0: { sym: 'G', dir: 'D' }, 2: { sym: 'G', dir: 'U' }, 8: { sym: 'D', dir: 'D' } };   // 2 por tempo: tempo 1, 2 e 1º do compasso 2
  regrid(st, { sub: 4 }); assert.deepEqual(Object.keys(st.events).map(Number), [0, 4, 16]);
  regrid(st, { sig: '3/4', sub: 2 }); assert.deepEqual(Object.keys(st.events).map(Number), [0, 2, 6]);
  regrid(st, { bars: 1 }); assert.deepEqual(Object.keys(st.events).map(Number), [0, 2]);
});
