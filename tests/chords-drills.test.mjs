import test from 'node:test';
import assert from 'node:assert/strict';
import { changeDrill, progressionDrill, positionDrill, voicingChangeDrill, buildDrill, validateScore, PROGRESSION_PRESETS, PAIR_PRESETS, POSITION_PRESETS, pickVoicing } from '../js/content/chord-drills.js';
import { voicingsOf } from '../js/music/chords.js';

test('troca A↔B gera Score válido (timed: 1 palhetada por batida)', () => {
  const { score, sequence } = changeDrill('Em', 'Am', { beatsPerChord: 4, rounds: 3, bpm: 70 });
  assert.deepEqual(validateScore(score), []);
  assert.equal(sequence.length, 2); assert.equal(score.lengthBeats, 4 * 2 * 3); assert.equal(score.events.length, 24);
  assert.equal(score.bpm, 70); assert.equal(score.mode, 'timed'); assert.equal(score.technique, 'chord-change');
  assert.equal(score.chords.length, 6); assert.deepEqual(score.chords.map((c) => c.chordId), ['Em', 'Am', 'Em', 'Am', 'Em', 'Am']);
  assert.ok(score.events.every((e) => e.beat < score.lengthBeats && e.strum.strings.length >= 3));
});

test('modo wait: um evento por acorde e sem exigir tempo', () => {
  const { score } = changeDrill('G', 'C', { mode: 'wait', rounds: 2 });
  assert.deepEqual(validateScore(score), []);
  assert.equal(score.mode, 'wait'); assert.equal(score.events.length, 4);
  assert.ok(score.events.every((e) => e.check.strings && e.check.pitch && !e.check.timing));
});

test('todos os presets de pares e progressões geram Scores válidos', () => {
  for (const [a, b] of PAIR_PRESETS) assert.deepEqual(validateScore(changeDrill(a, b).score), [], `${a}-${b}`);
  for (const p of PROGRESSION_PRESETS) {
    const { score, sequence } = progressionDrill(p.symbols, { title: p.name });
    assert.deepEqual(validateScore(score), [], p.id); assert.equal(sequence.length, p.symbols.length);
  }
});

test('sequência por posição sobe e desce o braço; troca entre digitações do mesmo acorde', () => {
  for (const s of POSITION_PRESETS) {
    const { sequence, score } = positionDrill(s);
    assert.deepEqual(validateScore(score), [], s);
    const bases = sequence.map((v) => v.baseFret);
    assert.ok(Math.max(...bases) > Math.min(...bases), `${s} tem várias posições`);
    assert.ok(sequence.every((v) => v.symbol === s || v.symbol === voicingsOf(s)[0].symbol));
  }
  const { sequence } = voicingChangeDrill('C');
  assert.equal(sequence.length, 2); assert.notEqual(sequence[0].frets.join(), sequence[1].frets.join());
  assert.equal(sequence[0].symbol, sequence[1].symbol);
});

test('buildDrill despacha por tipo e rejeita tipo desconhecido', () => {
  assert.ok(buildDrill('pair', { a: 'D', b: 'A' }).score);
  assert.ok(buildDrill('progression', { symbols: ['C', 'G'] }).score);
  assert.ok(buildDrill('positions', { symbol: 'Am' }).score);
  assert.ok(buildDrill('voicings', { symbol: 'G' }).score);
  assert.throws(() => buildDrill('nada', {}));
  assert.throws(() => progressionDrill([]));
});

test('pickVoicing: fácil prefere iniciante sem pestana; aberta prefere forma aberta', () => {
  const f = pickVoicing('F'); assert.ok(!f.barre || f.difficulty <= 2);
  assert.ok(pickVoicing('G', 'aberta').tags.includes('aberto'));
  assert.equal(pickVoicing('C', 0), voicingsOf('C')[0]);
});

test('validateScore detecta Scores quebrados', () => {
  assert.ok(validateScore({}).length > 0);
  const s = changeDrill('Em', 'Am').score;
  assert.ok(validateScore({ ...s, mode: 'xx' }).length > 0);
  assert.ok(validateScore({ ...s, events: [{ ...s.events[0], beat: 999 }] }).length > 0);
});
