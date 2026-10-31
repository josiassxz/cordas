// Linha do tempo de acordes editável e utilidades de tempo. Puro, sem DOM.
// Representação: [{ t, symbol|null, conf?, manual }] ordenado; cada acorde vale até o próximo.
import { isValidSymbol } from './chordnames.js';

const r3 = (v) => Math.round(v * 1000) / 1000;
const sorted = (l) => [...l].sort((a, b) => a.t - b.t);

export function chordAt(list, t) { let cur = null, idx = -1; list.forEach((c, i) => { if (c.t <= t + 1e-9) { cur = c; idx = i; } }); return { chord: cur, index: idx }; }
export function nextChord(list, t) { const { index } = chordAt(list, t); return list.slice(index + 1).find((c) => c.symbol && c.symbol !== list[index]?.symbol) || null; }

export function addChord(list, t, symbol) {
  if (symbol !== null && !isValidSymbol(symbol)) throw new Error(`Acorde inválido: "${symbol}".`);
  const rest = list.filter((c) => Math.abs(c.t - t) > 0.05);
  return sorted([...rest, { t: r3(Math.max(0, t)), symbol, conf: 1, manual: true }]);
}
export function editChord(list, i, symbol) {
  if (symbol !== null && !isValidSymbol(symbol)) throw new Error(`Acorde inválido: "${symbol}".`);
  return list.map((c, k) => (k === i ? { ...c, symbol, conf: 1, manual: true } : c));
}
export const removeChord = (list, i) => list.filter((_, k) => k !== i);
export const moveChord = (list, i, t) => sorted(list.map((c, k) => (k === i ? { ...c, t: r3(Math.max(0, t)), manual: true } : c)));
// junta vizinhos idênticos (após edições)
export function tidy(list) { const out = []; for (const c of sorted(list)) if (!out.length || out[out.length - 1].symbol !== c.symbol) out.push(c); return out; }
// trechos [{t0,t1,symbol}] até a duração total
export function spans(list, duration) { return list.map((c, i) => ({ t0: c.t, t1: list[i + 1]?.t ?? duration, symbol: c.symbol, manual: !!c.manual })); }

// ---------- andamento ----------
export function tapTempo(taps) {
  if (taps.length < 3) return null;
  const d = taps.slice(1).map((t, i) => t - taps[i]).filter((v) => v > 0.2 && v < 2).sort((a, b) => a - b);
  if (d.length < 2) return null;
  const med = d[Math.floor(d.length / 2)];
  return Math.round((60 / med) * 10) / 10;
}
export const beatTimes = (bpm, offset, duration) => { const out = [], s = 60 / bpm; for (let t = offset - Math.floor(offset / s) * s; t < duration; t += s) out.push(t); return out; };
export const beatIndexAt = (t, bpm, offset) => Math.floor((t - offset) * bpm / 60 + 1e-9);

// ---------- loop A–B ----------
export const MIN_LOOP = 0.5;
export function normalizeLoop(a, b, duration) {
  let x = Math.max(0, Math.min(a, b)), y = Math.min(duration, Math.max(a, b));
  if (y - x < MIN_LOOP) y = Math.min(duration, x + MIN_LOOP);
  if (y - x < MIN_LOOP) x = Math.max(0, y - MIN_LOOP);
  return { a: r3(x), b: r3(y) };
}
// Dado o tempo atual, retorna para onde saltar (ou null). Cobre também ficar fora e antes de A.
export function loopJump(t, loop) { if (!loop?.enabled) return null; return t >= loop.b ? loop.a : null; }
export function nudgeLoop(loop, which, delta, duration) { const n = which === 'a' ? normalizeLoop(loop.a + delta, loop.b, duration) : normalizeLoop(loop.a, loop.b + delta, duration); return { ...loop, ...n }; }
