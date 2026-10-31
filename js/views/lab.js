// Laboratório: o que a AG01 realmente envia. Monitor MIDI cru, calibração de afinação e captura exportável.
import { esc, toast } from '../core/dom.js';
import { STANDARD, STRING_LABELS, noteName, fretOf } from '../music/theory.js';

const CAPS = [
  ['Corda tocada (ataque)', 'sim', 'Nota ligada por corda (canal MIDI 1-6) com velocidade.'],
  ['Nota que soou', 'sim', 'Número MIDI da nota; o traste é derivado dela.'],
  ['Nota sustentada / solta', 'sim', 'Nota desligada ou "all notes off" por corda.'],
  ['Direção da palhetada', 'inferida', 'Ordem em que as cordas chegam (grave→agudo = para baixo). Não vem do aparelho.'],
  ['Casa pressionada (sem palhetar)', 'sim', 'CC 49 = apertou a casa (valor = nº da casa) e CC 50 = soltou, por corda; confirmado em captura com roteiro. A marca fica até o CC 50 chegar.'],
  ['Qual dedo / mão direita (PIMA)', 'não', 'Não observável. O app mostra só a indicação pedagógica, marcada como "guia".'],
  ['Hammer-on, pull-off, slide, bend, vibrato', 'não', 'Sem eventos próprios. Seriam inferidos por áudio (fora do escopo do MIDI).'],
];

export default {
  id: 'lab', title: 'Laboratório', icon: 'flask', order: 90, group: 'foot',
  mount(el, app) {
    const log = []; let strumBuf = [];
    el.innerHTML = `<div class="page lab">
      <div class="page-head"><div><p class="muted">Veja o que a guitarra envia, calibre a afinação e exporte uma captura. Somente leitura: nada é escrito na guitarra.</p></div>
        <div class="row"><button class="btn" id="labClear">Limpar</button><button class="btn" id="labExport">Exportar captura</button></div></div>
      <div class="grid" style="grid-template-columns:minmax(300px,1.2fr) minmax(280px,1fr)">
        <section class="panel"><h3 class="h3">Eventos ao vivo</h3><div id="labLog" class="lab-log mono" aria-live="off"></div></section>
        <section class="panel col"><h3 class="h3">Calibração de afinação</h3>
          <p class="muted">Palhete as <b>6 cordas soltas</b> (sem apertar nada). O app compara com E-A-D-G-B-E e sugere o desvio.</p>
          <div id="labMap" class="lab-map"></div>
          <div class="row"><button class="btn" id="labMeasure">Medir última palhetada</button><button class="btn primary" id="labApply" disabled>Aplicar desvio</button></div>
          <p id="labResult" class="muted"></p></section>
      </div>
      <section class="panel"><h3 class="h3">O que a AG01 informa (verificado em captura real)</h3>
        <table class="lab-caps"><tbody>${CAPS.map(([a, b, c]) => `<tr><td>${a}</td><td><span class="badge ${b === 'sim' ? 'live' : b === 'inferida' ? 'guide' : ''}">${b}</span></td><td class="muted">${c}</td></tr>`).join('')}</tbody></table></section>
    </div>`;
    const $log = el.querySelector('#labLog'), $map = el.querySelector('#labMap'), $res = el.querySelector('#labResult'), $apply = el.querySelector('#labApply');
    let suggestion = null, lastStrum = [];

    const line = (t, txt) => { log.push({ t, txt }); if (log.length > 2000) log.shift(); const d = document.createElement('div'); d.textContent = `${(t / 1000).toFixed(3)}s  ${txt}`; $log.prepend(d); while ($log.childElementCount > 120) $log.lastChild.remove(); };
    const raw = (e) => line(e.detail.t, `RAW ${e.detail.hex}`);
    const on = (e) => { const { string, note, vel, t } = e.detail; line(t, `corda ${string + 1} (${STRING_LABELS[string]}) ON  ${noteName(note)} (${note}) vel ${vel}  traste≈${fretOf(string, note, app.settings.pitchOffset)}`); strumBuf.push({ string, note }); };
    const offE = (e) => line(e.detail.t, `corda ${e.detail.string + 1} OFF ${noteName(e.detail.note)}`);
    const cc = (e) => line(e.detail.t, `CC ${e.detail.controller} = ${e.detail.value}  (canal ${e.detail.string + 1})`);
    const strum = (e) => { lastStrum = strumBuf; strumBuf = []; renderMap(); };
    for (const [n, f] of [['raw', raw], ['noteon', on], ['noteoff', offE], ['cc', cc], ['strum', strum]]) app.guitar.addEventListener(n, f);

    function renderMap() {
      $map.innerHTML = STRING_LABELS.map((l, s) => { const n = lastStrum.find((x) => x.string === s); return `<div class="lab-str"><b>${s + 1}ª · ${l}</b><span>${n ? noteName(n.note) : '—'}</span><small>${n ? 'Δ ' + (n.note - STANDARD[s]) : ''}</small></div>`; }).join('');
    }
    renderMap();

    el.querySelector('#labMeasure').onclick = () => {
      if (lastStrum.length < 3) { $res.textContent = 'Palhete as cordas soltas primeiro (pelo menos 3 cordas).'; return; }
      const d = lastStrum.map((n) => n.note - STANDARD[n.string]).sort((a, b) => a - b);
      const med = d[Math.floor(d.length / 2)], uniform = d.every((x) => x === med);
      suggestion = med;
      $res.innerHTML = uniform ? `Todas as cordas desviam <b>${med >= 0 ? '+' : ''}${med}</b> semitom(ns). Desvio uniforme: calibração segura.`
        : `Desvios diferentes entre cordas (${d.join(', ')}). Isso não é um simples capo; aplicar o valor central (${med}) pode não corrigir tudo.`;
      $apply.disabled = med === app.settings.pitchOffset;
    };
    $apply.onclick = () => { app.store.set('settings.pitchOffset', suggestion); app.stage?.setOffset(suggestion); toast(`Desvio de afinação definido para ${suggestion} semitom(ns)`); $apply.disabled = true; };
    el.querySelector('#labClear').onclick = () => { log.length = 0; $log.textContent = ''; };
    el.querySelector('#labExport').onclick = () => {
      const blob = new Blob([JSON.stringify({ device: app.guitar.deviceName, when: new Date().toISOString(), events: log }, null, 1)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `captura-aeroband-${Date.now()}.json` }); a.click(); URL.revokeObjectURL(a.href);
    };
    return () => { for (const [n, f] of [['raw', raw], ['noteon', on], ['noteoff', offE], ['cc', cc], ['strum', strum]]) app.guitar.removeEventListener(n, f); };
  },
};
