// Rotinas de prática: sequência de exercícios com duração. Sugestão diária a partir de fraquezas e nível.
import { weakTechniques, techniqueLabel, DAY } from './stats.js';

const clampMin = (m) => Math.min(30, Math.max(1, Math.round(m)));
export const routineMinutes = (r) => r.steps.reduce((a, s) => a + s.minutes, 0);
export const makeRoutine = (name, steps, id = `r-${Date.now().toString(36)}`) => ({ id, name: (name || 'Minha rotina').slice(0, 40), custom: true, steps: steps.map((s) => ({ exerciseId: s.exerciseId, title: s.title, technique: s.technique, minutes: clampMin(s.minutes ?? 3) })) });

// catalog: array de exercícios {id,title,technique,level,bpm?}. Escolhe o menos praticado recentemente, no nível mais próximo.
export function suggestDaily({ sessions, catalog, now = Date.now(), level = 1, minutes = 15, nextTechnique = null }) {
  if (!catalog?.length) return null;
  const last = new Map(sessions.filter((s) => s.refId).map((s) => [s.refId, s.ts]));
  const weak = weakTechniques(sessions, { now });
  const order = [...new Set(['chords', ...weak.map((w) => w.technique), nextTechnique, 'rhythm', 'strumming'].filter(Boolean))];
  const used = new Set(), steps = [];
  const slots = Math.max(1, Math.round(minutes / 3));
  const pick = (technique) => catalog.filter((e) => e.technique === technique && !used.has(e.id))
    .sort((a, b) => Math.abs((a.level ?? 1) - level) - Math.abs((b.level ?? 1) - level) || (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0))[0];
  for (const t of order) {
    if (steps.length >= slots) break;
    const e = pick(t); if (!e) continue;
    used.add(e.id);
    steps.push({ exerciseId: e.id, title: e.title, technique: e.technique, minutes: 3 });
  }
  if (!steps.length) return null;
  const reason = weak.length ? `Inclui reforço de ${techniqueLabel(weak[0].technique).toLowerCase()} (média ${weak[0].avgAccuracy}%).` : 'Aquecimento, técnica nova e ritmo.';
  return { id: 'daily', name: 'Rotina do dia', custom: false, reason, steps };
}

// Executa a rotina em sequência com app.practice. Cada passo repete até cobrir os minutos pedidos.
export function runRoutine(app, routine, host, { catalog, onStep, onFinish } = {}) {
  let i = -1, handle = null, stopped = false;
  const next = () => {
    if (stopped) return;
    i++;
    if (i >= routine.steps.length) { onFinish?.({ completed: true }); return; }
    const st = routine.steps[i], ex = catalog?.exerciseById?.(st.exerciseId);
    onStep?.(i, st);
    if (!ex) { next(); return; }
    const passSec = ex.lengthBeats && ex.bpm ? (ex.lengthBeats * 60) / ex.bpm : 20;
    const repeat = Math.min(50, Math.max(1, Math.ceil((st.minutes * 60) / passSec)));
    handle = app.practice.start(ex, { host, repeat, onFinish: () => next() });
  };
  next();
  return { stop() { stopped = true; handle?.stop?.(); }, skip() { handle?.stop?.(); next(); }, get index() { return i; } };
}
export const ROUTINE_DAY_MS = DAY;
