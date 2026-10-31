// Construtores de Score por técnica. Cada função devolve um Score (docs/ARCHITECTURE.md §6) já normalizável.
// REGRA DE HONESTIDADE: o que o aparelho não envia (dedos da mão direita, setas de palhetada em nota única,
// hammer/pull/slide/bend/vibrato) vira evento "guia" (check desligado) ou campo `digit`/`pick`, nunca pontuação.
import { STANDARD } from '../music/theory.js';
import { shapeOf } from './patterns.js';

const GUIDE = { strings: false, pitch: false, timing: false, dir: false };
const base = (o) => ({ technique: 'strumming', level: 1, bpm: 80, beatsPerBar: 4, subdivision: 2, mode: 'timed', ...o });

// ---- palhetada em acordes: um padrão de colcheias por compasso, acordes por compasso ----
export function strumScore({ id, title, technique = 'strumming', level, bpm, chords, slots, bars, beatsPerBar = 4, sub = 2, dirCheck = true, ramp }) {
  const n = beatsPerBar * sub, events = [], chordList = [];
  for (let b = 0; b < bars; b++) {
    const sym = chords[b % chords.length], sh = shapeOf(sym), off = b * beatsPerBar;
    if (b === 0 || chords[b % chords.length] !== chords[(b - 1) % chords.length]) chordList.push({ beat: off, chordId: sym, root: sh.root, q: sh.q, frets: sh.frets, fingers: sh.fingers });
    for (let i = 0; i < n; i++) {
      const c = slots[i % slots.length];
      if (c === '-' || c === undefined) continue;
      events.push({ beat: off + i / sub, dur: 1 / sub, strum: { dir: c, strings: sh.strings, frets: sh.frets, fingers: sh.fingers }, check: { dir: dirCheck } });
    }
  }
  return base({ id, title, technique, level, bpm, beatsPerBar, subdivision: sub, lengthBeats: bars * beatsPerBar, events, chords: chordList, ramp });
}

// ---- sequência de notas únicas (picking, escalas, melodias) ----
// notes: [{string,fret,finger?,digit?,pick?,guide?:{tech}}] espaçadas por `step` batidas.
export function noteSeq({ id, title, technique, level, bpm, notes, step = 0.5, bars, beatsPerBar = 4, sub = 2, ramp, repeat = 1 }) {
  const seq = Array.from({ length: repeat }, () => notes).flat(), events = [];
  seq.forEach((n, i) => {
    const ev = { beat: i * step, dur: step, notes: [{ string: n.string, fret: n.fret, ...(n.finger ? { finger: n.finger } : {}), ...(n.digit ? { digit: n.digit } : {}) }] };
    if (n.pick) ev.pick = n.pick;
    if (n.tech) { ev.tech = n.tech; ev.guide = true; ev.check = GUIDE; }
    if (n.extra) ev.notes.push(...n.extra);
    if (n.label) ev.label = n.label;
    events.push(ev);
  });
  const end = seq.length * step;
  return base({ id, title, technique, level, bpm, beatsPerBar, subdivision: sub, lengthBeats: Math.max(beatsPerBar, bars ? bars * beatsPerBar : Math.ceil(end / beatsPerBar) * beatsPerBar), events, ramp });
}

// ---- arpejos: padrões sobre as cordas que soam no acorde ----
const sounding = (sh) => sh.strings;
export function arpSequence(sym, pattern, withDigits = false) {
  const sh = shapeOf(sym), L = sounding(sh), n = L.length, H = L.slice(n - 3);
  const T = L[0], T2 = L[1] ?? L[0];
  const idx = {
    asc: () => L, desc: () => [...L].reverse(),
    updown: () => [...L, ...[...L].reverse().slice(1, -1)],
    pima: () => [T, H[0], H[1], H[2], H[1], H[0], H[1], H[2]],
    alt: () => [T, H[1], H[2], H[1], T2, H[1], H[2], H[1]],
    pinch: () => [T, H[2], H[0], H[2], T, H[2], H[1], H[2]],
    travis: () => [T, H[0], T2, H[1], T, H[0], T2, H[2]],
    pmi: () => [T, H[1], H[0], H[1], T, H[1], H[0], H[1]],
  }[pattern]();
  const digit = (s) => (!withDigits ? undefined : s === T || s === T2 ? 'p' : s === H[0] ? 'i' : s === H[1] ? 'm' : 'a');
  return idx.map((s) => ({ string: s, fret: sh.frets[s], finger: sh.fingers[s] || undefined, digit: digit(s) }));
}
export function arpScore({ id, title, technique = 'arpeggio', level, bpm, chords, pattern, bars, withDigits = false, perBar = 8 }) {
  const events = [], chordList = [];
  for (let b = 0; b < bars; b++) {
    const sym = chords[b % chords.length], sh = shapeOf(sym);
    chordList.push({ beat: b * 4, chordId: sym, root: sh.root, q: sh.q, frets: sh.frets, fingers: sh.fingers });
    const seq = arpSequence(sym, pattern, withDigits);
    for (let i = 0; i < perBar; i++) { const x = seq[i % seq.length]; events.push({ beat: b * 4 + i * (4 / perBar), dur: 4 / perBar, notes: [{ string: x.string, fret: x.fret, ...(x.finger ? { finger: x.finger } : {}), ...(x.digit ? { digit: x.digit } : {}) }] }); }
  }
  return base({ id, title, technique, level, bpm, lengthBeats: bars * 4, events, chords: chordList });
}

// ---- escalas: janela de casas por posição, nota por nota em ordem de altura ----
export const SCALES = {
  'pent-minor': { name: 'Pentatônica menor', iv: [0, 3, 5, 7, 10] }, 'pent-major': { name: 'Pentatônica maior', iv: [0, 2, 4, 7, 9] },
  major: { name: 'Maior', iv: [0, 2, 4, 5, 7, 9, 11] }, minor: { name: 'Menor natural', iv: [0, 2, 3, 5, 7, 8, 10] },
  blues: { name: 'Blues', iv: [0, 3, 5, 6, 7, 10] },
};
export function scaleNotes({ root, scale, lo, span = 4 }) {
  const set = new Set(SCALES[scale].iv.map((i) => (root + i) % 12)), seen = new Map();
  for (let s = 0; s < 6; s++) for (let f = lo; f < lo + span + (lo === 0 ? 1 : 0); f++) {
    const note = STANDARD[s] + f;
    if (set.has(note % 12) && !seen.has(note)) seen.set(note, { string: s, fret: f, finger: f === 0 ? undefined : Math.min(4, Math.max(1, f - lo + (lo === 0 ? 0 : 1))) });
  }
  return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}
export function sequenceOf(notes, shape) {
  const out = [];
  if (shape === 'thirds') for (let i = 0; i + 2 < notes.length; i++) out.push(notes[i], notes[i + 2]);
  else if (shape === 'triplets') for (let i = 0; i + 2 < notes.length; i++) out.push(notes[i], notes[i + 1], notes[i + 2]);
  else if (shape === 'fours') for (let i = 0; i + 3 < notes.length; i++) out.push(notes[i], notes[i + 1], notes[i + 2], notes[i + 3]);
  else if (shape === 'down') out.push(...[...notes].reverse());
  else if (shape === 'updown') out.push(...notes, ...[...notes].reverse().slice(1, -1));
  else out.push(...notes);
  return out;
}

// ---- troca de acordes ----
export function changeScore({ id, title, level, bpm, chords, strumsPerBar = 1, barsPerChord = 1, cycles = 2, mode = 'timed' }) {
  const events = [], chordList = [], total = chords.length * barsPerChord * cycles;
  for (let b = 0; b < total; b++) {
    const sym = chords[Math.floor(b / barsPerChord) % chords.length], sh = shapeOf(sym), off = b * 4;
    if (b % barsPerChord === 0) chordList.push({ beat: off, chordId: sym, root: sh.root, q: sh.q, frets: sh.frets, fingers: sh.fingers });
    const step = 4 / strumsPerBar;
    for (let k = 0; k < strumsPerBar; k++) events.push({ beat: off + k * step, dur: step, strum: { dir: 'D', strings: sh.strings, frets: sh.frets, fingers: sh.fingers }, check: { dir: false } });
  }
  return base({ id, title, technique: 'chord-change', level, bpm, mode, lengthBeats: total * 4, events, chords: chordList });
}

// ---- técnicas expressivas: só a nota tocada é avaliada; o gesto vira evento-guia ----
export function techniqueScore({ id, title, level, bpm, kind, string = 3, base: fret0 = 0, bars = 4 }) {
  const events = [], per = { hammer: 2, pull: 2, slide: 2, bend: 2, vibrato: 2, legato: 1 }[kind] ?? 2;
  for (let b = 0; b < bars; b++) {
    const t = b * 4;
    if (kind === 'hammer') for (let k = 0; k < 2; k++) events.push({ beat: t + k * 2, notes: [{ string, fret: fret0, finger: 1 }] }, { beat: t + k * 2 + 0.5, notes: [{ string, fret: fret0 + 2, finger: 3 }], tech: 'hammer', guide: true, check: GUIDE });
    else if (kind === 'pull') for (let k = 0; k < 2; k++) events.push({ beat: t + k * 2, notes: [{ string, fret: fret0 + 2, finger: 3 }] }, { beat: t + k * 2 + 0.5, notes: [{ string, fret: fret0, finger: 1 }], tech: 'pull', guide: true, check: GUIDE });
    else if (kind === 'slide') for (let k = 0; k < 2; k++) events.push({ beat: t + k * 2, notes: [{ string, fret: fret0 + 5, finger: 1 }] }, { beat: t + k * 2 + 0.75, notes: [{ string, fret: fret0 + 7, finger: 1 }], tech: 'slide', guide: true, check: GUIDE });
    else if (kind === 'bend') for (let k = 0; k < 2; k++) events.push({ beat: t + k * 2, dur: 1.5, notes: [{ string, fret: fret0 + 7, finger: 3 }] }, { beat: t + k * 2 + 0.5, notes: [{ string, fret: fret0 + 9, finger: 3 }], tech: 'bend', guide: true, check: GUIDE });
    else if (kind === 'vibrato') events.push({ beat: t, dur: 3, notes: [{ string, fret: fret0 + 7, finger: 1 }] }, { beat: t + 1, dur: 2, notes: [{ string, fret: fret0 + 7, finger: 1 }], tech: 'vibrato', guide: true, check: GUIDE });
    else if (kind === 'legato') {
      events.push({ beat: t, notes: [{ string, fret: fret0 + 5, finger: 1 }] });
      [[0.5, 6, 2], [1, 7, 3], [1.5, 8, 4]].forEach(([d, f, fi]) => events.push({ beat: t + d, notes: [{ string, fret: fret0 + f, finger: fi }], tech: 'hammer', guide: true, check: GUIDE }));
      [[2, 7, 3], [2.5, 6, 2], [3, 5, 1]].forEach(([d, f, fi]) => events.push({ beat: t + d, notes: [{ string, fret: fret0 + f, finger: fi }], tech: 'pull', guide: true, check: GUIDE }));
    }
  }
  return base({ id, title, technique: 'technique', level, bpm, lengthBeats: bars * 4, events });
}

// Palm mute e notas abafadas sobre uma forma de acorde: as batidas "abafadas" são guia; as soantes são avaliadas.
export function mutedScore({ id, title, level, bpm, chord, kind, bars = 4 }) {
  const sh = shapeOf(chord), events = [];
  for (let b = 0; b < bars; b++) for (let i = 0; i < 8; i++) {
    const beat = b * 4 + i / 2;
    if (kind === 'palm') events.push({ beat, dur: 0.5, strum: { dir: i % 2 ? 'U' : 'D', strings: sh.strings.slice(0, 2), frets: sh.frets }, tech: 'palm', check: { dir: false } });
    else if (i % 2 === 0) events.push({ beat, dur: 0.5, strum: { dir: 'D', strings: sh.strings, frets: sh.frets }, check: { dir: false } });
    else events.push({ beat, dur: 0.5, strum: { dir: 'U', strings: sh.strings, frets: sh.frets }, tech: 'mute', guide: true, check: GUIDE });
  }
  return base({ id, title, technique: 'technique', level, bpm, lengthBeats: bars * 4, events, chords: [{ beat: 0, chordId: chord, root: sh.root, q: sh.q, frets: sh.frets, fingers: sh.fingers }] });
}
