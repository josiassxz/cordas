import test from 'node:test';
import assert from 'node:assert/strict';
import { driveCurve, karplusStrong, yin, reverbIR, centsBetween, peakOf } from '../js/audio/dsp.js';
import { analyzePitch, hzOf, TUNINGS, inTune } from '../js/audio/tuner.js';

const SR = 48000;
const sine = (f, n = 4096, a = 0.6) => Float32Array.from({ length: n }, (_, i) => a * Math.sin((2 * Math.PI * f * i) / SR));

test('curva de distorção: limitada, monotônica, e satura mais com mais drive', () => {
  for (const mode of ['overdrive', 'distortion']) for (const amt of [0, 0.3, 0.7, 1]) {
    const c = driveCurve(amt, mode);
    assert.equal(c.length, 2048);
    for (let i = 0; i < c.length; i++) { assert.ok(Math.abs(c[i]) <= 1.0001, `${mode} ${amt} fora de [-1,1]`); if (i) assert.ok(c[i] >= c[i - 1] - 1e-6, `${mode} ${amt} não monotônica em ${i}`); }
  }
  const at = (c, x) => c[Math.round(((x + 1) / 2) * (c.length - 1))];
  assert.ok(at(driveCurve(0.9, 'overdrive'), 0.1) > at(driveCurve(0.1, 'overdrive'), 0.1), 'mais drive = mais ganho em sinal fraco');
  assert.ok(at(driveCurve(0.8, 'distortion'), 0.1) > at(driveCurve(0.8, 'overdrive'), 0.1), 'distorção é mais agressiva que overdrive');
  const id = driveCurve(0.5, 'off'); assert.ok(Math.abs(at(id, 0.5) - 0.5) < 1e-3, 'off é identidade');
  const d = driveCurve(0.8, 'distortion'); assert.ok(Math.abs(at(d, 0.4) + at(d, -0.4)) < 1e-3, 'distorção simétrica');
});

test('overdrive é levemente assimétrico (harmônicos pares)', () => {
  const c = driveCurve(0.8, 'overdrive'), at = (x) => c[Math.round(((x + 1) / 2) * (c.length - 1))];
  assert.ok(Math.abs(at(0.3) + at(-0.3)) > 1e-3);
});

test('YIN mede senoides em várias frequências com erro < 1 cent', () => {
  for (const f of [82.41, 110, 196, 329.63, 440, 880]) {
    const r = yin(sine(f), SR); assert.ok(Math.abs(centsBetween(r.freq, f)) < 1, `${f} Hz -> ${r.freq}`); assert.ok(r.prob > 0.9);
  }
});

test('YIN mede cordas Karplus-Strong sintéticas (E2..E5) com erro < 3 cents', () => {
  for (const m of [40, 45, 50, 55, 59, 64, 76]) {
    const f = hzOf(m), w = karplusStrong(SR, f, 0.6, { brightness: 0.7, t60: 3 }), r = yin(w.slice(6000, 6000 + 4096), SR);
    assert.ok(Math.abs(centsBetween(r.freq, f)) < 3, `nota ${m}: ${f.toFixed(2)} Hz medido ${r.freq.toFixed(2)} (${centsBetween(r.freq, f).toFixed(2)} c)`);
  }
});

test('YIN rejeita silêncio e ruído', () => {
  assert.equal(yin(new Float32Array(4096), SR).freq, 0);
  let s = 1; const noise = Float32Array.from({ length: 4096 }, () => { s = (s * 1664525 + 1013904223) >>> 0; return (s / 4294967296 - 0.5) * 0.5; });
  assert.ok(yin(noise, SR).prob < 0.6);
});

test('Karplus-Strong: decai, respeita brilho e é determinístico', () => {
  const a = karplusStrong(SR, 196, 1.5, { brightness: 0.8, t60: 2 }), b = karplusStrong(SR, 196, 1.5, { brightness: 0.8, t60: 2 });
  assert.deepEqual(a.slice(0, 200), b.slice(0, 200));
  assert.ok(peakOf(a.slice(0, 4800)) > peakOf(a.slice(60000, 64800)) * 2, 'amplitude cai com o tempo');
  assert.ok(Number.isFinite(peakOf(a)) && peakOf(a) <= 1.5);
  const zc = (x) => { let n = 0; for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) n++; return n; };
  const bright = karplusStrong(SR, 196, 0.4, { brightness: 1, t60: 3 }).slice(2000, 12000), dark = karplusStrong(SR, 196, 0.4, { brightness: 0, t60: 3 }).slice(2000, 12000);
  assert.ok(zc(bright) >= zc(dark), 'brilho alto não é mais escuro que brilho baixo');
});

test('reverb IR: estéreo, decai e damp escurece', () => {
  const [L, R] = reverbIR(SR, 1, 0.5); assert.equal(L.length, SR); assert.notDeepEqual(L.slice(1000, 1100), R.slice(1000, 1100));
  assert.ok(peakOf(L.slice(0, 4800)) > peakOf(L.slice(40000, 48000)) * 5);
  const hf = (x) => { let s = 0; for (let i = 1; i < x.length; i++) s += Math.abs(x[i] - x[i - 1]); return s / (peakOf(x) || 1); };
  assert.ok(hf(reverbIR(SR, 1, 0.1)[0]) > hf(reverbIR(SR, 1, 0.95)[0]));
});

test('afinador: corda-alvo e cents', () => {
  const std = TUNINGS[0].midi;
  const exact = analyzePitch(hzOf(45), std); assert.equal(exact.string, 1); assert.ok(Math.abs(exact.cents) < 1e-6); assert.equal(exact.note, 'A');
  const sharp = analyzePitch(hzOf(45) * 2 ** (20 / 1200), std); assert.ok(Math.abs(sharp.cents - 20) < 0.01); assert.ok(!inTune(sharp.cents)); assert.ok(inTune(2));
  const dropD = analyzePitch(hzOf(38) * 2 ** (-12 / 1200), TUNINGS.find((t) => t.id === 'dropd').midi); assert.equal(dropD.string, 0); assert.ok(Math.abs(dropD.cents + 12) < 0.01);
  assert.equal(analyzePitch(0), null);
  assert.ok(TUNINGS.every((t) => t.midi.length === 6));
});
