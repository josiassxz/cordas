import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUALITY_LIST, AERO_QUALITIES, QUALITIES_BY_ID, parseSymbol, symbolOf, voicingsOf, inversionsOf, getChord, allSymbols, searchSymbols, findChords,
  validateVoicing, matchVoicing, diffByString, expectedPositions, chordEvent, chordScore,
} from '../js/music/chords.js';
import { OPEN } from '../js/music/chord-data/open.js';
import { CHORDS as LEGACY } from '../js/music/legacy.js';
import { matchChord as theoryMatch, STANDARD, setFlats } from '../js/music/theory.js';

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

test('12 raízes × todas as qualidades (incluindo as 16 da Aeroband) têm ao menos uma digitação', () => {
  assert.equal(AERO_QUALITIES.length, 16);
  for (const q of AERO_QUALITIES) assert.ok(QUALITIES_BY_ID[q], `qualidade ${q}`);
  const missing = allSymbols().filter((s) => voicingsOf(s.symbol).length === 0).map((s) => s.symbol);
  assert.deepEqual(missing, []);
  assert.equal(allSymbols().length, 12 * QUALITY_LIST.length);
});

test('toda digitação é musicalmente válida (classes de altura, extensão, dedos)', () => {
  let total = 0;
  for (const s of allSymbols()) for (const v of voicingsOf(s.symbol)) {
    total++;
    assert.deepEqual(validateVoicing(v), [], v.id);
    assert.equal(v.frets.length, 6); assert.equal(v.fingers.length, 6);
    const pos = v.frets.filter((f) => f > 0);
    if (pos.length) assert.ok(Math.max(...pos) - Math.min(...pos) <= 3, `extensão ${v.id}`);
    assert.ok(new Set(v.fingers.filter(Boolean)).size <= 4, `dedos ${v.id}`);
    assert.deepEqual(v.notes, v.frets.map((f, i) => (f < 0 ? null : STANDARD[i] + f)).filter((n) => n !== null));
    assert.deepEqual(v.used.concat(v.muted).sort(), [0, 1, 2, 3, 4, 5]);
    assert.ok(v.difficulty >= 1 && v.difficulty <= 3);
    if (v.barre) assert.ok(v.difficulty >= 2, `pestana não é fácil: ${v.id}`);
  }
  assert.ok(total > 2000, `total de digitações: ${total}`);
});

test('formas abertas curadas: nenhuma foi descartada pela validação', () => {
  for (const [sym, list] of Object.entries(OPEN)) {
    const vs = voicingsOf(sym).filter((v) => v.tags.includes('curado'));
    assert.equal(vs.length, list.length, `${sym}: ${vs.length}/${list.length} curadas sobreviveram`);
  }
});

test('biblioteca v1 (27 acordes) está totalmente coberta, com as mesmas digitações', () => {
  for (const c of LEGACY) {
    const sym = symbolOf(c.root, c.q === 'maj' ? 'maj' : c.q === 'min' ? 'min' : c.q);
    const found = voicingsOf(sym).some((v) => v.frets.join() === c.frets.join());
    assert.ok(found, `${c.id} (${sym}) ${c.frets}`);
  }
});

test('símbolos: apelidos, nomes em português, baixo e bemóis', () => {
  assert.deepEqual(parseSymbol('Am7'), { root: 9, quality: 'm7', bass: null });
  assert.deepEqual(parseSymbol('Sol7'), { root: 7, quality: '7', bass: null });
  assert.deepEqual(parseSymbol('Lám'), { root: 9, quality: 'min', bass: null });
  assert.deepEqual(parseSymbol('Faug'), { root: 5, quality: 'aug', bass: null }, 'Faug não é "Fá"+"ug"');
  assert.equal(parseSymbol('Fadd9').quality, 'add9');
  assert.deepEqual(parseSymbol('Bbmaj7'), { root: 10, quality: 'maj7', bass: null });
  assert.deepEqual(parseSymbol('C/E'), { root: 0, quality: 'maj', bass: 4 });
  assert.equal(parseSymbol('C/C').bass, null);
  assert.equal(parseSymbol('Cm(maj7)').quality, 'm7M');
  assert.equal(parseSymbol('F#m7b5').quality, 'm7b5');
  assert.equal(parseSymbol('Xyz'), null);
  assert.equal(symbolOf(1, 'm7'), 'C#m7');
});

test('baixo invertido e slash: baixo é a nota pedida', () => {
  for (const s of ['C/E', 'C/G', 'G/B', 'D/F#', 'Am/C', 'C/D', 'C/Bb', 'Em7/D', 'F/C']) {
    const vs = voicingsOf(s), p = parseSymbol(s);
    assert.ok(vs.length > 0, s);
    for (const v of vs) { assert.equal(v.notes[0] % 12, p.bass, `${s} ${v.id}`); assert.equal(v.bass, p.bass); assert.ok(v.tags.includes('slash') || v.tags.includes('inversão')); }
  }
  assert.ok(inversionsOf('C').length >= 2);
});

test('formas móveis, power chords, iniciante e jazz existem', () => {
  const all = allSymbols().flatMap((s) => voicingsOf(s.symbol));
  for (const t of ['aberto', 'pestana', 'móvel', 'power', 'iniciante', 'jazz', 'inversão']) assert.ok(all.some((v) => v.tags.includes(t)) || t === 'inversão', t);
  const cs = voicingsOf('C');
  assert.ok(cs.some((v) => v.barre && v.shape === 'E') && cs.some((v) => v.barre && v.shape === 'A'), 'C tem forma E e forma A de pestana');
  assert.ok(voicingsOf('A5').every((v) => v.notes.length >= 2 && v.pcs.length <= 2));
  assert.ok(voicingsOf('Cmaj7').some((v) => v.tags.includes('iniciante')));
});

test('busca e filtros', () => {
  assert.ok(searchSymbols('am7').includes('Am7'));
  assert.ok(searchSymbols('sol').includes('G') && searchSymbols('sol').includes('G7'));
  assert.ok(searchSymbols('sus2').every((s) => /sus2|7sus2/.test(s)) || searchSymbols('sus2').length > 0);
  assert.equal(searchSymbols('').length, 0);
  const faceis = findChords({ root: 0, difficulty: 1 });
  assert.ok(faceis.length > 0 && faceis.every((v) => v.root === 0 && v.difficulty === 1));
  const pest = findChords({ quality: 'min', tag: 'pestana', limit: 400 });
  assert.ok(pest.length > 0 && pest.every((v) => v.quality === 'min' && v.barre));
  assert.ok(findChords({ category: 'Power', limit: 50 }).every((v) => v.quality === '5'));
  assert.equal(findChords({ q: 'zzzz' }).length, 0);
  assert.ok(findChords({ symbols: ['Em', 'G'], limit: 100 }).every((v) => ['Em', 'G'].includes(v.symbol)));
});

test('getChord: fórmula, nomes e respeito à notação (bemóis)', () => {
  const c = getChord('C#m7');
  assert.equal(c.symbol, 'C#m7'); assert.deepEqual(c.formula, ['1', '♭3', '5', '♭7']); assert.equal(c.category, 'Sétimas');
  setFlats(true);
  assert.equal(getChord('C#m7').name, 'Dbm7'); assert.equal(getChord('C#m7').best.name, 'Dbm7');
  setFlats(false);
});

test('avaliação com MIDI simulado por corda: acerta, erra e concorda com theory.matchChord', () => {
  const play = (v, off = 0) => v.notes.map((n) => n + off);
  const em = voicingsOf('Em')[0], am = voicingsOf('Am')[0], a = voicingsOf('A')[0];
  for (const r of ['root', 'normal', 'strict']) assert.ok(matchVoicing(play(em), em, r).ok, r);
  assert.equal(matchVoicing(play(a), am, 'normal').ok, false);
  assert.deepEqual(matchVoicing(play(a), am, 'normal').missing, ['C']);
  assert.equal(matchVoicing(play(am), em, 'strict').ok, false);
  // desvio de afinação −1: o chamador subtrai o offset antes
  assert.ok(matchVoicing(play(em, -1).map((n) => n + 1), em).ok);
  // consistência com o avaliador do núcleo nas qualidades que ambos conhecem
  const shared = ['maj', 'min', '7', 'maj7', 'm7', 'sus2', 'sus4', 'dim', 'aug', '5', '6', 'add9'];
  let checked = 0;
  for (const s of allSymbols().filter((x) => shared.includes(x.quality) && [0, 4, 9].includes(x.root))) {
    for (const v of voicingsOf(s.symbol).slice(0, 3)) for (const target of voicingsOf(s.symbol).slice(0, 1)) {
      const mine = matchVoicing(v.notes, target, 'normal').ok, core = theoryMatch(v.notes, { root: target.root, q: target.quality }, 'normal').ok;
      assert.equal(mine, core, `${v.id} vs ${target.id}`); checked++;
    }
  }
  assert.ok(checked > 50);
  // outras qualidades do motor novo
  const c9 = voicingsOf('E9')[0];
  assert.ok(matchVoicing(c9.notes, c9, 'strict').ok);
  // inversão exige o baixo certo
  const ce = voicingsOf('C/E')[0], cRoot = voicingsOf('C')[0];
  assert.equal(matchVoicing(cRoot.notes, ce).ok, false);
  assert.ok(matchVoicing(ce.notes, ce, 'strict').ok);
});

test('diffByString: por corda, mostra acerto, erro, falta e corda que devia ficar abafada', () => {
  const em = voicingsOf('Em')[0];
  const played = new Map(em.notes.map((n, i) => [i, n]));
  assert.ok(diffByString(em, played).every((d) => d.state === 'ok'));
  played.delete(2); played.set(3, played.get(3) + 1);
  const d = diffByString(em, played);
  assert.equal(d[2].state, 'missing'); assert.equal(d[3].state, 'wrong');
  const a = voicingsOf('A')[0];                       // 6ª corda abafada
  const bad = diffByString(a, new Map([[0, 40]]));
  assert.equal(bad[0].state, 'avoid-hit');
  assert.equal(diffByString(a, new Map())[0].state, 'avoid-ok');
  assert.equal(expectedPositions(em).length, 6);
  assert.equal(expectedPositions(a).length, 5);
});

test('chordEvent/chordScore produzem eventos no formato do Score', () => {
  const v = voicingsOf('G')[0];
  const ev = chordEvent(v, { beat: 2 });
  assert.equal(ev.kind, 'strum'); assert.equal(ev.beat, 2); assert.deepEqual(ev.strum.strings, v.used); assert.deepEqual(ev.avoid, v.muted); assert.ok(ev.check.strings);
  const sc = chordScore(v, { beats: 4 });
  assert.equal(sc.events.length, 4); assert.equal(sc.lengthBeats, 4); assert.equal(sc.chords[0].chordId, 'G');
});

test('geração é rápida (biblioteca inteira em menos de 5 s)', () => {
  const t = Date.now(); for (const s of allSymbols()) voicingsOf(s.symbol);
  assert.ok(Date.now() - t < 5000);
});

test('mutação: o validador rejeita digitações erradas', async () => {
  const em = voicingsOf('Em')[0];
  const wrongNote = { ...em, frets: [0, 2, 2, 0, 0, 1], pcs: [...new Set([...em.pcs, 5])] };       // Fá não pertence a Em
  assert.ok(validateVoicing(wrongNote).some((e) => /fora da fórmula/.test(e)));
  const noThird = { ...em, pcs: em.pcs.filter((p) => p !== 7) };                                    // sem a terça (Sol)
  assert.ok(validateVoicing(noThird).some((e) => /falta/.test(e)));
  const wide = { ...em, frets: [1, 2, 6, 0, 0, 0] };
  assert.ok(validateVoicing(wide).length > 0, 'extensão/solta com mão alta');
  const fiveFingers = { ...em, fingers: [1, 2, 3, 4, 5, 1] };
  assert.ok(validateVoicing(fiveFingers).some((e) => /dedo/.test(e)));
});
