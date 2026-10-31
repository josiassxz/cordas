// Tablaturas locais (dataset de uso pessoal em data-local/, fora do Git): busca por música/artista e conversão alphaTex -> Score.
// Os dados são gerados por tools/build-tabs.py: data-local/tabs/index.json (índice) + shard-NNN.json.gz (só faixas de guitarra).
import { STANDARD } from '../music/theory.js';

const BASE = './data-local/tabs/';
const INSTRUMENT = { 24: 'Violão nylon', 25: 'Violão aço', 26: 'Guitarra jazz', 27: 'Guitarra limpa', 28: 'Guitarra abafada', 29: 'Guitarra overdrive', 30: 'Guitarra distorcida', 31: 'Harmônicos' };
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

let index = null, indexP = null;
const shards = new Map();   // cache das últimas pastas descomprimidas

export async function loadIndex() {
  if (index) return index;
  indexP ||= fetch(BASE + 'index.json').then((r) => { if (!r.ok) throw new Error('Índice de tablaturas não encontrado (rode tools/build-tabs.py).'); return r.json(); }).then((j) => (index = j));
  return indexP;
}

// Busca: todas as palavras precisam aparecer em "artista título"; título que começa com a palavra vem primeiro.
export function searchTabs(q, limit = 80) {
  if (!index) return [];
  const toks = fold(q).split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  const out = [];
  for (const row of index) {
    const key = row[6];
    if (!toks.every((t) => key.includes(t))) continue;
    const title = fold(row[2]), artist = fold(row[1]);
    let sc = 0;
    toks.forEach((t) => { if (title.startsWith(t)) sc += 3; else if (title.includes(` ${t}`)) sc += 2; if (artist.startsWith(t)) sc += 2; });
    if (title === toks.join(' ')) sc += 6;
    out.push({ sc, id: row[0], artist: row[1], title: row[2], tempo: row[3], tracks: row[4], shard: row[5] });
  }
  out.sort((a, b) => b.sc - a.sc || a.title.localeCompare(b.title) || a.artist.localeCompare(b.artist));
  return out.slice(0, limit);
}

async function gunzipJson(res) {
  const ds = new DecompressionStream('gzip');
  return JSON.parse(await new Response(res.body.pipeThrough(ds)).text());
}
export async function fetchSong(row) {
  const k = row.shard;
  if (!shards.has(k)) {
    const res = await fetch(`${BASE}shard-${String(k).padStart(3, '0')}.json.gz`);
    if (!res.ok) throw new Error('Pacote de tablaturas não encontrado.');
    shards.set(k, await gunzipJson(res));
    if (shards.size > 3) shards.delete(shards.keys().next().value);
  }
  const s = shards.get(k)[row.id]; if (!s) throw new Error('Música não encontrada no pacote.');
  return s;
}

export const trackLabel = (t) => INSTRUMENT[t.instrument] || 'Guitarra';

// ---------------- alphaTex -> Score ----------------
const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function pitchOf(name) {   // 'E6', 'F#4', 'Bb3'
  const m = /^([A-G])([#b]?)(-?\d+)$/.exec(name); if (!m) return null;
  return (+m[3] + 1) * 12 + NOTE_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
// Afinação da faixa (agudo→grave no arquivo) -> MIDI grave→agudo, normalizada para a oitava da guitarra padrão.
function tuningOf(list) {
  const hi = list.map(pitchOf); if (hi.some((x) => x == null)) return [...STANDARD];
  const shift = Math.round((hi[0] - 64) / 12) * 12;
  return hi.map((m) => m - shift).reverse();
}
const tuningName = (t) => {
  const d = t.map((m, i) => m - STANDARD[i]);
  if (d.every((x) => x === 0)) return 'Padrão (E A D G B E)';
  if (d.every((x) => x === d[0])) return `${d[0] > 0 ? '+' : '−'}${Math.abs(d[0])} semitom${Math.abs(d[0]) > 1 ? 's' : ''} em todas as cordas`;
  if (d[0] === -2 && d.slice(1).every((x) => x === 0)) return 'Drop D';
  return 'Afinação alternativa';
};

const TECH = { h: 'hammer', v: 'vibrato', pm: 'palm', be: 'bend', sl: 'slide', ss: 'slide' };

export function alphaTexToScore(track, meta) {
  const text = track.text, tuning = tuningOf(track.tuning);
  const events = [], bars = [];
  let i = 0, beat = 0, def = 4, barStart = 0;
  const N = text.length, isWs = (c) => c === ' ' || c === '\n' || c === '\t' || c === '\r';
  const readFx = () => { let fx = ''; { let j = i; while (j < N && (text[j] === ' ' || text[j] === '\t')) j++; if (text[j] === '{') i = j; } while (text[i] === '{') { const j = text.indexOf('}', i); if (j < 0) { i = N; break; } fx += ' ' + text.slice(i + 1, j); i = j + 1; } return fx; };
  const beats = (d, fx) => {
    let b = 4 / d;
    if (/(^|[\s;])d($|[\s;])/.test(fx)) b *= 1.5;
    const tu = /tu\s+(\d+)/.exec(fx); if (tu) { const n = +tu[1]; b *= (2 ** Math.floor(Math.log2(n))) / n; }
    return b;
  };
  const techOf = (fx) => { const w = fx.split(/[\s;]+/).filter(Boolean)[0]; for (const k of fx.split(/[\s;]+/)) if (TECH[k]) return TECH[k]; return w && TECH[w]; };
  while (i < N) {
    const c = text[i];
    if (isWs(c)) { i++; continue; }
    if (c === '|') { bars.push(beat - barStart); barStart = beat; i++; continue; }
    if (c === ':') { let j = i + 1; while (/\d/.test(text[j] || '')) j++; def = +text.slice(i + 1, j) || def; i = j; continue; }
    if (c === '\\') { while (i < N && text[i] !== '\n') i++; continue; }
    let notes = [], d = def, rest = false, dead = false, tie = false;
    if (c === '(') {
      const j = text.indexOf(')', i); if (j < 0) break;
      const inner = text.slice(i + 1, j).replace(/\{[^}]*\}/g, ' ');
      for (const tk of inner.split(/\s+/).filter(Boolean)) { const m = /^(\d+|x|-)\.(\d)/.exec(tk); if (!m) continue; if (m[1] === 'x') dead = true; else if (m[1] === '-') tie = true; else notes.push({ string: 6 - +m[2], fret: +m[1] }); }
      i = j + 1;
      const dm = /^\.(\d+)/.exec(text.slice(i, i + 4)); if (dm) { d = +dm[1]; i += dm[0].length; }
    } else if (c === 'r') {
      rest = true; i++;
      const dm = /^\.(\d+)/.exec(text.slice(i, i + 4)); if (dm) { d = +dm[1]; i += dm[0].length; }
    } else {
      const m = /^(\d+|x|-)\.(\d)(?:\.(\d+))?/.exec(text.slice(i, i + 16));
      if (!m) { i++; continue; }
      i += m[0].length; if (m[3]) d = +m[3];
      if (m[1] === 'x') dead = true; else if (m[1] === '-') tie = true; else notes.push({ string: 6 - +m[2], fret: +m[1] });
    }
    const fx = readFx(), dur = beats(d, fx);
    if (!rest && !dead && !tie && notes.length) {
      notes = notes.filter((n) => n.string >= 0 && n.string <= 5 && n.fret <= 24);
      if (notes.length) { const ev = { beat, dur: Math.min(dur, 2), notes }; const t = techOf(fx); if (t) ev.tech = t; events.push(ev); }
    }
    beat += dur;
  }
  if (beat > barStart + 0.01) bars.push(beat - barStart);
  // compasso: o comprimento de compasso mais comum (em semínimas), limitado a 2..12
  const tally = new Map(); bars.filter((b) => b > 0.5).forEach((b) => { const r = Math.round(b * 4) / 4; tally.set(r, (tally.get(r) || 0) + 1); });
  const common = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 4;
  const beatsPerBar = Math.max(2, Math.min(12, Math.round(common)));
  const lengthBeats = Math.max(beatsPerBar, Math.ceil(beat / beatsPerBar) * beatsPerBar);
  const std = tuning.every((m, k) => m === STANDARD[k]);
  return {
    id: `tab:${meta.id}:${meta.trackIndex}`, title: fold(meta.title).includes(fold(meta.artist)) ? meta.title : `${meta.artist} — ${meta.title}`, technique: 'song', level: 3, mode: 'timed',
    bpm: Math.max(30, Math.min(240, meta.tempo || 100)), beatsPerBar, subdivision: 2, lengthBeats, events, tuning,
    fixedTiming: true, tuningName: tuningName(tuning), standardTuning: std,
    // em afinação diferente o app só confere as CORDAS (a nota esperada seria enganosa se a guitarra física estiver afinada normalmente)
    ...(std ? {} : { noPitch: true }),
  };
}
