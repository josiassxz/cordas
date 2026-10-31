// app.learn: fachada do aprendizado (histórico, metas, trilhas, rotinas, favoritos). Lógica pura em stats/goals/routines/recommend.
import * as S from './stats.js';
import * as G from './goals.js';
import * as R from './routines.js';
import { recommend, lastSession, levelOf } from './recommend.js';
import { PATHS, pathProgress, resolveStep, stepProgress } from '../content/paths.js';

let catalogPromise = null;
// Biblioteca de exercícios (frente Prática). Import dinâmico: se ainda não existe, devolve null sem quebrar.
export function loadCatalog() {
  catalogPromise ??= import('../content/exercises.js').then((m) => {
    const all = m.EXERCISES || [];
    return { getExercises: m.getExercises, exerciseById: m.exerciseById, all: Array.isArray(all) ? all : Object.values(all) };
  }).catch(() => null);
  return catalogPromise;
}

export function installLearn(app) {
  const { store } = app;
  const sessions = () => S.normalizeAll(store.get('sessions', []));
  const goals = () => G.sanitizeGoals(store.get('goals', G.DEFAULT_GOALS));
  const progress = () => PATHS.map((p) => pathProgress(p, sessions(), store.get('paths.completed', {})));

  app.learn = {
    ready: true,
    PATHS,
    // §8: todas as frentes chamam record() ao terminar algo praticável
    record(rec) {
      const s = S.normalize({ ts: Date.now(), ...rec });
      if (!s) return null;
      store.update('sessions', (a) => [...a, { ...rec, ts: s.ts }].slice(-1000), []);
      store.markDay();
      // conclusão de passo é gravada (não "desconclui" se o histórico for limpo)
      const all = sessions(), done = { ...store.get('paths.completed', {}) };
      for (const p of PATHS) for (const st of p.steps) if (!done[st.id] && stepProgress(st, all).done) done[st.id] = s.ts;
      store.set('paths.completed', done);
      return s;
    },
    sessions, goals, progress, loadCatalog, techniqueLabel: S.techniqueLabel,
    setGoals(g) { store.set('goals', G.sanitizeGoals({ ...goals(), ...g })); },
    today: (now) => G.dailyProgress(sessions(), goals(), now),
    week: (now) => G.weeklyProgress(sessions(), goals(), now),
    streak: (now) => S.streak(store.get('days', []), sessions(), now),
    bestStreak: () => S.bestStreak(store.get('days', []), sessions()),
    overview: (now) => S.overview(sessions(), now),
    byTechnique: () => S.byTechnique(sessions()),
    weak: (now) => S.weakTechniques(sessions(), { now }),
    masteredChords: () => S.masteredChords(store.get('chords', {})),
    last: () => lastSession(sessions()),
    recommend: (now) => recommend({ sessions: sessions(), progress: progress(), now }),
    level: () => levelOf(progress()),
    resolveStep,
    // favoritos agregados: { exercises, chords, songs, tones }
    favorites: () => store.get('favorites', {}),
    isFavorite: (kind, id) => (store.get(`favorites.${kind}`, []) || []).includes(id),
    toggleFavorite(kind, id) {
      store.update(`favorites.${kind}`, (a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]), []);
      return this.isFavorite(kind, id);
    },
    // rotinas
    routines: () => store.get('routines.custom', []),
    saveRoutine(r) { store.update('routines.custom', (a) => [...a.filter((x) => x.id !== r.id), r], []); return r; },
    deleteRoutine(id) { store.update('routines.custom', (a) => a.filter((x) => x.id !== id), []); },
    async dailyRoutine(now) {
      const cat = await loadCatalog(); if (!cat?.all?.length) return null;
      const nx = this.recommend(now);
      return R.suggestDaily({ sessions: sessions(), catalog: cat.all, now, level: this.level(), minutes: goals().dailyMinutes, nextTechnique: nx.technique });
    },
    async runRoutine(routine, host, hooks = {}) {
      if (!app.practice?.ready) throw new Error('A prática guiada ainda não está disponível.');
      return R.runRoutine(app, routine, host, { catalog: await loadCatalog(), ...hooks });
    },
  };
}
