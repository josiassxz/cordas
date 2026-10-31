// DSP puro (sem Web Audio): FFT, janela, mono, reamostragem simples e picos para a forma de onda.

// FFT radix-2 in-place. re/im: Float32Array|Float64Array de tamanho potência de 2.
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

export const hann = (n) => { const w = new Float32Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)); return w; };

// Espectro de magnitude (n/2 bins) de um trecho x[start..start+n) com janela w.
export function magnitudes(x, start, n, w, re, im, out) {
  for (let i = 0; i < n; i++) { const v = x[start + i]; re[i] = (v === undefined ? 0 : v) * w[i]; im[i] = 0; }
  fft(re, im);
  for (let k = 0; k < n / 2; k++) out[k] = Math.hypot(re[k], im[k]);
  return out;
}

export function toMono(channels) {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length, out = new Float32Array(n), c = channels.length;
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < c; k++) s += channels[k][i]; out[i] = s / c; }
  return out;
}

// Reamostragem por média de blocos (fator inteiro). Basta para análise (≤ ~5 kHz de banda).
export function downsample(x, sr, target = 11025) {
  const f = Math.max(1, Math.round(sr / target));
  if (f === 1) return { x, sr };
  const n = Math.floor(x.length / f), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; const o = i * f; for (let k = 0; k < f; k++) s += x[o + k]; out[i] = s / f; }
  return { x: out, sr: sr / f };
}

// Picos (0..1) em n colunas para desenhar a forma de onda.
export function peaks(x, n = 800) {
  const out = new Float32Array(n), step = x.length / n;
  let max = 1e-9;
  for (let i = 0; i < n; i++) {
    let m = 0; const a = Math.floor(i * step), b = Math.min(x.length, Math.floor((i + 1) * step) || a + 1);
    for (let j = a; j < b; j++) { const v = Math.abs(x[j]); if (v > m) m = v; }
    out[i] = m; if (m > max) max = m;
  }
  for (let i = 0; i < n; i++) out[i] /= max;
  return out;
}
