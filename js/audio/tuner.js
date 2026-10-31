// Afinador. Parte pura (afinações, análise de nota/cents) + MicTuner (microfone, só no navegador).
// IMPORTANTE: a AG01 envia notas MIDI já quantizadas; não existe "cents" no sinal dela.
// A medição de afinação fina só é possível ouvindo o SOM da corda pelo microfone.
import { yin, rmsOf, centsBetween } from './dsp.js';

export const TUNINGS = [
  { id: 'standard', name: 'Padrão (E A D G B E)', midi: [40, 45, 50, 55, 59, 64] },
  { id: 'dropd', name: 'Drop D (D A D G B E)', midi: [38, 45, 50, 55, 59, 64] },
  { id: 'halfdown', name: 'Meio tom abaixo (Eb Ab Db Gb Bb Eb)', midi: [39, 44, 49, 54, 58, 63] },
  { id: 'dadgad', name: 'DADGAD', midi: [38, 45, 50, 55, 57, 62] },
  { id: 'opend', name: 'Open D (D A D F# A D)', midi: [38, 45, 50, 54, 57, 62] },
  { id: 'openg', name: 'Open G (D G D G B D)', midi: [38, 43, 50, 55, 59, 62] },
];
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const hzOf = (midi) => 440 * 2 ** ((midi - 69) / 12);
export const midiOfHz = (f) => 69 + 12 * Math.log2(f / 440);
export const noteLabel = (midi) => NAMES[((Math.round(midi) % 12) + 12) % 12];

// Dada uma frequência medida, acha a corda-alvo mais próxima e o desvio em cents.
export function analyzePitch(freq, tuning = TUNINGS[0].midi) {
  if (!(freq > 0)) return null;
  const m = midiOfHz(freq), nearest = Math.round(m);
  let best = null;
  tuning.forEach((tm, string) => { const c = centsBetween(freq, hzOf(tm)); if (!best || Math.abs(c) < Math.abs(best.cents)) best = { string, targetMidi: tm, targetHz: hzOf(tm), cents: c }; });
  return { freq, note: noteLabel(nearest), noteCents: (m - nearest) * 100, ...best, inRange: Math.abs(best.cents) <= 600 };
}
export const inTune = (cents, tol = 5) => Math.abs(cents) <= tol;

// Microfone -> YIN. Não ouve nada até start() (o navegador pede permissão).
export class MicTuner {
  constructor(onReading) { this.onReading = onReading; this.ctx = null; this.stream = null; this.timer = null; this.hist = []; }
  get supported() { return !!navigator.mediaDevices?.getUserMedia; }
  async start() {
    if (!this.supported) throw new Error('Este navegador não permite acesso ao microfone.');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    this.ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    const src = this.ctx.createMediaStreamSource(this.stream), an = this.ctx.createAnalyser();
    an.fftSize = 4096; src.connect(an);                          // não vai para a saída: sem microfonia
    const buf = new Float32Array(an.fftSize);
    this.timer = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      const rms = rmsOf(buf);
      if (rms < 0.008) { this.hist = []; this.onReading({ rms, freq: 0 }); return; }
      const { freq, prob } = yin(buf, this.ctx.sampleRate);
      if (!freq || prob < 0.8) { this.onReading({ rms, freq: 0 }); return; }
      this.hist.push(freq); if (this.hist.length > 5) this.hist.shift();
      const med = [...this.hist].sort((a, b) => a - b)[this.hist.length >> 1];   // mediana: ignora saltos de oitava isolados
      this.onReading({ rms, freq: med, prob });
    }, 60);
  }
  stop() { clearInterval(this.timer); this.timer = null; this.stream?.getTracks().forEach((t) => t.stop()); this.ctx?.close(); this.ctx = null; this.stream = null; this.hist = []; }
}
