// Verificação do grafo Web Audio real no Chrome headless (OfflineAudioContext). Pula se não houver Chrome/servidor.
// Usa o protocolo de depuração (CDP) para esperar a renderização terminar de verdade.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', PAGE = 'http://127.0.0.1:8731/tests/browser/audio-offline.html', PORT = 9337;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const up = async () => { try { return (await fetch(PAGE)).ok; } catch { return false; } };

async function runPage() {
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'corda-'))}`, PAGE], { stdio: 'ignore' });
  try {
    let target;
    for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { /* ainda subindo */ } }
    assert.ok(target, 'Chrome não abriu a página');
    const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const pending = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); };
    const call = (method, params) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
    for (let i = 0; i < 160; i++) {
      const r = await call('Runtime.evaluate', { expression: 'document.title' });
      const t = r.result?.result?.value || '';
      if (t.startsWith('RESULT:')) { ws.close(); return JSON.parse(t.slice(7)); }
      await sleep(500);
    }
    throw new Error('a página não terminou em 80 s');
  } finally { proc.kill('SIGKILL'); }
}

test('cadeia de efeitos: renderiza todos os presets sem erro, sem NaN, sem estouro', async (t) => {
  if (!existsSync(CHROME) || !(await up())) return t.skip('Chrome ou servidor local (./serve.sh) indisponível');
  const r = await runPage();
  assert.deepEqual(r.errors, [], 'console limpo');
  assert.equal(Object.keys(r.presets).length, 9);
  for (const [id, s] of Object.entries(r.presets)) { assert.equal(s.bad, 0, `${id} tem NaN/Infinito`); assert.ok(s.rms > 0.005, `${id} está mudo (rms ${s.rms})`); assert.ok(s.peak <= 1.0001, `${id} estourou (${s.peak})`); }
  assert.equal(r.checks.clickMaxDiff, 0, 'clique do metrônomo não passa pelos efeitos');
  assert.ok(r.checks.clickPeak > 0.1, 'clique audível');
  assert.ok(r.checks.hfMetal > r.checks.hfSteel * 1.5, `metal deve ter mais agudos que o aço (metal ${r.checks.hfMetal}, aço ${r.checks.hfSteel})`);
  assert.ok(r.checks.tailWithFx > r.checks.tailNoFx * 3, `delay+reverb geram cauda (${r.checks.tailWithFx} vs ${r.checks.tailNoFx})`);
  assert.deepEqual(r.checks.ab, ['b:jazz', 'b:metal', 'b:jazz']);
  assert.equal(Math.round(r.checks.volume * 10), 3);
});
