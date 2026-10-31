// Próxima recomendação: reforço das fraquezas primeiro; senão, o próximo passo da trilha atual; senão, começar.
import { weakTechniques, techniqueLabel } from './stats.js';
import { nextStep } from '../content/paths.js';

export function recommend({ sessions, progress, now = Date.now() }) {
  const weak = weakTechniques(sessions, { now })[0];
  const nx = nextStep(progress);
  if (weak) {
    const level = nx?.path.level ?? 1;
    return { type: 'reinforce', technique: weak.technique, level, title: `Reforçar ${techniqueLabel(weak.technique).toLowerCase()}`,
      reason: `Precisão média de ${weak.avgAccuracy}% nas últimas ${weak.sessions} sessões.`, step: nx?.step ?? null };
  }
  if (nx) {
    const first = !sessions.length;
    return { type: first ? 'start' : 'path', technique: nx.step.technique, level: nx.path.level, step: nx.step, pathId: nx.path.id,
      title: nx.step.title, reason: first ? 'Um bom primeiro passo na trilha Iniciante.' : `Próximo passo da trilha ${nx.path.name}.` };
  }
  return { type: 'free', technique: null, level: 5, title: 'Trilhas concluídas', reason: 'Pratique livremente ou aumente o BPM dos seus exercícios favoritos.', step: null };
}

export const lastSession = (sessions) => sessions[sessions.length - 1] || null;
export const levelOf = (progress) => (nextStep(progress)?.path.level ?? 5);
