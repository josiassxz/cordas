// Braço da guitarra (SVG). Componente central: mostra o que o instrumento REALMENTE enviou
// (corda tocada, nota, traste derivado da nota) e, por cima, o que o exercício espera.
//
// Convenção de cordas: índice 0 = mais grave (E2) ... 5 = mais aguda (E4), igual ao canal MIDI da AG01.
// Na tela a corda aguda fica em cima (como o app da Aeroband e as tablaturas).
//
// HONESTIDADE: a AG01 envia "nota ligada/desligada" por corda. Isso prova que a corda foi tocada e qual
// nota soou; o traste é DERIVADO (nota - afinação - offset). Uma corda apenas pressionada, sem ser
// tocada, não gera evento e portanto não aparece. "Sustentada" = nota ligada ainda sem nota desligada.
import { STANDARD, STRING_LABELS, fretOf, noteName } from '../music/theory.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 1200, H = 236, NUT = 70, END = 1176, TOP = 34, GAP = 30;
const INLAYS = { 3: 1, 5: 1, 7: 1, 9: 1, 12: 2, 15: 1, 17: 1 };
const FINGER_CLASS = { 1: 'f1', 2: 'f2', 3: 'f3', 4: 'f4' };

const svg = (tag, attrs = {}, parent) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent?.appendChild(el);
  return el;
};

export class Fretboard {
  // opts: { frets=15, offset=0, strings=STANDARD, compact=false, showNames=true }
  constructor(host, opts = {}) {
    this.host = host;
    this.frets = opts.frets ?? 15;
    this.offset = opts.offset ?? 0;
    this.tuning = opts.strings ?? STANDARD;
    this.showNames = opts.showNames ?? true;
    this.expected = [];          // [{string,fret,finger,state}]
    this.live = new Map();       // string -> { el, note, fret, since }
    this.fadeTimers = new Map();
    this.build();
  }

  // posição X do centro da casa n (n=0 é a corda solta, desenhada junto da pestana)
  fretX(n) { const k = (1 - 2 ** (-this.frets / 12)); return NUT + (END - NUT) * (1 - 2 ** (-n / 12)) / k; }
  cellX(fret) { return fret === 0 ? NUT - 22 : (this.fretX(fret - 1) + this.fretX(fret)) / 2; }
  rowY(string) { return TOP + (5 - string) * GAP + 18; }

  build() {
    this.host.classList.add('fretboard');
    this.root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Braço da guitarra em tempo real', preserveAspectRatio: 'xMidYMid meet' });
    const defs = svg('defs', {}, this.root);
    const grad = svg('linearGradient', { id: 'fbWood', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    svg('stop', { offset: '0%', 'stop-color': 'var(--fb-wood-a)' }, grad);
    svg('stop', { offset: '100%', 'stop-color': 'var(--fb-wood-b)' }, grad);

    svg('rect', { class: 'fb-board', x: NUT, y: TOP - 4, width: END - NUT, height: GAP * 5 + 44, rx: 6, fill: 'url(#fbWood)' }, this.root);
    // casas e marcações
    for (let n = 1; n <= this.frets; n++) {
      const x = this.fretX(n);
      svg('line', { class: 'fb-fret', x1: x, x2: x, y1: TOP - 4, y2: TOP + GAP * 5 + 40 }, this.root);
      svg('text', { class: 'fb-num', x: this.cellX(n), y: H - 8, 'text-anchor': 'middle' }, this.root).textContent = n;
      const dots = INLAYS[n];
      if (dots === 1) svg('circle', { class: 'fb-inlay', cx: this.cellX(n), cy: TOP + GAP * 2.5 + 18, r: 6 }, this.root);
      if (dots === 2) { svg('circle', { class: 'fb-inlay', cx: this.cellX(n), cy: TOP + GAP * 1.5 + 18, r: 6 }, this.root); svg('circle', { class: 'fb-inlay', cx: this.cellX(n), cy: TOP + GAP * 3.5 + 18, r: 6 }, this.root); }
    }
    svg('rect', { class: 'fb-nut', x: NUT - 5, y: TOP - 4, width: 6, height: GAP * 5 + 44, rx: 2 }, this.root);
    // cordas
    this.stringEls = [];
    for (let s = 0; s < 6; s++) {
      const y = this.rowY(s);
      const line = svg('line', { class: 'fb-string', x1: NUT - 44, x2: END, y1: y, y2: y, 'stroke-width': 1 + (5 - s) * 0.32 }, this.root);
      const lab = svg('text', { class: 'fb-label', x: 16, y: y + 5, 'text-anchor': 'middle' }, this.root);
      lab.textContent = STRING_LABELS[s];
      this.stringEls.push({ line, lab });
    }
    this.layerExpected = svg('g', { class: 'fb-expected' }, this.root);
    this.layerLive = svg('g', { class: 'fb-live' }, this.root);
    this.layerFlash = svg('g', { class: 'fb-flash' }, this.root);
    this.layerOff = svg('g', { class: 'fb-offboard' }, this.root);   // notas fora do braço desenhado
    this.host.replaceChildren(this.root);
  }

  // ---------- esperado pelo exercício ----------
  // items: [{ string, fret, finger?, state? 'pending'|'hit'|'miss' }]
  setExpected(items = []) {
    this.expected = items;
    this.layerExpected.replaceChildren();
    for (const it of items) {
      const x = this.cellX(it.fret), y = this.rowY(it.string);
      const g = svg('g', { class: `fb-exp ${it.state || 'pending'} ${FINGER_CLASS[it.finger] || ''}`, transform: `translate(${x} ${y})` }, this.layerExpected);
      svg('circle', { r: it.fret === 0 ? 8 : 12 }, g);
      if (it.finger && it.fret > 0) svg('text', { 'text-anchor': 'middle', y: 4.5 }, g).textContent = it.finger;
    }
  }
  clearExpected() { this.setExpected([]); }

  // Cordas que NÃO devem soar (✕ ao lado da pestana, corda apagada).
  setAvoid(strings = []) {
    this.stringEls.forEach(({ line, lab }, s) => {
      const on = strings.includes(s);
      line.classList.toggle('avoid', on); lab.classList.toggle('avoid', on);
      lab.textContent = on ? '×' : STRING_LABELS[s];
    });
  }

  // ---------- ao vivo (eventos reais do dispositivo) ----------
  noteOn(string, note, vel = 64) {
    this.noteOff(string, true);
    clearTimeout(this.fadeTimers.get(string));
    const fret = fretOf(string, note, this.offset, this.tuning);
    const onBoard = fret >= 0 && fret <= this.frets;
    const layer = onBoard ? this.layerLive : this.layerOff;
    const x = onBoard ? this.cellX(fret) : NUT - 22 - 4, y = this.rowY(string);
    const g = svg('g', { class: `fb-note ${onBoard ? '' : 'off'}`, transform: `translate(${x} ${y})`, style: `--vel:${Math.min(1, vel / 100)}` }, layer);
    svg('circle', { class: 'ring', r: 14 }, g);
    svg('circle', { class: 'dot', r: fret === 0 ? 9 : 13 }, g);
    if (this.showNames) svg('text', { class: 'nm', 'text-anchor': 'middle', y: 4 }, g).textContent = noteName(note).replace(/\d/, '');
    if (!onBoard) g.append(Object.assign(svg('title'), { textContent: `${noteName(note)} está fora do braço desenhado (traste ${fret}). Ajuste a calibração em Laboratório.` }));
    this.live.set(string, { el: g, note, fret, onBoard, t: performance.now() });
    this.stringEls[string].line.classList.add('vibrating');
    return { string, note, fret, onBoard };
  }

  noteOff(string, instant = false) {
    const cur = this.live.get(string);
    if (!cur) return;
    this.live.delete(string);
    this.stringEls[string].line.classList.remove('vibrating');
    if (instant) { cur.el.remove(); return; }
    cur.el.classList.add('released');
    this.fadeTimers.set(string, setTimeout(() => cur.el.remove(), 600));
  }
  releaseAll() { for (const s of [...this.live.keys()]) this.noteOff(s); }

  // Notas atualmente sustentadas (ligadas, ainda sem nota desligada): [{string,note,fret}]
  sustained() { return [...this.live].map(([string, v]) => ({ string, note: v.note, fret: v.fret })); }

  // ---------- resultado de avaliação ----------
  // kind: 'ok' (acertou) | 'bad' (errou); fret opcional (usa o esperado se omitido)
  flash(string, fret, kind) {
    const g = svg('g', { class: `fb-res ${kind}`, transform: `translate(${this.cellX(fret ?? 0)} ${this.rowY(string)})` }, this.layerFlash);
    svg('circle', { r: 16 }, g);
    setTimeout(() => g.remove(), 700);
  }
  // Marca uma nota esperada como acertada/errada (muda a cor do marcador esperado).
  resolve(string, state) {
    this.expected.filter((e) => e.string === string).forEach((e) => { e.state = state; });
    this.setExpected(this.expected);
  }

  setOffset(n) { this.offset = n; }
  destroy() { this.fadeTimers.forEach(clearTimeout); this.host.replaceChildren(); this.host.classList.remove('fretboard'); }
}

// Liga um Fretboard aos eventos da guitarra (usado pelo dock fixo e por telas de prática).
export function bindGuitar(fb, guitar) {
  const on = (e) => fb.noteOn(e.detail.string, e.detail.note, e.detail.vel);
  const off = (e) => fb.noteOff(e.detail.string);
  const notes = (e) => { for (const s of [...fb.live.keys()]) if (!e.detail.active.has(s)) fb.noteOff(s); };
  guitar.addEventListener('noteon', on);
  guitar.addEventListener('noteoff', off);
  guitar.addEventListener('notes', notes);
  return () => { guitar.removeEventListener('noteon', on); guitar.removeEventListener('noteoff', off); guitar.removeEventListener('notes', notes); };
}
