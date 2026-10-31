// Tarefas pesadas no navegador: decodificar para mono e analisar (Worker), preservando correções manuais.
import { toMono } from './dsp.js';
import { runAnalysis } from './runner.js';
import { tidy } from './timeline.js';

// Mantém acordes corrigidos à mão; os automáticos só entram onde não há correção próxima.
export function mergeManual(auto, previous = []) {
  const manual = previous.filter((c) => c.manual);
  if (!manual.length) return auto;
  const keep = auto.filter((a) => !manual.some((m) => Math.abs(m.t - a.t) < 0.5));
  return tidy([...keep, ...manual]);
}

export async function decodeMono(app, blob) {
  const buf = await app.audio.context.decodeAudioData(await blob.arrayBuffer());
  return { mono: toMono(Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i))), sr: buf.sampleRate };
}

export async function analyzeSong(app, lib, id, { bpmHint = null, onProgress = () => {} } = {}) {
  const rec = await lib.audio(id); if (!rec) throw new Error('Áudio não encontrado.');
  const song = lib.get(id), { mono, sr } = await decodeMono(app, rec.blob);
  const res = await runAnalysis(mono, sr, { bpmHint, onProgress });
  const manualBpm = song.bpm?.source === 'manual' && !bpmHint ? song.bpm : null;
  return lib.update(id, {
    bpm: manualBpm || res.bpm, key: res.key, chords: mergeManual(res.chords, song.chords), analyzed: true, analysis: { limits: res.limits, at: Date.now() },
  });
}
