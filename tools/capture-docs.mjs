// Gera as capturas de tela da documentação (aeroband-docs/images) com o Chrome sem tela.
// Uso: node tools/capture-docs.mjs [urlBase] [pastaSaida]     (o servidor ./serve.sh precisa estar rodando)
// Tudo é SIMULADO: a guitarra é emulada por eventos (nenhum aparelho é necessário) e os dados de progresso são de demonstração.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8731', OUT = process.argv[3] || 'aeroband-docs/images';
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(OUT, { recursive: true });
const port = 9700 + Math.floor(Math.random() * 200), profile = mkdtempSync(join(tmpdir(), 'corda-docs-'));
const chrome = spawn(CH, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--disable-gpu', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- helpers que rodam DENTRO da página ----
const PRE = `
window.__sleep = (ms) => new Promise((r) => setTimeout(r, ms));
window.__connect = () => { corda.guitar.setStatus('connected', 'AeroBand Midi 297b'); };
window.__open = (ex) => { document.querySelector('[data-a=toggle]'); };
window.__strum = (frets, dir = 'D') => { const notes = frets.map((f, s) => (f < 0 ? null : [40, 45, 50, 55, 59, 64][s] + f)); corda.guitar.simulateStrum(notes, dir, 55); };
window.__press = (pairs) => pairs.forEach(([s, f]) => corda.guitar.handle({ type: 'cc', ch: 5 - s, a: 49, b: f }, 0));
window.__runTo = async (beat) => { const r = corda.practice.current; while (r.position() < beat) await __sleep(10); };
window.__demoHits = async (n, wrongAt = -1) => { const r = corda.practice.current; for (let i = 0; i < n; i++) { const ev = r.upcoming(); if (!ev) break; await __runTo(ev.p * r.score.lengthBeats + ev.ev.beat - 0.01); corda.demoStrum(ev.ev.strum?.dir || 'D', i === wrongAt); await __sleep(30); } };
`;

const SEED = `
(() => {
  const day = 86400000, now = Date.now(), S = [];
  const mk = (d, t, ref, title, tech, lvl, bpm, acc, tm, dur) => S.push({ ts: now - d * day - (t || 0) * 60000, kind: 'exercise', refId: ref, title, technique: tech, level: lvl, bpm, speed: 1, durationSec: dur, accuracy: acc, timingMeanMs: tm, hits: { perfect: Math.round(acc / 10), good: 3, ok: 2, miss: Math.max(0, 10 - Math.round(acc / 10)), extra: 1 }, stringsOk: 40, stringsTotal: 48 });
  const plan = [[13, 'strum-down-em', 'Só para baixo: Em', 'strumming', 1, 60, 62, 55], [12, 'strum-down-em', 'Só para baixo: Em', 'strumming', 1, 64, 70, 40], [11, 'strum-pop-gdem', 'Pop clássico · G – D – Em – C', 'strumming', 2, 70, 58, 38], [9, 'chg-G-C-wait', 'G ⇄ C · devagar', 'chord-change', 2, 60, 66, 30], [8, 'strum-pop-gdem', 'Pop clássico · G – D – Em – C', 'strumming', 2, 72, 71, 26], [7, 'arp-Am-asc', 'Arpejo Am (subindo)', 'arpeggio', 2, 70, 74, 22], [6, 'chg-G-C-wait', 'G ⇄ C · devagar', 'chord-change', 2, 70, 79, 18], [5, 'strum-pop-gdem', 'Pop clássico · G – D – Em – C', 'strumming', 2, 76, 82, 14], [4, 'arp-Am-asc', 'Arpejo Am (subindo)', 'arpeggio', 2, 76, 85, 12], [3, 'strum-down-em', 'Só para baixo: Em', 'strumming', 1, 84, 91, 9], [2, 'chg-G-C-wait', 'G ⇄ C · devagar', 'chord-change', 2, 80, 88, 11], [1, 'strum-pop-gdem', 'Pop clássico · G – D – Em – C', 'strumming', 2, 84, 90, 8], [0, 'arp-Am-desc', 'Arpejo Am (descendo)', 'arpeggio', 2, 80, 87, 10]];
  plan.forEach(([d, ref, title, tech, lvl, bpm, acc, tm]) => { mk(d, 10, ref, title, tech, lvl, bpm, acc, tm, 180); if (d % 2 === 0) mk(d, 60, ref, title, tech, lvl, bpm + 4, Math.min(98, acc + 4), Math.max(5, tm - 3), 240); });
  corda.store.set('sessions', S);
  corda.store.set('days', [...new Set(S.map((s) => corda.store.dayKey(new Date(s.ts))))]);
  ['G', 'C', 'Em', 'Am', 'D'].forEach((c, i) => corda.store.set('chords.' + c, { tries: 14 + i, ok: 10 + i, streak: i < 3 ? 3 : 1 }));
  corda.store.set('favorites.chords', ['G', 'Em', 'Am7']); corda.store.set('favorites.exercises', ['strum-pop-gdem', 'arp-Am-asc']);
  corda.store.set('settings.stageScale', 130); corda.store.set('settings.latency', 85);
  corda.store.flush();
  return S.length + ' sessões de demonstração';
})()`;

// ---- cenas: [arquivo, rota, setup(js), espera após o setup (ms), altura opcional] ----
const SCENES = [
  ['01-home', 'home', `__connect()`, 600],
  ['02-fretboard-live-strum', 'chords', `__connect(); __strum([0,2,2,0,0,0]); await __sleep(700); __press([[1,2],[2,2]]);`, 300],
  ['03-fretboard-pressed-frets', 'chords', `__connect(); __press([[5,3],[1,2],[2,2],[0,3]]); await __sleep(300);`, 300],
  ['04-train-library', 'train', `__connect()`, 500],
  ['05-train-exercise-timeline', 'train?ex=strum-pop-gdem', `corda.startDemo(); document.querySelector('[data-a=toggle]').click(); await __sleep(300); while (corda.practice.current.position() < -0.05) await __sleep(10); await __demoHits(7, 4); await __sleep(400);`, 200],
  ['06-train-settings-popover', 'train?ex=strum-pop-gdem', `__connect(); document.querySelector('[data-a=gear]').click(); await __sleep(300);`, 200],
  ['07-train-note-highway-arpeggio', 'train?ex=arp-Am-asc', `corda.startDemo(); document.querySelector('[data-a=toggle]').click(); await __sleep(300); while (corda.practice.current.position() < -0.05) await __sleep(10); await __demoHits(5); await __sleep(300);`, 200],
  ['08-train-chord-change-timeline', 'train?ex=chg-G-C-wait', `corda.startDemo(); document.querySelector('[data-a=toggle]').click(); await __sleep(300); while (corda.practice.current.position() < 1.2) await __sleep(10);`, 200],
  ['09-chords-library', 'chords', `__connect()`, 700],
  ['10-chords-library-detail', 'chords', `__connect(); [...document.querySelectorAll('[data-sym]')].find(b => b.dataset.sym === 'G7')?.click(); await __sleep(500);`, 300],
  ['11-chords-listen-practice', 'chords', `__connect(); [...document.querySelectorAll('button')].find(b => /Praticar acorde/.test(b.textContent)).click(); await __sleep(400); document.querySelector('[data-dirwant="D"]').click(); await __sleep(300);`, 300],
  ['12-chords-listen-direction-wrong', 'chords', `__connect(); [...document.querySelectorAll('button')].find(b => /Praticar acorde/.test(b.textContent)).click(); await __sleep(400); document.querySelector('[data-dirwant="D"]').click(); await __sleep(300); const g = corda.guitar, nm = document.querySelector('.ch-name').textContent, F = {Em:[0,2,2,0,0,0],Am:[0,0,2,2,1,0],C:[0,3,2,0,1,0],G:[3,2,0,0,0,3],D:[0,0,0,2,3,2],E:[0,2,2,1,0,0]}[nm] || [0,2,2,0,0,0]; [5,4,3,2,1,0].forEach((s,i) => setTimeout(() => g.handle({type:'noteon',ch:s,a:[40,45,50,55,59,64][s]+F[s],b:40},0), i*60)); await __sleep(1000);`, 300],
  ['13-chords-drill-kinds', 'chords', `__connect(); [...document.querySelectorAll('button')].find(b => /Troca de acordes/.test(b.textContent)).click(); await __sleep(500);`, 300],
  ['14-chords-drill-assemble-config', 'chords', `__connect(); [...document.querySelectorAll('button')].find(b => /Troca de acordes/.test(b.textContent)).click(); await __sleep(400); document.querySelector('[data-kind=assemble]').click(); await __sleep(500);`, 300],
  ['15-chords-drill-assemble-running', 'chords', `__connect(); [...document.querySelectorAll('button')].find(b => /Troca de acordes/.test(b.textContent)).click(); await __sleep(400); document.querySelector('[data-kind=assemble]').click(); await __sleep(300); document.querySelector('[data-act=startdrill]').click(); await __sleep(300); const r = corda.practice.current; while (r.position() < -0.2) await __sleep(10); const fr = r.score.events[0].strum.frets; while (r.position() < 0.02) await __sleep(5); fr.forEach((f, s) => { if (f > 0) corda.guitar.handle({type:'cc',ch:5-s,a:49,b:f},0); }); await __sleep(800); const fr2 = r.score.events[1].strum.frets; fr.forEach((f, s) => { if (f > 0) corda.guitar.handle({type:'cc',ch:5-s,a:50,b:f},0); }); await __sleep(150); while (r.position() < 3.9) await __sleep(10);`, 200],
  ['16-chords-picker-modal', 'chords', `__connect(); [...document.querySelectorAll('button')].find(b => /Troca de acordes/.test(b.textContent)).click(); await __sleep(400); document.querySelector('[data-kind=custom]').click(); await __sleep(300); document.querySelector('[data-act=pickseq]').click(); await __sleep(600);`, 300],
  ['17-chords-picker-variations', 'chords', `__connect(); [...document.querySelectorAll('button')].find(b => /Troca de acordes/.test(b.textContent)).click(); await __sleep(400); document.querySelector('[data-kind=custom]').click(); await __sleep(300); document.querySelector('[data-act=pickseq]').click(); await __sleep(600); document.querySelectorAll('.cpk-step')[3].querySelector('b').click(); await __sleep(500);`, 300],
  ['18-rhythm-metronome', 'rhythm', `__connect(); document.querySelector('[data-a=toggle]').click(); await __sleep(3300);`, 200],
  ['19-rhythm-patterns', 'rhythm?tab=patterns', `__connect(); document.querySelector('[data-pat="1"]').click(); await __sleep(400);`, 300],
  ['20-rhythm-chords-in-rhythm', 'rhythm?tab=chords', `__connect(); await __sleep(500);`, 300],
  ['21-rhythm-builder-simple', 'rhythm?tab=builder', `__connect(); await __sleep(500);`, 300],
  ['22-rhythm-builder-semitab', 'rhythm?tab=builder', `__connect(); document.querySelector('[data-bm=semi]').click(); await __sleep(300); const dt = new DataTransfer(); const fire = (el, t) => el.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt })); const sel = document.querySelector('#stdrop'); sel.value = 'beat'; sel.dispatchEvent(new Event('change', { bubbles: true })); for (const [c, i] of [['G', 0], ['D', 8], ['Em', 16], ['C', 24]]) { fire(document.querySelector('[data-chip="' + c + '"]'), 'dragstart'); const x = document.querySelector('.st-cell[data-i="' + i + '"]'); fire(x, 'dragover'); fire(x, 'drop'); } const pd = (el, o = {}) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ...o })); pd(document.querySelector('.st-cell[data-i="2"]')); pd(document.querySelector('.st-cell[data-i="6"]'), { shiftKey: true }); window.dispatchEvent(new PointerEvent('pointerup')); [...document.querySelectorAll('[data-set]')].find(b => b.dataset.set === 'U').click(); await __sleep(400);`, 300],
  ['23-rhythm-path', 'rhythm?tab=path', `__connect(); await __sleep(400);`, 300],
  ['24-progress-overview', 'progress', `__connect(); await __sleep(500);`, 300],
  ['25-progress-techniques', 'progress', `[...document.querySelectorAll('[data-tab]')].find(b => b.dataset.tab === 'tecnicas').click(); await __sleep(400);`, 300],
  ['26-progress-chords', 'progress', `[...document.querySelectorAll('[data-tab]')].find(b => b.dataset.tab === 'acordes').click(); await __sleep(400);`, 300],
  ['27-progress-history', 'progress', `[...document.querySelectorAll('[data-tab]')].find(b => b.dataset.tab === 'historico').click(); await __sleep(400);`, 300],
  ['28-progress-goals', 'progress', `[...document.querySelectorAll('[data-tab]')].find(b => b.dataset.tab === 'metas').click(); await __sleep(400);`, 300],
  ['29-progress-routines', 'progress', `[...document.querySelectorAll('[data-tab]')].find(b => b.dataset.tab === 'rotinas').click(); await __sleep(400);`, 300],
  ['30-progress-paths', 'progress', `[...document.querySelectorAll('[data-tab]')].find(b => b.dataset.tab === 'trilhas').click(); await __sleep(400);`, 300],
  ['31-lab-raw-monitor', 'lab', `__connect(); const g = corda.guitar; __strum([0,2,2,0,0,0], 'D'); await __sleep(900); __strum([0,2,2,0,0,0], 'U'); await __sleep(900); __press([[1,2],[2,2]]); await __sleep(300); corda.guitar.handle({type:'cc',ch:4,a:50,b:2},0);`, 400],
  ['32-settings-dialog', 'train', `__connect(); document.querySelector('#settingsBtn').click(); await __sleep(400);`, 300],
  ['33-calibration-timing', 'train?ex=strum-pop-gdem', `__connect(); document.querySelector('[data-a=gear]').click(); document.querySelector('[data-a=sync]').click(); await __sleep(500); document.querySelector('#syGo').click(); await __sleep(6800);`, 300],
  ['34-instrument-menu', 'chords', `__connect(); document.querySelector('#instrBtn, [data-instr], #instrument')?.click(); await __sleep(300);`, 300],
];

try {
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === 'page')) break; } catch { /* aguardando */ } await sleep(250); }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(), errors = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const run = async (expr) => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) errors.push('setup: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); return r.result?.result?.value; };
  const nav = async (route, n) => { await send('Page.navigate', { url: `${BASE}/?s=${n}#/${route}` }); await sleep(1700); await run(PRE); };
  // semente (uma vez): dados de demonstração para a tela de Progresso/Início
  await nav('home', 0); console.log('seed:', await run(`return ${SEED.trim()}`)); await sleep(400);
  let n = 1;
  for (const [name, route, setup, wait] of SCENES) {
    await nav(route, n++); const before = errors.length;
    try { await run(setup); } catch (e) { errors.push(name + ': ' + e.message); }
    await sleep(wait);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, name + '.png'), Buffer.from(shot.result.data, 'base64'));
    const info = await run(`return 'sessões=' + corda.store.get('sessions', []).length + ' extras=' + (document.querySelector('[data-s=extra]')?.textContent ?? '-')`);
    console.log(errors.length > before ? '⚠ ' : '✓ ', name, info, errors.length > before ? errors.slice(before).join(' | ').slice(0, 160) : '');
  }
  console.log('erros no total:', errors.length);
} finally { chrome.kill(); }
