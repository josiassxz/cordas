// app.practice: inicia um Score num Runner e (se houver `host`) monta pista + transporte + feedback + resumo.
// Também mostra as posições esperadas (e acertos/erros por corda) no braço do palco (app.stage).
import { Runner, validationOf } from './runner.js';
import { Highway } from './highway.js';
import { Lane } from './lane.js';
import { mountTransport } from './transport-ui.js';
import { icon, esc, clamp } from '../core/dom.js';
import { STANDARD, fretOf } from '../music/theory.js';
import { expectedFret, fingerOf } from './score.js';

const LEVELS = ['Iniciante', 'Básico', 'Intermediário', 'Avançado', 'Expert'];
const MSG = { perfect: 'Perfeito', good: 'Bom', ok: 'No limite', miss: 'Perdeu' };

export function installPractice(app) {
  app.practice = { ready: true, current: null, start: (score, opts = {}) => startPractice(app, score, opts), stopAll() { this.current?.destroy(); this.current = null; } };
}

function startPractice(app, score, opts = {}) {
  app.practice.stopAll();   // só existe UM exercício ativo: o anterior é desmontado (tecla P, clique e áudio) antes de começar outro
  const deps = { guitar: app.guitar, audio: app.audio, learn: app.learn, settings: () => app.store.get('settings'), setTolerance: (t) => app.store.set('settings.timingTolerance', t), setValidation: ({ neck, sound }) => { if (neck != null) app.store.set('settings.validateNeck', neck); if (sound != null) app.store.set('settings.validateSound', sound); } };
  const run = new Runner(deps, score, { ...opts, onFinish: undefined });
  let ui = null;
  const handle = run;
  handle.destroy = ((orig) => () => { ui?.destroy(); ui = null; orig(); if (app.practice.current === handle) app.practice.current = null; app.demoChord = null; clearStage(app); })(run.destroy.bind(run));
  app.practice.current = handle;
  if (opts.host) ui = mountUI(app, run, opts);
  app.demoChord = () => run.demoFrets();
  if (opts.autostart !== false) run.start();
  return handle;
}

function clearStage(app) { app.stage?.clearExpected(); app.stage?.setAvoid([]); }

function stagePositions(ev) {
  if (ev.kind === 'strum') return ev.strum.strings.map((s) => ({ string: s, fret: ev.strum.frets?.[s] ?? 0, finger: ev.strum.fingers?.[s] || undefined }));
  return (ev.notes || []).map((n) => ({ string: n.string, fret: n.fret, finger: n.finger }));
}

function mountUI(app, run, opts) {
  const { host, meta = {} } = opts, sc = run.score;
  const notes = meta.limitations || [];
  host.innerHTML = `<div class="pr">
    <div class="pr-head">
      ${opts.onClose ? `<button class="btn ghost sm" data-close>${icon('chev', 'flip')} Voltar</button>` : ''}
      <div class="grow"><div class="h2">${esc(sc.title)}</div>
        <div class="row wrap" style="gap:6px;margin-top:4px"><span class="chip">${LEVELS[sc.level - 1] || ''}</span>${meta.guide ? '<span class="badge guide">guia</span>' : ''}<span class="chip">${sc.beatsPerBar}/4 · ${sc.mode === 'wait' ? 'acerte dentro do trecho' : 'no tempo'}</span></div></div>
      <div class="pr-state muted" aria-live="polite"></div>
    </div>
    ${notes.length ? `<div class="pr-notice"><span class="badge guide">guia</span><div>${notes.map(esc).join(' ')}</div></div>` : ''}
    <div class="pr-calib" hidden><span>Calibre o timing antes de começar: o app mede seu atraso e o acerto fica o mais preciso possível.</span><button class="btn sm primary" data-calib>Calibrar agora</button><button class="btn ghost sm" data-calib-skip>Agora não</button></div>
    <div class="pr-bar"></div>
    <div class="pr-hw"><canvas aria-label="Pista de notas e batidas"></canvas><button class="pr-full" data-full aria-label="Timeline em tela cheia (F)" title="Timeline em tela cheia (F)">⛶</button><div class="pr-flash" aria-live="polite"></div></div>
    <div class="pr-needle" aria-hidden="true"><span class="lbl l">cedo</span><span class="lbl r">tarde</span><div class="track"></div><div class="mid"></div><div class="needle"></div></div>
    <div class="pr-stats num"><span>Acerto <b data-s="acc">–</b></span><span>Perfeitas <b data-s="perfect">0</b></span><span>Boas <b data-s="good">0</b></span><span>No limite <b data-s="ok">0</b></span><span>Perdidas <b data-s="miss">0</b></span><span>Extras <b data-s="extra">0</b></span></div>
    <div class="pr-summary panel" hidden></div>
  </div>`;
  const $ = (s) => host.querySelector(s), flash = $('.pr-flash'), needle = $('.needle'), summary = $('.pr-summary');
  const cv = $('canvas');
  // Ritmo/palhetada: pista vertical de setas descendo. Notas soltas (arpejos, escalas…): a pista horizontal de sempre.
  const strums = sc.events.filter((e) => e.kind === 'strum').length, notesN = sc.events.filter((e) => e.kind === 'note').length;
  const vertical = strums > 0 && strums >= notesN;
  host.querySelector('.pr-hw').classList.toggle('lane', vertical);
  const outLat = () => { const c = app.audio.context; return ((c?.outputLatency || 0) + (c?.baseLatency || 0)) * run.effectiveBpm / 60; };   // o que você VÊ acompanha o que você OUVE
  const hw = new (vertical ? Lane : Highway)(cv, () => ({ okMs: run.evaluator?.win.ok ?? 0, goodMs: run.evaluator?.win.good ?? 0, perfectMs: run.evaluator?.win.perfect ?? 0, bpmEff: run.effectiveBpm, score: run.score, pos: run.position() - (run.state === 'running' || run.state === 'countin' ? outLat() : 0), results: run.results, passes: run.passes, state: run.state, mode: run.mode }));
  hw.start();
  const tr = mountTransport($('.pr-bar'), run);
  const counts = { perfect: 0, good: 0, ok: 0, miss: 0, extra: 0 };
  let holdUntil = 0, lastKey = null, flashTimer;

  const setFlash = (txt, cls = '') => { flash.className = `pr-flash ${cls}`; flash.textContent = txt; clearTimeout(flashTimer); flashTimer = setTimeout(() => { flash.textContent = ''; }, 900); };
  const paintStats = () => {
    for (const k of Object.keys(counts)) $(`[data-s=${k}]`).textContent = counts[k];
    const n = counts.perfect + counts.good + counts.ok + counts.miss;
    $('[data-s=acc]').textContent = n ? `${Math.round((counts.perfect + counts.good * 0.75 + counts.ok * 0.45) / n * 100)}%` : '–';
  };
  const calib = $('.pr-calib');
  const paintCalib = () => { calib.hidden = !(run.state === 'idle' && app.guitar.status === 'connected' && !app.isCalibrated?.() && !sessionStorage.getItem('corda.calibSkip')); };
  const label = { idle: 'Pronto — aperte Iniciar (ou P)', countin: 'Prepare-se…', running: 'Tocando', paused: 'Pausado', finished: 'Concluído' };
  const paintState = () => { paintCalib(); $('.pr-state').textContent = label[run.state] || ''; if (run.state === 'countin' || run.state === 'running') summary.hidden = true; };

  function syncStage() {
    if (!app.stage || performance.now() < holdUntil) return;
    const u = run.upcoming();
    const key = u ? `${u.key}:${run.state}` : 'none';
    if (key === lastKey) return; lastKey = key;
    if (!u) return clearStage(app);
    app.stage.setExpected(stagePositions(u.ev));
    const keep = u.ev.kind === 'strum' ? new Set(u.ev.strum.strings) : new Set();
    app.stage.setAvoid([...new Set([...(u.ev.avoid || []), ...(u.ev.kind === 'strum' ? [0, 1, 2, 3, 4, 5].filter((s) => !keep.has(s)) : [])])]);
  }

  const offs = [
    run.on('reset', () => { Object.keys(counts).forEach((k) => (counts[k] = 0)); paintStats(); needle.style.opacity = 0; summary.hidden = true; lastKey = null; }),
    run.on('state', () => { paintState(); lastKey = null; syncStage(); }),
    run.on('progress', syncStage),
    run.on('result', (r) => {
      const nm = run.chordAt?.(r.beat)?.chordId;
      counts[r.grade] = (counts[r.grade] || 0) + 1; paintStats();
      if (r.grade !== 'miss') {
        if (r.heardName && nm && r.heardName.replace(/\s/g, '') !== nm.replace(/\s/g, '')) setFlash(`✓ Conta como ${nm} (você fez ${r.heardName})`, r.grade); else
        setFlash(`${MSG[r.grade]}${r.delta != null && Math.abs(r.delta) > 12 ? ` · ${r.delta > 0 ? 'atrasado' : 'adiantado'} ${Math.abs(Math.round(r.delta))} ms` : ''}${r.dirOk === false ? ' · direção diferente' : ''}`, r.grade);
        if (r.delta != null) { const lim = Math.min(200, 60000 / run.effectiveBpm / run.score.subdivision * 0.45); needle.style.opacity = 1; needle.style.left = `${50 + clamp(r.delta / lim, -1, 1) * 50}%`; }
      } else setFlash(r.why?.text || 'Perdeu essa', 'miss');
      if (app.stage) {
        const u = run.score.events[r.i]; if (!u) return;
        const items = stagePositions(u).map((p) => ({ ...p, state: r.strings[p.string] === 'ok' ? 'hit' : 'miss' }));
        app.stage.setExpected(items); holdUntil = performance.now() + 420; lastKey = null;
        setTimeout(syncStage, 440);
      }
    }),
    run.on('feedback', (f) => {
      counts.extra += f.type === 'extra' || f.type === 'avoid' ? 1 : 0; if (f.type === 'extra' || f.type === 'avoid') paintStats();
      const fret = clamp(fretOf(f.string, f.note, 0), 0, 22);
      if (f.type === 'wrongNeck') { app.stage?.flash(f.string, fret, 'bad'); setFlash(f.why?.text || 'Montagem diferente do pedido', 'bad'); }
      else if (f.type === 'hit' && f.tail) { /* resto da palhetada: já contou */ }
      else if (f.type === 'hit') app.stage?.flash(f.string, f.fret ?? fret, 'ok');
      else { app.stage?.flash(f.string, fret, 'bad'); setFlash(f.type === 'wrongPitch' ? 'Corda certa, nota errada' : f.type === 'avoid' ? 'Essa corda deveria ficar de fora' : validationOf(app.store.get('settings')).sound !== 'strings' ? 'Fora do tempo' : 'Corda errada', 'bad'); }
    }),
    run.on('attempt', (a) => { if (a.ok) setFlash('Acertou!', 'perfect'); else setFlash(a.missing.length ? `Faltou a corda ${a.missing.map((s) => 6 - s).join(', ')}` : a.avoid.length ? 'Tem corda tocando que devia ficar de fora' : a.wrongPitch.length ? 'Nota errada' : 'Quase — confira o braço', 'bad'); }),
    run.on('finish', (s) => showSummary(s)),
  ];

  function showSummary(s) {
    const late = Math.round(s.timingMeanMs ?? 0);
    const tip = s.timingMeanMs == null ? '' : Math.abs(late) < 15 ? 'Seu tempo está muito bem calibrado.' : late > 0 ? `Você tende a tocar ${late} ms atrasado.` : `Você tende a tocar ${-late} ms adiantado.`;
    const apply = s.timingMeanMs != null && Math.abs(late) >= 30 ? `<button class="btn" data-apply="${late}">Compensar ${late > 0 ? '+' : '−'}${Math.abs(late)} ms de latência</button>` : '';
    summary.hidden = false;
    summary.innerHTML = `<div class="row between wrap"><div><div class="h3">${s.reason === 'done' ? 'Resultado' : 'Resultado parcial'}</div><div class="big-num" style="color:var(--${s.accuracy >= 80 ? 'ok' : s.accuracy >= 50 ? 'accent' : 'bad'})">${s.accuracy}%</div></div>
      <div class="pr-sum-grid num"><div><b>${s.perfect}</b><small>perfeitas</small></div><div><b>${s.good}</b><small>boas</small></div><div><b>${s.ok}</b><small>no limite</small></div><div><b>${s.miss}</b><small>perdidas</small></div><div><b>${s.extras}</b><small>fora de lugar</small></div>
      ${s.stringsTotal ? `<div><b>${s.stringsOk}/${s.stringsTotal}</b><small>cordas certas</small></div>` : ''}${s.dirAccuracy != null ? `<div><b>${s.dirAccuracy}%</b><small>direção (inferida)</small></div>` : ''}${s.chordsTotal ? `<div><b>${s.chordsOk}/${s.chordsTotal}</b><small>acordes certos</small></div>` : ''}<div><b>${s.durationSec}s</b><small>tempo tocando</small></div></div></div>
      <p class="muted" style="margin-top:12px">${tip}</p><div class="row wrap" style="margin-top:12px">${apply}<button class="btn primary" data-again>Tentar de novo</button>${opts.onClose ? '<button class="btn" data-close>Fechar</button>' : ''}</div>`;
    app.store.update('practice.best', (o) => ({ ...o, [run.score.id]: Math.max(o?.[run.score.id] || 0, s.accuracy) }), {});
    opts.onFinish?.(s);
  }

  const root = host.querySelector('.pr');
  const toggleFull = () => { if (document.fullscreenElement) document.exitFullscreen?.(); else root.requestFullscreen?.().catch(() => app.toast('Seu navegador não liberou a tela cheia.')); };
  const onFullKey = (e) => { if (!host.isConnected || e.target.closest?.('input,select,textarea,dialog') || e.metaKey || e.ctrlKey) return; if (e.key === 'f' || e.key === 'F') toggleFull(); };
  document.addEventListener('keydown', onFullKey);
  host.addEventListener('click', (e) => {
    if (e.target.closest('[data-calib]')) { document.dispatchEvent(new CustomEvent('corda:sync')); return; }
    if (e.target.closest('[data-calib-skip]')) { sessionStorage.setItem('corda.calibSkip', '1'); paintCalib(); return; }
    if (e.target.closest('[data-full]')) { toggleFull(); return; }
    if (e.target.closest('[data-close]')) { opts.onClose?.(); return; }
    if (e.target.closest('[data-again]')) { Object.keys(counts).forEach((k) => (counts[k] = 0)); paintStats(); needle.style.opacity = 0; run.restart(); return; }
    const ap = e.target.closest('[data-apply]');
    if (ap) { const v = clamp(app.store.get('settings.latency', 0) + +ap.dataset.apply, 0, 250); app.store.set('settings.latency', v); app.toast(`Latência ajustada para ${v} ms`); ap.remove(); }
  });
  paintState(); paintStats(); syncStage();
  return { destroy() { document.removeEventListener('keydown', onFullKey); if (document.fullscreenElement && root.contains(document.fullscreenElement)) document.exitFullscreen?.(); offs.forEach((f) => f()); hw.stop(); tr.destroy(); host.innerHTML = ''; clearTimeout(flashTimer); } };
}
