import test from 'node:test';
import assert from 'node:assert/strict';

test('relayoutScore: mais batidas por tempo repete o padrão; menos corta; mudar várias vezes não acumula', async () => {
  const { normalizeScore, relayoutScore } = await import('../js/engine/score.js');
  const slots = 'D-DU-UDU';   // 8 fatias em 4/4 com 2 por tempo
  const events = [...slots].map((c, i) => (c === '-' ? null : { beat: i / 2, dur: 0.5, strum: { dir: c, strings: [0, 1, 2, 3, 4, 5] } })).filter(Boolean);
  const sc = normalizeScore({ id: 'p', title: 'p', bpm: 90, beatsPerBar: 4, subdivision: 2, lengthBeats: 8, events });
  const n0 = sc.events.length;
  relayoutScore(sc, 4, 4);                                    // 4 por tempo: 16 fatias por compasso -> padrão tocado 2×
  assert.equal(sc.events.length, n0 * 2); assert.equal(sc.subdivision, 4);
  assert.deepEqual(sc.events.slice(0, 3).map((e) => e.beat), [0, 0.5, 0.75]);          // fatia 0, 2 e 3 agora valem 1/4 de tempo
  assert.equal(sc.events[n0].beat, 2);                                                // 2ª repetição começa no tempo 3
  assert.equal(sc.lengthBeats, 8);
  relayoutScore(sc, 4, 1);                                    // 1 por tempo: só 4 fatias por compasso -> corta o resto
  assert.ok(sc.events.every((e) => e.beat % 4 < 4) && sc.events.length < n0);
  relayoutScore(sc, 4, 2);                                    // voltar ao original reproduz o original (não acumula)
  assert.deepEqual(sc.events.map((e) => [e.beat, e.strum.dir]), events.map((e) => [e.beat, e.strum.dir]));
  relayoutScore(sc, 3, 2);                                    // 3/4: 6 fatias por compasso, comprimento = 2 compassos de 3 tempos
  assert.equal(sc.lengthBeats, 6); assert.ok(sc.events.every((e) => e.beat < 6));
});
