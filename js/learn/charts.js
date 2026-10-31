// Gráficos SVG mínimos (sem libs). Cores via CSS (classes .ch-*), declaradas em css/progress.css.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const scale = (v, a, b, c, d) => (b === a ? (c + d) / 2 : c + ((v - a) / (b - a)) * (d - c));
export const niceMax = (v) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };

// data: [{label, value, title?, emphasis?}]
export function barChart(data, { w = 1100, h = 170, unit = '', max } = {}) {
  const m = { l: 34, r: 8, t: 10, b: 24 }, top = niceMax(max ?? Math.max(...data.map((d) => d.value), 0));
  const bw = (w - m.l - m.r) / data.length, pad = Math.min(8, bw * 0.25);
  const grid = [0, 0.5, 1].map((f) => { const y = scale(f * top, 0, top, h - m.b, m.t); return `<line class="ch-grid" x1="${m.l}" x2="${w - m.r}" y1="${y}" y2="${y}"/><text class="ch-ax" x="${m.l - 6}" y="${y + 4}" text-anchor="end">${Math.round(f * top * 10) / 10}</text>`; }).join('');
  const bars = data.map((d, i) => { const y = scale(d.value, 0, top, h - m.b, m.t), x = m.l + i * bw + pad / 2;
    return `<rect class="ch-bar${d.emphasis ? ' on' : ''}" x="${x}" y="${y}" width="${Math.max(2, bw - pad)}" height="${Math.max(0, h - m.b - y)}" rx="3"><title>${esc(d.title ?? `${d.label}: ${Math.round(d.value * 10) / 10}${unit}`)}</title></rect>`
      + (i % Math.ceil(data.length / 8) === 0 ? `<text class="ch-ax" x="${x + (bw - pad) / 2}" y="${h - 6}" text-anchor="middle">${esc(d.label)}</text>` : ''); }).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">${grid}${bars}</svg>`;
}

// series: [{name, cls, points:[{x(ts), y}]}]; ranges opcionais.
export function lineChart(series, { w = 1100, h = 170, yMin, yMax, unit = '', fmtX } = {}) {
  const pts = series.flatMap((s) => s.points); if (!pts.length) return '';
  const m = { l: 40, r: 12, t: 12, b: 24 };
  const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x));
  const lo = yMin ?? Math.min(...pts.map((p) => p.y)), hi = yMax ?? Math.max(...pts.map((p) => p.y));
  const span = hi - lo || 1, a = yMin ?? lo - span * 0.1, b = yMax ?? hi + span * 0.1;
  const X = (v) => (x1 === x0 ? (m.l + w - m.r) / 2 : scale(v, x0, x1, m.l, w - m.r)), Y = (v) => scale(v, a, b, h - m.b, m.t);
  const grid = [0, 0.5, 1].map((f) => { const v = a + f * (b - a), y = Y(v); return `<line class="ch-grid" x1="${m.l}" x2="${w - m.r}" y1="${y}" y2="${y}"/><text class="ch-ax" x="${m.l - 6}" y="${y + 4}" text-anchor="end">${Math.round(v)}${unit}</text>`; }).join('');
  const lines = series.map((s) => { const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join('');
    return `<path class="ch-line ${s.cls || ''}" d="${d}"/>` + s.points.map((p) => `<circle class="ch-pt ${s.cls || ''}" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3.2"><title>${esc(s.name)}: ${Math.round(p.y)}${unit}${p.note ? ' · ' + esc(p.note) : ''}</title></circle>`).join(''); }).join('');
  const ax = fmtX ? `<text class="ch-ax" x="${m.l}" y="${h - 6}">${esc(fmtX(x0))}</text><text class="ch-ax" x="${w - m.r}" y="${h - 6}" text-anchor="end">${esc(fmtX(x1))}</text>` : '';
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">${grid}${lines}${ax}</svg>`;
}

// barras horizontais: [{label,value(0..100),note}]
export function hBars(data, { w = 900, row = 30 } = {}) {
  const h = data.length * row + 4, lw = 190;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">${data.map((d, i) => { const y = i * row + 4, bw = (w - lw - 60) * Math.min(1, d.value / 100);
    return `<text class="ch-lb" x="0" y="${y + 17}">${esc(d.label)}</text><rect class="ch-track" x="${lw}" y="${y + 6}" width="${w - lw - 60}" height="10" rx="5"/><rect class="ch-bar on${d.weak ? ' weak' : ''}" x="${lw}" y="${y + 6}" width="${Math.max(3, bw)}" height="10" rx="5"/><text class="ch-ax" x="${w}" y="${y + 16}" text-anchor="end">${esc(d.note ?? Math.round(d.value) + '%')}</text>`; }).join('')}</svg>`;
}

export function ring(ratio, { size = 148, stroke = 12 } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, ofs = c * (1 - Math.min(1, Math.max(0, ratio)));
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><circle class="ring-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/><circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${ofs}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}
