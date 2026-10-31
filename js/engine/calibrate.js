// Calibrar a guitarra (tudo local, só LÊ eventos da guitarra e grava configurações do app):
//  1) Timing: mede o atraso entre o clique e o que chega da guitarra (Bluetooth + áudio + sua mão) -> compensação de latência
//  2) Notas: toca as 6 cordas soltas -> descobre o desvio de afinação do aparelho (ex.: tudo −1 semitom)
//  3) Casas: aperta a casa 5 -> confere se o número da casa e a ordem das cordas dos sensores batem com o desenho
import { STANDARD, noteName } from '../music/theory.js';
import { openSync } from './sync.js';

const NAMES = ['E (6ª)', 'A (5ª)', 'D (4ª)', 'G (3ª)', 'B (2ª)', 'E (1ª)'];
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const isCalibrated = (store) => !!store.get('settings.calibratedAt');

export function openCalibration(app) {
  if (document.getElementById('calDlg')) return;
  const { store, guitar } = app;
  const dlg = document.createElement('dialog'); dlg.id = 'calDlg';
  const live = guitar.status === 'connected';
  dlg.innerHTML = `<form method="dialog" class="sheet cal">
    <h2 class="h2">Calibrar a guitarra</h2>
    <p class="muted">Faça nesta ordem, antes de começar a treinar. Leva uns 2 minutos e deixa o acerto muito mais preciso. ${live ? '' : '<b>A guitarra não está conectada</b>: conecte-a antes (botão no canto superior direito).'}</p>
    <section class="cal-step" data-s="1"><div class="cal-h"><b>1 · Timing</b><span class="cal-state" id="c1"></span></div>
      <p class="muted">Toca um clique e você palheta junto. O app mede o atraso médio e compensa na avaliação.</p><button type="button" class="btn" id="c1go">Medir meu atraso…</button></section>
    <section class="cal-step" data-s="2"><div class="cal-h"><b>2 · Notas das cordas</b><span class="cal-state" id="c2"></span></div>
      <p class="muted">Toque cada corda <b>solta</b>, uma de cada vez, da mais grossa (6ª) à mais fina (1ª).</p>
      <div class="cal-strings" id="cstr">${NAMES.map((n, i) => `<div class="cal-str" data-s="${i}"><small>${n}</small><b>—</b></div>`).join('')}</div>
      <div class="row"><button type="button" class="btn" id="c2reset">Refazer</button><button type="button" class="btn primary" id="c2apply" hidden>Aplicar</button></div><p class="muted" id="c2msg"></p></section>
    <section class="cal-step" data-s="3"><div class="cal-h"><b>3 · Casas</b><span class="cal-state" id="c3"></span></div>
      <p class="muted">Aperte a <b>casa 5 da corda Lá (5ª corda)</b> e segure sem palhetar.</p>
      <div class="cal-fret" id="cfret">Aguardando…</div>
      <div class="row"><button type="button" class="btn" id="c3reset">Refazer</button><button type="button" class="btn primary" id="c3apply" hidden>Aplicar</button></div><p class="muted" id="c3msg"></p></section>
    <div class="row between"><small class="dim" id="cdone"></small><button type="button" class="btn" id="cclose">Fechar</button></div>
  </form>`;
  document.body.appendChild(dlg);
  const $ = (s) => dlg.querySelector(s), set = (k, v) => store.set('settings.' + k, v);
  const mark = () => store.set('settings.calibratedAt', Date.now());
  const paintState = () => {
    $('#c1').textContent = `compensação atual: ${store.get('settings.latency', 0)} ms`;
    $('#c2').textContent = `desvio atual: ${store.get('settings.pitchOffset', 0)} semitom(ns)`;
    $('#c3').textContent = `ajuste de casa: ${store.get('settings.fretOffset', 0)}`;
    const t = store.get('settings.calibratedAt'); $('#cdone').textContent = t ? `Última calibração: ${new Date(t).toLocaleString('pt-BR')}` : 'Ainda não calibrada.';
  };
  paintState();

  // ---- 2 · notas ----
  let got = new Map();
  const paintStrings = () => dlg.querySelectorAll('.cal-str').forEach((el) => { const s = +el.dataset.s, n = got.get(s); el.classList.toggle('ok', n != null); el.querySelector('b').textContent = n != null ? `${noteName(n)} (${n - STANDARD[s] >= 0 ? '+' : ''}${n - STANDARD[s]})` : '—'; });
  const onNote = (e) => {
    const { string, note } = e.detail; if (got.has(string)) return; got.set(string, note); paintStrings();
    if (got.size < 6) return;
    const d = [...got].map(([s, n]) => n - STANDARD[s]), off = Math.round(median(d)), spread = Math.max(...d) - Math.min(...d);
    $('#c2msg').innerHTML = spread === 0 ? (off === 0 ? 'As 6 cordas chegaram na afinação padrão: <b>nenhum desvio</b>.' : `Todas as cordas chegaram <b>${off > 0 ? '+' : ''}${off} semitom(ns)</b> diferentes do padrão. Aplique para o app compensar.`)
      : `As cordas não concordam entre si (${d.map((x) => (x > 0 ? '+' : '') + x).join(' ')}): a guitarra pode estar desafinada ou algumas cordas tocaram duas vezes. Vou usar o valor mais comum (<b>${off}</b>). Refaça se quiser conferir.`;
    $('#c2apply').hidden = off === store.get('settings.pitchOffset', 0); $('#c2apply').dataset.off = off;
    if (off === store.get('settings.pitchOffset', 0) && spread === 0) { mark(); paintState(); }
  };
  guitar.addEventListener('noteon', onNote);
  $('#c2reset').addEventListener('click', () => { got = new Map(); $('#c2msg').textContent = ''; $('#c2apply').hidden = true; paintStrings(); });
  $('#c2apply').addEventListener('click', (e) => { const off = +e.currentTarget.dataset.off; set('pitchOffset', off); app.stage?.setOffset?.(off); mark(); paintState(); $('#c2apply').hidden = true; app.toast(`Desvio de afinação: ${off}`); });

  // ---- 3 · casas ----
  let fret = null;
  const onPress = (e) => {
    if (fret) return; fret = e.detail;
    const want = { string: 1, fret: 5 }, offs = want.fret - fret.fret, okStr = fret.string === want.string;
    $('#cfret').innerHTML = `Recebi: <b>corda ${6 - fret.string} (${NAMES[fret.string]})</b>, <b>casa ${fret.fret}</b>.`;
    $('#c3msg').innerHTML = !okStr ? `A casa chegou na <b>corda ${6 - fret.string}</b>, não na 5ª. Confira se apertou a corda certa ou me conte: a ordem das cordas dos sensores pode estar diferente.`
      : offs === 0 ? 'O número da casa <b>bate</b>: nenhum ajuste necessário.' : `O sensor mandou ${fret.fret} em vez de 5. Aplique para somar <b>${offs > 0 ? '+' : ''}${offs}</b> a todas as casas.`;
    $('#c3apply').hidden = !okStr || offs === 0; $('#c3apply').dataset.off = offs;
    if (okStr && offs === 0) { mark(); paintState(); }
  };
  guitar.addEventListener('press', onPress);
  $('#c3reset').addEventListener('click', () => { fret = null; $('#cfret').textContent = 'Aguardando…'; $('#c3msg').textContent = ''; $('#c3apply').hidden = true; });
  $('#c3apply').addEventListener('click', (e) => { const off = (store.get('settings.fretOffset', 0)) + +e.currentTarget.dataset.off; set('fretOffset', off); guitar.fretOffset = off; mark(); paintState(); $('#c3apply').hidden = true; app.toast(`Ajuste de casas: ${off > 0 ? '+' : ''}${off}`); });

  $('#c1go').addEventListener('click', () => { openSync(app); });
  const syncWatch = setInterval(paintState, 800);
  const close = () => { clearInterval(syncWatch); guitar.removeEventListener('noteon', onNote); guitar.removeEventListener('press', onPress); dlg.close(); dlg.remove(); };
  $('#cclose').addEventListener('click', close);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.showModal();
}
