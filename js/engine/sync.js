// Sincronizar: mede o atraso entre o clique e o que chega da guitarra (Bluetooth + sua mão) e ajusta a
// compensação de latência. Só lê eventos da guitarra; escreve apenas a configuração local `settings.latency`.
import { Transport } from './transport.js';
import { Lane } from './lane.js';
import { icon } from '../core/dom.js';

const COUNT_IN = 4, BEATS = 12;
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function openSync(app) {
  if (document.getElementById('syncDlg')) return;
  const dlg = document.createElement('dialog'); dlg.id = 'syncDlg';
  const score = { beatsPerBar: 4, subdivision: 1, lengthBeats: 4, bpm: 80, events: [0, 1, 2, 3].map((beat) => ({ beat, kind: 'strum', strum: { dir: 'D', strings: [0, 1, 2, 3, 4, 5] }, check: { strings: true }, dur: 1 })) };
  dlg.innerHTML = `<form method="dialog" class="sheet sync">
    <h2 class="h2">Sincronizar com a guitarra</h2>
    <p class="muted">Palhete <b>junto com cada clique</b> (quando a seta chegar na linha), olhando o tempo e não a tela. O app mede o atraso médio entre você e o clique, e compensa na avaliação dos exercícios.</p>
    <div class="row" style="gap:12px;margin:8px 0"><span class="h3">Andamento</span><div class="seg" id="syBpm">${[60, 80, 100].map((b) => `<button type="button" data-b="${b}" aria-pressed="${b === 80}">${b} BPM</button>`).join('')}</div></div>
    <div class="pr-hw lane" style="height:300px"><canvas></canvas></div>
    <div class="sync-read num"><div><small>Acertos medidos</small><b id="syN">0/${BEATS}</b></div><div><small>Atraso médio</small><b id="syMean">–</b></div><div><small>Variação</small><b id="syVar">–</b></div></div>
    <p class="muted" id="syMsg">Aperte <b>Começar</b>, espere a contagem e toque ${BEATS} tempos.</p>
    <div class="row between"><button type="button" class="btn" id="syClose">Fechar</button><div class="row"><button type="button" class="btn primary" id="syGo">${icon('play')} Começar</button><button type="button" class="btn primary" id="syApply" hidden>Aplicar</button></div></div>
  </form>`;
  document.body.appendChild(dlg);
  const $ = (s) => dlg.querySelector(s), guitar = app.guitar;
  let bpm = 80, tr = null, deltas = [], lane = null, applyMs = 0, done = false;

  const view = () => ({ score: { ...score, bpm }, pos: tr ? tr.position() : -0.5, results: new Map(), passes: Infinity, state: tr?.state === 'paused' ? 'paused' : 'running' });
  lane = new Lane($('canvas'), view); lane.start();

  function stop() { tr?.stop(); tr = null; guitar.removeEventListener('strumstart', onStrum); }
  function onStrum(e) {
    if (!tr || done) return;
    const beat = tr.beatAtPerf(e.detail.t); if (beat == null || beat < -0.4) return;
    const nearest = Math.round(beat), d = (beat - nearest) * 60000 / bpm;
    if (nearest < 0 || nearest >= BEATS || Math.abs(d) > 60000 / bpm * 0.45) return;   // longe de qualquer clique: ignora
    if (deltas.some((x) => x.n === nearest)) return;                                    // um por clique
    deltas.push({ n: nearest, d }); paint();
    if (deltas.length >= BEATS) finish();
  }
  function paint() {
    const ds = deltas.map((x) => x.d);
    $('#syN').textContent = `${ds.length}/${BEATS}`;
    if (ds.length) { const m = median(ds); $('#syMean').textContent = `${m > 0 ? '+' : '−'}${Math.abs(Math.round(m))} ms`; const dev = median(ds.map((x) => Math.abs(x - m))); $('#syVar').textContent = `±${Math.round(dev)} ms`; }
  }
  function finish() {
    done = true; const ds = deltas.map((x) => x.d); const m = ds.length >= 4 ? median(ds) : null;
    stop();
    const msg = $('#syMsg');
    if (m == null) { msg.innerHTML = 'Poucos acertos medidos. Tente de novo, palhetando junto de cada clique.'; return; }
    const cur = app.store.get('settings.latency', 0), want = Math.max(0, Math.min(250, Math.round(cur + m)));
    applyMs = want;
    if (m < -15) msg.innerHTML = `Você tocou em média <b>${Math.abs(Math.round(m))} ms adiantado</b> em relação ao clique. A compensação só corrige atraso, então não há o que ajustar: espere o clique.`;
    else if (Math.abs(m) < 15) msg.innerHTML = `Seu tempo está <b>muito bem sincronizado</b> (${Math.round(m)} ms). Nada a ajustar.`;
    else { msg.innerHTML = `Você chega em média <b>${Math.round(m)} ms depois</b> do clique (Bluetooth + sua mão). Compensação atual <b>${cur} ms</b> → sugerida <b>${want} ms</b>.`; $('#syApply').hidden = false; }
  }
  function go() {
    stop(); deltas = []; done = false; paint(); $('#syApply').hidden = true; $('#syMsg').textContent = 'Contagem… depois palhete junto de cada clique.';
    const settings = app.store.get('settings');
    tr = new Transport(app.audio, { bpm, beatsPerBar: 4, subdivision: 1, click: true, latencyMs: 0 });
    tr.start({ countInBeats: COUNT_IN });
    guitar.addEventListener('strumstart', onStrum);
    app.audio.context.resume?.();
    void settings;
    const tick = setInterval(() => { if (!tr) return clearInterval(tick); if (tr.position() > BEATS + 1 && !done) { clearInterval(tick); finish(); } }, 100);
  }
  $('#syGo').addEventListener('click', go);
  $('#syBpm').addEventListener('click', (e) => { const b = e.target.closest('[data-b]'); if (!b) return; bpm = +b.dataset.b; dlg.querySelectorAll('[data-b]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
  $('#syApply').addEventListener('click', () => { app.store.set('settings.latency', applyMs); app.toast(`Compensação de latência: ${applyMs} ms`); $('#syApply').hidden = true; });
  const close = () => { stop(); lane.stop(); dlg.close(); dlg.remove(); };
  $('#syClose').addEventListener('click', close);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.showModal();
}
