// Capo, transposição e tonalidade (puro). Cifras em notação de letras: "G", "F#m7", "Bb/D".
import { QUALITIES } from '../music/theory.js';

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const mod12 = (n) => ((n % 12) + 12) % 12;
export const pcLabel = (pc, flats = false) => (flats ? FLAT : SHARP)[mod12(pc)];

export function parseNote(s) {
  const m = /^([A-Ga-g])([#b♯♭]?)$/.exec(s || '');
  if (!m) return null;
  return mod12(NAT[m[1].toUpperCase()] + (m[2] === '#' || m[2] === '♯' ? 1 : m[2] ? -1 : 0));
}

export function parseChord(sym) {
  const m = /^([A-G][#b♯♭]?)([^/]*)(?:\/([A-G][#b♯♭]?))?$/.exec((sym || '').trim());
  if (!m) return null;
  return { root: parseNote(m[1]), suffix: m[2], bass: m[3] ? parseNote(m[3]) : null };
}
export const formatChord = (c, flats = false) => pcLabel(c.root, flats) + c.suffix + (c.bass != null ? '/' + pcLabel(c.bass, flats) : '');

export function transposeChord(sym, semis, flats = false) {
  const c = parseChord(sym);
  return c ? formatChord({ ...c, root: mod12(c.root + semis), bass: c.bass == null ? null : mod12(c.bass + semis) }, flats) : sym;
}
// Com capo na casa n, quem toca a FORMA X soa X+n. Para soar "sym", toca-se a forma sym-n.
export const capoShape = (sym, capo, flats = false) => transposeChord(sym, -capo, flats);
export const soundingChord = (shape, capo, flats = false) => transposeChord(shape, capo, flats);

export function parseProgression(text) {
  const tokens = String(text || '').split(/[\s,;|–—-]+(?![^()]*\))/).filter(Boolean);
  const chords = [], invalid = [];
  for (const t of tokens) (parseChord(t) ? chords : invalid).push(t);
  return { chords, invalid };
}

// ---------- facilidade das formas (para sugerir capo) ----------
const OPEN = new Set(['C', 'D', 'E', 'G', 'A', 'Am', 'Dm', 'Em', 'A7', 'C7', 'D7', 'E7', 'G7', 'B7', 'Am7', 'Dm7', 'Em7', 'Cmaj7', 'Dmaj7', 'Gmaj7', 'Fmaj7', 'Asus2', 'Asus4', 'Dsus2', 'Dsus4', 'Esus4', 'Em7']);
export function shapeDifficulty(sym) {
  const c = parseChord(sym); if (!c) return 3;
  const name = pcLabel(c.root, false) + c.suffix;
  return OPEN.has(name) ? 0 : (c.suffix === '' || c.suffix === 'm' || c.suffix === '7' || c.suffix === 'm7') ? 2 : 3;
}
export function suggestCapo(chords, maxCapo = 9, flats = false) {
  const out = [];
  for (let capo = 0; capo <= maxCapo; capo++) {
    const shapes = chords.map((c) => capoShape(c, capo, flats));
    out.push({ capo, shapes, score: shapes.reduce((a, s) => a + shapeDifficulty(s), 0) });
  }
  return out.sort((a, b) => a.score - b.score || a.capo - b.capo);
}

// ---------- tonalidade ----------
const kind = (suffix) => (/^dim|^°|^m7b5|^ø/.test(suffix) ? 'dim' : /^m(?!aj)|^min/.test(suffix) ? 'min' : 'maj');
const MAJOR = [[0, 'maj', 'I'], [2, 'min', 'ii'], [4, 'min', 'iii'], [5, 'maj', 'IV'], [7, 'maj', 'V'], [9, 'min', 'vi'], [11, 'dim', 'vii°']];
const MINOR = [[0, 'min', 'i'], [2, 'dim', 'ii°'], [3, 'maj', 'III'], [5, 'min', 'iv'], [7, 'min', 'v'], [8, 'maj', 'VI'], [10, 'maj', 'VII']];
const SUFFIX = { maj: '', min: 'm', dim: 'dim' };

export function diatonic(tonic, mode = 'major', flats = false) {
  return (mode === 'major' ? MAJOR : MINOR).map(([i, q, rn]) => ({ roman: rn, chord: pcLabel(tonic + i, flats) + SUFFIX[q] }));
}

// Heurística: quantos acordes pertencem ao campo harmônico (+ bônus se começa/termina na tônica; V maior no menor conta).
export function detectKey(chords) {
  const parsed = chords.map(parseChord).filter(Boolean);
  if (!parsed.length) return null;
  let best = null;
  for (let t = 0; t < 12; t++) for (const mode of ['major', 'minor']) {
    const field = mode === 'major' ? MAJOR : MINOR;
    let score = 0;
    parsed.forEach((c, idx) => {
      const k = kind(c.suffix), rel = mod12(c.root - t);
      if (field.some(([i, q]) => i === rel && q === k)) score += 2;
      else if (mode === 'minor' && rel === 7 && k === 'maj') score += 1.5;
      if (idx === 0 && rel === 0) score += 1;
      if (idx === parsed.length - 1 && rel === 0) score += 1;
    });
    if (!best || score > best.score) best = { tonic: t, mode, score };
  }
  const max = parsed.length * 2 + 2;
  return { ...best, confidence: Math.min(1, best.score / max), name: pcLabel(best.tonic) + (best.mode === 'minor' ? ' menor' : ' maior') };
}

// Voicing genérico só para "ouvir" (não é o diagrama de acorde): [notas MIDI] com a fundamental entre E2 e D#3.
export function chordMidi(sym) {
  const c = parseChord(sym); if (!c) return [];
  const q = QUALITIES.find((x) => x.sym === c.suffix.replace(/^min$/, 'm').replace(/^maj$/, '')) || QUALITIES[0];
  let root = 40 + mod12(c.root - 4); if (root > 51) root -= 12;
  const third = q.pcs.find((i) => i === 3 || i === 4 || i === 2 || i === 5) ?? 4, fifth = q.pcs.includes(6) ? 6 : q.pcs.includes(8) ? 8 : 7;
  const seventh = q.pcs.find((i) => i === 9 || i === 10 || i === 11);
  const bass = c.bass != null ? 40 + mod12(c.bass - 4) : root;
  const notes = [bass > 51 ? bass - 12 : bass, root + fifth, root + 12, root + 12 + third, root + 12 + fifth + (seventh != null ? 0 : 12)];
  if (seventh != null) notes[4] = root + 12 + seventh;
  return notes;
}
