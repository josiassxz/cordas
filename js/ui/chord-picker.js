// Seletor visual de acordes em modal: busca, filtros por nota e família, grade COMPLETA de acordes (12 notas × 26 famílias,
// mais os invertidos com baixo, como C/E), e TODAS as digitações de cada acorde. A sequência montada embaixo se reordena
// arrastando e soltando (também dá para arrastar um acorde da grade para dentro dela) ou com ‹ ›.
//   const seq = await pickChords({ title, initial: ['G', {symbol:'C', vid:'C@…'}], min: 2, max: 16, presets: [{name, symbols}] })
//   -> [{ symbol, vid|null }, …]  (vid = digitação escolhida; null = a mais fácil) ou null se cancelar.
import { allSymbols, searchSymbols, parseSymbol, voicingsOf, inversionsOf, QUALITIES_BY_ID, CATEGORIES, displayName } from '../music/chords.js';
import { chordDiagram } from './chord-diagram.js';

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SLASH = 'Com baixo (C/E)';
const PAGE = 60;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const easiest = (sym) => { const l = voicingsOf(sym); return l.find((v) => v.tags.includes('iniciante') && !v.barre) || l.slice().sort((a, b) => a.difficulty - b.difficulty)[0]; };
export const toItem = (x) => (typeof x === 'string' ? { symbol: x, vid: null } : { symbol: x.symbol, vid: x.vid ?? null });
export const itemLabel = (it) => { const p = parseSymbol(it.symbol); return p ? displayName(p.root, p.quality, p.bass) : it.symbol; };
const voicingLabel = (v) => `${v.tags.includes('aberto') ? 'Aberta' : v.baseFret > 1 ? `${v.baseFret}ª casa` : 'Posição 1'}${v.barre ? ' · pestana' : ''}`;

// Invertidos (baixo na terça/quinta…) de todas as raízes nas famílias que fazem sentido.
let slashCache = null;
function slashSymbols() {
  if (slashCache) return slashCache;
  const out = [];
  for (const s of allSymbols()) if (['maj', 'min', '7', 'maj7', 'm7'].includes(s.quality)) for (const v of inversionsOf(s.symbol)) if (!out.includes(v.symbol)) out.push(v.symbol);
  return (slashCache = out);
}

export function pickChords({ title = 'Monte sua sequência de acordes', initial = [], min = 2, max = 16, presets = [] } = {}) {
  return new Promise((resolve) => {
    document.getElementById('chPicker')?.remove();
    const seq = initial.map(toItem);
    const F = { q: '', root: null, cat: null, shown: PAGE, open: null, sel: null };   // open = acorde com variações abertas; sel = posição da sequência sendo trocada
    const dlg = document.createElement('dialog'); dlg.id = 'chPicker';
    dlg.innerHTML = `<form method="dialog" class="cpk">
      <header class="cpk-head"><div><h2 class="h2">${esc(title)}</h2><p class="muted">Toque num acorde para adicionar (ou arraste para a sequência). “Variações” mostra todas as digitações dele. Arraste os acordes da sequência para mudar a ordem.</p></div><button type="button" class="btn ghost icon" data-x aria-label="Fechar">✕</button></header>
      <div class="cpk-tabs" id="cpkTabs" role="tablist"></div>
      <div id="cpkBrowse"><div class="cpk-filters">
        <label class="search grow"><input type="search" id="cpkQ" placeholder="Buscar: Am7, sol, sus4, C/E…" aria-label="Buscar acorde"></label>
        <div class="cpk-chips" id="cpkRoots" role="group" aria-label="Nota raiz"><button type="button" class="chip on" data-root="">Todas as notas</button>${ROOTS.map((r, i) => `<button type="button" class="chip" data-root="${i}">${r}</button>`).join('')}</div>
        <div class="cpk-chips" id="cpkCats" role="group" aria-label="Família"><button type="button" class="chip on" data-cat="">Todos</button>${CATEGORIES.map((c) => `<button type="button" class="chip" data-cat="${c}">${c}</button>`).join('')}<button type="button" class="chip" data-cat="${SLASH}">${SLASH}</button></div>
      </div>
      <div class="cpk-count dim" id="cpkCount"></div>
      <div class="cpk-grid" id="cpkGrid" tabindex="0"></div></div>
      <div class="cpk-var" id="cpkVar" hidden></div>
      <div class="cpk-tray"><div class="cpk-trayhead"><b>Sua sequência <span class="num dim" id="cpkN"></span></b>
        <span class="row">${presets.length ? `<select id="cpkPre" aria-label="Começar de um modelo"><option value="">Começar de um modelo…</option>${presets.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('')}</select>` : ''}<button type="button" class="btn ghost sm" data-clear>Limpar</button></span></div>
        <div class="cpk-seq" id="cpkSeq" aria-live="polite"></div></div>
      <footer class="cpk-foot"><button type="button" class="btn" data-x>Cancelar</button><button type="button" class="btn primary" id="cpkOk">Usar esta sequência</button></footer>
    </form>`;
    document.body.appendChild(dlg);
    const $ = (s) => dlg.querySelector(s);

    const list = () => {
      let syms;
      if (F.cat === SLASH) syms = slashSymbols();
      else if (F.q.trim()) syms = [...new Set([...searchSymbols(F.q), ...(F.q.includes('/') ? [] : [])])];
      else syms = allSymbols().map((s) => s.symbol);
      if (F.root != null || (F.cat && F.cat !== SLASH)) syms = syms.filter((s) => { const p = parseSymbol(s); return p && (F.root == null || p.root === F.root) && (!F.cat || F.cat === SLASH || QUALITIES_BY_ID[p.quality].cat === F.cat); });
      if (F.cat === SLASH && F.q.trim()) syms = syms.filter((s) => s.toLowerCase().includes(F.q.trim().toLowerCase()));
      return syms;
    };
    function paintGrid() {
      const g = $('#cpkGrid'), syms = list(), part = syms.slice(0, F.shown);
      g.innerHTML = (part.length ? part.map((s) => {
        const v = easiest(s), p = parseSymbol(s), n = voicingsOf(s).length;
        return `<div class="cpk-tile" draggable="true" data-drag="${esc(s)}"><button type="button" class="cpk-add" data-add="${esc(s)}" aria-label="Adicionar ${esc(s)}" title="${esc(QUALITIES_BY_ID[p.quality].name)}">${v ? chordDiagram(v, { size: 'sm' }) : ''}<b>${esc(displayName(p.root, p.quality, p.bass))}</b></button><button type="button" class="cpk-more ${F.open === s ? 'on' : ''}" data-var="${esc(s)}" aria-label="Ver as ${n} variações de ${esc(s)}">${n} var.</button></div>`;
      }).join('') : '<div class="empty">Nada com esse filtro.</div>') + (syms.length > part.length ? `<button type="button" class="btn cpk-moreall" data-showmore>Mostrar mais (${syms.length - part.length})</button>` : '');
      const c = $('#cpkCount'); if (c) c.textContent = `${syms.length} acordes`;
    }
    function paintTabs() {
      const t = $('#cpkTabs'), inVar = !!F.open;
      const p = F.open && parseSymbol(F.open);
      t.innerHTML = `<button type="button" role="tab" class="${inVar ? '' : 'on'}" aria-selected="${!inVar}" data-tab="grid">Todos os acordes</button>` + (inVar ? `<button type="button" role="tab" class="on" aria-selected="true" data-tab="var">${F.sel != null ? `Trocando o ${F.sel + 1}º: ` : 'Variações de '}${esc(displayName(p.root, p.quality, p.bass))}</button>` : '');
    }
    function paintVar() {
      const box = $('#cpkVar'), browse = $('#cpkBrowse');
      paintTabs();
      if (!F.open) { box.hidden = true; box.innerHTML = ''; browse.hidden = false; return; }
      const vs = voicingsOf(F.open), p = parseSymbol(F.open), cur = F.sel != null ? seq[F.sel] : null;
      const curId = cur ? (cur.vid || easiest(F.open)?.id) : null;
      browse.hidden = true; box.hidden = false;
      box.innerHTML = `<div class="cpk-varhead"><b>${vs.length} digitações de ${esc(displayName(p.root, p.quality, p.bass))}</b><span class="dim">${F.sel != null ? 'Toque na que você quer — ela substitui o acorde ' + (F.sel + 1) + ' da sequência.' : 'Toque na que você quer para adicionar à sequência.'}</span><button type="button" class="btn ghost sm" data-varclose>← Voltar à lista</button></div>
        <div class="cpk-varrow big">${vs.map((v) => `<button type="button" class="cpk-vtile ${v.id === curId ? 'cur' : ''}" data-addv="${esc(F.open)}|${esc(v.id)}" aria-label="${F.sel != null ? 'Usar' : 'Adicionar'} ${esc(F.open)}, ${esc(voicingLabel(v))}">${chordDiagram(v, { size: 'sm' })}<small>${esc(voicingLabel(v))}</small><small class="dim num">${v.frets.map((f) => (f < 0 ? 'x' : f)).join(' ')}</small>${v.id === curId ? '<em>atual</em>' : ''}</button>`).join('')}</div>`;
    }
    function paintSeq() {
      $('#cpkN').textContent = `${seq.length}/${max}`;
      $('#cpkSeq').innerHTML = seq.length ? seq.map((it, i) => `<div class="cpk-step ${F.open && F.sel === i ? 'sel' : ''}" draggable="true" data-idx="${i}" title="Clique para ver as variações · arraste para mudar a ordem"><small class="num">${i + 1}</small><b>${esc(itemLabel(it))}</b>${it.vid ? `<small class="dim">${esc(voicingLabel(voicingsOf(it.symbol).find((v) => v.id === it.vid) || { tags: [], baseFret: 1 }))}</small>` : ''}<span class="cpk-acts"><button type="button" data-mv="${i}:-1" aria-label="Mover ${esc(it.symbol)} para trás" ${i === 0 ? 'disabled' : ''}>‹</button><button type="button" data-mv="${i}:1" aria-label="Mover ${esc(it.symbol)} para frente" ${i === seq.length - 1 ? 'disabled' : ''}>›</button><button type="button" data-rm="${i}" aria-label="Remover ${esc(it.symbol)}">✕</button></span></div>`).join('<span class="cpk-arrow">→</span>') : '<span class="dim">Nenhum acorde ainda. Escolha acima ou arraste para cá.</span>';
      const ok = $('#cpkOk'); ok.disabled = seq.length < min; ok.textContent = seq.length < min ? `Escolha pelo menos ${min} acordes` : `Usar esta sequência (${seq.length})`;
    }
    const add = (it, at = seq.length) => { if (seq.length >= max) return; seq.splice(at, 0, it); paintSeq(); $('#cpkSeq').querySelector(`[data-idx="${at}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); };
    const done = (v) => { dlg.close(); dlg.remove(); resolve(v); };

    dlg.addEventListener('click', (e) => {
      const step = e.target.closest('.cpk-step');
      if (step && !e.target.closest('button')) { const i = +step.dataset.idx; F.open = seq[i].symbol; F.sel = i; paintVar(); paintSeq(); $('#cpkTabs').scrollIntoView?.({ block: 'nearest' }); return; }
      const b = e.target.closest('button'); if (!b) return;
      const d = b.dataset;
      if (d.add) add({ symbol: d.add, vid: null });
      else if (d.addv) { const [symbol, vid] = d.addv.split('|'); if (F.sel != null && seq[F.sel]) { seq[F.sel] = { symbol, vid }; paintSeq(); paintVar(); } else add({ symbol, vid }); }
      else if (d.var) { F.open = d.var; F.sel = null; paintVar(); paintSeq(); }
      else if (d.tab === 'grid' || 'varclose' in d) { F.open = null; F.sel = null; paintGrid(); paintVar(); paintSeq(); }
      else if ('showmore' in d) { F.shown += PAGE; paintGrid(); }
      else if (d.rm != null) { seq.splice(+d.rm, 1); if (F.sel != null) { F.open = null; F.sel = null; paintVar(); } paintSeq(); }
      else if (d.mv) { const [i, k] = d.mv.split(':').map(Number); const j = i + k; if (j >= 0 && j < seq.length) { [seq[i], seq[j]] = [seq[j], seq[i]]; if (F.sel != null) { F.sel = j; } paintSeq(); } }
      else if ('clear' in d) { seq.length = 0; paintSeq(); }
      else if ('root' in d) { F.root = d.root === '' ? null : +d.root; F.shown = PAGE; dlg.querySelectorAll('[data-root]').forEach((x) => x.classList.toggle('on', x === b)); paintGrid(); }
      else if ('cat' in d) { F.cat = d.cat || null; F.shown = PAGE; dlg.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('on', x === b)); paintGrid(); }
      else if ('x' in d) done(null);
      else if (b.id === 'cpkOk' && seq.length >= min) done(seq.map((x) => ({ ...x })));
    });

    // ---- arrastar e soltar: reordenar a sequência, ou soltar um acorde da grade nela ----
    let dragging = null;   // { kind:'mv', i } | { kind:'add', symbol }
    const slotAt = (x) => {   // posição de inserção pelo ponto do mouse entre os passos
      const steps = [...$('#cpkSeq').querySelectorAll('.cpk-step')];
      for (let i = 0; i < steps.length; i++) { const r = steps[i].getBoundingClientRect(); if (x < r.left + r.width / 2) return i; }
      return steps.length;
    };
    const clearMarks = () => { dlg.querySelectorAll('.cpk-step').forEach((s) => s.classList.remove('dropbefore', 'dropafter', 'dragging')); $('#cpkSeq').classList.remove('over'); };
    dlg.addEventListener('dragstart', (e) => {
      const st = e.target.closest?.('.cpk-step'), tl = e.target.closest?.('[data-drag]');
      if (st) { dragging = { kind: 'mv', i: +st.dataset.idx }; st.classList.add('dragging'); }
      else if (tl) dragging = { kind: 'add', symbol: tl.dataset.drag };
      else return;
      e.dataTransfer.effectAllowed = 'copyMove'; e.dataTransfer.setData('text/plain', 'corda');
    });
    $('#cpkSeq').addEventListener('dragover', (e) => {
      if (!dragging) return; e.preventDefault();
      const at = slotAt(e.clientX), steps = [...$('#cpkSeq').querySelectorAll('.cpk-step')];
      dlg.querySelectorAll('.cpk-step').forEach((s) => s.classList.remove('dropbefore', 'dropafter'));
      $('#cpkSeq').classList.add('over');
      if (at < steps.length) steps[at].classList.add('dropbefore'); else steps[steps.length - 1]?.classList.add('dropafter');
    });
    $('#cpkSeq').addEventListener('drop', (e) => {
      if (!dragging) return; e.preventDefault();
      const at = slotAt(e.clientX);
      if (dragging.kind === 'mv') { const [it] = seq.splice(dragging.i, 1); seq.splice(at > dragging.i ? at - 1 : at, 0, it); if (F.sel != null) { F.sel = null; F.open = null; paintVar(); } paintSeq(); }
      else add({ symbol: dragging.symbol, vid: null }, at);
      dragging = null; clearMarks();
    });
    dlg.addEventListener('dragend', () => { dragging = null; clearMarks(); });
    $('#cpkSeq').addEventListener('dragleave', (e) => { if (!$('#cpkSeq').contains(e.relatedTarget)) $('#cpkSeq').classList.remove('over'); });

    $('#cpkQ').addEventListener('input', (e) => { F.q = e.target.value; F.shown = PAGE; paintGrid(); });
    $('#cpkPre')?.addEventListener('change', (e) => { const p = presets[+e.target.value]; if (p) { seq.length = 0; seq.push(...p.symbols.slice(0, max).map(toItem)); paintSeq(); } e.target.value = ''; });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    paintGrid(); paintVar(); paintSeq();
    dlg.showModal();
    $('#cpkQ').focus();
  });
}
