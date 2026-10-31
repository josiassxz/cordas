// Mini cliente do protocolo de depuração do Chrome (CDP) para testes de interface. Sem dependências.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const hasChrome = () => existsSync(CHROME);
export const serverUp = async (url) => { try { return (await fetch(url)).ok; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function openPage(url, port) {
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'corda-'))}`, 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* subindo */ } }
  if (!target) { proc.kill('SIGKILL'); throw new Error('Chrome não abriu'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); };
  const call = (method, params, ms = 20000) => new Promise((r, j) => { const n = ++id, t = setTimeout(() => { pending.delete(n); j(new Error('CDP sem resposta: ' + method)); }, ms); pending.set(n, (d) => { clearTimeout(t); r(d); }); ws.send(JSON.stringify({ id: n, method, params })); });
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: "window.__errs=[];addEventListener('error',e=>__errs.push(e.message));addEventListener('unhandledrejection',e=>__errs.push(String(e.reason)));const ce=console.error;console.error=(...a)=>{__errs.push(a.join(' '));ce(...a)};" });
  await call('Page.navigate', { url });
  const evaluate = async (expression) => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, expression.length > 200 ? 60000 : 2000); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'erro no navegador'); return r.result?.result?.value; };
  const ready = async () => { for (let i = 0; i < 60; i++) { await sleep(250); try { if (await evaluate("typeof corda !== 'undefined'")) return; } catch { /* carregando */ } } throw new Error('o app não carregou'); };
  await ready();
  const reload = async () => { await call('Page.reload'); await ready(); };
  return { evaluate, reload, close: () => { try { ws.close(); } catch { /* já fechado */ } proc.kill('SIGKILL'); } };
}
