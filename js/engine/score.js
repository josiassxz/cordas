// Score: descrição de um exercício como linha do tempo em batidas (docs/ARCHITECTURE.md §6).
// normalizeScore preenche padrões; validateScore devolve a lista de erros (vazia = válido).
import { noteAt, STANDARD } from '../music/theory.js';

const DIRS = ['D', 'U'];
const DIGITS = ['p', 'i', 'm', 'a'];
const TECHS = ['hammer', 'pull', 'slide', 'bend', 'vibrato', 'mute', 'palm'];
const isStr = (s) => Number.isInteger(s) && s >= 0 && s <= 5;

export const kindOf = (e) => e.kind || (e.strum ? 'strum' : e.notes?.length ? 'note' : 'rest');

// Quais cordas o evento espera que soem.
export function expectedStrings(ev) {
  if (ev.kind === 'strum') return [...(ev.strum?.strings || [])];
  if (ev.kind === 'note') return [...new Set((ev.notes || []).map((n) => n.string))];
  return [];
}

// Nota MIDI esperada numa corda (null se o evento não define o traste dela).
export function expectedPitch(ev, string, offset = 0, tuning = STANDARD) {
  const n = ev.notes?.find((x) => x.string === string);
  if (n) return noteAt(string, n.fret, offset, tuning);
  const f = ev.strum?.frets?.[string];
  return f != null && f >= 0 ? noteAt(string, f, offset, tuning) : null;
}
export const expectedFret = (ev, string) => ev.notes?.find((x) => x.string === string)?.fret ?? ev.strum?.frets?.[string] ?? 0;
export const fingerOf = (ev, string) => ev.notes?.find((x) => x.string === string)?.finger ?? ev.strum?.fingers?.[string] ?? 0;

// "Só guia": o evento é exibido mas nada nele é verificado (ex.: técnica que o aparelho não envia).
export const isScored = (ev) => ev.kind !== 'rest' && !!ev.check?.strings;

export function normalizeScore(raw) {
  const s = { beatsPerBar: 4, subdivision: 2, mode: 'timed', level: 1, ...raw };
  s.events = (raw.events || []).map((e) => {
    const kind = kindOf(e);
    const base = kind === 'strum' ? { strings: true, pitch: !raw.noPitch, timing: true, dir: !!e.strum?.dir }
      : kind === 'note' ? { strings: true, pitch: !raw.noPitch, timing: true, dir: false }
        : { strings: false, pitch: false, timing: false, dir: false };
    return { dur: kind === 'strum' ? 0.5 : 0.5, ...e, kind, check: { ...base, ...(e.check || {}) } };
  }).sort((a, b) => a.beat - b.beat);
  if (!s.lengthBeats) {
    const end = s.events.reduce((m, e) => Math.max(m, e.beat + (e.dur || 0)), 0);
    s.lengthBeats = Math.max(s.beatsPerBar, Math.ceil(end / s.beatsPerBar - 1e-9) * s.beatsPerBar);
  }
  if (s.chords) s.chords = [...s.chords].sort((a, b) => a.beat - b.beat);
  return s;
}

export function validateScore(s) {
  const err = [];
  const need = (c, m) => { if (!c) err.push(m); };
  need(typeof s.id === 'string' && s.id, 'id ausente');
  need(typeof s.title === 'string' && s.title, 'title ausente');
  need(Number.isFinite(s.bpm) && s.bpm >= 20 && s.bpm <= 300, 'bpm inválido');
  need(Number.isFinite(s.lengthBeats) && s.lengthBeats > 0, 'lengthBeats inválido');
  need(['timed', 'wait'].includes(s.mode), 'mode inválido');
  need(Array.isArray(s.events) && s.events.length > 0, 'sem eventos');
  need(Number.isInteger(s.level) && s.level >= 1 && s.level <= 5, 'level fora de 1..5');
  (s.events || []).forEach((e, i) => {
    const at = `evento ${i}`;
    need(Number.isFinite(e.beat) && e.beat >= 0 && e.beat < s.lengthBeats, `${at}: beat fora da passada`);
    need(['strum', 'note', 'rest'].includes(e.kind), `${at}: kind inválido`);
    if (e.kind === 'strum') {
      need(DIRS.includes(e.strum?.dir), `${at}: dir inválido`);
      need(e.strum?.strings?.length && e.strum.strings.every(isStr), `${at}: strings inválidas`);
      if (e.strum?.frets) need(e.strum.frets.length === 6 && e.strum.strings.every((x) => e.strum.frets[x] >= 0), `${at}: frets incoerentes com strings`);
    }
    if (e.kind === 'note') need(e.notes?.length && e.notes.every((n) => isStr(n.string) && Number.isInteger(n.fret) && n.fret >= 0 && n.fret <= 24 && (n.finger == null || (n.finger >= 1 && n.finger <= 4)) && (n.digit == null || DIGITS.includes(n.digit))), `${at}: notas inválidas`);
    if (e.tech) need(TECHS.includes(e.tech), `${at}: técnica desconhecida`);
    if (e.avoid) need(e.avoid.every(isStr), `${at}: avoid inválido`);
    if (e.avoid && e.kind !== 'rest') need(!expectedStrings(e).some((x) => e.avoid.includes(x)), `${at}: corda esperada também em avoid`);
    // honestidade: técnica não detectável nunca pode declarar timing/pitch verificados no evento-guia
    if (e.tech && e.guide) need(!e.check.strings && !e.check.pitch && !e.check.timing, `${at}: evento-guia não pode ser avaliado`);
  });
  (s.chords || []).forEach((c, i) => need(Number.isFinite(c.beat) && c.beat >= 0 && c.beat < s.lengthBeats && c.chordId, `acorde ${i} inválido`));
  if (s.ramp) need(s.ramp.step > 0 && s.ramp.max > s.bpm, 'ramp inválida');
  return err;
}
