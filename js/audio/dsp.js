// DSP puro (sem Web Audio, sem DOM): testável em Node. Usado pelo motor, pelo afinador e pelos testes.
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

// PRNG determinístico (mulberry32): mesma corda soa igual, e testes são reproduzíveis.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- distorção ----------
// Curva de transferência do WaveShaper, x em [-1,1] -> y em [-1,1], monotônica.
//  overdrive: tanh com leve assimetria (harmônicos pares, compressão suave).
//  distortion: clip duro suavizado e simétrico, com ganho muito maior.
export function driveCurve(amount, mode, n = 2048) {
  const c = new Float32Array(n), a = clamp(amount, 0, 1);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    if (mode === 'overdrive') {
      const k = 1 + a * 9, b = 0.18 * a;
      c[i] = (Math.tanh(k * x + b) - Math.tanh(b)) / (1 + Math.tanh(b));
    } else if (mode === 'distortion') {
      const v = (6 + a * 54) * x;
      c[i] = v / Math.pow(1 + Math.pow(Math.abs(v), 4), 0.25);
    } else c[i] = x;
  }
  return c;
}

// ---------- corda dedilhada (Karplus-Strong com afinação fracionária) ----------
// opts: { brightness 0..1 (brilho do laço), t60 (s, tempo de decaimento), soft 0..1 (maciez do ataque, nylon),
//         pluckPos 0..0.5 (posição da palhetada), seed, gain }
// Atraso total do laço = N + (1-a) [filtro passa-baixas de 2 pontos] + d [all-pass fracionário], d em [0.5,1.5):
// assim a afinação fica dentro de poucos cents mesmo nas notas agudas.
export function karplusStrong(sr, freq, seconds, o = {}) {
  const brightness = clamp(o.brightness ?? 0.6, 0, 1), t60 = o.t60 ?? 3, soft = clamp(o.soft ?? 0, 0, 1);
  const a = lerp(0.5, 0.98, brightness);                       // peso da amostra atual no filtro do laço
  const L = sr / freq, N = Math.max(2, Math.floor(L - (1 - a) - 0.5)), d = L - (1 - a) - N;
  const C = (1 - d) / (1 + d);
  const loopGain = Math.pow(10, (-3 * (1 / freq)) / t60);      // perda por volta para atingir -60 dB em t60
  const rand = rng(o.seed ?? Math.round(freq * 100));
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) buf[i] = rand() * 2 - 1;
  if (soft > 0) { let y = 0; const k = lerp(1, 0.18, soft); for (let i = 0; i < N; i++) { y += (buf[i] - y) * k; buf[i] = y; } }
  const pp = Math.round(clamp(o.pluckPos ?? 0.18, 0.02, 0.5) * N);       // pente: remove harmônicos da posição de ataque
  if (pp > 0) for (let i = N - 1; i >= pp; i--) buf[i] -= buf[i - pp] * 0.9;
  let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(buf[i]));
  const norm = peak > 0 ? 1 / peak : 1;
  for (let i = 0; i < N; i++) buf[i] *= norm;
  const len = Math.floor(sr * seconds), out = new Float32Array(len);
  let p = 0, prev = 0, apX = 0, apY = 0;
  const fade = Math.floor(sr * 0.05);
  for (let i = 0; i < len; i++) {
    const s = buf[p];
    out[i] = s;
    const lp = a * s + (1 - a) * prev; prev = s;
    const ap = C * lp + apX - C * apY; apX = lp; apY = ap;
    buf[p] = ap * loopGain;
    if (++p === N) p = 0;
    if (i > len - fade) out[i] *= (len - i) / fade;            // fade final: sem estalo ao terminar
  }
  return out;
}

// ---------- reverb: resposta ao impulso estéreo gerada ----------
export function reverbIR(sr, seconds, damp = 0.5, seed = 7) {
  const n = Math.max(64, Math.floor(sr * seconds)), L = new Float32Array(n), R = new Float32Array(n), rand = rng(seed);
  const k = lerp(0.9, 0.12, clamp(damp, 0, 1));                 // damp alto = agudos somem mais rápido
  for (const ch of [L, R]) {
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n, env = Math.exp(-6.9 * t);
      y += ((rand() * 2 - 1) - y) * lerp(k, k * 0.35, t);
      ch[i] = y * env * (i < sr * 0.004 ? i / (sr * 0.004) : 1);
    }
  }
  return [L, R];
}

// ---------- afinador: YIN ----------
// Estima a frequência fundamental. Retorna { freq, prob } (freq=0 se não houver tom claro).
export function yin(buf, sr, { minHz = 50, maxHz = 1200, threshold = 0.12 } = {}) {
  const tauMax = Math.min(Math.floor(sr / minHz), buf.length >> 1), tauMin = Math.max(2, Math.floor(sr / maxHz));
  const W = buf.length - tauMax;
  if (W < 32) return { freq: 0, prob: 0 };
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) { let s = 0; for (let j = 0; j < W; j++) { const x = buf[j] - buf[j + tau]; s += x * x; } d[tau] = s; }
  const dn = new Float32Array(tauMax + 1); dn[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= tauMax; tau++) { run += d[tau]; dn[tau] = run === 0 ? 1 : (d[tau] * tau) / run; }
  let tau = -1;
  for (let t = tauMin; t < tauMax; t++) {
    if (dn[t] < threshold) { while (t + 1 < tauMax && dn[t + 1] < dn[t]) t++; tau = t; break; }
  }
  if (tau < 0) { let best = tauMin; for (let t = tauMin; t <= tauMax; t++) if (dn[t] < dn[best]) best = t; if (dn[best] > 0.35) return { freq: 0, prob: 0 }; tau = best; }
  let t0 = tau;                                                    // interpolação parabólica
  if (tau > 1 && tau < tauMax) {
    const s0 = dn[tau - 1], s1 = dn[tau], s2 = dn[tau + 1], den = s0 + s2 - 2 * s1;
    if (Math.abs(den) > 1e-12) t0 = tau + (s0 - s2) / (2 * den);
  }
  return { freq: sr / t0, prob: clamp(1 - dn[tau], 0, 1) };
}

export const centsBetween = (f, ref) => 1200 * Math.log2(f / ref);
export const peakOf = (arr) => { let m = 0; for (let i = 0; i < arr.length; i++) { const v = Math.abs(arr[i]); if (v > m) m = v; } return m; };
export const rmsOf = (arr) => { let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i]; return Math.sqrt(s / arr.length); };
