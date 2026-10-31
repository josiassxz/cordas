// Símbolos de acorde <-> (raiz, qualidade) e uma voicing simples para o acompanhamento sintetizado.
import { pcName, QUALITIES } from '../music/theory.js';

const ROOTS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QSYM = QUALITIES.map((q) => q.sym).filter(Boolean).sort((a, b) => b.length - a.length);

export function parseSymbol(sym) {
  const m = /^([A-G])([#b]?)(.*)$/.exec((sym || '').trim());
  if (!m) return null;
  const root = (ROOTS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const rest = m[3].split('/')[0];
  const q = rest === '' ? QUALITIES[0] : QUALITIES.find((x) => x.sym === rest);
  return q ? { root, quality: q.id, q } : null;
}
export const symbolOf = (root, qualityId) => pcName(root) + (QUALITIES.find((q) => q.id === qualityId)?.sym ?? '');
export const isValidSymbol = (s) => !!parseSymbol(s);

// Notas MIDI (baixo na região da 5ª-6ª corda + acorde em oitava acima).
export function voicingNotes(sym) {
  const p = parseSymbol(sym); if (!p) return [];
  const base = 40 + ((p.root - 4 + 12) % 12);
  return [base, ...p.q.pcs.map((i) => base + 12 + i)];
}
export { QSYM };
