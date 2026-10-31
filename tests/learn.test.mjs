import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/learn/stats.js';
import * as G from '../js/learn/goals.js';
import { recommend } from '../js/learn/recommend.js';
import { suggestDaily, makeRoutine, routineMinutes } from '../js/learn/routines.js';
import { PATHS, pathProgress, resolveStep, nextStep, stepProgress } from '../js/content/paths.js';
import { Store } from '../js/core/store.js';
import { installLearn } from '../js/learn/index.js';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const NOW = at(2026, 10, 30, 21);
const mk = (daysAgo, o = {}) => ({ ts: NOW - daysAgo * S.DAY, kind: 'exercise', technique: 'strumming', level: 1, durationSec: 300, accuracy: 85, bpm: 80, speed: 1, ...o });
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('normalize aceita sessões v1 ({date, mode}) e do §8', () => {
  const v1 = S.normalize({ date: '2026-10-01', mode: 'train', accuracy: 70, bpm: 90 });
  assert.equal(v1.technique, 'chord-change'); assert.equal(S.dayKey(v1.ts), '2026-10-01'); assert.equal(v1.durationSec, 0);
  assert.equal(S.normalize({ date: '2026-10-01', mode: 'rhythm', accuracy: 50 }).technique, 'rhythm');
  assert.equal(S.normalize({ ts: 5, accuracy: NaN }).accuracy, null);
  assert.equal(S.normalize({}), null);
});

test('minutos por dia, hoje e semana (segunda-feira)', () => {
  const ss = S.normalizeAll([mk(0, { durationSec: 600 }), mk(0, { durationSec: 120 }), mk(1)]);
  assert.equal(S.minutesOnDay(ss, NOW), 12);
  const series = S.minutesByDay(ss, { days: 7, now: NOW });
  assert.equal(series.length, 7); assert.equal(series[6].minutes, 12); assert.equal(series[5].minutes, 5); assert.equal(series[0].minutes, 0);
  assert.equal(new Date(S.weekStart(NOW)).getDay(), 1);   // 30/10/2026 é sexta -> semana começa 26/10
  assert.equal(S.dayKey(S.weekStart(NOW)), '2026-10-26');
});

test('sequência: hoje sem prática não quebra; buraco quebra; união days+sessões', () => {
  const day = (n) => S.dayKey(NOW - n * S.DAY);
  assert.equal(S.streak([day(1), day(2), day(3)], [], NOW), 3);
  assert.equal(S.streak([day(0), day(1), day(3)], [], NOW), 2);
  assert.equal(S.streak([day(2)], [], NOW), 0, 'ontem faltou');
  assert.equal(S.streak([day(2)], S.normalizeAll([mk(1), mk(0)]), NOW), 3);
  assert.equal(S.streak([], [], NOW), 0);
  assert.equal(S.bestStreak([day(10), day(9), day(8), day(7), day(1), day(0)], []), 4);
});

test('metas diária e semanal: progresso, conclusão e limites', () => {
  const ss = S.normalizeAll([mk(0, { durationSec: 600 }), mk(2), mk(3)]);
  const d = G.dailyProgress(ss, { dailyMinutes: 15 }, NOW);
  assert.equal(d.minutes, 10); assert.equal(d.done, false); assert.equal(d.remaining, 5); assert.ok(Math.abs(d.ratio - 10 / 15) < 1e-9);
  assert.equal(G.dailyProgress(ss, { dailyMinutes: 10 }, NOW).done, true);
  const w = G.weeklyProgress(ss, { weeklySessions: 5 }, NOW);   // semana desde seg 26/10: hoje(6ª), 2d atrás = 28/10, 3d = 27/10
  assert.equal(w.sessions, 3); assert.equal(w.done, false);
  assert.deepEqual(G.sanitizeGoals({ dailyMinutes: 0, weeklySessions: 999 }), { dailyMinutes: 1, weeklySessions: 50 });
  assert.deepEqual(G.sanitizeGoals({}), G.DEFAULT_GOALS);
});

test('técnicas por reforço: precisa de ≥2 sessões e média baixa ou muitos erros', () => {
  const ss = S.normalizeAll([
    mk(5, { technique: 'picking', accuracy: 55 }), mk(2, { technique: 'picking', accuracy: 60 }),
    mk(4, { technique: 'rhythm', accuracy: 95 }), mk(1, { technique: 'rhythm', accuracy: 92 }),
    mk(1, { technique: 'scale', accuracy: 30 }),                                   // 1 sessão: ainda sem conclusão
    mk(3, { technique: 'arpeggio', accuracy: 88, hits: { perfect: 4, miss: 6 } }), mk(1, { technique: 'arpeggio', accuracy: 88, hits: { perfect: 4, miss: 6 } }),
    mk(60, { technique: 'legato', accuracy: 20 }), mk(59, { technique: 'legato', accuracy: 20 }), // fora da janela
  ]);
  const w = S.weakTechniques(ss, { now: NOW });
  assert.deepEqual(w.map((x) => x.technique), ['picking', 'arpeggio']);
  assert.equal(w[0].avgAccuracy, 58);
});

test('séries de precisão/BPM e BPM efetivo considera velocidade', () => {
  const ss = S.normalizeAll([mk(3, { bpm: 100, speed: 0.5 }), mk(1, { bpm: 100, speed: 1 }), mk(0, { technique: 'rhythm', bpm: 70 })]);
  assert.deepEqual(S.bpmSeries(ss, { technique: 'strumming' }).map((p) => p.bpm), [50, 100]);
  assert.equal(S.accuracySeries(ss, { technique: 'rhythm' }).length, 1);
  assert.equal(S.byTechnique(ss)[0].technique, 'strumming');
});

test('acordes dominados saem de store.chords (streak>=3)', () => {
  assert.deepEqual(S.masteredChords({ Em: { streak: 3 }, Am: { streak: 2 }, G: { streak: 5 } }).sort(), ['Em', 'G']);
});

test('trilhas: critério de conclusão, progresso e próximo passo', () => {
  const st = PATHS[0].steps.find((s) => s.technique === 'chords');
  const ss = S.normalizeAll([mk(2, { technique: 'chords', accuracy: 85 }), mk(1, { technique: 'chords', accuracy: 79 })]);
  assert.deepEqual(stepProgress(st, ss), { qualifying: 1, needed: 2, done: false });
  const ss2 = S.normalizeAll([mk(2, { technique: 'chords', accuracy: 85 }), mk(1, { technique: 'chords', accuracy: 90 }), mk(1, { technique: 'chords', level: 4, accuracy: 99 })]);
  assert.equal(stepProgress(st, ss2).done, true);
  assert.equal(stepProgress(st, S.normalizeAll([mk(1, { technique: 'chords', level: 4, accuracy: 99 }), mk(1, { technique: 'chords', level: 4, accuracy: 99 })])).done, false, 'nível fora do passo não conta');
  const prog = PATHS.map((p) => pathProgress(p, ss2));
  assert.equal(prog[0].doneCount, 1);
  assert.equal(nextStep(prog).step.id, 'i-palhetada');
  assert.equal(pathProgress(PATHS[0], [], { 'i-acordes': 1 }).steps[0].done, true, 'conclusão gravada é mantida');
});

test('resolução de trilhas via biblioteca: ausente = pendente, presente = lista sem duplicatas', () => {
  const st = PATHS[0].steps[1];
  assert.deepEqual(resolveStep(st, null), { available: false, exercises: [] });
  assert.equal(resolveStep(st, { getExercises: () => { throw new Error('x'); } }).available, false);
  const cat = { getExercises: ({ technique, level }) => [{ id: `${technique}-a`, level }, { id: `${technique}-b`, level }] };
  assert.equal(resolveStep(st, cat).exercises.length, 2);
});

test('recomendação: reforço > próximo passo > início > livre', () => {
  const prog = (ss) => PATHS.map((p) => pathProgress(p, ss));
  const none = recommend({ sessions: [], progress: prog([]), now: NOW });
  assert.equal(none.type, 'start'); assert.equal(none.technique, 'chords');
  const weak = S.normalizeAll([mk(3, { technique: 'picking', accuracy: 50 }), mk(1, { technique: 'picking', accuracy: 55 })]);
  const r = recommend({ sessions: weak, progress: prog(weak), now: NOW });
  assert.equal(r.type, 'reinforce'); assert.equal(r.technique, 'picking'); assert.match(r.reason, /5\d%/);
  const good = S.normalizeAll([mk(2, { technique: 'chords', accuracy: 90 }), mk(1, { technique: 'chords', accuracy: 92 })]);
  assert.equal(recommend({ sessions: good, progress: prog(good), now: NOW }).type, 'path');
  const all = PATHS.flatMap((p) => p.steps.map((s) => s.id)).reduce((a, id) => ({ ...a, [id]: 1 }), {});
  assert.equal(recommend({ sessions: [], progress: PATHS.map((p) => pathProgress(p, [], all)), now: NOW }).type, 'free');
});

test('rotina do dia: prioriza fraqueza, não repete, respeita orçamento; sem catálogo = null', () => {
  const cat = [
    { id: 'c1', title: 'Em-Am', technique: 'chords', level: 1 }, { id: 'p1', title: 'Alternada', technique: 'picking', level: 1 }, { id: 'p2', title: 'Alt. 2', technique: 'picking', level: 3 },
    { id: 'r1', title: 'Pop', technique: 'rhythm', level: 1 }, { id: 's1', title: 'Baixo', technique: 'strumming', level: 1 },
  ];
  assert.equal(suggestDaily({ sessions: [], catalog: [], now: NOW }), null);
  const weak = S.normalizeAll([mk(3, { technique: 'picking', accuracy: 50 }), mk(1, { technique: 'picking', accuracy: 55 })]);
  const r = suggestDaily({ sessions: weak, catalog: cat, now: NOW, level: 1, minutes: 9 });
  assert.equal(r.steps.length, 3); assert.equal(r.steps[0].technique, 'chords'); assert.equal(r.steps[1].exerciseId, 'p1'); assert.match(r.reason, /picking|palhetada alternada/i);
  assert.equal(new Set(r.steps.map((s) => s.exerciseId)).size, r.steps.length);
  const mine = makeRoutine('x'.repeat(80), [{ exerciseId: 'a', minutes: 99 }, { exerciseId: 'b', minutes: 0 }]);
  assert.equal(mine.name.length, 40); assert.equal(routineMinutes(mine), 31);
});

test('migração do store v1 -> v2 preserva progresso, e app.learn.record grava e conclui passos', () => {
  const storage = mem();
  storage.setItem('corda.v1', JSON.stringify({ settings: { latency: 120 }, chords: { Em: { ok: 3, tries: 3, streak: 3 } }, sessions: [{ date: '2026-10-01', mode: 'rhythm', accuracy: 70, bpm: 80 }], days: ['2026-10-01'] }));
  const store = new Store(storage);
  assert.equal(store.get('settings.latency'), 120); assert.equal(store.get('settings.pitchOffset'), 0, 'defaults novos entram');
  assert.equal(store.get('chords.Em.streak'), 3);
  const app = { store }; installLearn(app);
  assert.equal(app.learn.sessions()[0].technique, 'rhythm');
  assert.deepEqual(app.learn.masteredChords(), ['Em']);
  for (let i = 0; i < 2; i++) app.learn.record({ kind: 'exercise', technique: 'chords', level: 1, durationSec: 120, accuracy: 90 });
  assert.ok(store.get('paths.completed.i-acordes'), 'passo concluído gravado');
  assert.equal(app.learn.progress()[0].doneCount, 1);
  assert.equal(app.learn.toggleFavorite('chords', 'G'), true); assert.equal(app.learn.isFavorite('chords', 'G'), true);
  assert.equal(app.learn.toggleFavorite('chords', 'G'), false);
  app.learn.setGoals({ dailyMinutes: 30 }); assert.equal(app.learn.goals().dailyMinutes, 30);
  const r = app.learn.saveRoutine(makeRoutine('A', [{ exerciseId: 'x', minutes: 5 }]));
  assert.equal(app.learn.routines().length, 1); app.learn.deleteRoutine(r.id); assert.equal(app.learn.routines().length, 0);
});
