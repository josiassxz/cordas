// Seletor visual de acordes em modal: busca, filtros por nota e família, grade com diagramas, e a sequência montada
// embaixo (reordenar, remover). Devolve a lista de símbolos escolhidos (ou null se cancelar).
//   const seq = await pickChords({ title, initial: ['G','D'], min: 2, max: 16, presets: [{name, symbols}] })
import { allSymbols, searchSymbols, parseSymbol, voicingsOf, QUALITIES_BY_ID, CATEGORIES, displayName } from '../music/chords.js';
import { chordDiagram } from './chord-diagram.js';

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const COMMON = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Am', 'Bm', 'Cm', 'Dm', 'Em', 'Fm', 'Gm', 'A7', 'B7', 'C7', 'D7', 'E7', 'G7', 'Cmaj7', 'Dm7', 'Em7', 'Am7', 'Asus2', 'Asus4', 'Dsus2', 'Dsus4', 'Esus4', 'Fmaj7'];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const easiest = (sym) => { const l = voicingsOf(sym); return l.find((v) => v.tags.includes('iniciante') && !v.barre) || l.slice().sort((a, b) => a.difficulty - b.difficulty)[0]; };

export function pickChords({ title = 'Monte sua sequência de acordes', initial = [], min = 2, max = 16, presets = [] } = {}) {
  return new Promise((resolve) => {
    document.getElementById('chPicker')?.remove();
    const seq = [...initial];
    const F = { q: '', root: null, cat: null };
    const dlg = document.createElement('dialog'); dlg.id = 'chPicker';
    dlg.innerHTML = `<form method="dialog" class="cpk">
      <header class="cpk-head"><div><h2 class="h2">${esc(title)}</h2><p class="muted">Toque nos acordes para adicionar, na ordem em que serão tocados (um por compasso/trecho). Repita à vontade.</p></div><button type="button" class="btn ghost icon" data-x aria-label="Fechar">✕</button></header>
      <div class="cpk-filters">
        <label class="search grow"><input type="search" id="cpkQ" placeholder="Buscar: Am7, sol, sus4, dim…" aria-label="Buscar acorde"></label>
        <div class="cpk-chips" id="cpkRoots" role="group" aria-label="Nota raiz"><button type="button" class="chip on" data-root="">Todas</button>${ROOTS.map((r, i) => `<button type="button" class="chip" data-root="${i}">${r}</button>`).join('')}</div>
        <div class="cpk-chips" id="cpkCats" role="group" aria-label="Família"><button type="button" class="chip on" data-cat="">Mais usados</button>${CATEGORIES.map((c) => `<button type="button" class="chip" data-cat="${c}">${c}</button>`).join('')}</div>
      </div>
      <div class="cpk-grid" id="cpkGrid" tabindex="0"></div>
      <div class="cpk-tray"><div class="cpk-trayhead"><b>Sua sequência <span class="num dim" id="cpkN"></span></b>
        <span class="row">${presets.length ? `<select id="cpkPre" aria-label="Começar de um modelo"><option value="">Começar de um modelo…</option>${presets.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('')}</select>` : ''}<button type="button" class="btn ghost sm" data-clear>Limpar</button></span></div>
        <div class="cpk-seq" id="cpkSeq" aria-live="polite"></div></div>
      <footer class="cpk-foot"><button type="button" class="btn" data-x>Cancelar</button><button type="button" class="btn primary" id="cpkOk">Usar esta sequência</button></footer>
    </form>`;
    document.body.appendChild(dlg);
    const $ = (s) => dlg.querySelector(s);

    const list = () => {
      let syms;
      if (F.q.trim()) syms = searchSymbols(F.q);
      else if (F.root == null && !F.cat) syms = COMMON;
      else syms = allSymbols().map((s) => s.symbol);
      if (F.root != null || F.cat) syms = syms.filter((s) => { const p = parseSymbol(s); return p && (F.root == null || p.root === F.root) && (!F.cat || QUALITIES_BY_ID[p.quality].cat === F.cat); });
      return syms.slice(0, 96);
    };
    function paintGrid() {
      const g = $('#cpkGrid'), syms = list();
      g.innerHTML = syms.length ? syms.map((s) => { const v = easiest(s); const p = parseSymbol(s); return `<button type="button" class="cpk-tile" data-add="${esc(s)}" aria-label="Adicionar ${esc(s)}" title="${esc(QUALITIES_BY_ID[p.quality].name)}">${v ? chordDiagram(v, { size: 'sm' }) : ''}<b>${esc(displayName(p.root, p.quality))}</b></button>`; }).join('') : '<div class="empty">Nada com esse filtro.</div>';
    }
    function paintSeq() {
      $('#cpkN').textContent = `${seq.length}/${max}`;
      $('#cpkSeq').innerHTML = seq.length ? seq.map((s, i) => `<div class="cpk-step"><small class="num">${i + 1}</small><b>${esc(s)}</b><span class="cpk-acts"><button type="button" data-mv="${i}:-1" aria-label="Mover ${esc(s)} para trás" ${i === 0 ? 'disabled' : ''}>‹</button><button type="button" data-mv="${i}:1" aria-label="Mover ${esc(s)} para frente" ${i === seq.length - 1 ? 'disabled' : ''}>›</button><button type="button" data-rm="${i}" aria-label="Remover ${esc(s)}">✕</button></span></div>`).join('<span class="cpk-arrow">→</span>') : '<span class="dim">Nenhum acorde ainda. Escolha acima.</span>';
      const ok = $('#cpkOk'); ok.disabled = seq.length < min; ok.textContent = seq.length < min ? `Escolha pelo menos ${min} acordes` : `Usar esta sequência (${seq.length})`;
    }
    const done = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const d = b.dataset;
      if (d.add) { if (seq.length >= max) return; seq.push(d.add); paintSeq(); $('#cpkSeq').lastElementChild?.scrollIntoView?.({ block: 'nearest', inline: 'end' }); }
      else if (d.rm != null) { seq.splice(+d.rm, 1); paintSeq(); }
      else if (d.mv) { const [i, k] = d.mv.split(':').map(Number); const j = i + k; if (j >= 0 && j < seq.length) { [seq[i], seq[j]] = [seq[j], seq[i]]; paintSeq(); } }
      else if ('clear' in d) { seq.length = 0; paintSeq(); }
      else if ('root' in d) { F.root = d.root === '' ? null : +d.root; dlg.querySelectorAll('[data-root]').forEach((x) => x.classList.toggle('on', x === b)); paintGrid(); }
      else if ('cat' in d) { F.cat = d.cat || null; dlg.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('on', x === b)); paintGrid(); }
      else if ('x' in d) done(null);
      else if (b.id === 'cpkOk' && seq.length >= min) done([...seq]);
    });
    $('#cpkQ').addEventListener('input', (e) => { F.q = e.target.value; paintGrid(); });
    $('#cpkPre')?.addEventListener('change', (e) => { const p = presets[+e.target.value]; if (p) { seq.length = 0; seq.push(...p.symbols.slice(0, max)); paintSeq(); } e.target.value = ''; });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    paintGrid(); paintSeq();
    dlg.showModal();
    $('#cpkQ').focus();
  });
}
