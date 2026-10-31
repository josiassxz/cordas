import test from 'node:test';
import assert from 'node:assert/strict';
import { Guitar } from '../js/device/guitar.js';

test('corda sem note-off é apagada após sustainMs; CC123 apaga na hora', async () => {
  const g = new Guitar(); g.sustainMs = 50;
  const offs = []; g.addEventListener('noteoff', (e) => offs.push(e.detail));
  g.handle({ type: 'noteon', ch: 0, a: 40, b: 40 }, 0);
  assert.equal(g.active.size, 1);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(g.active.size, 0);
  assert.equal(offs[0].estimated, true);
  g.handle({ type: 'noteon', ch: 1, a: 45, b: 40 }, 0);
  g.handle({ type: 'cc', ch: 1, a: 123, b: 0 }, 0);
  assert.equal(g.active.size, 0);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(offs.length, 1);
});

test('CC 49/50 viram casa pressionada e expiram', async () => {
  const g = new Guitar(); g.pressMs = 40;
  const ev = []; g.addEventListener('press', (e) => ev.push(e.detail)); g.addEventListener('unpress', (e) => ev.push('u' + e.detail.string));
  g.handle({ type: 'cc', ch: 2, a: 49, b: 5 }, 0);
  g.handle({ type: 'cc', ch: 2, a: 50, b: 5 }, 0);
  assert.deepEqual(ev, [{ string: 3, fret: 5 }]);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(g.pressed.size, 0); assert.equal(ev.at(-1), 'u3');
});

test('casa pressionada vale enquanto o fluxo de CC continua e sai quando ele para', async () => {
  const g = new Guitar(); g.pressMs = 60;
  const ev = []; g.addEventListener('unpress', (e) => ev.push(e.detail.string));
  g.handle({ type: 'cc', ch: 2, a: 49, b: 5 }, 0);
  for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 40)); g.handle({ type: 'cc', ch: 0, a: 49, b: 5 }, 0); }
  assert.equal(g.pressed.has(3), true);   // fluxo vivo (outra corda), a corda 3 continua marcada
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(g.pressed.size, 0);
});
