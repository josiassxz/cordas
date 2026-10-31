// Trilhas de aprendizado: ESPECIFICAÇÕES. Os exercícios concretos são resolvidos em tempo de execução
// a partir de js/content/exercises.js (frente Prática) por técnica + nível; sem biblioteca, o passo fica "pendente".
// Critério de conclusão: `sessions` sessões da técnica, nos níveis do passo, com precisão >= `minAccuracy`.
const step = (id, technique, title, hint, levels, o = {}) => ({ id, technique, title, hint, levels, criteria: { minAccuracy: o.acc ?? 80, sessions: o.n ?? 2 } });

export const PATHS = [
  { id: 'iniciante', name: 'Iniciante', level: 1, desc: 'Do primeiro acorde à primeira música.', steps: [
    step('i-acordes', 'chords', 'Primeiros acordes abertos', 'Em, Am, E, A, D: forma certa e todas as cordas soando.', [1, 2]),
    step('i-palhetada', 'strumming', 'Palhetada para baixo e para cima', 'Direção e tempo constantes em um acorde só.', [1, 2]),
    step('i-ritmo', 'rhythm', 'Primeiros ritmos', 'Padrões simples de 8 colcheias com metrônomo.', [1, 2]),
    step('i-troca', 'chord-change', 'Troca de dois acordes', 'Em ↔ Am sem parar o ritmo.', [1, 2], { acc: 70 }),
    step('i-arpejo', 'arpeggio', 'Arpejos básicos', 'Cordas na ordem certa, devagar.', [1, 2], { acc: 70 }),
    step('i-escala', 'scale', 'Primeira escala', 'Pentatônica menor na posição 1.', [1, 2], { acc: 70 }),
  ] },
  { id: 'intermediario', name: 'Intermediário', level: 3, desc: 'Velocidade, pestanas e independência.', steps: [
    step('m-acordes', 'chords', 'Pestanas e acordes com sétima', 'F, Bm, G7, Cmaj7 limpos.', [3]),
    step('m-palhetada', 'picking', 'Palhetada alternada', 'Precisão em cordas individuais.', [3]),
    step('m-ritmo', 'rhythm', 'Padrões com contratempo', 'Colcheias contínuas e reggae.', [3]),
    step('m-troca', 'chord-change', 'Progressões completas', 'Quatro acordes no andamento.', [3]),
    step('m-arpejo', 'arpeggio', 'Arpejos por acorde', 'Padrões ascendentes e descendentes.', [3]),
    step('m-dedilhado', 'fingerpicking', 'Dedilhado PIMA', 'Polegar alternado com baixos.', [3], { acc: 75 }),
    step('m-escala', 'scale', 'Escalas em várias posições', 'Maior e pentatônicas.', [3]),
    step('m-tecnicas', 'legato', 'Ligados', 'Hammer-on e pull-off (indicação pedagógica).', [3], { acc: 70 }),
  ] },
  { id: 'avancado', name: 'Avançado', level: 4, desc: 'Fluência, velocidade e expressão.', steps: [
    step('a-acordes', 'chords', 'Voicings e acordes estendidos', '9ª, 11ª e 13ª; inversões.', [4, 5], { acc: 75 }),
    step('a-palhetada', 'picking', 'Velocidade de palhetada', 'Aumente o BPM mantendo a precisão.', [4, 5], { acc: 75 }),
    step('a-ritmo', 'rhythm', 'Ritmos sincopados', 'Padrões com pausas e mudança de direção.', [4, 5], { acc: 75 }),
    step('a-troca', 'chord-change', 'Trocas rápidas', 'Acordes com pestana em andamento alto.', [4, 5], { acc: 75 }),
    step('a-dedilhado', 'fingerpicking', 'Fingerstyle com melodia', 'Melodia e baixo simultâneos.', [4, 5], { acc: 75 }),
    step('a-escala', 'scale', 'Sequências melódicas', 'Escalas em sequências e velocidade.', [4, 5], { acc: 75 }),
    step('a-melodia', 'melody', 'Melodias', 'Frases com ritmo variado.', [4, 5], { acc: 75 }),
  ] },
];

export const stepById = (id) => PATHS.flatMap((p) => p.steps.map((s) => ({ ...s, pathId: p.id }))).find((s) => s.id === id);

// Progresso de um passo a partir do histórico (derivado; é sempre recalculável).
export function stepProgress(st, sessions) {
  const q = sessions.filter((s) => s.technique === st.technique && s.accuracy !== null && (s.level == null || st.levels.includes(s.level)) && s.accuracy >= st.criteria.minAccuracy);
  return { qualifying: Math.min(q.length, st.criteria.sessions), needed: st.criteria.sessions, done: q.length >= st.criteria.sessions };
}

export function pathProgress(path, sessions, completed = {}) {
  const steps = path.steps.map((st) => { const p = stepProgress(st, sessions); const done = p.done || !!completed[st.id]; return { ...st, ...p, done }; });
  return { ...path, steps, doneCount: steps.filter((s) => s.done).length, total: steps.length, done: steps.every((s) => s.done) };
}

// Resolve os exercícios de um passo via biblioteca (opcional). catalog = { getExercises(filter) }.
export function resolveStep(st, catalog) {
  if (!catalog?.getExercises) return { available: false, exercises: [] };
  try {
    const seen = new Set(), list = [];
    for (const level of st.levels) for (const e of catalog.getExercises({ technique: st.technique, level }) || []) if (!seen.has(e.id)) { seen.add(e.id); list.push(e); }
    return { available: list.length > 0, exercises: list };
  } catch { return { available: false, exercises: [] }; }
}

export function nextStep(progressList) {
  for (const p of progressList) { const s = p.steps.find((x) => !x.done); if (s) return { path: p, step: s }; }
  return null;
}
