// Esquema versionado de preset, presets de fábrica, validação e mapeamento para a cadeia de áudio.
// Tudo puro (sem Web Audio): testável em Node.  Cada campo abaixo TEM efeito audível na cadeia (audio/chain.js).
import { clamp, lerp } from './dsp.js';

export const PRESET_VERSION = 1;

// Esquema: [min,max,padrão] = número · ['a','b'] = enum (1º é o padrão) · true/false = booleano com padrão
export const SCHEMA = {
  voice:   { type: ['steel', 'nylon', 'electric'], brightness: [0, 1, 0.6], sustain: [0, 1, 0.55], body: [0, 1, 0.5], pickup: [0, 1, 0.5] },
  comp:    { on: false, amount: [0, 1, 0.3] },
  drive:   { mode: ['off', 'overdrive', 'distortion'], amount: [0, 1, 0.4], tone: [0, 1, 0.5], level: [0, 1, 0.7], cab: true },
  eq:      { low: [-12, 12, 0], mid: [-12, 12, 0], high: [-12, 12, 0], presence: [-12, 12, 0] },
  chorus:  { on: false, rate: [0.1, 5, 0.8], depth: [0, 1, 0.4], mix: [0, 1, 0.3] },
  delay:   { on: false, time: [40, 1000, 320], sync: false, division: ['1/4', '1/8', '1/8d', '1/8t', '1/16', '1/4d'], feedback: [0, 0.9, 0.3], mix: [0, 1, 0.25] },
  reverb:  { on: false, size: [0.3, 3.5, 1.2], damp: [0, 1, 0.5], mix: [0, 1, 0.2] },
  volume:  [0, 1, 0.8],
};
export const DIVISION_BEATS = { '1/4': 1, '1/8': 0.5, '1/8d': 0.75, '1/8t': 1 / 3, '1/16': 0.25, '1/4d': 1.5 };

const isNum = (s) => Array.isArray(s) && typeof s[0] === 'number';
const isEnum = (s) => Array.isArray(s) && typeof s[0] === 'string';

function walk(schema, src, out, errors, path) {
  for (const [k, spec] of Object.entries(schema)) {
    const p = path ? `${path}.${k}` : k, v = src?.[k];
    if (isNum(spec)) {
      if (v === undefined) out[k] = spec[2];
      else if (typeof v !== 'number' || !Number.isFinite(v)) { errors.push(`${p}: número inválido`); out[k] = spec[2]; }
      else out[k] = clamp(v, spec[0], spec[1]);
    } else if (isEnum(spec)) {
      if (v === undefined) out[k] = spec[0];
      else if (!spec.includes(v)) { errors.push(`${p}: valor "${v}" não é um de ${spec.join('|')}`); out[k] = spec[0]; }
      else out[k] = v;
    } else if (typeof spec === 'boolean') {
      if (v === undefined) out[k] = spec;
      else if (typeof v !== 'boolean') { errors.push(`${p}: esperado booleano`); out[k] = spec; }
      else out[k] = v;
    } else { out[k] = {}; walk(spec, v, out[k], errors, p); }
  }
}

// Normaliza e valida. Valores fora da faixa são limitados (clamp); estrutura inválida vira erro.
export function validatePreset(p) {
  const errors = [];
  if (!p || typeof p !== 'object') return { ok: false, errors: ['preset não é um objeto'], preset: defaultPreset() };
  if (p.v !== undefined && p.v !== PRESET_VERSION) errors.push(`versão ${p.v} não suportada (esperado ${PRESET_VERSION})`);
  const out = { v: PRESET_VERSION, id: typeof p.id === 'string' ? p.id : 'c:novo', name: String(p.name ?? 'Sem nome').slice(0, 60), desc: String(p.desc ?? '').slice(0, 160), kind: p.kind === 'builtin' ? 'builtin' : 'custom', family: String(p.family ?? p.voice?.type ?? 'electric') };
  walk(SCHEMA, p, out, errors, '');
  return { ok: errors.length === 0, errors, preset: out };
}

export function defaultPreset() { const out = { v: PRESET_VERSION, id: 'c:novo', name: 'Novo preset', desc: '', kind: 'custom', family: 'electric' }; walk(SCHEMA, {}, out, [], ''); return out; }
const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k] || {}, v) : v; return o; };
const mk = (id, name, family, desc, over) => validatePreset({ ...merge(defaultPreset(), over), id, name, family, desc, kind: 'builtin' }).preset;

// ---------- presets de fábrica ----------
export const BUILTIN = [
  mk('b:steel', 'Violão de aço', 'steel', 'Brilhante e aberto, com corpo de caixa.', { voice: { type: 'steel', brightness: 0.78, sustain: 0.62, body: 0.75 }, comp: { on: true, amount: 0.25 }, eq: { low: 1, high: 2, presence: 1 }, reverb: { on: true, size: 1.0, mix: 0.12 } }),
  mk('b:nylon', 'Violão nylon', 'nylon', 'Macio e escuro, ataque suave.', { voice: { type: 'nylon', brightness: 0.4, sustain: 0.45, body: 0.65 }, eq: { high: -2, low: 1 }, reverb: { on: true, size: 1.1, mix: 0.12 } }),
  mk('b:clean', 'Guitarra limpa', 'electric', 'Captador cristalino com chorus discreto.', { voice: { type: 'electric', brightness: 0.62, sustain: 0.8, pickup: 0.6 }, comp: { on: true, amount: 0.3 }, chorus: { on: true, rate: 0.7, depth: 0.35, mix: 0.25 }, reverb: { on: true, size: 1.3, mix: 0.16 } }),
  mk('b:overdrive', 'Overdrive', 'electric', 'Quebra de válvula, ótimo para riffs.', { voice: { type: 'electric', brightness: 0.65, sustain: 0.85, pickup: 0.65 }, drive: { mode: 'overdrive', amount: 0.5, tone: 0.55, level: 0.7, cab: true }, eq: { mid: 2 }, reverb: { on: true, size: 0.8, mix: 0.1 } }),
  mk('b:distortion', 'Distorção', 'electric', 'Saturação pesada e sustain longo.', { voice: { type: 'electric', brightness: 0.7, sustain: 0.95, pickup: 0.7 }, drive: { mode: 'distortion', amount: 0.7, tone: 0.5, level: 0.6, cab: true }, eq: { low: 1, mid: -1, presence: 2 }, reverb: { on: true, size: 0.7, mix: 0.08 } }),
  mk('b:blues', 'Blues', 'electric', 'Overdrive quente, eco curto e reverb de sala.', { voice: { type: 'electric', brightness: 0.55, sustain: 0.8, pickup: 0.75 }, drive: { mode: 'overdrive', amount: 0.32, tone: 0.42, level: 0.75, cab: true }, comp: { on: true, amount: 0.2 }, eq: { low: 1, mid: 1, high: -1 }, delay: { on: true, time: 140, feedback: 0.18, mix: 0.16 }, reverb: { on: true, size: 1.4, mix: 0.2 } }),
  mk('b:rock', 'Rock', 'electric', 'Médios agressivos, presença alta.', { voice: { type: 'electric', brightness: 0.7, sustain: 0.85, pickup: 0.7 }, drive: { mode: 'overdrive', amount: 0.72, tone: 0.62, level: 0.65, cab: true }, eq: { low: 1, mid: 1, high: 1, presence: 3 }, reverb: { on: true, size: 0.9, mix: 0.1 } }),
  mk('b:metal', 'Metal', 'electric', 'Distorção alta, médios escavados, ataque firme.', { voice: { type: 'electric', brightness: 0.8, sustain: 1, pickup: 0.85 }, drive: { mode: 'distortion', amount: 0.95, tone: 0.65, level: 0.5, cab: true }, comp: { on: true, amount: 0.4 }, eq: { low: 3, mid: -4, high: 2, presence: 4 }, reverb: { on: true, size: 0.6, mix: 0.06 } }),
  mk('b:jazz', 'Jazz', 'electric', 'Captador escuro, redondo e limpo.', { voice: { type: 'electric', brightness: 0.35, sustain: 0.7, pickup: 0.3, body: 0.6 }, comp: { on: true, amount: 0.2 }, eq: { low: 2, high: -4, presence: -2 }, chorus: { on: true, rate: 0.5, depth: 0.2, mix: 0.15 }, reverb: { on: true, size: 1.5, mix: 0.18 } }),
];
export const BUILTIN_BY_ID = Object.fromEntries(BUILTIN.map((p) => [p.id, p]));

// ---------- mapeamento: preset -> valores de nó (puro; chain.js só aplica) ----------
export function delaySeconds(d, bpm = 100) {
  const s = d.sync ? (DIVISION_BEATS[d.division] ?? 0.5) * 60 / Math.max(20, bpm) : d.time / 1000;
  return clamp(s, 0.04, 1.9);
}

export function mapParams(p, bpm = 100) {
  const dr = p.drive, on = dr.mode !== 'off', dist = dr.mode === 'distortion';
  const pk = p.voice.type === 'electric' ? p.voice.pickup : 0;
  const body = p.voice.type === 'electric' ? 0.15 : p.voice.body;
  return {
    body: { lowGain: body * 7, midGain: body * 4.5, lowHz: p.voice.type === 'nylon' ? 95 : 110, midHz: p.voice.type === 'nylon' ? 190 : 220 },
    pickup: { gain: pk * 7, lowpassHz: lerp(9000, 4200, pk) },
    comp: p.comp.on ? { threshold: -10 - p.comp.amount * 26, ratio: 1 + p.comp.amount * 7, makeup: 1 + p.comp.amount * 1.1 } : { threshold: 0, ratio: 1, makeup: 1 },
    drive: {
      on, dry: on ? 0 : 1, wet: on ? 1 : 0,
      preHz: dist ? 220 : 120, preGain: on ? 1 + dr.amount * (dist ? 40 : 14) : 1,
      postHz: lerp(1800, 9000, dr.tone), level: dr.level * (dist ? 0.32 : 0.55),
      cab: dr.cab ? { hp: 100, lp: 4800, peakHz: 2200, peakGain: 4 } : { hp: 20, lp: 20000, peakHz: 2200, peakGain: 0 },
    },
    eq: { low: p.eq.low, mid: p.eq.mid, high: p.eq.high, presence: p.eq.presence },
    chorus: { wet: p.chorus.on ? p.chorus.mix * 0.8 : 0, dry: p.chorus.on ? 1 - p.chorus.mix * 0.3 : 1, rate: p.chorus.rate, depth: p.chorus.depth * 0.005 },
    delay: { time: delaySeconds(p.delay, bpm), feedback: p.delay.feedback, wet: p.delay.on ? p.delay.mix : 0, dry: 1, dampHz: 3800 },
    reverb: { seconds: p.reverb.size, damp: p.reverb.damp, wet: p.reverb.on ? p.reverb.mix * 0.9 : 0, dry: p.reverb.on ? 1 - p.reverb.mix * 0.25 : 1 },
    out: p.volume,
  };
}

// Parâmetros da voz (corda) a partir do preset: define o que o Karplus-Strong gera.
export function voiceParams(v) {
  const t = v.type;
  const t60 = lerp(0.8, t === 'electric' ? 9 : 5.5, v.sustain);
  if (t === 'nylon') return { brightness: v.brightness * 0.7, t60: t60 * 0.8, soft: 0.65, pluckPos: 0.2 };
  if (t === 'electric') return { brightness: 0.35 + v.brightness * 0.55, t60, soft: 0.1, pluckPos: 0.1 };
  return { brightness: v.brightness, t60, soft: 0, pluckPos: 0.16 };
}
export const voiceKey = (v) => { const q = voiceParams(v); return `${v.type}:${q.brightness.toFixed(2)}:${q.t60.toFixed(1)}`; };

// ---------- presets do usuário (store.tones.presets), favoritos e A/B ----------
// "store" = qualquer objeto com get/set/update (o Store do app, ou um falso nos testes).
export const customPresets = (store) => store.get('tones.presets', []);
export const allPresets = (store) => [...BUILTIN, ...customPresets(store)];
export const getPreset = (store, id) => BUILTIN_BY_ID[id] || customPresets(store).find((p) => p.id === id) || null;
const newId = () => 'c:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function saveCustom(store, preset, name) {
  const p = validatePreset({ ...preset, id: newId(), name: name || preset.name, kind: 'custom' }).preset;
  store.update('tones.presets', (a) => [...a, p], []);
  return p;
}
export function updateCustom(store, id, patch) {
  let out = null;
  store.update('tones.presets', (a) => a.map((p) => (p.id === id ? (out = validatePreset({ ...p, ...patch, id, kind: 'custom' }).preset) : p)), []);
  return out;
}
export const renamePreset = (store, id, name) => updateCustom(store, id, { name: String(name).trim() || 'Sem nome' });
export function deletePreset(store, id) {
  const had = customPresets(store).some((p) => p.id === id);
  if (!had) return false;
  store.update('tones.presets', (a) => a.filter((p) => p.id !== id), []);
  store.update('favorites.tones', (a) => a.filter((x) => x !== id), []);
  if (store.get('tones.current') === id) store.set('tones.current', 'b:steel');
  return true;
}
export function duplicatePreset(store, id) { const p = getPreset(store, id); return p ? saveCustom(store, p, `${p.name} (cópia)`) : null; }
export const isFavorite = (store, id) => store.get('favorites.tones', []).includes(id);
export function toggleFavorite(store, id) {
  const on = !isFavorite(store, id);
  store.update('favorites.tones', (a) => (on ? [...a, id] : a.filter((x) => x !== id)), []);
  return on;
}
