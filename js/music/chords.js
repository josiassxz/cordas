// Motor de acordes estruturado. Nada de imagens: cada Voicing é dado musical (trastes, dedos, notas, classes de altura).
// Geração: busca todas as digitações possíveis numa janela de 4 casas cujas notas pertencem ao acorde, valida contra a fórmula,
// atribui dedos/pestana, pontua a facilidade e escolhe um conjunto variado. Formas abertas curadas (chord-data/open.js) entram primeiro.
import { STANDARD, pcName } from './theory.js';
import { QUALITY_LIST, CATEGORIES, AERO_QUALITIES } from './chord-data/qualities.js';
import { OPEN } from './chord-data/open.js';

export { QUALITY_LIST, CATEGORIES, AERO_QUALITIES };
export const QUALITIES_BY_ID = Object.fromEntries(QUALITY_LIST.map((q) => [q.id, q]));
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LATIN = { do: 'C', dó: 'C', re: 'D', ré: 'D', mi: 'E', fa: 'F', fá: 'F', sol: 'G', la: 'A', lá: 'A', si: 'B' };
const MAX_PER_CHORD = 7;

// ---------- símbolos ----------
const ALIAS = new Map();
for (const q of QUALITY_LIST) for (const a of [...q.aliases, q.sym]) ALIAS.set(norm(a), q.id);
function norm(s) { return s.replace(/[()\s]/g, ''); }

// Duas leituras possíveis: nome latino (Dó, Ré, Mi, Fá, Sol, Lá, Si) ou letra (C-B). "Faug" é F+aug, não Fá+"ug".
function parseNotes(str) {
  const out = [];
  const lat = /^(do|dó|re|ré|mi|fa|fá|sol|la|lá|si)([#b♯♭]?)/i.exec(str), let_ = /^([A-Ga-g])([#b♯♭]?)/.exec(str);
  for (const m of [let_, lat]) {
    if (!m) continue;
    const letter = LATIN[m[1].toLowerCase()] || m[1].toUpperCase();
    const acc = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0;
    out.push({ pc: (LETTER[letter] + acc + 12) % 12, rest: str.slice(m[0].length) });
  }
  return out;
}
const parseNote = (str) => parseNotes(str)[0] || null;

// 'C#m7/G' -> { root:1, quality:'m7', bass:7 } (bass = null sem barra). Aceita nomes em português (Dó, Ré, Sol…).
export function parseSymbol(str) {
  if (!str) return null;
  const [main, bassStr] = String(str).trim().split('/');
  let n = null, qid;
  for (const cand of parseNotes(main.trim())) {
    qid = ALIAS.get(norm(cand.rest)) ?? ALIAS.get(norm(cand.rest).toLowerCase());
    if (qid !== undefined) { n = cand; break; }
  }
  if (!n) return null;
  let bass = null;
  if (bassStr) { const b = parseNotes(bassStr.trim()).find((x) => !x.rest); if (!b) return null; bass = b.pc; }
  return { root: n.pc, quality: qid, bass: bass === n.pc ? null : bass };
}
export const symbolOf = (root, quality, bass = null) => SHARP[root] + QUALITIES_BY_ID[quality].sym + (bass != null ? '/' + SHARP[bass] : '');
export const displayName = (root, quality, bass = null) => pcName(root) + QUALITIES_BY_ID[quality].sym + (bass != null ? '/' + pcName(bass) : '');

// ---------- classes de altura ----------
const pcOf = (s, f) => (STANDARD[s] + f) % 12;
const chordPcs = (root, q) => new Set(q.pcs.map((i) => (root + i) % 12));

// ---------- dedos e pestana ----------
// Pestana só quando necessária (>4 notas pisadas) ou natural (sem cordas soltas e ≥3 notas na casa mais baixa).
function assignFingers(frets) {
  const fretted = [];
  frets.forEach((f, s) => { if (f > 0) fretted.push({ s, f }); });
  const fingers = Array(6).fill(0);
  if (!fretted.length) return { ok: true, fingers, barre: null, count: 0 };
  const f0 = Math.min(...fretted.map((x) => x.f));
  const atMin = fretted.filter((x) => x.f === f0);
  const hasOpen = frets.some((f) => f === 0);
  let barre = null;
  if (atMin.length >= 2 && (fretted.length > 4 || (!hasOpen && atMin.length >= 3))) {
    const from = atMin[0].s, to = atMin[atMin.length - 1].s;
    let clear = true;
    for (let s = from; s <= to; s++) if (frets[s] === 0) clear = false;
    if (clear) barre = { fret: f0, from, to };
  }
  const rest = fretted.filter((x) => !(barre && x.f === f0 && x.s >= barre.from && x.s <= barre.to)).sort((a, b) => a.f - b.f || a.s - b.s);
  const first = barre ? 2 : 1;
  if (rest.length + first - 1 > 4) return { ok: false };
  if (barre) for (let s = barre.from; s <= barre.to; s++) if (frets[s] === f0) fingers[s] = 1;
  rest.forEach((x, i) => { fingers[x.s] = first + i; });
  return { ok: true, fingers, barre, count: rest.length + (barre ? 1 : 0) };
}
// Curado: pestana deduzida quando o mesmo dedo cobre 2+ cordas na mesma casa.
function barreFromFingers(frets, fingers) {
  for (let d = 1; d <= 4; d++) {
    const ss = frets.map((f, s) => (fingers[s] === d && f > 0 ? s : -1)).filter((s) => s >= 0);
    if (ss.length >= 2 && new Set(ss.map((s) => frets[s])).size === 1) return { fret: frets[ss[0]], from: ss[0], to: ss[ss.length - 1] };
  }
  return null;
}

// ---------- Voicing ----------
class Voicing {
  constructor(d) { Object.assign(this, d); }
  get symbol() { return symbolOf(this.root, this.quality, this.bass); }
  get name() { return displayName(this.root, this.quality, this.bass); }
  get qualityName() { return QUALITIES_BY_ID[this.quality].name; }
  get noteNames() { return [...new Set(this.notes.map((n) => pcName(n)))]; }
}

function describe(root, qid, bass, frets, fingers, barre, extraTags = []) {
  const q = QUALITIES_BY_ID[qid];
  const sounding = frets.map((f, s) => (f >= 0 ? s : -1)).filter((s) => s >= 0);
  const notes = sounding.map((s) => STANDARD[s] + frets[s]);
  const pcs = [...new Set(notes.map((n) => n % 12))].sort((a, b) => a - b);
  const pos = frets.filter((f) => f > 0);
  const baseFret = pos.length && Math.max(...pos) > 4 ? Math.min(...pos) : 1;
  const span = pos.length ? Math.max(...pos) - Math.min(...pos) : 0;
  const lo = sounding[0], hi = sounding[sounding.length - 1];
  const inner = frets.slice(lo, hi + 1).filter((f) => f < 0).length;
  const bassPc = notes[0] % 12;
  const used = sounding, muted = frets.map((f, s) => (f < 0 ? s : -1)).filter((s) => s >= 0);
  const fingerCount = new Set(fingers.filter((x) => x > 0)).size;
  const raw = fingerCount + (barre ? 2 + (barre.to - barre.from >= 4 ? 1 : 0) : 0) + (span >= 3 ? 1 : 0) + inner;
  const difficulty = Math.max(barre ? 2 : 1, raw <= 3 ? 1 : raw <= 6 ? 2 : 3);
  const rootString = sounding.find((s) => pcOf(s, frets[s]) === root);
  const tags = new Set(extraTags);
  if (frets.some((f) => f === 0)) tags.add('aberto');
  if (barre) tags.add('pestana');
  if (!frets.some((f) => f === 0) && !barre && pos.length) tags.add('móvel');
  if (barre) tags.add('móvel');
  if (qid === '5') tags.add('power');
  if (bassPc !== root) tags.add('inversão');
  if (bass != null) tags.add('slash');
  if (difficulty === 1 && !barre && sounding.length >= 3 && sounding.length <= 5) tags.add('iniciante');
  const noFifth = !pcs.includes((root + 7) % 12);
  if (['7', 'maj7', 'm7', 'm7M', '9', 'maj9', 'm9', '13', '11', 'm11', 'm7b5', 'dim7', '7b9', '7#9', '6', 'm6'].includes(qid) && noFifth && sounding.length >= 4) tags.add('jazz');
  const shape = rootString != null && rootString <= 3 && !tags.has('slash') ? ['E', 'A', 'D', 'G'][rootString] : null;
  return new Voicing({
    id: `${symbolOf(root, qid, bass)}@${frets.join('.')}`, root, quality: qid, bass, bassPc, frets, fingers, barre, baseFret, difficulty,
    tags: [...tags], notes, pcs, used, muted, shape, rootString: rootString ?? null, span, cost: 0, inversion: bassPc === root ? 0 : q.pcs.map((i) => (root + i) % 12).indexOf(bassPc),
  });
}

// ---------- validação musical (usada na geração, nas formas curadas e nos testes) ----------
export function validateVoicing(v) {
  const q = QUALITIES_BY_ID[v.quality], allowed = chordPcs(v.root, q), have = new Set(v.pcs);
  const errors = [];
  if (v.frets.length !== 6) errors.push('precisa de 6 cordas');
  for (const p of have) if (!allowed.has(p)) errors.push(`nota ${SHARP[p]} fora da fórmula`);
  for (const i of q.must) if (!have.has((v.root + i) % 12)) errors.push(`falta ${SHARP[(v.root + i) % 12]}`);
  const pos = v.frets.filter((f) => f > 0);
  if (pos.length && Math.max(...pos) - Math.min(...pos) > 3) errors.push('extensão maior que 4 casas');
  if (v.frets.some((f) => f === 0) && pos.length && Math.max(...pos) > 5) errors.push('corda solta com mão alta');
  if (new Set(v.fingers.filter((x) => x > 0)).size > 4) errors.push('mais de 4 dedos');
  v.fingers.forEach((d, s) => { if ((d > 0) !== (v.frets[s] > 0)) errors.push(`dedo incoerente na corda ${s + 1}`); });
  if (v.barre) for (let s = v.barre.from; s <= v.barre.to; s++) if (v.frets[s] === 0) errors.push('corda solta dentro da pestana');
  if (v.notes.length < (v.quality === '5' ? 2 : 3)) errors.push('notas de menos');
  return errors;
}

// ---------- geração ----------
function candidates(root, qid) {
  const q = QUALITIES_BY_ID[qid], allowed = chordPcs(root, q), must = q.must.map((i) => (root + i) % 12);
  const minNotes = qid === '5' ? 2 : 3;
  const seen = new Map();
  for (let b = 0; b <= 9; b++) {
    const opts = [];
    for (let s = 0; s < 6; s++) {
      const o = [-1];
      if (b <= 3 && allowed.has(pcOf(s, 0))) o.push(0);
      for (let f = Math.max(1, b); f <= b + 3; f++) if (allowed.has(pcOf(s, f))) o.push(f);
      opts.push(o);
    }
    const cur = Array(6);
    const rec = (s) => {
      if (s === 6) { evaluate(cur.slice()); return; }
      for (const f of opts[s]) { cur[s] = f; rec(s + 1); }
    };
    const evaluate = (frets) => {
      const key = frets.join('.');
      if (seen.has(key)) return;
      const snd = frets.map((f, s) => (f >= 0 ? s : -1)).filter((s) => s >= 0);
      if (snd.length < minNotes) return;
      const inner = frets.slice(snd[0], snd[snd.length - 1] + 1).filter((f) => f < 0).length;
      if (inner > 1 || (inner === 1 && snd.length < 4)) return;
      const have = new Set(snd.map((s) => pcOf(s, frets[s])));
      if (!must.every((p) => have.has(p))) return;
      const pos = frets.filter((f) => f > 0);
      if (frets.includes(0) && pos.length && Math.max(...pos) > 5) return;
      const fg = assignFingers(frets);
      if (!fg.ok) return;
      const v = describe(root, qid, null, frets, fg.fingers, fg.barre);
      seen.set(key, v);
    };
    rec(0);
  }
  return [...seen.values()];
}

// Quanto menor, mais fácil/natural de tocar. Formas cheias (5-6 cordas) valem mais que fragmentos de 3 cordas.
function cost(v) {
  const opens = v.frets.filter((f) => f === 0).length;
  const maxFret = Math.max(0, ...v.frets);
  const inner = v.frets.slice(v.used[0], v.used[v.used.length - 1] + 1).filter((f) => f < 0).length;
  const thin = v.quality === '5' ? 0 : (6 - v.used.length) * 0.9;
  return new Set(v.fingers.filter((x) => x > 0)).size + (v.barre ? 2 : 0) + inner * 3 + v.span * 0.6 + thin
    + v.baseFret * 0.06 - opens * 0.3 + (opens && maxFret >= 4 ? 2.5 : 0) + (v.bassPc !== v.root ? 1.5 : 0);
}
const bucket = (b) => (b <= 2 ? 0 : b <= 5 ? 1 : b <= 8 ? 2 : 3);

function pick(list, max) {
  const sorted = [...list].sort((a, b) => cost(a) - cost(b) || a.id.localeCompare(b.id));
  const out = [], keys = new Set();
  for (const v of sorted) {
    const k = `${v.used[0]}|${bucket(v.baseFret)}|${v.used.length >= 5 ? 'f' : v.used.length === 4 ? 'm' : 's'}|${v.tags.includes('aberto')}`;
    if (keys.has(k)) continue;
    keys.add(k); out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

const cache = new Map();
function fromCurated(root, qid) {
  const list = OPEN[symbolOf(root, qid)] || [];
  return list.map((c) => describe(root, qid, null, c.f, c.fi, barreFromFingers(c.f, c.fi), ['curado', ...(c.tags || [])]));
}

function buildRootPosition(root, qid) {
  const pool = candidates(root, qid).filter((v) => v.bassPc === root);
  const curated = fromCurated(root, qid);
  const taken = new Set(curated.map((v) => v.frets.join('.')));
  const rest = pool.filter((v) => !taken.has(v.frets.join('.')));
  const out = [...curated, ...pick(rest, Math.max(1, MAX_PER_CHORD - curated.length))];
  // garante uma opção simples para iniciantes (≤3 dedos, sem pestana)
  if (!out.some((v) => v.tags.includes('iniciante'))) {
    const easy = rest.filter((v) => v.tags.includes('iniciante') && !out.includes(v)).sort((a, b) => cost(a) - cost(b))[0];
    if (easy) out.push(easy);
  }
  // uma forma MÓVEL (sem cordas soltas) por corda de raiz: forma E, A, D, G (para subir o braço)
  for (const rs of [0, 1, 2, 3]) {
    const m = rest.filter((v) => v.tags.includes('móvel') && !v.tags.includes('aberto') && v.rootString === rs && v.used.length >= (qid === '5' ? 2 : 4) && !out.includes(v))
      .sort((a, b) => cost(a) - a.used.length * 0.8 - (cost(b) - b.used.length * 0.8))[0];
    if (m) out.push(m);
  }
  return out.filter((v) => validateVoicing(v).length === 0).sort((a, b) => a.baseFret - b.baseFret || cost(a) - cost(b));
}

function buildInversion(root, qid, bass) {
  const q = QUALITIES_BY_ID[qid];
  const pool = candidates(root, qid).filter((v) => v.bassPc === bass);
  if (chordPcs(root, q).has(bass)) {
    return pick(pool, 5).map((v) => describe(root, qid, bass, v.frets, v.fingers, v.barre, ['inversão']));
  }
  // baixo fora do acorde (ex.: C/D, C/Bb): qualquer forma do acorde + nota grave numa das duas cordas abaixo dela
  const out = [], seen = new Set();
  for (const v of candidates(root, qid)) {
    for (const s of [v.used[0] - 1, v.used[0] - 2]) {
      if (s < 0) continue;
      const between = s + 1 < v.used[0] ? v.used[0] - s - 1 : 0;
      if (between > 1) continue;
      const pos = v.frets.filter((f) => f > 0), lo = pos.length ? Math.min(...pos) : 1, hi = pos.length ? Math.max(...pos) : 1;
      for (let f = 0; f <= 12; f++) {
        if (pcOf(s, f) !== bass) continue;
        if (f === 0 ? hi > 5 : (f < hi - 3 || f > lo + 3)) continue;
        const frets = v.frets.slice(); frets[s] = f;
        const key = frets.join('.');
        if (seen.has(key)) continue;
        const fg = assignFingers(frets);
        if (!fg.ok) continue;
        const nv = describe(root, qid, bass, frets, fg.fingers, fg.barre, ['slash']);
        if (validateVoicingSlash(nv).length === 0) { seen.add(key); out.push(nv); }
      }
    }
  }
  return pick(out, 4);
}
function validateVoicingSlash(v) { const clone = { ...v, pcs: v.pcs.filter((p) => p !== v.bass || chordPcs(v.root, QUALITIES_BY_ID[v.quality]).has(p)) }; return validateVoicing(clone); }

// Digitações de um símbolo ('C', 'F#m7', 'C/E', 'Sol7'). Resultado em cache.
export function voicingsOf(symbol) {
  const p = typeof symbol === 'string' ? parseSymbol(symbol) : symbol;
  if (!p) return [];
  const key = symbolOf(p.root, p.quality, p.bass);
  if (!cache.has(key)) cache.set(key, p.bass == null ? buildRootPosition(p.root, p.quality) : buildInversion(p.root, p.quality, p.bass));
  return cache.get(key);
}

// Triades/sétimas em inversão (baixo = terça, quinta, sétima), úteis para estudo.
export function inversionsOf(symbol) {
  const p = parseSymbol(symbol); if (!p || p.bass != null) return [];
  const q = QUALITIES_BY_ID[p.quality];
  return q.pcs.slice(1).filter((i) => q.must.includes(i) || i === 7).flatMap((i) => voicingsOf(symbolOf(p.root, p.quality, (p.root + i) % 12)));
}

export function getChord(symbol) {
  const p = parseSymbol(symbol); if (!p) return null;
  const q = QUALITIES_BY_ID[p.quality];
  const voicings = voicingsOf(p);
  const FORMULA = { 0: '1', 1: '♭9', 2: '9', 3: '♭3', 4: '3', 5: '4', 6: '♭5', 7: '5', 8: '♯5', 9: '6', 10: '♭7', 11: '7' };
  return {
    symbol: symbolOf(p.root, p.quality, p.bass), name: displayName(p.root, p.quality, p.bass), root: p.root, quality: p.quality, bass: p.bass,
    qualityName: q.name, category: q.cat, formula: q.pcs.map((i) => FORMULA[i]), pcs: q.pcs.map((i) => (p.root + i) % 12), voicings, best: voicings[0] || null,
  };
}

// Lista de símbolos (sem gerar digitações): 12 raízes × todas as qualidades.
export function allSymbols() { return SHARP.flatMap((_, root) => QUALITY_LIST.map((q) => ({ symbol: symbolOf(root, q.id), root, quality: q.id }))); }

// Busca textual por símbolos: 'am7', 'sol', 'c#', 'sus'. Retorna símbolos (sem digitações).
export function searchSymbols(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  const exact = parseSymbol(t);
  const low = t.toLowerCase();
  const rootOnly = parseNotes(t).find((x) => !x.rest) || null;
  const res = [];
  if (exact) res.push(symbolOf(exact.root, exact.quality, exact.bass));
  for (const s of allSymbols()) {
    const nm = displayName(s.root, s.quality).toLowerCase(), qn = QUALITIES_BY_ID[s.quality].name.toLowerCase();
    const match = nm.startsWith(low) || s.symbol.toLowerCase().startsWith(low) || qn.includes(low) || (rootOnly && !rootOnly.rest && s.root === rootOnly.pc);
    if (match && !res.includes(s.symbol)) res.push(s.symbol);
  }
  return res;
}

// Filtra digitações. Gera sob demanda os acordes pedidos (com `root`/`quality`/`symbol` é rápido; sem eles percorre a biblioteca).
export function findChords({ q = '', root = null, quality = null, category = null, difficulty = null, tag = null, symbols = null, limit = 500 } = {}) {
  let syms = symbols || (q ? searchSymbols(q) : allSymbols().map((s) => s.symbol));
  if (root != null || quality || category) {
    syms = syms.filter((s) => { const p = parseSymbol(s); return (root == null || p.root === root) && (!quality || p.quality === quality) && (!category || QUALITIES_BY_ID[p.quality].cat === category); });
  }
  const out = [];
  for (const s of syms) {
    for (const v of voicingsOf(s)) {
      if (difficulty && v.difficulty !== +difficulty) continue;
      if (tag && !v.tags.includes(tag)) continue;
      out.push(v);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// ---------- uso na prática ----------
// Posições para Fretboard.setExpected (inclui cordas soltas no traste 0).
export const expectedPositions = (v) => v.frets.map((f, string) => (f < 0 ? null : { string, fret: f, finger: v.fingers[string] || undefined })).filter(Boolean);

// Comparação por classes de altura (notas já sem o desvio de afinação). rigor: 'root' | 'normal' | 'strict'
export function matchVoicing(notes, v, rigor = 'normal') {
  const q = QUALITIES_BY_ID[v.quality];
  const set = new Set(notes.map((n) => ((n % 12) + 12) % 12));
  const rel = new Set([...set].map((p) => (p - v.root + 12) % 12));
  const missing = q.must.filter((i) => !rel.has(i)).map((i) => pcName(v.root + i));
  const extra = [...rel].filter((i) => !q.pcs.includes(i)).map((i) => pcName(v.root + i));
  let ok;
  if (rigor === 'root') ok = set.size >= 2 && rel.has(0);
  else if (rigor === 'strict') ok = !missing.length && !extra.length;
  else ok = !missing.length && extra.length <= 1;
  if (ok && rigor !== 'root' && v.bass != null && notes.length && ((Math.min(...notes) % 12) + 12) % 12 !== v.bass) { ok = false; missing.push(`baixo ${pcName(v.bass)}`); }
  return { ok, missing, extra };
}

// Diferença por corda entre o esperado e o tocado. played: Map corda -> nota (já sem desvio).
export function diffByString(v, played) {
  return v.frets.map((f, s) => {
    const want = f >= 0 ? STANDARD[s] + f : null, got = played.get(s) ?? null;
    if (want == null) return { string: s, state: got == null ? 'avoid-ok' : 'avoid-hit', want, got };
    if (got == null) return { string: s, state: 'missing', want, got };
    return { string: s, state: got === want ? 'ok' : (((got - want) % 12) + 12) % 12 === 0 ? 'octave' : 'wrong', want, got };
  });
}

// Evento de palhetada para Scores (§6).
export function chordEvent(v, { beat = 0, dur = 1, dir = 'D', check = { strings: true, pitch: true, timing: true, dir: false } } = {}) {
  return {
    beat, dur, kind: 'strum', strum: { dir, strings: v.used.slice() },
    notes: v.frets.map((f, string) => (f < 0 ? null : { string, fret: f, finger: v.fingers[string] || undefined })).filter(Boolean),
    avoid: v.muted.slice(), check, label: v.name,
  };
}
// Score de um acorde repetido (aquecimento / "ouça e toque").
export function chordScore(v, { beats = 4, bpm = 70, dir = 'D', mode = 'timed' } = {}) {
  const events = Array.from({ length: beats }, (_, i) => chordEvent(v, { beat: i, dir }));
  return { id: `chord:${v.id}`, title: `Acorde ${v.name}`, technique: 'chords', level: v.difficulty, bpm, beatsPerBar: 4, subdivision: 2, lengthBeats: beats, mode,
    chords: [{ beat: 0, chordId: v.symbol, frets: v.frets, fingers: v.fingers }], events };
}
