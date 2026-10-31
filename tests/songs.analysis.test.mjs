import test from 'node:test';
import assert from 'node:assert/strict';
import { fft, peaks, toMono, downsample } from '../js/songs/dsp.js';
import { encodeWav, decodeWav } from '../js/songs/wav.js';
import { analyze, onsetEnvelope, estimateTempo, estimateOffset } from '../js/songs/analysis.js';

const SR = 22050;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

function clicks(bpm, secs, first = 0.25) {
  const x = new Float32Array(Math.floor(SR * secs)), step = 60 / bpm;
  for (let t = first; t < secs - 0.05; t += step) { const s = Math.floor(t * SR); for (let i = 0; i < 300; i++) x[s + i] += Math.exp(-i / 60) * Math.sin(2 * Math.PI * 1500 * i / SR); }
  return x;
}
// acorde com harmônicos (violão/piano simplificado) + baixo na raiz
function chordSignal(chords, secPer) {
  const x = new Float32Array(Math.floor(SR * secPer * chords.length));
  chords.forEach((notes, c) => {
    for (const m of notes) for (let h = 1; h <= 4; h++) {
      const f = mtof(m) * h, a = 1 / h, o = Math.floor(c * secPer * SR);
      for (let i = 0; i < secPer * SR; i++) x[o + i] += a * 0.2 * Math.sin(2 * Math.PI * f * i / SR) * Math.min(1, i / 400) * Math.min(1, (secPer * SR - i) / 400);
    }
  });
  return x;
}
const C = [48, 60, 64, 67], G = [43, 59, 62, 67], Am = [45, 57, 60, 64], F = [41, 57, 60, 65];

test('FFT: senoide de 1 kHz cai no bin certo e Parseval fecha', () => {
  const n = 1024, re = new Float32Array(n), im = new Float32Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.sin(2 * Math.PI * 64 * i / n);
  const e0 = re.reduce((a, v) => a + v * v, 0);
  fft(re, im);
  const mag = re.map((v, i) => Math.hypot(v, im[i]));
  assert.equal(mag.indexOf(Math.max(...mag.slice(0, n / 2))), 64);
  const e1 = mag.reduce((a, v) => a + v * v, 0) / n;
  assert.ok(Math.abs(e0 - e1) / e0 < 1e-4);
});

test('WAV: codifica e decodifica sem perda audível; mono/downsample/picos', () => {
  const x = clicks(100, 2), w = decodeWav(encodeWav(x, SR));
  assert.equal(w.sampleRate, SR); assert.ok(Math.abs(w.duration - 2) < 1e-3);
  assert.ok(Math.abs(w.channels[0][Math.floor(0.25 * SR) + 5] - x[Math.floor(0.25 * SR) + 5]) < 1e-3);
  assert.equal(toMono([x, x]).length, x.length);
  assert.equal(downsample(x, SR, 11025).sr, 11025);
  const p = peaks(x, 100); assert.equal(p.length, 100); assert.equal(Math.max(...p), 1);
});

for (const bpm of [70, 100, 128]) {
  test(`BPM: clique a ${bpm} BPM é estimado com ±1,5`, async () => {
    const { x, sr } = downsample(clicks(bpm, 24), SR, 11025);
    const { env, frameRate } = await onsetEnvelope(x, sr);
    const t = estimateTempo(env, frameRate);
    assert.ok(Math.abs(t.bpm - bpm) <= 1.5, `obteve ${t.bpm}`);
    assert.ok(t.confidence > 0.3, `confiança ${t.confidence}`);
    assert.ok(t.alternatives.some((a) => Math.abs(a - bpm * 2) < 3 || Math.abs(a - bpm / 2) < 3), 'alternativas ×2/÷2');
  });
}

test('Offset da 1ª batida dentro de 60 ms', async () => {
  const { x, sr } = downsample(clicks(100, 20, 0.3), SR, 11025);
  const { env, frameRate } = await onsetEnvelope(x, sr);
  const off = estimateOffset(env, frameRate, 100), step = 0.6;
  const err = Math.abs(((off - 0.3 + step / 2) % step + step) % step - step / 2);
  assert.ok(err < 0.06, `erro ${err}`);
});

test('Acordes: C – G – Am – F sintéticos viram os rótulos certos; tom C maior/Lá menor', async () => {
  const sig = chordSignal([C, G, Am, F, C, G, Am, F], 2);   // 16 s
  const res = await analyze(sig, SR, { bpmHint: 120 });
  const seq = res.chords.filter((c) => c.symbol).map((c) => c.symbol);
  assert.deepEqual(seq.slice(0, 8), ['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F']);
  assert.ok(['C maior', 'A menor'].includes(res.key.name), res.key.name);
  assert.equal(res.bpm.source, 'manual'); assert.ok(res.limits.length >= 3);
  // tempos plausíveis: cada acorde começa perto de múltiplos de 2 s
  res.chords.slice(0, 4).forEach((c, i) => assert.ok(Math.abs(c.t - i * 2) < 0.6, `${c.symbol} em ${c.t}`));
});

test('Acorde de sétima é reconhecido (G7) e silêncio vira sem acorde', async () => {
  const G7 = [43, 59, 62, 65, 67], sig = new Float32Array(SR * 8);
  sig.set(chordSignal([G7], 4), 0);                           // 0–4 s G7, 4–8 s silêncio
  const res = await analyze(sig, SR, { bpmHint: 120 });
  assert.equal(res.chords[0].symbol, 'G7');
  assert.equal(res.chords[res.chords.length - 1].symbol, null);
});
