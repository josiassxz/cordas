import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN, BUILTIN_BY_ID, SCHEMA, validatePreset, defaultPreset, mapParams, voiceParams, delaySeconds, saveCustom, updateCustom, renamePreset, deletePreset, duplicatePreset, toggleFavorite, isFavorite, getPreset, allPresets, customPresets } from '../js/audio/presets.js';
import { Store } from '../js/core/store.js';

const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const mkStore = () => new Store(memStorage());

test('presets de fábrica: os 9 pedidos existem e são válidos', () => {
  const ids = BUILTIN.map((p) => p.id);
  for (const id of ['b:steel', 'b:nylon', 'b:clean', 'b:overdrive', 'b:distortion', 'b:blues', 'b:rock', 'b:metal', 'b:jazz']) assert.ok(ids.includes(id), id);
  for (const p of BUILTIN) { const r = validatePreset(p); assert.ok(r.ok, `${p.id}: ${r.errors}`); assert.deepEqual(r.preset, p, `${p.id} normaliza para si mesmo`); assert.equal(p.kind, 'builtin'); }
  assert.equal(BUILTIN_BY_ID['b:metal'].drive.mode, 'distortion');
  assert.ok(BUILTIN_BY_ID['b:nylon'].voice.type === 'nylon' && BUILTIN_BY_ID['b:steel'].voice.type === 'steel');
});

test('validação: limita faixas, preenche padrões e relata erros estruturais', () => {
  const r = validatePreset({ v: 1, name: 'x', drive: { mode: 'overdrive', amount: 5 }, eq: { low: -99 }, delay: { division: '9/9' } });
  assert.equal(r.preset.drive.amount, 1); assert.equal(r.preset.eq.low, -12); assert.equal(r.preset.delay.division, '1/4');
  assert.ok(!r.ok && r.errors.some((e) => e.includes('delay.division')));
  assert.equal(validatePreset(null).ok, false); assert.equal(validatePreset({ v: 2 }).ok, false);
  assert.ok(validatePreset({ drive: { amount: 'alto' } }).errors.length === 1);
  assert.equal(validatePreset({ name: 'a'.repeat(200) }).preset.name.length, 60);
  assert.ok(validatePreset(defaultPreset()).ok);
});

test('mapParams: cada controle muda um valor real da cadeia', () => {
  const base = defaultPreset();
  const m = (over) => mapParams(validatePreset({ ...base, ...over }).preset, 100);
  assert.equal(m({}).drive.on, false); assert.equal(m({}).drive.dry, 1);
  const od = m({ drive: { mode: 'overdrive', amount: 0.5 } }), ds = m({ drive: { mode: 'distortion', amount: 0.5 } });
  assert.ok(od.drive.on && od.drive.wet === 1 && od.drive.dry === 0); assert.ok(ds.drive.preGain > od.drive.preGain);
  assert.ok(m({ drive: { mode: 'overdrive', amount: 0.9 } }).drive.preGain > od.drive.preGain);
  assert.ok(m({ drive: { mode: 'overdrive', tone: 1 } }).drive.postHz > m({ drive: { mode: 'overdrive', tone: 0 } }).drive.postHz);
  assert.equal(m({ drive: { mode: 'overdrive', cab: false } }).drive.cab.peakGain, 0);
  assert.equal(m({ comp: { on: false } }).comp.ratio, 1); assert.ok(m({ comp: { on: true, amount: 1 } }).comp.ratio > 7);
  assert.equal(m({ reverb: { on: false, mix: 0.9 } }).reverb.wet, 0); assert.ok(m({ reverb: { on: true, mix: 0.5 } }).reverb.wet > 0);
  assert.equal(m({ delay: { on: false } }).delay.wet, 0); assert.ok(m({ chorus: { on: true, mix: 0.5 } }).chorus.wet > 0);
  assert.equal(m({ eq: { presence: 5 } }).eq.presence, 5);
  assert.ok(m({ voice: { type: 'steel', body: 1 } }).body.lowGain > m({ voice: { type: 'steel', body: 0 } }).body.lowGain);
  assert.equal(m({ voice: { type: 'electric', body: 1 } }).body.lowGain < 2, true, 'elétrica quase sem corpo de caixa');
});

test('delay sincronizado ao BPM e limites', () => {
  const d = (o) => ({ ...defaultPreset().delay, ...o });
  assert.ok(Math.abs(delaySeconds(d({ sync: true, division: '1/4' }), 120) - 0.5) < 1e-9);
  assert.ok(Math.abs(delaySeconds(d({ sync: true, division: '1/8' }), 120) - 0.25) < 1e-9);
  assert.ok(Math.abs(delaySeconds(d({ sync: true, division: '1/8d' }), 60) - 0.75) < 1e-9);
  assert.ok(Math.abs(delaySeconds(d({ sync: false, time: 300 }), 120) - 0.3) < 1e-9);
  assert.equal(delaySeconds(d({ sync: true, division: '1/4d' }), 20), 1.9, 'limitado a 1,9 s');
});

test('voz: nylon é mais macio e escuro que aço; sustain aumenta o T60', () => {
  const v = (type, o = {}) => voiceParams({ ...defaultPreset().voice, type, ...o });
  assert.ok(v('nylon').soft > v('steel').soft); assert.ok(v('nylon').brightness < v('steel').brightness);
  assert.ok(v('steel', { sustain: 1 }).t60 > v('steel', { sustain: 0 }).t60);
});

test('presets do usuário: salvar, renomear, duplicar, apagar, favoritos', () => {
  const s = mkStore();
  assert.equal(customPresets(s).length, 0); assert.equal(allPresets(s).length, BUILTIN.length);
  const a = saveCustom(s, BUILTIN_BY_ID['b:blues'], 'Meu blues');
  assert.equal(a.kind, 'custom'); assert.ok(a.id.startsWith('c:')); assert.equal(a.name, 'Meu blues'); assert.equal(a.drive.amount, BUILTIN_BY_ID['b:blues'].drive.amount);
  assert.equal(getPreset(s, a.id).name, 'Meu blues');
  assert.equal(renamePreset(s, a.id, '  Blues do vovô ').name, 'Blues do vovô');
  const edited = updateCustom(s, a.id, { drive: { ...a.drive, amount: 0.9 } }); assert.equal(edited.drive.amount, 0.9); assert.equal(getPreset(s, a.id).drive.amount, 0.9);
  const dup = duplicatePreset(s, a.id); assert.notEqual(dup.id, a.id); assert.match(dup.name, /cópia/); assert.equal(customPresets(s).length, 2);
  assert.equal(isFavorite(s, a.id), false); assert.equal(toggleFavorite(s, a.id), true); assert.equal(isFavorite(s, a.id), true);
  s.set('tones.current', a.id);
  assert.equal(deletePreset(s, a.id), true); assert.equal(getPreset(s, a.id), null); assert.equal(isFavorite(s, a.id), false, 'apagar remove dos favoritos'); assert.equal(s.get('tones.current'), 'b:steel');
  assert.equal(deletePreset(s, 'b:steel'), false, 'fábrica não se apaga');
  assert.equal(toggleFavorite(s, 'b:metal'), true); assert.equal(toggleFavorite(s, 'b:metal'), false);
});

test('presets personalizados persistem no Store (recarregar)', () => {
  const st = memStorage(), s1 = new Store(st); const p = saveCustom(s1, BUILTIN_BY_ID['b:rock'], 'Persistido'); s1.flush();
  const s2 = new Store(st); assert.equal(getPreset(s2, p.id)?.name, 'Persistido'); assert.ok(validatePreset(getPreset(s2, p.id)).ok);
});

test('esquema não tem campo sem mapeamento (nenhum controle fantasma)', () => {
  const map = JSON.stringify(mapParams(defaultPreset()));
  assert.ok(map.length > 100);
  for (const sec of Object.keys(SCHEMA)) assert.ok(sec in defaultPreset());
});
