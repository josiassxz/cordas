// Executa a análise em Worker; se o navegador não permitir, cai para a thread principal em blocos (com yields).
import { analyze } from './analysis.js';

export function runAnalysis(samples, sr, { onProgress = () => {}, bpmHint = null } = {}) {
  return new Promise((resolve, reject) => {
    let worker;
    try { worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); } catch { worker = null; }
    const fallback = () => analyze(samples, sr, { onProgress, bpmHint }).then(resolve, reject);
    if (!worker) return fallback();
    worker.onmessage = (e) => {
      if (e.data.type === 'progress') onProgress(e.data.p);
      else if (e.data.type === 'done') { worker.terminate(); resolve(e.data.res); }
      else { worker.terminate(); reject(new Error(e.data.message)); }
    };
    worker.onerror = () => { worker.terminate(); fallback(); };
    const copy = samples.slice();
    worker.postMessage({ samples: copy, sr, opts: { bpmHint } }, [copy.buffer]);
  });
}
