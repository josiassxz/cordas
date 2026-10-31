// Padrões rítmicos, compassos e formas de acorde usadas pelos exercícios.
// Formas vêm da biblioteca v1 (js/music/legacy.js); upgradeShapes() as troca pelas do motor de acordes quando existir.
import { CHORDS, PROGRESSIONS as V1_PROGRESSIONS } from '../music/legacy.js';
import { STANDARD, pcName } from '../music/theory.js';

// Compasso: beats = batidas por compasso; sub = subdivisões por batida; label do compasso composto usa batida pontuada.
export const TIME_SIGNATURES = [
  { id: '2/4', label: '2/4', beats: 2, sub: 2, accents: [0], note: 'Marcha' },
  { id: '3/4', label: '3/4', beats: 3, sub: 2, accents: [0], note: 'Valsa' },
  { id: '4/4', label: '4/4', beats: 4, sub: 2, accents: [0, 2], note: 'O mais comum' },
  { id: '5/4', label: '5/4', beats: 5, sub: 2, accents: [0, 3], note: 'Irregular (3+2)' },
  { id: '6/8', label: '6/8', beats: 2, sub: 3, accents: [0], note: 'Composto: 2 batidas de 3' },
  { id: '12/8', label: '12/8', beats: 4, sub: 3, accents: [0, 2], note: 'Composto: 4 batidas de 3' },
];
export const SUBDIVISIONS = [{ id: 1, label: 'Semínimas' }, { id: 2, label: 'Colcheias' }, { id: 3, label: 'Tercinas' }, { id: 4, label: 'Semicolcheias' }];

// Padrões de palhetada em colcheias (8 posições em 4/4): D = baixo, U = cima, - = pausa.
export const STRUM_PATTERNS = [
  { id: 'down', name: 'Só para baixo', level: 1, slots: 'D-D-D-D-' },
  { id: 'pop', name: 'Pop clássico', level: 2, slots: 'D-DU-UDU' },
  { id: 'ballad', name: 'Balada', level: 2, slots: 'D--U-UDU' },
  { id: 'eighths', name: 'Colcheias contínuas', level: 3, slots: 'DUDUDUDU' },
  { id: 'rock', name: 'Rock', level: 2, slots: 'D-D-D-DU' },
  { id: 'reggae', name: 'Reggae (contratempo)', level: 3, slots: '-U-U-U-U' },
  { id: 'folk', name: 'Folk', level: 3, slots: 'D-DUDU-U' },
  { id: 'gallop', name: 'Cavalgada', level: 3, slots: 'D-DUD-DU' },
];
export const patternById = (id) => STRUM_PATTERNS.find((p) => p.id === id);

export const PROGRESSIONS = [
  ...V1_PROGRESSIONS,
  { id: 'dgad', name: 'D – G – A – D', desc: 'Rock clássico de três acordes', chords: ['D', 'G', 'A', 'D'] },
  { id: 'amg', name: 'Am – G – C – E', desc: 'Cadência andaluza simplificada', chords: ['Am', 'G', 'C', 'E'] },
];

// ---------- formas ----------
const cache = new Map();
const NAMES = { maj: '', min: 'm', 7: '7', maj7: 'maj7', m7: 'm7', sus2: 'sus2', sus4: 'sus4', 5: '5' };
function mk(symbol, root, q, frets, fingers) {
  const notes = frets.map((f, s) => (f < 0 ? null : STANDARD[s] + f)).filter((n) => n != null);
  return { symbol, name: symbol, id: symbol, root, q, frets, fingers, strings: frets.map((f, s) => (f >= 0 ? s : -1)).filter((s) => s >= 0), notes };
}
for (const c of CHORDS) cache.set(c.id, mk(c.id, c.root, c.q, c.frets, c.fingers));
const POWER = [['E5', 4, [0, 2, 2, -1, -1, -1], [0, 1, 2, 0, 0, 0]], ['A5', 9, [-1, 0, 2, 2, -1, -1], [0, 0, 1, 2, 0, 0]], ['D5', 2, [-1, -1, 0, 2, 3, -1], [0, 0, 0, 1, 2, 0]], ['G5', 7, [3, 5, 5, -1, -1, -1], [1, 3, 4, 0, 0, 0]]];
for (const [s, r, f, fi] of POWER) cache.set(s, mk(s, r, '5', f, fi));

export function shapeOf(symbol) {
  const s = cache.get(symbol);
  if (!s) throw new Error(`Forma de acorde desconhecida: ${symbol}`);
  return s;
}
export const hasShape = (symbol) => cache.has(symbol);
export const allShapes = () => [...cache.values()];

// Troca as formas pelas da biblioteca nova (frente ACORDES) se ela existir e responder ao contrato.
export async function upgradeShapes() {
  try {
    const m = await import('../music/chords.js');
    let n = 0;
    for (const sym of [...cache.keys()]) {
      let v = m.getChord?.(sym);
      if (Array.isArray(v)) v = v[0];
      if (v && Array.isArray(v.frets) && v.frets.length === 6 && v.root != null) {
        const q = v.quality ?? cache.get(sym).q;
        cache.set(sym, mk(sym, v.root, q === 'min' || q === 'maj' || q in NAMES ? q : cache.get(sym).q, v.frets, v.fingers || Array(6).fill(0))); n++;
      }
    }
    return n;
  } catch { return 0; }
}
export const rootName = (sym) => pcName(shapeOf(sym).root);
