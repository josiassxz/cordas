import test from 'node:test';
import assert from 'node:assert/strict';
import { chordDiagram } from '../js/ui/chord-diagram.js';
import { voicingsOf } from '../js/music/chords.js';

test('diagrama: SVG com X, O, dedos coloridos, pestana e casa base', () => {
  const a = voicingsOf('A')[0], svg = chordDiagram(a, { size: 'lg' });
  assert.match(svg, /^<svg /); assert.match(svg, /aria-label="A: corda 1 abafada/);
  assert.equal((svg.match(/stroke-linecap:round;fill:none/g) || []).length, 1, 'um X (6ª corda abafada)');
  assert.ok(svg.includes('var(--f1)') && svg.includes('var(--f2)') && svg.includes('var(--f3)'), 'cores dos dedos 1-3');
  const barre = voicingsOf('Am').find((v) => v.barre && v.baseFret > 1);
  const b = chordDiagram(barre, { size: 'md' });
  assert.ok(b.includes('<rect') && b.includes(`${barre.baseFret}ª`), 'pestana e número da casa base');
});
test('diagrama: tamanhos, título, notas e rótulos', () => {
  const v = voicingsOf('G')[0];
  assert.match(chordDiagram(v, { size: 'sm' }), /width="78"/); assert.match(chordDiagram(v, { size: 'lg' }), /width="230"/);
  assert.ok(chordDiagram(v, { showTitle: true }).includes('>G</text>'));
  assert.ok(chordDiagram(v, { showNotes: true }).includes('var(--accent-2)'), 'raiz destacada nas notas');
  assert.ok(chordDiagram(v, { label: 'note' }).includes('font:800 7.5px'));
  assert.ok(chordDiagram(v, { label: 'none' }).length > 100);
});
