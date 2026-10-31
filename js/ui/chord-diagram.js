// Diagrama de acorde em SVG (string). Reutilizável por Acordes, Músicas e Aprendizado.
// chordDiagram(voicing, { size:'sm'|'md'|'lg', label:'finger'|'note'|'none', showNotes:false, showTitle:false, expected? })
// Usa só variáveis do tema (--f1..--f4, --tx...) via style inline, então funciona em qualquer tela.
import { STANDARD, pcName } from '../music/theory.js';

const SIZES = { sm: 78, md: 130, lg: 230 };
const COLORS = { 1: 'var(--f1)', 2: 'var(--f2)', 3: 'var(--f3)', 4: 'var(--f4)' };
const X0 = 22, DX = 15.2, Y0 = 36, DY = 21, ROWS = 5;

export function chordDiagram(v, o = {}) {
  const size = SIZES[o.size] ?? SIZES.md, label = o.label ?? 'finger';
  const sx = (s) => X0 + s * DX, ry = (r) => Y0 + r * DY;
  const showNotes = o.showNotes ?? false, showTitle = o.showTitle ?? false;
  const H = 40 + ROWS * DY + (showNotes ? 18 : 6) + (showTitle ? 16 : 0), oy = showTitle ? 16 : 0;
  let g = '';
  const line = (x1, y1, x2, y2, st) => `<line x1="${x1}" y1="${y1 + oy}" x2="${x2}" y2="${y2 + oy}" style="${st}"/>`;
  for (let s = 0; s < 6; s++) g += line(sx(s), ry(0), sx(s), ry(ROWS), 'stroke:#586079;stroke-width:1.4');
  for (let r = 0; r <= ROWS; r++) g += line(sx(0), ry(r), sx(5), ry(r), 'stroke:#3a4157;stroke-width:1.4');
  if (v.baseFret === 1) g += line(sx(0) - 1, ry(0), sx(5) + 1, ry(0), 'stroke:var(--tx);stroke-width:4;stroke-linecap:round');
  else g += `<text x="${X0 - 12}" y="${ry(0) + 15 + oy}" text-anchor="end" style="fill:var(--tx-2);font:700 10px var(--font)">${v.baseFret}ª</text>`;

  // pestana
  if (v.barre) {
    const y = ry(v.barre.fret - v.baseFret + 0.5) + oy;
    g += `<rect x="${sx(v.barre.from) - 7}" y="${y - 7}" width="${sx(v.barre.to) - sx(v.barre.from) + 14}" height="14" rx="7" style="fill:var(--f1);opacity:.95"/>`;
  }
  v.frets.forEach((f, s) => {
    const x = sx(s);
    if (f < 0) g += `<path d="M${x - 3.5} ${24 + oy}l7 7M${x + 3.5} ${24 + oy}l-7 7" style="stroke:var(--tx-3);stroke-width:1.6;stroke-linecap:round;fill:none"/>`;
    else if (f === 0) g += `<circle cx="${x}" cy="${27.5 + oy}" r="3.8" style="fill:none;stroke:var(--tx-2);stroke-width:1.5"/>`;
    else {
      const y = ry(f - v.baseFret + 0.5) + oy, d = v.fingers[s], isRoot = (STANDARD[s] + f) % 12 === v.root;
      const inBarre = v.barre && f === v.barre.fret && s >= v.barre.from && s <= v.barre.to && s !== v.barre.from && s !== v.barre.to;
      if (!inBarre) {
        g += `<circle class="cd-dot" data-s="${s}" data-f="${f}" cx="${x}" cy="${y}" r="6.6" style="fill:${COLORS[d] || 'var(--accent)'}${isRoot ? ';stroke:#fff;stroke-width:1.6' : ''}"/>`;
        const txt = label === 'finger' ? (d || '') : label === 'note' ? pcName((STANDARD[s] + f) % 12) : '';
        if (txt !== '') g += `<text class="cd-txt" data-s="${s}" data-f="${f}" data-orig="${txt}" x="${x}" y="${y + 3.4}" text-anchor="middle" style="fill:#14100a;font:800 ${label === 'note' ? 7.5 : 9}px var(--font)">${txt}</text>`;
      }
    }
  });
  if (o.expected) o.expected.forEach((e) => { g += `<circle cx="${sx(e.string)}" cy="${(e.fret > 0 ? ry(e.fret - v.baseFret + 0.5) : 27.5) + oy}" r="9" style="fill:none;stroke:${e.state === 'ok' ? 'var(--ok)' : 'var(--bad)'};stroke-width:2"/>`; });
  if (showNotes) v.frets.forEach((f, s) => { if (f >= 0) g += `<text x="${sx(s)}" y="${ry(ROWS) + 14 + oy}" text-anchor="middle" style="fill:${(STANDARD[s] + f) % 12 === v.root ? 'var(--accent-2)' : 'var(--tx-2)'};font:700 8.5px var(--font)">${pcName((STANDARD[s] + f) % 12)}</text>`; });
  if (showTitle) g += `<text x="${(X0 + sx(5)) / 2}" y="12" text-anchor="middle" style="fill:var(--tx);font:700 13px var(--font-display)">${v.name}</text>`;
  const aria = `${v.name}: ${v.frets.map((f, s) => (f < 0 ? `corda ${s + 1} abafada` : `corda ${s + 1} casa ${f}`)).join(', ')}`;
  return `<svg class="cdiag" viewBox="0 0 ${X0 + sx(5) - X0 + 24} ${H}" width="${size}" role="img" aria-label="${aria}">${g}</svg>`;
}

// Ao vivo: quando a casa pressionada na guitarra cai numa bolinha de qualquer diagrama da tela,
// o número do dedo é trocado pelo nome da nota até a marca sumir.
export function bindDiagramPress(guitar) {
  const swap = (string, fret, on) => {
    document.querySelectorAll(`.cd-txt[data-s="${string}"]`).forEach((t) => {
      if (on && +t.dataset.f !== fret) return;
      const dot = t.previousElementSibling;   // a bolinha vem logo antes do texto
      if (on) { t.dataset.style ??= t.getAttribute('style'); t.textContent = pcName((STANDARD[string] + fret) % 12); t.style.font = '800 6.5px var(--font)'; if (dot?.classList.contains('cd-dot')) { dot.dataset.fill = dot.style.fill; dot.style.fill = 'var(--accent)'; dot.setAttribute('r', '7.6'); } }
      else { t.textContent = t.dataset.orig; if (t.dataset.style) t.setAttribute('style', t.dataset.style); delete t.dataset.style; if (dot?.dataset.fill !== undefined) { dot.style.fill = dot.dataset.fill; delete dot.dataset.fill; dot.setAttribute('r', '6.6'); } }
    });
  };
  const last = new Map();
  guitar.addEventListener('press', (e) => { const { string, fret } = e.detail; swap(string, last.get(string), false); last.set(string, fret); swap(string, fret, true); });
  guitar.addEventListener('unpress', (e) => {
    const strings = e.detail.string < 0 ? [...last.keys()] : [e.detail.string];
    for (const s of strings) { swap(s, last.get(s), false); last.delete(s); }
  });
}
