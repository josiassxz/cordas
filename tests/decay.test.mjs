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

test('CC 49 aperta e CC 50 solta a casa (ordem das cordas invertida)', () => {
  const g = new Guitar();
  const ev = []; g.addEventListener('press', (e) => ev.push(['p', e.detail.string, e.detail.fret])); g.addEventListener('unpress', (e) => ev.push(['u', e.detail.string]));
  g.handle({ type: 'cc', ch: 4, a: 49, b: 3 }, 0);            // casa 3, corda Lá (índice 1)
  g.handle({ type: 'noteon', ch: 0, a: 40, b: 40 }, 0);       // palhetar outra corda não solta a casa
  assert.equal(g.pressed.get(1), 3);
  g.handle({ type: 'cc', ch: 4, a: 50, b: 2 }, 0);            // "soltou" de outra casa: ignora
  assert.equal(g.pressed.get(1), 3);
  g.handle({ type: 'cc', ch: 4, a: 50, b: 3 }, 0);
  assert.equal(g.pressed.size, 0);
  assert.deepEqual(ev, [['p', 1, 3], ['u', 1]]);
});

test('palhetada: direção pela ordem das cordas e corte de 260 ms entre cordas', async () => {
  const g = new Guitar(), out = []; g.addEventListener('strum', (e) => out.push([e.detail.dir, e.detail.order.join('')]));
  const play = (order, gap) => order.forEach((s, i) => setTimeout(() => g.handle({ type: 'noteon', ch: s, a: 40 + s, b: 40 }, 0), i * gap));
  play([0, 1, 2, 3, 4, 5], 200);                 // 0,2 s entre cordas (como na guitarra real): continua UMA palhetada
  await new Promise((r) => setTimeout(r, 1900));
  play([5, 4, 3, 2, 1, 0], 60);
  await new Promise((r) => setTimeout(r, 700));
  assert.deepEqual(out, [['D', '012345'], ['U', '543210']]);
});
