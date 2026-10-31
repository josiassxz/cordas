// Gera um Score (docs/ARCHITECTURE.md §6) de troca de acordes alinhado ao andamento da música.
import { spans } from './timeline.js';
import { parseSymbol } from './chordnames.js';

// frets/fingers opcionais vêm de js/music/chords.js (via lookup injetado); sem eles, todas as cordas.
export function chordChangeScore(song, from, to, { lookup = () => null, subdivision = 2 } = {}) {
  const bpm = song.bpm.value, off = song.bpm.offset || 0, beat = 60 / bpm;
  const toBeat = (t) => Math.round((t - from) / beat);
  const list = spans(song.chords, song.duration).filter((s) => s.symbol && s.t1 > from && s.t0 < to);
  if (!list.length) throw new Error('Não há acordes neste trecho. Adicione acordes na linha do tempo.');
  const events = [], chords = [];
  for (const s of list) {
    if (!parseSymbol(s.symbol)) continue;
    const beatPos = Math.max(0, toBeat(Math.max(s.t0, from))), v = lookup(s.symbol) || {};
    const strings = v.frets ? v.frets.map((f, i) => (f >= 0 ? i : -1)).filter((i) => i >= 0) : [0, 1, 2, 3, 4, 5];
    chords.push({ beat: beatPos, chordId: s.symbol, frets: v.frets, fingers: v.fingers });
    events.push({ beat: beatPos, dur: 1, kind: 'strum', strum: { dir: 'D', strings }, check: { strings: true, pitch: true, timing: true, dir: false }, label: s.symbol });
  }
  const lengthBeats = Math.max(4, Math.ceil((to - from) / beat / 4) * 4);
  return {
    id: `song:${song.id}:${from.toFixed(1)}-${to.toFixed(1)}`, title: `${song.title} · acordes (${Math.round(from)}s–${Math.round(to)}s)`,
    technique: 'chord-change', level: 2, bpm: Math.round(bpm), beatsPerBar: 4, subdivision, lengthBeats, mode: 'timed',
    chords, events, source: 'song', estimated: song.bpm.source !== 'manual',
  };
}
