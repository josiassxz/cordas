import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChord, transposeChord, capoShape, soundingChord, parseProgression, suggestCapo, detectKey, diatonic, shapeDifficulty, chordMidi, pcLabel } from '../js/audio/transpose.js';

test('parse e transposição de cifras', () => {
  assert.deepEqual(parseChord('F#m7'), { root: 6, suffix: 'm7', bass: null });
  assert.deepEqual(parseChord('Bb/D'), { root: 10, suffix: '', bass: 2 });
  assert.equal(parseChord('H'), null);
  assert.equal(transposeChord('G', 2), 'A'); assert.equal(transposeChord('Am7', -3), 'F#m7'); assert.equal(transposeChord('Am7', -3, true), 'Gbm7');
  assert.equal(transposeChord('D/F#', 2), 'E/G#'); assert.equal(transposeChord('B', 1), 'C');
  assert.equal(pcLabel(-1), 'B');
});

test('capo: forma a tocar e acorde que soa são inversos', () => {
  assert.equal(capoShape('A', 2), 'G'); assert.equal(capoShape('Bm', 2), 'Am'); assert.equal(capoShape('F#m', 2), 'Em'); assert.equal(capoShape('C', 0), 'C');
  for (const c of ['G', 'D', 'Em', 'C', 'Bb', 'F#m7', 'Bb/D']) for (let capo = 0; capo <= 11; capo++) assert.equal(soundingChord(capoShape(c, capo), capo), transposeChord(c, 0), `${c} capo ${capo}`);
});

test('progressão: separadores e inválidos', () => {
  assert.deepEqual(parseProgression('G - D - Em - C'), { chords: ['G', 'D', 'Em', 'C'], invalid: [] });
  assert.deepEqual(parseProgression('Am, F | C   G7'), { chords: ['Am', 'F', 'C', 'G7'], invalid: [] });
  assert.deepEqual(parseProgression('G H Em'), { chords: ['G', 'Em'], invalid: ['H'] });
  assert.deepEqual(parseProgression(''), { chords: [], invalid: [] });
});

test('sugestão de capo troca barras por formas abertas', () => {
  const hard = suggestCapo(['Bm', 'F#m', 'G', 'A']), none = hard.find((x) => x.capo === 0);
  assert.ok(hard[0].capo > 0 && hard[0].score < none.score, 'com capo fica mais fácil que sem capo');
  assert.deepEqual(hard.find((x) => x.capo === 2).shapes, ['Am', 'Em', 'F', 'G']);
  assert.equal(suggestCapo(['G', 'D', 'Em', 'C'])[0].capo, 0, 'já é fácil: sem capo');
  assert.equal(shapeDifficulty('G'), 0); assert.ok(shapeDifficulty('F') > 0); assert.ok(shapeDifficulty('Bbm') >= shapeDifficulty('F'));
  const top = suggestCapo(['Bb', 'Eb', 'F', 'Gm'])[0]; assert.ok(top.capo > 0 && top.score < suggestCapo(['Bb', 'Eb', 'F', 'Gm']).find((x) => x.capo === 0).score);
});

test('detecção de tonalidade', () => {
  assert.equal(detectKey(['G', 'D', 'Em', 'C']).name, 'G maior');
  assert.ok([0, 9].includes(detectKey(['Am', 'F', 'C', 'G']).tonic), 'Am-F-C-G é C maior / A menor (relativos)');
  assert.equal(detectKey(['Am', 'Dm', 'E', 'Am']).name, 'A menor');
  assert.equal(detectKey(['C', 'F', 'G', 'C']).name, 'C maior');
  assert.equal(detectKey([]), null);
  assert.ok(detectKey(['G', 'D', 'Em', 'C']).confidence > 0.7);
});

test('campo harmônico', () => {
  assert.deepEqual(diatonic(0, 'major').map((d) => d.chord), ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
  assert.deepEqual(diatonic(9, 'minor').map((d) => d.chord), ['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
  assert.equal(diatonic(7, 'major', true)[3].chord, 'C');
});

test('voicing de audição: contém fundamental e terça corretas', () => {
  const pcs = (s) => new Set(chordMidi(s).map((n) => n % 12));
  assert.ok(pcs('C').has(0) && pcs('C').has(4) && pcs('C').has(7));
  assert.ok(pcs('Am').has(9) && pcs('Am').has(0) && pcs('Am').has(4) && !pcs('Am').has(1), 'Am = A C E, sem C#');
  assert.ok(pcs('Em7').has(2) && pcs('Em7').has(7) && pcs('Em7').has(11));
  assert.ok(chordMidi('G').every((n) => n >= 38 && n <= 90)); assert.deepEqual(chordMidi('xyz'), []);
  assert.equal(chordMidi('D/F#')[0] % 12, 6);
});
