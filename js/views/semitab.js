// Semi-tablatura de treino (Ritmo → Construtor): escolha vários acordes, arraste-os para a timeline, selecione vários
// de uma vez e mude a palhetada (↓/↑) em bloco. Cada acorde colocado é UMA palhetada: o exercício toca o acorde naquela
// fatia do compasso, com a direção escolhida. Gera um Score comum (mesma pista, mesma avaliação de todos os exercícios).
import { esc, icon, paintIcons } from '../core/dom.js';
import { TIME_SIGNATURES, SUBDIVISIONS, shapeOf, ensureShapes, PROGRESSIONS } from '../content/patterns.js';
import { normalizeScore } from '../engine/score.js';
import { pickChords } from '../ui/chord-picker.js';

const sigOf = (id) => TIME_SIGNATURES.find((t) => t.id === id);
const SUBL = { 1: [''], 2: ['', '&'], 3: ['', 'tri', 'let'], 4: ['', 'e', '&', 'a'] };
const DROP = [['one', 'Só nesta posição'], ['beat', 'Em todos os tempos do compasso'], ['slice', 'Em todas as fatias do compasso']];
export const DEFAULT_STATE = () => ({ sig: '4/4', sub: 2, bars: 4, bpm: 76, name: '', palette: ['G', 'D', 'Em', 'C'], events: {}, drop: 'one', armed: null });

// ---------- lógica pura (testável) ----------
export const slotsPerBar = (st) => sigOf(st.sig).beats * st.sub;
export const totalSlots = (st) => slotsPerBar(st) * st.bars;

// posições (fatias) que um acorde solto em `slot` ocupa, conforme "Ao soltar"
export function dropSlots(st, slot) {
  const per = slotsPerBar(st), bar = Math.floor(slot / per), start = bar * per;
  if (st.drop === 'beat') return Array.from({ length: sigOf(st.sig).beats }, (_, b) => start + b * st.sub);
  if (st.drop === 'slice') return Array.from({ length: per }, (_, i) => start + i);
  return [slot];
}
export function place(st, slot, sym, dir = 'D') {
  for (const i of dropSlots(st, slot)) if (i < totalSlots(st)) st.events[i] = { sym, dir: st.events[i]?.dir ?? dir };
  return st;
}
export function setDir(st, sel, dir) {   // dir: 'D' | 'U' | 'toggle'
  for (const i of sel) { const e = st.events[i]; if (e) e.dir = dir === 'toggle' ? (e.dir === 'D' ? 'U' : 'D') : dir; }
  return st;
}
export function setChord(st, sel, sym, dir = 'D') { for (const i of sel) st.events[i] = { sym, dir: st.events[i]?.dir ?? dir }; return st; }
export function removeAt(st, sel) { for (const i of sel) delete st.events[i]; return st; }
export function moveEvent(st, from, to) {
  if (from === to || !st.events[from] || to < 0 || to >= totalSlots(st)) return st;
  st.events[to] = st.events[from]; delete st.events[from]; return st;
}
export const rangeOf = (a, b) => { const [x, y] = a <= b ? [a, b] : [b, a]; return Array.from({ length: y - x + 1 }, (_, i) => x + i); };
// refaz a grade ao mudar compasso/subdivisão/compassos: mantém cada palhetada no mesmo instante musical que couber
export function regrid(st, patch) {
  const old = { per: slotsPerBar(st), sub: st.sub, beats: sigOf(st.sig).beats }, next = { ...st, ...patch };
  const nb = sigOf(next.sig).beats, evs = {};
  for (const [k, e] of Object.entries(st.events)) {
    const bar = Math.floor(k / old.per), within = (k % old.per) / old.sub;   // posição dentro do compasso, em tempos
    if (within >= nb) continue;
    const slot = bar * nb * next.sub + Math.round(within * next.sub);
    if (bar < next.bars && slot < nb * next.sub * next.bars) evs[slot] = e;
  }
  Object.assign(st, patch, { events: evs }); return st;
}

// Score: cada palhetada toca TODAS as cordas do acorde naquela fatia. A lista `chords` alimenta a faixa de acordes ("TROQUE →").
export function buildSemiScore(st, shapes = shapeOf) {
  const sg = sigOf(st.sig), keys = Object.keys(st.events).map(Number).sort((a, b) => a - b), events = [], chords = [];
  let last = null;
  for (const i of keys) {
    const { sym, dir } = st.events[i], sh = shapes(sym), beat = i / st.sub;
    events.push({ beat, dur: 1 / st.sub, strum: { dir, strings: sh.strings, frets: sh.frets, fingers: sh.fingers }, check: { dir: true } });
    if (sym !== last) { chords.push({ beat, chordId: sym, root: sh.root, q: sh.q, frets: sh.frets, fingers: sh.fingers }); last = sym; }
  }
  const nm = (st.name || 'minha').replace(/[^\w-]/g, '_');
  return normalizeScore({ id: `semitab-${nm}-${keys.length}`, title: `Semi-tablatura${st.name ? ': ' + st.name : ''}`, technique: 'chord-change', level: 3, bpm: st.bpm, beatsPerBar: sg.beats, subdivision: st.sub, lengthBeats: st.bars * sg.beats, events, chords });
}

// ---------- tela ----------
let memo = null;   // o rascunho sobrevive à troca de aba
export function mountSemiTab(root, app, { launch }) {
  const st = (memo ||= DEFAULT_STATE());
  const store = app.store, saved = () => store.get('rhythm.semitabs', []);
  let sel = new Set(), anchor = null, dragSel = false, cleanups = [];

  const colors = ['', '', ''];
  const label = (i) => { const per = st.sub, b = Math.floor((i % slotsPerBar(st)) / per), sl = i % per; return sl === 0 ? String(b + 1) : SUBL[st.sub]?.[sl] || ''; };

  function draw() {
    const n = totalSlots(st), per = slotsPerBar(st), selN = [...sel].filter((i) => st.events[i]).length;
    root.innerHTML = `<div class="panel col st">
      <details class="st-helpbox"><summary>Como usar</summary><p class="muted st-help">Escolha acordes, <b>arraste</b> cada um para a posição da timeline (ou clique no acorde para “armar” e clique na timeline). Cada acorde colocado é uma palhetada. Selecione vários (arrastando por cima, ou com Shift/⌘) e mude todos para ↓ ou ↑ de uma vez. Dá para arrastar uma palhetada já colocada para mover.</p></details>
      <div class="st-cfg">
        <div class="field"><span class="h3">Compasso</span><div class="seg">${TIME_SIGNATURES.map((t) => `<button data-sig="${t.id}" aria-pressed="${t.id === st.sig}">${t.label}</button>`).join('')}</div></div>
        <div class="field"><span class="h3">Batidas por tempo</span><div class="seg">${SUBDIVISIONS.map((t) => `<button data-sub="${t.id}" aria-pressed="${t.id === st.sub}">${t.id}</button>`).join('')}</div></div>
        <div class="field"><span class="h3">Compassos</span><div class="stepper"><button class="btn icon sm" data-bars="-1" aria-label="Menos compassos">−</button><b class="num">${st.bars}</b><button class="btn icon sm" data-bars="1" aria-label="Mais compassos">+</button></div></div>
        <div class="field"><span class="h3">Andamento <b class="num" id="stbv">${st.bpm}</b> BPM</span><input type="range" id="stbpm" min="40" max="160" value="${st.bpm}" style="--p:${((st.bpm - 40) / 120) * 100}%"></div>
        <div class="field"><span class="h3">Ao soltar o acorde</span><select id="stdrop" aria-label="Ao soltar o acorde">${DROP.map(([v, l]) => `<option value="${v}" ${st.drop === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="st-palette" id="stpal"><span class="h3">Acordes</span>
        ${st.palette.map((c) => `<span class="st-chip ${st.armed === c ? 'armed' : ''}" draggable="true" data-chip="${esc(c)}" title="Arraste para a timeline ou clique para armar"><button data-arm="${esc(c)}">${esc(c)}</button><button data-unchip="${esc(c)}" aria-label="Tirar ${esc(c)} dos acordes">✕</button></span>`).join('')}
        <button class="btn sm" data-addchords>＋ Escolher acordes…</button>
        ${st.armed ? `<span class="chip on">Pincel: <b>${esc(st.armed)}</b> — clique na timeline <button data-disarm aria-label="Soltar o pincel">✕</button></span>` : ''}
      </div>
      <div class="st-sel" role="toolbar" aria-label="Palhetada dos selecionados">
        <b class="num">${selN}</b> <span class="dim">selecionado${selN === 1 ? '' : 's'}</span>
        <button class="btn sm" data-set="D" ${selN ? '' : 'disabled'}>↓ Para baixo</button>
        <button class="btn sm" data-set="U" ${selN ? '' : 'disabled'}>↑ Para cima</button>
        <button class="btn sm" data-set="toggle" ${selN ? '' : 'disabled'}>⇅ Inverter</button>
        <button class="btn sm" data-alt ${selN > 1 ? '' : 'disabled'} title="Alterna ↓ ↑ ↓ ↑ nos selecionados, em ordem">↓↑ Alternar</button>
        <button class="btn sm" data-apply ${st.armed && sel.size ? '' : 'disabled'} title="Coloca o acorde armado em todas as posições selecionadas">Aplicar acorde armado</button>
        <button class="btn sm danger" data-del ${selN ? '' : 'disabled'}>Apagar</button>
        <span class="grow"></span><button class="btn ghost sm" data-selall>Selecionar tudo</button><button class="btn ghost sm" data-selnone ${sel.size ? '' : 'disabled'}>Limpar seleção</button>
        <small class="dim">Teclas: D = ↓ · U = ↑ · Delete apaga</small>
      </div>
      <div class="st-scroll"><div class="st-grid" id="stgrid" style="--n:${n};--spb:${per}" tabindex="0" aria-label="Timeline da semi-tablatura">
        ${Array.from({ length: n }, (_, i) => {
    const e = st.events[i], bar = i % per === 0, beat = i % st.sub === 0;
    return `<div class="st-cell ${bar ? 'bar' : beat ? 'beat' : ''} ${sel.has(i) ? 'sel' : ''}" data-i="${i}"><i class="st-lab">${i % per === 0 ? `<b>c.${i / per + 1}</b>` : ''}${esc(label(i))}</i>${e ? `<div class="st-ev ${e.dir} ${sel.has(i) ? 'sel' : ''}" draggable="true" data-ev="${i}"><b>${esc(e.sym)}</b><span>${e.dir === 'D' ? '↓' : '↑'}</span></div>` : ''}</div>`;
  }).join('')}
      </div></div>
      <div class="row wrap st-foot">
        <button class="btn primary lg" data-go>${icon('play')} Praticar</button><button class="btn" data-hear>Pré-ouvir</button>
        <input type="text" id="stname" maxlength="40" placeholder="Nome (ex.: Minha balada)" value="${esc(st.name)}" aria-label="Nome da semi-tablatura">
        <button class="btn" data-save>Salvar</button><button class="btn ghost" data-clear>Limpar tudo</button>
        <select id="stpre" aria-label="Começar de uma progressão"><option value="">Começar de uma progressão…</option>${PROGRESSIONS.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('')}</select>
      </div>
      ${saved().length ? `<div class="st-saved"><span class="h3">Minhas semi-tablaturas</span>${saved().map((p) => `<span class="cpk-savedchip"><button data-load="${esc(p.id)}" title="${esc(p.name)}">${esc(p.name)} <small class="dim">${Object.keys(p.events).length} palhetadas · ${p.sig}</small></button><button data-del-saved="${esc(p.id)}" aria-label="Excluir ${esc(p.name)}">✕</button></span>`).join('')}</div>` : ''}
    </div>`;
    paintIcons(root);
  }

  const redraw = () => { const sc = root.querySelector('.st-scroll')?.scrollLeft || 0; draw(); const e = root.querySelector('.st-scroll'); if (e) e.scrollLeft = sc; };
  const symbolsUsed = () => [...new Set([...st.palette, ...Object.values(st.events).map((e) => e.sym)])];

  // ----- cliques -----
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.sig) { regrid(st, { sig: d.sig, sub: sigOf(d.sig).sub }); sel.clear(); redraw(); }
    else if (d.sub) { regrid(st, { sub: +d.sub }); sel.clear(); redraw(); }
    else if (d.bars) { regrid(st, { bars: Math.max(1, Math.min(16, st.bars + +d.bars)) }); sel = new Set([...sel].filter((i) => i < totalSlots(st))); redraw(); }
    else if (d.arm) { st.armed = st.armed === d.arm ? null : d.arm; redraw(); }
    else if ('disarm' in d) { st.armed = null; redraw(); }
    else if (d.unchip) { st.palette = st.palette.filter((c) => c !== d.unchip); if (st.armed === d.unchip) st.armed = null; redraw(); }
    else if ('addchords' in d) {
      const seq = await pickChords({ title: 'Acordes da sua semi-tablatura', initial: st.palette, min: 1, max: 24, presets: PROGRESSIONS.map((p) => ({ name: p.name, symbols: p.chords })) });
      if (seq) { st.palette = [...new Set(seq.map((x) => x.symbol))]; try { await ensureShapes(st.palette); } catch (err) { app.toast(err.message); } redraw(); }
    }
    else if (d.set) { setDir(st, sel, d.set); redraw(); }
    else if ('alt' in d) { [...sel].filter((i) => st.events[i]).sort((a, c) => a - c).forEach((i, k) => { st.events[i].dir = k % 2 ? 'U' : 'D'; }); redraw(); }
    else if ('apply' in d) { if (st.armed) { setChord(st, sel, st.armed); redraw(); } }
    else if ('del' in d) { removeAt(st, sel); redraw(); }
    else if ('selall' in d) { sel = new Set(Object.keys(st.events).map(Number)); redraw(); }
    else if ('selnone' in d) { sel.clear(); redraw(); }
    else if ('clear' in d) { st.events = {}; sel.clear(); redraw(); }
    else if ('go' in d) await go();
    else if ('hear' in d) await hear();
    else if ('save' in d) {
      const name = (root.querySelector('#stname').value.trim()) || `Semi-tablatura ${saved().length + 1}`; st.name = name;
      store.update('rhythm.semitabs', (a) => [{ id: 'st' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, sig: st.sig, sub: st.sub, bars: st.bars, bpm: st.bpm, palette: [...st.palette], events: JSON.parse(JSON.stringify(st.events)) }, ...a.filter((x) => x.name.toLowerCase() !== name.toLowerCase())], []);
      app.toast(`“${name}” salva`); redraw();
    }
    else if (d.load) { const p = saved().find((x) => x.id === d.load); if (p) { Object.assign(st, { sig: p.sig, sub: p.sub, bars: p.bars, bpm: p.bpm, name: p.name, palette: [...p.palette], events: JSON.parse(JSON.stringify(p.events)), armed: null }); sel.clear(); redraw(); } }
    else if (d.delSaved) { store.update('rhythm.semitabs', (a) => a.filter((x) => x.id !== d.delSaved), []); redraw(); }
  });
  root.addEventListener('input', (e) => { if (e.target.id === 'stbpm') { st.bpm = +e.target.value; root.querySelector('#stbv').textContent = st.bpm; e.target.style.setProperty('--p', `${((st.bpm - 40) / 120) * 100}%`); } });
  root.addEventListener('change', async (e) => {
    if (e.target.id === 'stdrop') st.drop = e.target.value;
    else if (e.target.id === 'stname') st.name = e.target.value;
    else if (e.target.id === 'stpre') {
      const p = PROGRESSIONS[+e.target.value]; if (!p) return;
      try { await ensureShapes(p.chords); } catch (err) { app.toast(err.message); return; }
      st.palette = [...new Set(p.chords)]; st.events = {};
      const per = slotsPerBar(st); const nb = sigOf(st.sig).beats;
      for (let bar = 0; bar < st.bars; bar++) { const sym = p.chords[bar % p.chords.length]; for (let b = 0; b < nb; b++) st.events[bar * per + b * st.sub] = { sym, dir: 'D' }; }   // um acorde por compasso, ↓ em cada tempo
      sel.clear(); redraw();
    }
  });

  // ----- seleção: clique, Shift/⌘, e arrastar por cima -----
  const slotOf = (el) => { const c = el?.closest?.('.st-cell'); return c ? +c.dataset.i : null; };
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button,input,select')) return;
    const i = slotOf(e.target); if (i == null) return;
    root.querySelector('#stgrid')?.focus({ preventScroll: true });
    if (st.armed && !st.events[i] && !e.shiftKey && !e.metaKey && !e.ctrlKey) { place(st, i, st.armed); redraw(); return; }   // pincel
    if (e.shiftKey && anchor != null) sel = new Set(rangeOf(anchor, i));
    else if (e.metaKey || e.ctrlKey) { sel.has(i) ? sel.delete(i) : sel.add(i); anchor = i; }
    else { sel = new Set([i]); anchor = i; if (!e.target.closest('.st-ev')) dragSel = true; }
    paintSel();
  });
  root.addEventListener('pointermove', (e) => {
    if (!dragSel) return;
    const i = slotOf(document.elementFromPoint(e.clientX, e.clientY)); if (i == null || anchor == null) return;
    sel = new Set(rangeOf(anchor, i)); paintSel();
  });
  const endDrag = () => { if (dragSel) { dragSel = false; redraw(); } };
  window.addEventListener('pointerup', endDrag); cleanups.push(() => window.removeEventListener('pointerup', endDrag));
  function paintSel() {   // atualiza só as classes (sem refazer o DOM durante o arrasto)
    root.querySelectorAll('.st-cell').forEach((c) => { const i = +c.dataset.i, on = sel.has(i); c.classList.toggle('sel', on); c.querySelector('.st-ev')?.classList.toggle('sel', on); });
    const n = [...sel].filter((i) => st.events[i]).length; root.querySelector('.st-sel .num').textContent = n;
  }

  // ----- arrastar e soltar: acorde da paleta -> timeline; mover palhetada já colocada -----
  let drag = null;
  root.addEventListener('dragstart', (e) => {
    const chip = e.target.closest?.('[data-chip]'), ev = e.target.closest?.('[data-ev]');
    if (chip) drag = { kind: 'chip', sym: chip.dataset.chip }; else if (ev) drag = { kind: 'ev', from: +ev.dataset.ev }; else return;
    e.dataTransfer.effectAllowed = 'copyMove'; e.dataTransfer.setData('text/plain', 'corda');
  });
  root.addEventListener('dragover', (e) => {
    if (!drag) return; const i = slotOf(e.target); if (i == null) return; e.preventDefault();
    root.querySelectorAll('.st-cell.drop').forEach((c) => c.classList.remove('drop'));
    const targets = drag.kind === 'chip' ? dropSlots(st, i) : [i];
    targets.forEach((t) => root.querySelector(`.st-cell[data-i="${t}"]`)?.classList.add('drop'));
  });
  root.addEventListener('drop', (e) => {
    if (!drag) return; const i = slotOf(e.target); if (i == null) return; e.preventDefault();
    if (drag.kind === 'chip') place(st, i, drag.sym); else moveEvent(st, drag.from, i);
    drag = null; sel = new Set([i]); redraw();
  });
  root.addEventListener('dragend', () => { drag = null; root.querySelectorAll('.st-cell.drop').forEach((c) => c.classList.remove('drop')); });

  // ----- teclado -----
  const key = (e) => {
    if (!root.isConnected || e.target.closest?.('input,select,textarea,dialog') || e.metaKey && e.key !== 'a') return;
    const k = e.key.toLowerCase();
    if (k === 'd' || k === 'u') {
      if (!sel.size) return; e.preventDefault(); setDir(st, sel, k === 'd' ? 'D' : 'U');
      if (sel.size === 1) { const only = [...sel][0]; const nextEv = Object.keys(st.events).map(Number).filter((x) => x > only).sort((a, b) => a - b)[0]; if (nextEv != null) { sel = new Set([nextEv]); anchor = nextEv; } }   // entrada rápida
      redraw();
    } else if (k === 'delete' || k === 'backspace') { if (sel.size) { e.preventDefault(); removeAt(st, sel); redraw(); } }
    else if (k === 'escape') { sel.clear(); redraw(); }
    else if (k === 'a' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sel = new Set(Object.keys(st.events).map(Number)); redraw(); }
  };
  document.addEventListener('keydown', key); cleanups.push(() => document.removeEventListener('keydown', key));

  // ----- praticar / ouvir -----
  async function ready() {
    if (!Object.keys(st.events).length) { app.toast('Coloque pelo menos um acorde na timeline.'); return false; }
    try { await ensureShapes(symbolsUsed()); } catch (err) { app.toast(err.message); return false; }
    return true;
  }
  async function go() { if (await ready()) launch(root, buildSemiScore(st)); }
  async function hear() {
    if (!(await ready())) return;
    const sc = buildSemiScore(st), ctx = app.audio.context, t0 = ctx.currentTime + 0.1, off = app.store.get('settings.pitchOffset', 0);
    sc.events.forEach((x) => { const sh = shapeOf(sc.chords.filter((c) => c.beat <= x.beat).pop().chordId); app.audio.strum(x.strum.strings.map((q) => sh.notes[sh.strings.indexOf(q)] + off), t0 + x.beat * 60 / st.bpm, x.strum.dir, 0.3); });
  }

  ensureShapes(symbolsUsed()).catch(() => {});
  draw();
  return () => cleanups.forEach((f) => f());
}
