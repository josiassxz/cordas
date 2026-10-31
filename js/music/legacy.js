// Biblioteca v1 (27 acordes, progressões e padrões). Será substituída pelo motor de acordes em music/chords.js.
import { pcName, STANDARD, QUALITIES } from './theory.js';
const Q = Object.fromEntries(QUALITIES.map((q) => [q.id, q]));
// ---- Biblioteca de acordes (cordas da mais grave para a mais aguda; -1 = abafada) ----
function chord(root, q, frets, fingers, group) {
  const pos = frets.filter((f) => f > 0);
  const base = pos.length && Math.max(...pos) > 4 ? Math.min(...pos) : 1;
  const name = pcName(root) + Q[q].sym;
  const notes = frets.map((f, s) => (f < 0 ? null : STANDARD[s] + f)).filter((n) => n !== null);
  return { id: name, name, root, q, frets, fingers, group, base, notes };
}
const C = 0, D = 2, E = 4, F = 5, G = 7, A = 9, B = 11;
export const CHORDS = [
  chord(E, 'min', [0, 2, 2, 0, 0, 0], [0, 2, 3, 0, 0, 0], 'Essenciais'),
  chord(A, 'min', [-1, 0, 2, 2, 1, 0], [0, 0, 2, 3, 1, 0], 'Essenciais'),
  chord(E, 'maj', [0, 2, 2, 1, 0, 0], [0, 2, 3, 1, 0, 0], 'Essenciais'),
  chord(A, 'maj', [-1, 0, 2, 2, 2, 0], [0, 0, 1, 2, 3, 0], 'Essenciais'),
  chord(D, 'maj', [-1, -1, 0, 2, 3, 2], [0, 0, 0, 1, 3, 2], 'Essenciais'),
  chord(C, 'maj', [-1, 3, 2, 0, 1, 0], [0, 3, 2, 0, 1, 0], 'Essenciais'),
  chord(G, 'maj', [3, 2, 0, 0, 0, 3], [2, 1, 0, 0, 0, 3], 'Essenciais'),
  chord(D, 'min', [-1, -1, 0, 2, 3, 1], [0, 0, 0, 2, 3, 1], 'Essenciais'),
  chord(F, 'maj', [-1, -1, 3, 2, 1, 1], [0, 0, 3, 2, 1, 1], 'Intermediários'),
  chord(B, 'min', [-1, 2, 4, 4, 3, 2], [0, 1, 3, 4, 2, 1], 'Intermediários'),
  chord(B, '7', [-1, 2, 1, 2, 0, 2], [0, 2, 1, 3, 0, 4], 'Intermediários'),
  chord(G, '7', [3, 2, 0, 0, 0, 1], [3, 2, 0, 0, 0, 1], 'Com sétima'),
  chord(C, '7', [-1, 3, 2, 3, 1, 0], [0, 3, 2, 4, 1, 0], 'Com sétima'),
  chord(D, '7', [-1, -1, 0, 2, 1, 2], [0, 0, 0, 2, 1, 3], 'Com sétima'),
  chord(E, '7', [0, 2, 0, 1, 0, 0], [0, 2, 0, 1, 0, 0], 'Com sétima'),
  chord(A, '7', [-1, 0, 2, 0, 2, 0], [0, 0, 2, 0, 3, 0], 'Com sétima'),
  chord(A, 'm7', [-1, 0, 2, 0, 1, 0], [0, 0, 2, 0, 1, 0], 'Com sétima'),
  chord(E, 'm7', [0, 2, 0, 0, 0, 0], [0, 2, 0, 0, 0, 0], 'Com sétima'),
  chord(D, 'm7', [-1, -1, 0, 2, 1, 1], [0, 0, 0, 2, 1, 1], 'Com sétima'),
  chord(C, 'maj7', [-1, 3, 2, 0, 0, 0], [0, 3, 2, 0, 0, 0], 'Com sétima'),
  chord(F, 'maj7', [-1, -1, 3, 2, 1, 0], [0, 0, 3, 2, 1, 0], 'Com sétima'),
  chord(G, 'maj7', [3, 2, 0, 0, 0, 2], [3, 2, 0, 0, 0, 1], 'Com sétima'),
  chord(D, 'maj7', [-1, -1, 0, 2, 2, 2], [0, 0, 0, 1, 1, 1], 'Com sétima'),
  chord(A, 'sus2', [-1, 0, 2, 2, 0, 0], [0, 0, 1, 2, 0, 0], 'Suspensos'),
  chord(A, 'sus4', [-1, 0, 2, 2, 3, 0], [0, 0, 1, 2, 3, 0], 'Suspensos'),
  chord(D, 'sus2', [-1, -1, 0, 2, 3, 0], [0, 0, 0, 1, 3, 0], 'Suspensos'),
  chord(D, 'sus4', [-1, -1, 0, 2, 3, 3], [0, 0, 0, 1, 2, 3], 'Suspensos'),
];
for (const c of CHORDS) c.id = c.name;
export const chordById = (id) => CHORDS.find((c) => c.id === id);
export const CHORD_GROUPS = ['Essenciais', 'Intermediários', 'Com sétima', 'Suspensos'];

export const PROGRESSIONS = [
  { id: 'gdem', name: 'G – D – Em – C', desc: 'O clássico do pop e do folk', chords: ['G', 'D', 'Em', 'C'] },
  { id: 'amfcg', name: 'Am – F – C – G', desc: 'Emotiva, muito usada em baladas', chords: ['Am', 'F', 'C', 'G'] },
  { id: 'cgamf', name: 'C – G – Am – F', desc: 'A progressão mais famosa do pop', chords: ['C', 'G', 'Am', 'F'] },
  { id: 'emcgd', name: 'Em – C – G – D', desc: 'Rock suave, ótima para treinar troca', chords: ['Em', 'C', 'G', 'D'] },
  { id: 'ada', name: 'A – D – E – A', desc: 'Três acordes: rock e blues básico', chords: ['A', 'D', 'E', 'A'] },
  { id: 'blues', name: 'A7 – D7 – A7 – E7', desc: 'Blues simplificado', chords: ['A7', 'D7', 'A7', 'E7'] },
  { id: 'em-am', name: 'Em – Am', desc: 'Troca de dois acordes: aquecimento', chords: ['Em', 'Am'] },
];

// Padrões de ritmo em colcheias (8 por compasso 4/4): D = para baixo, U = para cima, - = pausa.
export const PATTERNS = [
  { id: 'down', name: 'Só para baixo', level: 'Iniciante', slots: 'D-D-D-D-' },
  { id: 'pop', name: 'Pop clássico', level: 'Iniciante', slots: 'D-DU-UDU' },
  { id: 'ballad', name: 'Balada', level: 'Iniciante', slots: 'D--U-UDU' },
  { id: 'eighths', name: 'Colcheias contínuas', level: 'Intermediário', slots: 'DUDUDUDU' },
  { id: 'rock', name: 'Rock', level: 'Intermediário', slots: 'D-D-D-DU' },
  { id: 'reggae', name: 'Reggae (contratempo)', level: 'Intermediário', slots: '-U-U-U-U' },
];
