// Web Worker (módulo): roda a análise fora da thread da interface.
import { analyze } from './analysis.js';
self.onmessage = async (e) => {
  const { samples, sr, opts } = e.data;
  try { self.postMessage({ type: 'done', res: await analyze(samples, sr, { ...opts, onProgress: (p) => self.postMessage({ type: 'progress', p }) }) }); }
  catch (err) { self.postMessage({ type: 'error', message: err.message }); }
};
