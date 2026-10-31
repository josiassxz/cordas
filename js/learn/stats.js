// Estatísticas de prática. Funções puras: recebem sessões/dias e um "agora" injetável (testável com datas simuladas).
const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const DAY = 86400000;
const addDays = (ts, n) => { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); };
export const weekStart = (now) => { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }; // segunda-feira

export const TECHNIQUES = {
  chords: 'Acordes', 'chord-change': 'Troca de acordes', strumming: 'Palhetada', picking: 'Palhetada alternada', rhythm: 'Ritmo',
  arpeggio: 'Arpejos', fingerpicking: 'Dedilhado', scale: 'Escalas', melody: 'Melodias', legato: 'Técnicas (ligados)',
};
export const techniqueLabel = (t) => TECHNIQUES[t] || t || 'Livre';

// Aceita sessões no formato do §8 e as da v1 ({date, mode, accuracy, bpm}).
export function normalize(s) {
  if (!s) return null;
  let ts = s.ts;
  if (!ts && s.date) { const [y, m, d] = s.date.split('-').map(Number); ts = new Date(y, m - 1, d, 12).getTime(); }
  if (!ts) return null;
  const legacy = !s.ts && s.date;
  return {
    ts, kind: s.kind || (legacy ? 'rhythm' : 'exercise'), refId: s.refId ?? null, title: s.title || techniqueLabel(s.technique || s.mode),
    technique: s.technique || (legacy ? (s.mode === 'train' ? 'chord-change' : 'rhythm') : null), level: s.level ?? null,
    bpm: s.bpm ?? null, speed: s.speed ?? 1, durationSec: Math.max(0, s.durationSec ?? 0),
    accuracy: Number.isFinite(s.accuracy) ? s.accuracy : null, timingMeanMs: Number.isFinite(s.timingMeanMs) ? s.timingMeanMs : null,
    hits: s.hits || null, stringsOk: s.stringsOk ?? null, stringsTotal: s.stringsTotal ?? null,
    chordsOk: s.chordsOk ?? null, chordsTotal: s.chordsTotal ?? null,
  };
}
export const normalizeAll = (list) => (list || []).map(normalize).filter(Boolean).sort((a, b) => a.ts - b.ts);
export const effectiveBpm = (s) => (s.bpm ? Math.round(s.bpm * (s.speed || 1)) : null);

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export function minutesByDay(sessions, { days = 14, now = Date.now() } = {}) {
  const map = new Map();
  for (const s of sessions) map.set(dayKey(s.ts), (map.get(dayKey(s.ts)) || 0) + s.durationSec / 60);
  return Array.from({ length: days }, (_, i) => { const t = addDays(now, i - days + 1); const k = dayKey(t); return { day: k, ts: t, minutes: map.get(k) || 0 }; });
}
export const minutesOnDay = (sessions, now = Date.now()) => sessions.filter((s) => dayKey(s.ts) === dayKey(now)).reduce((a, s) => a + s.durationSec / 60, 0);
export const totalMinutes = (sessions) => sessions.reduce((a, s) => a + s.durationSec / 60, 0);
export const sessionsSince = (sessions, since) => sessions.filter((s) => s.ts >= since);

export function accuracySeries(sessions, { technique, refId } = {}) {
  return sessions.filter((s) => s.accuracy !== null && (!technique || s.technique === technique) && (!refId || s.refId === refId))
    .map((s) => ({ ts: s.ts, accuracy: s.accuracy, timing: s.timingMeanMs }));
}

export function bpmSeries(sessions, { technique, refId } = {}) {
  return sessions.filter((s) => effectiveBpm(s) && (!technique || s.technique === technique) && (!refId || s.refId === refId))
    .map((s) => ({ ts: s.ts, bpm: effectiveBpm(s), accuracy: s.accuracy }));
}

export function byTechnique(sessions) {
  const g = new Map();
  for (const s of sessions) { const k = s.technique || 'livre'; (g.get(k) || g.set(k, []).get(k)).push(s); }
  return [...g].map(([technique, list]) => {
    const acc = list.filter((s) => s.accuracy !== null).map((s) => s.accuracy);
    return { technique, label: techniqueLabel(technique), sessions: list.length, minutes: totalMinutes(list), avgAccuracy: avg(acc), recentAccuracy: avg(acc.slice(-5)), lastTs: list[list.length - 1].ts };
  }).sort((a, b) => b.minutes - a.minutes || b.sessions - a.sessions);
}

export const masteredChords = (chords = {}, need = 3) => Object.entries(chords).filter(([, v]) => (v.streak || 0) >= need).map(([id]) => id);

// Técnicas que pedem reforço: ≥2 sessões recentes e precisão média baixa / muitas batidas perdidas.
export function weakTechniques(sessions, { now = Date.now(), windowDays = 30, threshold = 80, perTechnique = 5 } = {}) {
  const recent = sessions.filter((s) => s.technique && s.accuracy !== null && s.ts >= addDays(now, -windowDays));
  const g = new Map();
  for (const s of recent) (g.get(s.technique) || g.set(s.technique, []).get(s.technique)).push(s);
  const out = [];
  for (const [technique, list] of g) {
    const last = list.slice(-perTechnique);
    if (last.length < 2) continue;
    const avgAccuracy = avg(last.map((s) => s.accuracy));
    const tot = last.reduce((a, s) => a + (s.hits ? Object.values(s.hits).reduce((x, y) => x + y, 0) : 0), 0);
    const miss = last.reduce((a, s) => a + (s.hits?.miss || 0), 0);
    const missRatio = tot ? miss / tot : 0;
    if (avgAccuracy >= threshold && missRatio < 0.25) continue;
    out.push({ technique, label: techniqueLabel(technique), avgAccuracy: Math.round(avgAccuracy), missRatio, sessions: last.length, weakness: 100 - avgAccuracy + 20 * missRatio });
  }
  return out.sort((a, b) => b.weakness - a.weakness);
}

// Sequência de dias: une os dias salvos no store com os dias das sessões. Hoje sem prática não quebra a sequência.
export function streak(days = [], sessions = [], now = Date.now()) {
  const set = new Set([...days, ...sessions.map((s) => dayKey(s.ts))]);
  let n = 0, t = now;
  if (!set.has(dayKey(t))) t = addDays(t, -1);
  while (set.has(dayKey(t))) { n++; t = addDays(t, -1); }
  return n;
}
export const bestStreak = (days = [], sessions = []) => {
  const keys = [...new Set([...days, ...sessions.map((s) => dayKey(s.ts))])].sort(); let best = 0, run = 0, prev = null;
  for (const k of keys) { const [y, m, d] = k.split('-').map(Number); const t = new Date(y, m - 1, d, 12).getTime(); run = prev && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = t; }
  return best;
};

export function overview(sessions, now = Date.now()) {
  const week = sessionsSince(sessions, weekStart(now));
  const acc = sessions.filter((s) => s.accuracy !== null).map((s) => s.accuracy);
  const half = Math.floor(acc.length / 2);
  return { sessions: sessions.length, totalMinutes: totalMinutes(sessions), weekMinutes: totalMinutes(week), weekSessions: week.length,
    avgAccuracy: avg(acc), trend: acc.length >= 6 ? avg(acc.slice(half)) - avg(acc.slice(0, half)) : null };
}
