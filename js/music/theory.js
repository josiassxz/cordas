// Teoria musical: notas, qualidades de acorde, biblioteca de acordes, detecção e comparação.

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
let useFlats = false;
export const setFlats = (v) => { useFlats = !!v; };
export const pcName = (pc) => (useFlats ? FLAT : SHARP)[((pc % 12) + 12) % 12];
export const noteName = (m) => pcName(m) + (Math.floor(m / 12) - 1);
export const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

// Instrumentos: só a guitarra está ativa; o resto já tem lugar na interface.
export const INSTRUMENTS = [
  { id: 'guitar', name: 'Guitarra', ready: true, strings: [40, 45, 50, 55, 59, 64], labels: ['E', 'A', 'D', 'G', 'B', 'E'] },
  { id: 'acoustic', name: 'Violão', ready: false },
  { id: 'bass', name: 'Baixo', ready: false },
  { id: 'ukulele', name: 'Ukulele', ready: false },
  { id: 'piano', name: 'Piano', ready: false },
];
export const STANDARD = INSTRUMENTS[0].strings;

export const QUALITIES = [
  { id: 'maj', sym: '', pcs: [0, 4, 7], req: [0, 4] },
  { id: 'min', sym: 'm', pcs: [0, 3, 7], req: [0, 3] },
  { id: '7', sym: '7', pcs: [0, 4, 7, 10], req: [0, 4, 10] },
  { id: 'maj7', sym: 'maj7', pcs: [0, 4, 7, 11], req: [0, 4, 11] },
  { id: 'm7', sym: 'm7', pcs: [0, 3, 7, 10], req: [0, 3, 10] },
  { id: 'sus2', sym: 'sus2', pcs: [0, 2, 7], req: [0, 2] },
  { id: 'sus4', sym: 'sus4', pcs: [0, 5, 7], req: [0, 5] },
  { id: 'dim', sym: 'dim', pcs: [0, 3, 6], req: [0, 3, 6] },
  { id: 'aug', sym: 'aug', pcs: [0, 4, 8], req: [0, 4, 8] },
  { id: '5', sym: '5', pcs: [0, 7], req: [0, 7] },
  { id: '6', sym: '6', pcs: [0, 4, 7, 9], req: [0, 4, 9] },
  { id: 'add9', sym: 'add9', pcs: [0, 2, 4, 7], req: [0, 2, 4] },
];
export const Q = Object.fromEntries(QUALITIES.map((q) => [q.id, q]));

// Reconhece o acorde de um conjunto de notas MIDI (baixo = nota mais grave).
export function detectChord(notes) {
  if (!notes.length) return null;
  const bassPc = Math.min(...notes) % 12;
  const set = new Set(notes.map((n) => n % 12));
  if (set.size < 2) return null;
  let best = null;
  for (const r of set) {
    const rel = new Set([...set].map((p) => (p - r + 12) % 12));
    for (const q of QUALITIES) {
      if (!q.req.every((i) => rel.has(i))) continue;
      const extras = [...rel].filter((i) => !q.pcs.includes(i)).length;
      if (extras > 1) continue;
      const have = q.pcs.filter((i) => rel.has(i)).length;
      const score = have * 3 - extras * 5 - (q.pcs.length - have) + (r === bassPc ? 4 : 0);
      if (!best || score > best.score) best = { score, root: r, q };
    }
  }
  if (!best) return null;
  const slash = best.root !== bassPc ? '/' + pcName(bassPc) : '';
  return { root: best.root, quality: best.q.id, name: pcName(best.root) + best.q.sym + slash, bass: bassPc };
}

// Compara o que foi tocado com o acorde-alvo. rigor: 'root' | 'normal' | 'strict'
export function matchChord(notes, target, rigor = 'normal') {
  const set = new Set(notes.map((n) => n % 12));
  const q = Q[target.q];
  const rel = new Set([...set].map((p) => (p - target.root + 12) % 12));
  const missing = q.req.filter((i) => !rel.has(i)).map((i) => pcName(target.root + i));
  const extra = [...rel].filter((i) => !q.pcs.includes(i)).map((i) => pcName(target.root + i));
  let ok;
  if (rigor === 'root') ok = set.size >= 2 && rel.has(0);
  else if (rigor === 'strict') ok = missing.length === 0 && extra.length === 0;
  else ok = missing.length === 0 && extra.length <= 1;
  return { ok, missing, extra };
}


// ---- Cordas e trastes ----
export const STRING_COUNT = 6;
// Traste correspondente a uma nota numa corda (0 = solta). offset = desvio de afinação/capo calibrado em semitons.
export const fretOf = (string, note, offset = 0, strings = STANDARD) => note - strings[string] - offset;
export const noteAt = (string, fret, offset = 0, strings = STANDARD) => strings[string] + fret + offset;
export const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'E'];
