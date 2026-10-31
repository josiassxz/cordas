import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBleMidi } from '../js/device/guitar.js';
import { detectChord, matchChord, fretOf, noteAt, STANDARD } from '../js/music/theory.js';
import { CHORDS, chordById } from '../js/music/legacy.js';

const hex = (s) => Uint8Array.from(s.split(' ').map((h) => parseInt(h, 16)));

test('parser decodifica pacotes reais capturados da AG01', () => {
  assert.deepEqual(parseBleMidi(hex('80 80 94 3b 28')), [{ type: 'noteon', ch: 4, a: 59, b: 40 }]);
  assert.deepEqual(parseBleMidi(hex('80 80 b0 7b 00')), [{ type: 'cc', ch: 0, a: 123, b: 0 }]);
  const multi = parseBleMidi(hex('80 80 81 2d 01 80 80 82 32 01 80 80 83 37 01'));
  assert.equal(multi.length, 3); assert.ok(multi.every((m) => m.type === 'noteoff'));
});

test('cordas soltas 28 2d 32 37 3b 40 mapeiam para traste 0', () => {
  [0x28, 0x2d, 0x32, 0x37, 0x3b, 0x40].forEach((n, s) => assert.equal(fretOf(s, n), 0));
  assert.equal(noteAt(1, 3), STANDARD[1] + 3);
  assert.equal(fretOf(0, 0x27), -1, 'desvio -1 aparece como traste negativo até calibrar');
  assert.equal(fretOf(0, 0x27, -1), 0, 'com offset -1 volta a zero');
});

test('acordes da biblioteca v1 são reconhecidos', () => {
  for (const c of CHORDS) { assert.equal(detectChord(c.notes)?.root, c.root, c.id); assert.ok(matchChord(c.notes, c, 'strict').ok, c.id); }
  assert.equal(matchChord(chordById('A').notes, chordById('Am')).ok, false);
});
