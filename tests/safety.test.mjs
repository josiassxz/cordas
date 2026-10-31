// Garantia de integridade da AeroBand AG01: o código do app NUNCA escreve na guitarra.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === 'legacy' ? [] : walk(p)) : p.endsWith('.js') ? [p] : []; });
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const files = walk(new URL('../js', import.meta.url).pathname);

test('nenhum módulo usa APIs de escrita GATT/SysEx', () => {
  const banned = [/\.writeValue\w*\s*\(/, /sendSysEx/i, /sysex\s*:\s*true/i, /\.send\(\s*\[/, /\.output\w*\.send/i];
  const hits = [];
  for (const f of files) { const src = strip(readFileSync(f, 'utf8')); for (const re of banned) if (re.test(src)) hits.push(`${f}: ${re}`); }
  assert.deepEqual(hits, []);
});

test('a única operação GATT permitida é leitura de notificações', () => {
  const src = strip(readFileSync(new URL('../js/device/guitar.js', import.meta.url), 'utf8'));
  assert.match(src, /startNotifications/);
  assert.doesNotMatch(src, /writeValue|sendSysEx|\.send\(/);
});
