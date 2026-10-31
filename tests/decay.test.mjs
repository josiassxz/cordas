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
