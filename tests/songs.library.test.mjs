import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../js/core/store.js';
import { Library, checkFile, parseTitle } from '../js/songs/library.js';
import { memoryAudioDb } from '../js/songs/db.js';
import { importSong } from '../js/songs/import.js';
import { encodeWav, decodeWav } from '../js/songs/wav.js';
import { addChord, editChord, removeChord, moveChord, tidy, chordAt, nextChord, spans, tapTempo, beatTimes, normalizeLoop, loopJump, nudgeLoop } from '../js/songs/timeline.js';
import { chordChangeScore } from '../js/songs/score.js';
import { parseSymbol, voicingNotes } from '../js/songs/chordnames.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const fakeFile = (bytes, name, type = 'audio/wav') => ({ name, type, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
const wavBytes = (secs = 2, sr = 22050) => { const x = new Float32Array(sr * secs); for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / sr); return encodeWav(x, sr); };
const decode = async (ab) => decodeWav(new Uint8Array(ab));

test('importa um WAV pequeno: áudio no "IndexedDB", metadados no Store, nada de áudio no localStorage', async () => {
  const store = new Store(mem()), db = memoryAudioDb(), lib = new Library(store, db);
  const { meta } = await importSong(fakeFile(wavBytes(), 'Artista Teste - Minha Música.wav'), { library: lib, decode });
  assert.equal(meta.title, 'Minha Música'); assert.equal(meta.artist, 'Artista Teste');
  assert.ok(Math.abs(meta.duration - 2) < 0.01);
  assert.equal(db.size(), 1); assert.equal((await lib.audio(meta.id)).peaks.length, 900);
  store.flush(); assert.ok(JSON.stringify(store.data).length < 2000, 'metadados leves');
  assert.equal(lib.list().length, 1);
});

test('rejeita DRM, formato estranho e áudio corrompido com mensagem clara', async () => {
  const lib = new Library(new Store(mem()), memoryAudioDb());
  assert.match(checkFile({ name: 'a.m4p', type: '' }).reason, /DRM/);
  assert.equal(checkFile({ name: 'doc.pdf', type: 'application/pdf' }).ok, false);
  assert.equal(checkFile({ name: 'a.flac', type: '' }).ok, true);
  await assert.rejects(importSong(fakeFile(new Uint8Array([1, 2, 3, 4]), 'ruim.wav'), { library: lib, decode }), /decodificar/);
  assert.equal(lib.all.length, 0, 'nada gravado quando falha');
});

test('busca, favoritos, tags, ordenação e remoção', async () => {
  const store = new Store(mem()), lib = new Library(store, memoryAudioDb());
  const a = (await importSong(fakeFile(wavBytes(1), 'Beta - Zebra.wav'), { library: lib, decode })).meta;
  const b = (await importSong(fakeFile(wavBytes(1), 'Alfa - Casa.wav'), { library: lib, decode })).meta;
  lib.setTags(a.id, ['rock', ' rock ', 'fácil']); assert.deepEqual(lib.get(a.id).tags, ['rock', 'fácil']);
  assert.equal(lib.toggleFav(b.id), true);
  assert.deepEqual(lib.list({ favOnly: true }).map((s) => s.id), [b.id]);
  assert.deepEqual(lib.list({ query: 'zebra' }).map((s) => s.id), [a.id]);
  assert.deepEqual(lib.list({ tag: 'rock' }).map((s) => s.id), [a.id]);
  assert.deepEqual(lib.list({ sort: 'title' }).map((s) => s.title), ['Casa', 'Zebra']);
  await lib.remove(b.id);
  assert.equal(lib.all.length, 1); assert.equal(await lib.audio(b.id), undefined); assert.equal(lib.isFav(b.id), false);
  assert.equal(parseTitle('so_titulo.mp3').artist, '');
});

test('correção manual da linha do tempo de acordes', () => {
  let l = [{ t: 0, symbol: 'C', manual: false }, { t: 4, symbol: 'G', manual: false }, { t: 8, symbol: 'Am', manual: false }];
  l = editChord(l, 1, 'G7'); assert.equal(l[1].symbol, 'G7'); assert.equal(l[1].manual, true);
  assert.throws(() => editChord(l, 1, 'H9'), /inválido/);
  l = addChord(l, 6, 'Em'); assert.deepEqual(l.map((c) => c.symbol), ['C', 'G7', 'Em', 'Am']);
  assert.equal(chordAt(l, 6.5).chord.symbol, 'Em'); assert.equal(nextChord(l, 6.5).symbol, 'Am');
  l = moveChord(l, 2, 5); assert.equal(l[2].t, 5);
  l = removeChord(l, 2); assert.equal(l.length, 3);
  assert.deepEqual(tidy([{ t: 0, symbol: 'C' }, { t: 1, symbol: 'C' }, { t: 2, symbol: 'F' }]).map((c) => c.t), [0, 2]);
  assert.deepEqual(spans(l, 12).at(-1), { t0: 8, t1: 12, symbol: 'Am', manual: false });
});

test('tap tempo e grade de batidas', () => {
  assert.equal(tapTempo([0, 0.6, 1.2, 1.8, 2.4]), 100);
  assert.equal(tapTempo([0, 0.6]), null);
  assert.equal(tapTempo([0, 0.6, 1.2, 5, 5.6, 6.2]), 100, 'ignora pausa longa');
  assert.deepEqual(beatTimes(120, 0.25, 2).map((t) => +t.toFixed(2)), [0.25, 0.75, 1.25, 1.75]);
});

test('loop A–B: normalização, salto ao atingir B, ajuste fino', () => {
  assert.deepEqual(normalizeLoop(10, 4, 60), { a: 4, b: 10 });
  assert.deepEqual(normalizeLoop(5, 5.1, 60), { a: 5, b: 5.5 }, 'mínimo de 0,5 s');
  assert.deepEqual(normalizeLoop(59.9, 59.95, 60), { a: 59.5, b: 60 }, 'respeita o fim');
  const L = { a: 4, b: 10, enabled: true };
  assert.equal(loopJump(9.99, L), null); assert.equal(loopJump(10, L), 4); assert.equal(loopJump(12, L), 4);
  assert.equal(loopJump(12, { ...L, enabled: false }), null);
  assert.deepEqual(nudgeLoop(L, 'b', -0.5, 60), { a: 4, b: 9.5, enabled: true });
});

test('Score de troca de acordes alinhado ao BPM', () => {
  const song = { id: 'x', title: 'T', duration: 30, bpm: { value: 120, offset: 0, source: 'estimado' }, chords: [{ t: 0, symbol: 'C' }, { t: 2, symbol: 'G' }, { t: 4, symbol: null }, { t: 6, symbol: 'Am' }] };
  const lookup = (s) => (s === 'C' ? { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] } : null);
  const sc = chordChangeScore(song, 0, 8, { lookup });
  assert.equal(sc.bpm, 120); assert.deepEqual(sc.events.map((e) => [e.beat, e.label]), [[0, 'C'], [4, 'G'], [12, 'Am']]);
  assert.deepEqual(sc.events[0].strum.strings, [1, 2, 3, 4, 5], 'C evita a corda 6');
  assert.deepEqual(sc.events[1].strum.strings, [0, 1, 2, 3, 4, 5]);
  assert.equal(sc.estimated, true); assert.equal(sc.technique, 'chord-change'); assert.ok(sc.lengthBeats >= 16);
  assert.throws(() => chordChangeScore(song, 4.2, 5.8), /Não há acordes/);
});

test('símbolos e voicing do acompanhamento', () => {
  assert.deepEqual(parseSymbol('F#m7'), { root: 6, quality: 'm7', q: parseSymbol('F#m7').q });
  assert.equal(parseSymbol('Bb').root, 10); assert.equal(parseSymbol('X'), null); assert.equal(parseSymbol('Cfoo'), null);
  const n = voicingNotes('Am'); assert.equal(n[0] % 12, 9); assert.ok(n.length >= 4 && n[0] >= 40 && n[0] < 52);
});

import { mergeManual } from '../js/songs/job.js';
test('reanálise preserva acordes corrigidos à mão', () => {
  const auto = [{ t: 0, symbol: 'C' }, { t: 4.1, symbol: 'F' }, { t: 8, symbol: 'G' }];
  const prev = [{ t: 4, symbol: 'Dm', manual: true }];
  assert.deepEqual(mergeManual(auto, prev).map((c) => c.symbol), ['C', 'Dm', 'G']);
  assert.equal(mergeManual(auto, []), auto);
});

import { voicingsOf } from '../js/music/chords.js';
test('integração com a biblioteca de acordes real: Score usa só as cordas da digitação', () => {
  const lookup = (s) => voicingsOf(s)?.[0] || null;
  const song = { id: 'z', title: 'Z', duration: 20, bpm: { value: 90, offset: 0, source: 'manual' }, chords: [{ t: 0, symbol: 'C' }, { t: 5, symbol: 'Am' }] };
  const sc = chordChangeScore(song, 0, 10, { lookup });
  const c = lookup('C');
  assert.ok(c && c.frets.length === 6);
  const expected = c.frets.map((f, i) => (f >= 0 ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(sc.events[0].strum.strings, expected);
  assert.equal(sc.estimated, false, 'BPM definido pelo usuário não é "estimado"');
  assert.ok(sc.chords.every((x) => x.frets && x.fingers));
});
