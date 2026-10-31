// Análise ESTIMADA de uma gravação: andamento, 1ª batida, acordes e tonalidade.
// LIMITES (mostrados ao usuário): sem separação de instrumentos; sem tablatura; acordes por correlação de croma
// (bom em violão/piano/pop limpo; fraco com distorção, voz dominante, jazz denso); tudo corrigível à mão.
import { fft, hann, downsample } from './dsp.js';
import { symbolOf } from './chordnames.js';
import { pcName } from '../music/theory.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- andamento ----------
const ON_N = 512, ON_HOP = 128;

export async function onsetEnvelope(x, sr, prog = () => {}) {
  const w = hann(ON_N), re = new Float32Array(ON_N), im = new Float32Array(ON_N);
  const frames = Math.max(0, Math.floor((x.length - ON_N) / ON_HOP));
  const prev = new Float32Array(ON_N / 2), env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const o = f * ON_HOP;
    for (let i = 0; i < ON_N; i++) { re[i] = x[o + i] * w[i]; im[i] = 0; }
    fft(re, im);
    let flux = 0;
    for (let k = 1; k < ON_N / 2; k++) {
      const m = Math.log1p(80 * Math.hypot(re[k], im[k]) / ON_N);
      const d = m - prev[k]; if (d > 0) flux += d; prev[k] = m;
    }
    env[f] = flux;
    if (f % 400 === 0) { prog(f / frames); await tick(); }
  }
  // remove média local (~0.5 s) e retifica
  const fr = sr / ON_HOP, half = Math.round(fr * 0.25), out = new Float32Array(frames);
  const cs = new Float64Array(frames + 1); for (let i = 0; i < frames; i++) cs[i + 1] = cs[i] + env[i];
  for (let i = 0; i < frames; i++) { const a = Math.max(0, i - half), b = Math.min(frames, i + half + 1); out[i] = Math.max(0, env[i] - (cs[b] - cs[a]) / (b - a)); }
  return { env: out, frameRate: fr };
}

export function estimateTempo(env, fr) {
  const n = env.length;
  if (n < fr * 4) return { bpm: 0, confidence: 0, alternatives: [] };
  let mean = 0; for (let i = 0; i < n; i++) mean += env[i]; mean /= n;
  const e = new Float32Array(n); for (let i = 0; i < n; i++) e[i] = env[i] - mean;
  const maxLag = Math.ceil(fr * 60 / 50) * 2 + 3, acf = new Float64Array(maxLag + 1);
  for (let l = 0; l <= maxLag; l++) { let s = 0; for (let i = 0; i + l < n; i++) s += e[i] * e[i + l]; acf[l] = s / (n - l); }
  const a0 = acf[0] || 1e-9, at = (L) => { const i = Math.floor(L), f = L - i; return ((acf[i] ?? 0) * (1 - f) + (acf[i + 1] ?? 0) * f) / a0; };
  const scores = [];
  for (let bpm = 55; bpm <= 215; bpm += 0.5) {
    const L = fr * 60 / bpm;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 115) / 0.85) ** 2);
    scores.push({ bpm, s: (at(L) + 0.5 * at(2 * L)) * prior, raw: at(L) });
  }
  let bi = 0; scores.forEach((c, i) => { if (c.s > scores[bi].s) bi = i; });
  // refinamento parabólico
  let bpm = scores[bi].bpm;
  if (bi > 0 && bi < scores.length - 1) {
    const y0 = scores[bi - 1].s, y1 = scores[bi].s, y2 = scores[bi + 1].s, d = y0 - 2 * y1 + y2;
    if (d < 0) bpm += 0.5 * ((y0 - y2) / (2 * d));
  }
  const base = scores.reduce((a, c) => a + Math.max(0, c.s), 0) / scores.length;
  const confidence = clamp((scores[bi].s - base) / (scores[bi].s + 1e-9) * (scores[bi].raw > 0.05 ? 1 : 0.4), 0, 1);
  const alt = [bpm * 2, bpm / 2].filter((v) => v >= 40 && v <= 240).map((v) => Math.round(v * 10) / 10);
  return { bpm: Math.round(bpm * 10) / 10, confidence, alternatives: alt };
}

// 1ª batida: fase que maximiza a soma do envelope sobre a grade de batidas. Retorna segundos.
export function estimateOffset(env, fr, bpm) {
  const P = fr * 60 / bpm; let best = 0, bestS = -1;
  for (let ph = 0; ph < P; ph += 0.5) {
    let s = 0; for (let t = ph; t < env.length - 1; t += P) { const i = Math.floor(t), f = t - i; s += env[i] * (1 - f) + env[i + 1] * f; }
    if (s > bestS) { bestS = s; best = ph; }
  }
  // o fluxo espectral sobe quando a energia entra na janela; compensa meia janela
  return Math.max(0, (best + 0.0) / fr - (ON_N / 2 - ON_HOP) / (fr * ON_HOP) * 0);
}

// ---------- croma e acordes ----------
const CH_N = 4096, CH_HOP = 2048;

export async function chromaFrames(x, sr, prog = () => {}) {
  const w = hann(CH_N), re = new Float32Array(CH_N), im = new Float32Array(CH_N);
  const frames = Math.max(0, Math.floor((x.length - CH_N) / CH_HOP));
  const kMin = Math.ceil(60 * CH_N / sr), kMax = Math.min(CH_N / 2 - 1, Math.floor(2000 * CH_N / sr));
  const map = new Int8Array(kMax + 1).fill(-1);
  for (let k = kMin; k <= kMax; k++) { const m = 69 + 12 * Math.log2((k * sr / CH_N) / 440), r = Math.round(m); if (Math.abs(m - r) < 0.32) map[k] = ((r % 12) + 12) % 12; }
  const out = [];
  for (let f = 0; f < frames; f++) {
    const o = f * CH_HOP; for (let i = 0; i < CH_N; i++) { re[i] = x[o + i] * w[i]; im[i] = 0; }
    fft(re, im);
    const c = new Float32Array(12);
    for (let k = kMin; k <= kMax; k++) if (map[k] >= 0) c[map[k]] += Math.sqrt(Math.hypot(re[k], im[k]));
    out.push({ t: (o + CH_N / 2) / sr, c });
    if (f % 40 === 0) { prog(f / frames); await tick(); }
  }
  return out;
}

const TEMPLATES = [
  { id: 'maj', w: [[0, 1], [4, 0.85], [7, 0.75]], bias: 0 },
  { id: 'min', w: [[0, 1], [3, 0.85], [7, 0.75]], bias: 0 },
  { id: '7', w: [[0, 1], [4, 0.85], [7, 0.7], [10, 0.6]], bias: -0.05 },
  { id: 'maj7', w: [[0, 1], [4, 0.85], [7, 0.7], [11, 0.6]], bias: -0.06 },
  { id: 'm7', w: [[0, 1], [3, 0.85], [7, 0.7], [10, 0.6]], bias: -0.05 },
];
const STATES = []; // 12 raízes x 5 qualidades
for (const t of TEMPLATES) for (let r = 0; r < 12; r++) { const v = new Float32Array(12); for (const [i, wt] of t.w) v[(r + i) % 12] = wt; const nn = Math.hypot(...v); STATES.push({ root: r, q: t.id, v: v.map((a) => a / nn), bias: t.bias }); }

const normalize = (c) => { const n = Math.hypot(...c) || 1; return c.map((a) => a / n); };

// Segmentos [t0,t1) -> croma médio por segmento
export function segmentChroma(frames, bounds) {
  return bounds.slice(0, -1).map((t0, i) => {
    const t1 = bounds[i + 1], acc = new Float32Array(12); let n = 0;
    for (const f of frames) if (f.t >= t0 && f.t < t1) { for (let k = 0; k < 12; k++) acc[k] += f.c[k]; n++; }
    return { t0, t1, c: acc, n };
  });
}

// Viterbi com penalidade uniforme de troca (suaviza trocas espúrias).
export function decodeChords(segs, penalty = 0.3) {
  const S = STATES.length + 1, T = segs.length;
  if (!T) return [];
  const energy = segs.map((s) => s.c.reduce((a, b) => a + b, 0)), maxE = Math.max(...energy) || 1;
  const emit = segs.map((s, i) => {
    const silent = energy[i] < 0.06 * maxE || s.n === 0, c = normalize(s.c), e = new Float32Array(S);
    for (let k = 0; k < STATES.length; k++) { let d = 0; for (let j = 0; j < 12; j++) d += c[j] * STATES[k].v[j]; e[k] = (d + STATES[k].bias) * (silent ? 0.1 : 1); }
    e[S - 1] = silent ? 0.9 : 0.25;
    return e;
  });
  let dp = Float32Array.from(emit[0]); const back = [];
  for (let t = 1; t < T; t++) {
    let mi = 0; for (let s = 1; s < S; s++) if (dp[s] > dp[mi]) mi = s;
    const nd = new Float32Array(S), bp = new Int16Array(S);
    for (let s = 0; s < S; s++) { if (dp[s] >= dp[mi] - penalty) { nd[s] = dp[s] + emit[t][s]; bp[s] = s; } else { nd[s] = dp[mi] - penalty + emit[t][s]; bp[s] = mi; } }
    dp = nd; back.push(bp);
  }
  let s = 0; for (let k = 1; k < S; k++) if (dp[k] > dp[s]) s = k;
  const path = new Int16Array(T); path[T - 1] = s;
  for (let t = T - 1; t > 0; t--) path[t - 1] = back[t - 1][path[t]];
  const out = [];
  for (let t = 0; t < T; t++) {
    const st = path[t], sym = st === S - 1 ? null : symbolOf(STATES[st].root, STATES[st].q);
    if (!out.length || out[out.length - 1].symbol !== sym) out.push({ t: segs[t].t0, symbol: sym, conf: sym ? emit[t][st] : 0, n: 1 });
    else { const l = out[out.length - 1]; l.conf = (l.conf * l.n + (sym ? emit[t][st] : 0)) / (l.n + 1); l.n++; }
  }
  return out.map(({ t, symbol, conf }) => ({ t: Math.round(t * 1000) / 1000, symbol, conf: Math.round(conf * 100) / 100, manual: false }));
}

// ---------- tonalidade (Krumhansl-Kessler) ----------
const KMAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KMIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const corr = (a, b) => { const ma = a.reduce((x, y) => x + y) / 12, mb = b.reduce((x, y) => x + y) / 12; let n = 0, da = 0, db = 0; for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / (Math.sqrt(da * db) || 1); };

export function estimateKey(chroma) {
  const rs = [];
  for (let r = 0; r < 12; r++) for (const [mode, prof] of [['maior', KMAJ], ['menor', KMIN]]) rs.push({ root: r, mode, r: corr(chroma, prof.map((_, i) => prof[(i - r + 12) % 12])) });
  rs.sort((a, b) => b.r - a.r);
  const margin = rs[0].r - rs[1].r;
  return { root: rs[0].root, mode: rs[0].mode, name: `${pcName(rs[0].root)} ${rs[0].mode}`, correlation: Math.round(rs[0].r * 100) / 100, confidence: clamp(rs[0].r * 0.6 + margin * 3, 0, 1), runnerUp: `${pcName(rs[1].root)} ${rs[1].mode}` };
}

export const LIMITS = [
  'Resultado estimado automaticamente; confira e corrija.',
  'Acordes vêm de correlação de notas (croma), sem separar instrumentos: voz, distorção e harmonias densas reduzem a precisão.',
  'Um arquivo de áudio não contém tablatura nem eventos de cordas; o app não os inventa.',
];

// Beat grid -> fronteiras dos segmentos de acorde
export function segmentBounds(duration, bpm, offset, confident) {
  const beat = 60 / bpm, len = confident ? beat * Math.max(1, Math.ceil(0.5 / beat)) : 0.6;
  const start = confident ? offset - Math.floor(offset / len) * len : 0, b = [];
  for (let t = start; t < duration + len; t += len) b.push(t);
  if (b[0] > 0) b.unshift(0);
  return b;
}

// ---------- pipeline completo ----------
export async function analyze(samples, sr, { onProgress = () => {}, bpmHint = null } = {}) {
  const { x, sr: s2 } = downsample(samples, sr, 11025);
  const duration = samples.length / sr;
  const p = (a, b) => (v) => onProgress(a + (b - a) * v);
  const { env, frameRate } = await onsetEnvelope(x, s2, p(0, 0.35));
  const tempo = estimateTempo(env, frameRate);
  const bpm = bpmHint || tempo.bpm || 100;
  const offset = estimateOffset(env, frameRate, bpm);
  onProgress(0.4);
  const frames = await chromaFrames(x, s2, p(0.4, 0.88));
  const confident = tempo.confidence >= 0.3 || !!bpmHint;
  const segs = segmentChroma(frames, segmentBounds(duration, bpm, offset, confident));
  const chords = decodeChords(segs);
  const total = new Float32Array(12); for (const f of frames) for (let k = 0; k < 12; k++) total[k] += f.c[k];
  const key = estimateKey(Array.from(total));
  onProgress(1);
  return { duration, bpm: { value: bpm, confidence: tempo.confidence, alternatives: tempo.alternatives, offset, source: bpmHint ? 'manual' : 'estimado' }, key, chords, limits: LIMITS };
}
