// Casca da aplicação: navegação, status da guitarra, palco com o braço ao vivo, ajustes e modo demo.
import { $, $$, icon, paintIcons, toast } from './core/dom.js';
import { Fretboard, bindGuitar } from './ui/fretboard.js';
import { bindDiagramPress } from './ui/chord-diagram.js';
import { openSync } from './engine/sync.js';
import { Transport } from './engine/transport.js';
import { openCalibration, isCalibrated } from './engine/calibrate.js';
import { validationOf } from './engine/runner.js';
import { INSTRUMENTS, STANDARD, detectChord, noteName, setFlats } from './music/theory.js';

export function startShell(app, views) {
  const { store, guitar, audio } = app;
  const byId = new Map(views.map((v) => [v.id, v]));
  app.views = byId;
  let current = null, cleanup = null;

  // ---------- roteador (#/id?x=y) ----------
  const parse = () => { const [id, q] = location.hash.replace(/^#\/?/, '').split('?'); return { id: byId.has(id) ? id : 'home', params: Object.fromEntries(new URLSearchParams(q || '')) }; };
  function render() {
    const { id, params } = parse();
    cleanup?.(); cleanup = null; app.demoChord = null; app.practice?.stopAll?.(); Transport.stopAll();   // trocar de tela sempre encerra o exercício (e o metrônomo) em andamento
    current = byId.get(id);
    $('#title').textContent = current.title;
    $$('#nav button').forEach((b) => { if (b.dataset.id === id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    const el = $('#view'); el.replaceChildren(); el.scrollTop = 0;
    try { cleanup = current.mount(el, app, params) || null; } catch (e) { console.error(e); el.innerHTML = `<div class="page"><div class="empty"><b>Erro ao abrir "${current.title}"</b><span>${e.message}</span></div></div>`; }
    paintIcons(el);
  }
  app.router = { go: (id, params) => { const q = params ? '?' + new URLSearchParams(params) : ''; const h = `#/${id}${q}`; if (location.hash === h) render(); else location.hash = h; }, render };
  addEventListener('hashchange', render);

  // ---------- navegação ----------
  const main = views.filter((v) => v.group !== 'foot').sort((a, b) => a.order - b.order);
  const foot = views.filter((v) => v.group === 'foot');
  $('#nav').innerHTML = main.map((v) => `<button data-id="${v.id}"><i data-icon="${v.icon}"></i><span>${v.title}</span></button>`).join('')
    + (foot.length ? '<div class="sep"></div>' + foot.map((v) => `<button data-id="${v.id}"><i data-icon="${v.icon}"></i><span>${v.title}</span></button>`).join('') : '');
  $('#nav').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) app.router.go(b.dataset.id); });

  // ---------- status / conexão ----------
  async function connect() {
    if (guitar.status === 'connected') return guitar.disconnect();
    if (guitar.status === 'demo') return guitar.setStatus('idle', '');
    if (!guitar.supported) return toast('Este navegador não suporta Bluetooth. Abra o Corda no Google Chrome.');
    try { await guitar.connect(); toast('Guitarra conectada. Pode tocar!'); store.markDay(); }
    catch (e) { toast(e.name === 'NotFoundError' ? 'Nenhuma guitarra escolhida. Feche o app da Aeroband e ligue a guitarra.' : 'Não consegui conectar: ' + (e.message || e.name)); }
  }
  app.connect = connect;
  guitar.addEventListener('status', (e) => {
    const { status, name } = e.detail;
    $('#status').dataset.s = status;
    $('#statusText').textContent = { idle: 'Conectar guitarra', connecting: 'Conectando…', connected: name || 'Conectada', demo: 'Modo demo' }[status];
  });
  $('#status').addEventListener('click', connect);
  app.startDemo = () => { guitar.startDemo(); store.markDay(); };

  // ---------- palco: braço ao vivo ----------
  const board = new Fretboard($('#stageBoard'), { offset: store.get('settings.pitchOffset', 0) });
  app.stage = board;
  bindGuitar(board, guitar);
  bindDiagramPress(guitar);
  app.openSync = () => openSync(app); app.openCalibration = () => openCalibration(app); app.isCalibrated = () => isCalibrated(store);
  if (store.get('settings.fretOffset')) store.set('settings.fretOffset', 0);   // o ajuste de casas foi removido: limpa qualquer valor que tenha sobrado
  // As casas mostradas nunca sofrem desvio. Uma vez só, zera desvios que ficaram gravados de calibrações antigas.
  if (!store.get('settings.noOffsetsV1')) { store.set('settings.pitchOffset', 0); store.set('settings.fretOffset', 0); store.set('settings.noOffsetsV1', true); }
  document.addEventListener('corda:calibrate', () => openCalibration(app));
  document.addEventListener('corda:sync', () => openSync(app));
  guitar.addEventListener('notes', (e) => {
    const act = e.detail.active, notes = [...act.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
    const ch = notes.length >= 2 ? detectChord(notes) : null;
    $('#stageChord').textContent = ch ? ch.name : notes.length === 1 ? noteName(notes[0]) : '—';
    $('#stageNotes').textContent = notes.map(noteName).join(' ');
  });
  guitar.addEventListener('noteon', (e) => { if (store.get('settings.synth') && guitar.status === 'connected') audio.pluck(e.detail.note, audio.context.currentTime, 0.15 + 0.4 * Math.min(1, e.detail.vel / 100)); });
  guitar.addEventListener('strum', () => store.markDay());
  const applyScale = (v) => { v = Math.max(100, Math.min(300, v)); store.set('settings.stageScale', v); document.documentElement.style.setProperty('--stage-scale', v / 100); if ($('#stageScale')) { $('#stageScale').value = v; $('#stageOut').textContent = v + '%'; } };
  applyScale(store.get('settings.stageScale', 150));
  const applyFrets = (v) => { v = Math.max(12, Math.min(24, v)); store.set('settings.stageFrets', v); board.setFrets(v); if ($('#stageFrets')) { $('#stageFrets').value = v; $('#fretsOut').textContent = v; } };
  applyFrets(store.get('settings.stageFrets', 22));
  $('#fretsMore').addEventListener('click', () => applyFrets(store.get('settings.stageFrets', 22) + 1));
  $('#fretsLess').addEventListener('click', () => applyFrets(store.get('settings.stageFrets', 22) - 1));
  guitar.sustainMs = store.get('settings.sustainMs', 2500);
  $('#stageBigger').addEventListener('click', () => applyScale(store.get('settings.stageScale', 150) + 20));
  $('#stageSmaller').addEventListener('click', () => applyScale(store.get('settings.stageScale', 150) - 20));
  $('#stageToggle').addEventListener('click', () => {
    const st = $('#stage'), c = st.classList.toggle('collapsed');
    $('#stageToggle').textContent = c ? 'Mostrar braço' : 'Recolher'; $('#stageToggle').setAttribute('aria-expanded', String(!c));
  });

  // ---------- modo demo (sem guitarra): Espaço/↓ = para baixo, ↑ = para cima, X = errar ----------
  function demoStrum(dir = 'D', wrong = false) {
    const frets = app.demoChord?.() || [0, 2, 2, 0, 0, 0];
    const fr = wrong ? frets.map((f) => (f < 0 ? f : f + 1)) : frets;
    const notes = fr.map((f, s) => (f < 0 ? null : STANDARD[s] + f + store.get('settings.pitchOffset', 0)));
    guitar.simulateStrum(notes, dir);
    if (!store.get('settings.synth')) audio.strum(notes.filter((n) => n != null), audio.context.currentTime, dir, 0.3);
  }
  app.demoStrum = demoStrum;
  addEventListener('keydown', (e) => {
    if (e.target.closest?.('input,select,textarea,dialog') || e.metaKey || e.ctrlKey || guitar.status === 'connected') return;
    if (e.code === 'Space' || e.code === 'ArrowDown') { e.preventDefault(); demoStrum('D'); }
    else if (e.code === 'ArrowUp') { e.preventDefault(); demoStrum('U'); }
    else if (e.key === 'x' || e.key === 'X') demoStrum('D', true);
  });

  // ---------- instrumento ----------
  const menu = $('#menu');
  $('#instrBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!menu.hidden) { menu.hidden = true; return; }
    menu.innerHTML = INSTRUMENTS.map((i) => `<button class="btn ghost" style="width:100%;justify-content:space-between" ${i.ready ? '' : 'disabled'}><span>${i.name}</span><small class="dim">${i.ready ? '✓' : 'em breve'}</small></button>`).join('');
    menu.hidden = false;
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#menu')) menu.hidden = true; });

  // ---------- ajustes ----------
  const dlg = $('#settings'), S = (k) => store.get('settings.' + k);
  $('#settingsBtn').addEventListener('click', () => {
    $('#latency').value = S('latency'); $('#latOut').textContent = S('latency') + ' ms';
    $('#pitchOffset').value = S('pitchOffset'); $('#offOut').textContent = S('pitchOffset');
    $('#stageScale').value = S('stageScale'); $('#stageOut').textContent = S('stageScale') + '%';
    $('#stageFrets').value = S('stageFrets'); $('#fretsOut').textContent = S('stageFrets');
    $('#sustainMs').value = S('sustainMs'); $('#susOut').textContent = (S('sustainMs') / 1000).toFixed(1) + ' s';
    $('#rigor').value = S('rigor'); $('#flats').value = S('flats') ? '1' : '0'; $('#synth').checked = S('synth'); { const v = validationOf(store.get('settings')); $('#vNeck').checked = v.neck; $('#vSound').value = v.sound; $('#tolerance').value = store.get('settings.timingTolerance') || 'normal'; $('#vDir').value = store.get('settings.validateDir') || 'soft'; } $('#auto').checked = S('auto');
    $$('input[type=range]', dlg).forEach(fillRange); dlg.showModal();
  });
  const fillRange = (r) => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min)) * 100 + '%');
  $('#latency').addEventListener('input', (e) => { store.set('settings.latency', +e.target.value); $('#latOut').textContent = e.target.value + ' ms'; fillRange(e.target); });
  $('#pitchOffset').addEventListener('input', (e) => { store.set('settings.pitchOffset', +e.target.value); board.setOffset(+e.target.value); $('#offOut').textContent = e.target.value; fillRange(e.target); });
  $('#stageScale').addEventListener('input', (e) => { applyScale(+e.target.value); fillRange(e.target); });
  $('#stageFrets').addEventListener('input', (e) => { applyFrets(+e.target.value); fillRange(e.target); });
  $('#sustainMs').addEventListener('input', (e) => { guitar.sustainMs = +e.target.value; store.set('settings.sustainMs', +e.target.value); $('#susOut').textContent = (e.target.value / 1000).toFixed(1) + ' s'; fillRange(e.target); });
  $('#syncBtn').addEventListener('click', () => { dlg.close(); openSync(app); });

  $('#rigor').addEventListener('change', (e) => store.set('settings.rigor', e.target.value));
  $('#flats').addEventListener('change', (e) => { store.set('settings.flats', e.target.value === '1'); setFlats(e.target.value === '1'); render(); });
  $('#vDir').addEventListener('change', (e) => store.set('settings.validateDir', e.target.value));
  $('#tolerance').addEventListener('change', (e) => store.set('settings.timingTolerance', e.target.value));
  $('#vNeck').addEventListener('change', (e) => store.set('settings.validateNeck', e.target.checked));
  $('#vSound').addEventListener('change', (e) => store.set('settings.validateSound', e.target.value));
  $('#synth').addEventListener('change', (e) => store.set('settings.synth', e.target.checked));
  $('#auto').addEventListener('change', (e) => store.set('settings.auto', e.target.checked));
  $('#resetBtn').addEventListener('click', () => { if (confirm('Apagar todo o progresso salvo neste navegador? (Os ajustes são mantidos.)')) { store.reset(['settings']); dlg.close(); render(); } });

  paintIcons();
  render();
}
