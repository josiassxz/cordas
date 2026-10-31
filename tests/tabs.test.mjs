import test from 'node:test';
import assert from 'node:assert/strict';
import { alphaTexToScore } from '../js/songs/tabs.js';
import { normalizeScore, validateScore } from '../js/engine/score.js';

// alphaTex sintético (escrito para o teste; nada do dataset)
const track = (text, tuning = ['E5', 'B4', 'G4', 'D4', 'A3', 'E3']) => ({ instrument: 27, tuning, frets: 24, notes: 9, text });
const meta = { id: 1, trackIndex: 0, artist: 'Banda', title: 'Teste', tempo: 90 };

test('alphaTex: notas, acordes, pausas, durações e compasso', () => {
  const sc = alphaTexToScore(track(':4 3.2 (0.1 2.3).8 r.8 5.6.2 | :8 0.4 0.4{pm} -.4 x.5 |'), meta);
  assert.equal(sc.bpm, 90);
  assert.deepEqual(sc.events[0], { beat: 0, dur: 1, notes: [{ string: 4, fret: 3 }] });          // alphaTex corda 2 -> índice 4 (Si)
  assert.deepEqual(sc.events[1].notes.map((n) => [n.string, n.fret]), [[5, 0], [3, 2]]);          // acorde: cordas 1 e 3
  assert.equal(sc.events[1].beat, 1); assert.equal(sc.events[1].dur, 0.5);
  assert.equal(sc.events[2].beat, 2); assert.deepEqual(sc.events[2].notes, [{ string: 0, fret: 5 }]);   // 5.6.2 = corda 6 (Mi grave), mínima
  assert.equal(sc.events[3].beat, 4); assert.equal(sc.events[4].tech, 'palm');
  assert.equal(sc.events.length, 5, 'ligadura (-) e nota morta (x) não viram eventos');
  assert.ok(validateScore(normalizeScore(sc)).length === 0, validateScore(normalizeScore(sc)).join('; '));
});

test('alphaTex: pontuada, quiáltera e afinação', () => {
  const sc = alphaTexToScore(track(':4 1.1{d} 2.1 | :8 3.1{tu 3} 3.1{tu 3} 3.1{tu 3}', ['E5', 'B4', 'G4', 'D4', 'A3', 'D3']), meta);
  assert.equal(sc.events[1].beat, 1.5);                                   // semínima pontuada = 1,5 tempo
  assert.ok(Math.abs(sc.events[3].beat - (2.5 + 1 / 3)) < 1e-9);          // colcheia em quiáltera de 3 = 1/3 de tempo
  assert.equal(sc.tuningName, 'Drop D'); assert.equal(sc.noPitch, true);
  assert.equal(sc.tuning[0], 38);
});
