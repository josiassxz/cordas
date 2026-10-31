// Exercícios de troca de acordes. Só PRODUZEM Scores (contrato §6); quem executa é app.practice (frente Prática).
import { voicingsOf, chordEvent, parseSymbol, symbolOf } from '../music/chords.js';

export const PROGRESSION_PRESETS = [
  { id: 'gdemc', name: 'G – D – Em – C', desc: 'O clássico do pop e do folk', symbols: ['G', 'D', 'Em', 'C'], level: 1 },
  { id: 'amfcg', name: 'Am – F – C – G', desc: 'Emotiva, muito usada em baladas', symbols: ['Am', 'F', 'C', 'G'], level: 2 },
  { id: 'cgamf', name: 'C – G – Am – F', desc: 'A progressão mais famosa do pop', symbols: ['C', 'G', 'Am', 'F'], level: 2 },
  { id: 'emcgd', name: 'Em – C – G – D', desc: 'Rock suave, ótima para treinar troca', symbols: ['Em', 'C', 'G', 'D'], level: 1 },
  { id: 'ada', name: 'A – D – E – A', desc: 'Três acordes: rock e blues básico', symbols: ['A', 'D', 'E', 'A'], level: 1 },
  { id: 'blues', name: 'A7 – D7 – A7 – E7', desc: 'Blues simplificado', symbols: ['A7', 'D7', 'A7', 'E7'], level: 2 },
  { id: 'jazz', name: 'Dm7 – G7 – Cmaj7', desc: 'ii–V–I em Dó', symbols: ['Dm7', 'G7', 'Cmaj7', 'Cmaj7'], level: 3 },
  { id: 'sus', name: 'Asus2 – Asus4 – A', desc: 'Suspensos resolvendo no maior', symbols: ['Asus2', 'Asus4', 'A', 'A'], level: 2 },
];
export const PAIR_PRESETS = [['Em', 'Am'], ['G', 'C'], ['D', 'A'], ['C', 'Am'], ['E', 'A'], ['G', 'D'], ['Am', 'Dm'], ['D', 'G'], ['C', 'F'], ['E7', 'A7']];
export const POSITION_PRESETS = ['C', 'G', 'Am', 'E', 'A7', 'Dm'];

// Digitação preferida por critério: 'fácil' = menor custo; 'aberta' = primeira curada/aberta.
export function pickVoicing(symbol, prefer = 'fácil') {
  const list = voicingsOf(symbol);
  if (!list.length) throw new Error(`Sem digitações para ${symbol}`);
  if (prefer === 'aberta') return list.find((v) => v.tags.includes('aberto')) || list[0];
  if (typeof prefer === 'number') return list[prefer % list.length];
  return list.find((v) => v.tags.includes('iniciante') && !v.barre) || list.slice().sort((a, b) => a.difficulty - b.difficulty)[0];
}

// Núcleo: sequência de digitações -> Score. timed = uma palhetada por batida; wait = uma por acorde, espera acertar.
export function drillFromVoicings(seq, { title, id, beatsPerChord = 4, rounds = 2, bpm = 60, mode = 'timed', dir = 'D', technique = 'chord-change' } = {}) {
  if (!seq.length) throw new Error('Sequência vazia');
  const events = [], chords = [];
  let beat = 0;
  for (let r = 0; r < rounds; r++) {
    for (const v of seq) {
      chords.push({ beat, chordId: v.symbol, frets: v.frets, fingers: v.fingers });
      if (mode === 'wait') events.push(chordEvent(v, { beat, dur: beatsPerChord, dir, check: { strings: true, pitch: true, timing: false, dir: false } }));
      else for (let i = 0; i < beatsPerChord; i++) events.push(chordEvent(v, { beat: beat + i, dur: 1, dir }));
      beat += beatsPerChord;
    }
  }
  return {
    id: id || `drill:${seq.map((v) => v.id).join('>')}:${mode}:${beatsPerChord}x${rounds}`, title, technique,
    level: Math.max(...seq.map((v) => v.difficulty)), bpm, beatsPerBar: 4, subdivision: 2, lengthBeats: beat, mode, chords, events,
    loop: { fromBeat: 0, toBeat: beat },
  };
}

const opts = (o) => ({ beatsPerChord: 4, rounds: 4, bpm: 60, mode: 'timed', ...o });

// A -> B (alternando)
export function changeDrill(a, b, o = {}) {
  const va = pickVoicing(a, o.prefer), vb = pickVoicing(b, o.prefer);
  return { sequence: [va, vb], score: drillFromVoicings([va, vb], { title: `Troca ${va.name} ↔ ${vb.name}`, ...opts(o) }) };
}
// Progressão de acordes (símbolos)
export function progressionDrill(symbols, o = {}) {
  const seq = symbols.map((s) => pickVoicing(s, o.prefer));
  return { sequence: seq, score: drillFromVoicings(seq, { title: o.title || `Progressão ${seq.map((v) => v.name).join(' – ')}`, ...opts({ rounds: 2, ...o }) }) };
}
// Mesmo acorde subindo pelas posições do braço e voltando
export function positionDrill(symbol, o = {}) {
  const list = voicingsOf(symbol).slice().sort((a, b) => a.baseFret - b.baseFret);
  if (list.length < 2) throw new Error(`${symbol} tem só uma posição`);
  const seq = [...list, ...list.slice(1, -1).reverse()];
  return { sequence: seq, score: drillFromVoicings(seq, { title: `Posições de ${list[0].name}`, ...opts({ rounds: 2, beatsPerChord: 4, ...o }) }) };
}
// Duas digitações do mesmo acorde (ex.: aberta ↔ pestana)
export function voicingChangeDrill(symbol, o = {}) {
  const list = voicingsOf(symbol);
  const open = list.find((v) => v.tags.includes('aberto')) || list[0];
  const moved = list.find((v) => v !== open && v.baseFret >= 3) || list.find((v) => v !== open);
  if (!moved) throw new Error(`${symbol} tem só uma digitação`);
  return { sequence: [open, moved], score: drillFromVoicings([open, moved], { title: `${open.name}: ${open.shape ? 'forma ' + open.shape : 'aberta'} ↔ ${moved.baseFret}ª casa`, ...opts(o) }) };
}

export const DRILL_KINDS = [
  { id: 'pair', name: 'Troca de dois acordes', hint: 'Alterne A ↔ B até a troca ficar limpa' },
  { id: 'progression', name: 'Progressão', hint: 'Sequências reais de música' },
  { id: 'custom', name: 'Minha sequência', hint: 'Escolha os acordes que quiser, na ordem que quiser' },
  { id: 'positions', name: 'Posições do mesmo acorde', hint: 'Suba o braço mantendo o acorde' },
  { id: 'voicings', name: 'Entre digitações', hint: 'Aberta ↔ pestana do mesmo acorde' },
];

export function buildDrill(kind, params = {}) {
  if (kind === 'pair') return changeDrill(params.a, params.b, params);
  if (kind === 'progression' || kind === 'custom') return progressionDrill(params.symbols, params);
  if (kind === 'positions') return positionDrill(params.symbol, params);
  if (kind === 'voicings') return voicingChangeDrill(params.symbol, params);
  throw new Error(`Tipo de exercício desconhecido: ${kind}`);
}

// Validador do formato de Score (§6) — usado nos testes.
export function validateScore(s) {
  const e = [];
  for (const k of ['id', 'title', 'technique', 'bpm', 'beatsPerBar', 'subdivision', 'lengthBeats', 'mode', 'events']) if (s[k] == null) e.push(`falta ${k}`);
  if (!['timed', 'wait'].includes(s.mode)) e.push('mode inválido');
  if (!(s.level >= 1 && s.level <= 5)) e.push('level fora de 1..5');
  s.events?.forEach((ev, i) => {
    if (!(ev.beat >= 0 && ev.beat < s.lengthBeats)) e.push(`evento ${i}: beat fora da faixa`);
    if (!['strum', 'note', 'rest'].includes(ev.kind)) e.push(`evento ${i}: kind`);
    if (ev.kind === 'strum' && !(ev.strum?.strings?.length >= 2)) e.push(`evento ${i}: strum sem cordas`);
    ev.notes?.forEach((n) => { if (!(n.string >= 0 && n.string <= 5 && n.fret >= 0)) e.push(`evento ${i}: nota inválida`); });
    if (!ev.check) e.push(`evento ${i}: sem check`);
  });
  return e;
}

export { parseSymbol, symbolOf };
