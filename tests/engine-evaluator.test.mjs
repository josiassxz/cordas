import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScore, validateScore } from '../js/engine/score.js';
import { Evaluator, evalAttempt, windowsMs } from '../js/engine/evaluator.js';
import { STANDARD } from '../js/music/theory.js';

// 120 bpm => 1 batida = 500 ms; janela "ok" = 112,5 ms = 0,225 batida; "good" 75 ms; "perfect" 37,5 ms.
const mk = (events, extra = {}) => normalizeScore({ id: 't', title: 't', bpm: 120, lengthBeats: 8, level: 1, events, ...extra });
const note = (beat, string, fret, extra = {}) => ({ beat, notes: [{ string, fret }], ...extra });
const strumAll = (beat, dir = 'D', extra = {}) => ({ beat, strum: { dir, strings: [0, 1, 2, 3, 4, 5], frets: [0, 0, 0, 0, 0, 0] }, ...extra });
const ev = (score, o = {}) => new Evaluator(score, { bpm: 120, ...o });
const play = (e, string, note, beat) => e.noteOn({ string, note, beat });

test('janelas de acerto encolhem com o andamento', () => {
  assert.ok(windowsMs(60).ok > windowsMs(120).ok);
  assert.ok(windowsMs(240).perfect < windowsMs(120).perfect);
  assert.ok(windowsMs(60).perfect <= 55 && windowsMs(60).ok <= 200);
});

test('nota certa na corda certa no tempo = perfeita', () => {
  const e = ev(mk([note(0, 4, 0)]));
  const fb = play(e, 4, 59, 0.02);
  assert.equal(fb[0].type, 'hit');
  const r = e.drain()[0];
  assert.equal(r.grade, 'perfect'); assert.equal(r.strings[4], 'ok');
});

test('timing: 50 ms de atraso = boa; fora da janela = perdida', () => {
  let e = ev(mk([note(0, 4, 0), note(4, 4, 0)]));
  play(e, 4, 59, 0.1);                       // 0,1 batida = 50 ms
  const r = e.drain()[0];
  assert.equal(r.grade, 'good'); assert.ok(Math.abs(r.delta - 50) < 1e-6);
  e = ev(mk([note(0, 4, 0), note(4, 4, 0)]));
  const fb = play(e, 4, 59, 1);              // 500 ms depois: nenhuma janela
  assert.equal(fb[0].type, 'extra');
  const out = e.advance(2);
  assert.equal(out[0].grade, 'miss');
});

test('corda errada = nota extra (perto de um evento) e o evento vira perdido', () => {
  const e = ev(mk([note(0, 4, 0)]));
  const fb = play(e, 3, 55, 0);
  assert.deepEqual([fb[0].type, fb[0].near], ['extra', true]);
  assert.equal(e.advance(5)[0].grade, 'miss');
  assert.equal(e.summary().extras, 1);
});

test('nota errada na corda certa = wrongPitch, sem acerto', () => {
  const e = ev(mk([note(0, 4, 0)]));
  assert.equal(play(e, 4, 60, 0)[0].type, 'wrongPitch');
  assert.equal(e.advance(5)[0].grade, 'miss');
  assert.equal(e.results[0].strings[4], 'pitch');
});

test('pitchOffset calibrado desloca a nota esperada', () => {
  const e = ev(mk([note(0, 0, 3)]), { pitchOffset: -1 });
  assert.equal(play(e, 0, STANDARD[0] + 3 - 1, 0)[0].type, 'hit');
});

test('nota fora de qualquer janela é extra', () => {
  const e = ev(mk([note(0, 4, 0), note(4, 4, 0)]));
  assert.equal(play(e, 4, 59, 2)[0].type, 'extra');
});

test('cordas a evitar tocadas = erro e nota limitada a "ok"', () => {
  const s = mk([{ beat: 0, strum: { dir: 'D', strings: [2, 3, 4, 5], frets: [-1, -1, 0, 2, 3, 2] }, avoid: [0, 1] }]);
  const e = ev(s);
  assert.equal(play(e, 1, 45, 0)[0].type, 'avoid');
  [[2, 50], [3, 57], [4, 62], [5, 66]].forEach(([st, n], i) => play(e, st, n, 0.02 * i));
  const r = e.drain()[0];
  assert.ok(['ok', 'miss'].includes(r.grade) && r.avoid === 1);
  assert.equal(e.summary().avoidHits, 1);
});

test('palhetada: cobertura parcial limita a nota; metade das cordas ainda conta', () => {
  let e = ev(mk([strumAll(0)], { lengthBeats: 4 }), { rigor: 'normal' });
  [0, 1, 2, 3, 4, 5].forEach((s, i) => play(e, s, STANDARD[s], 0.05 * i));
  assert.equal(e.drain()[0].grade, 'perfect');
  e = ev(mk([strumAll(0)], { lengthBeats: 4 }));
  [0, 1, 2].forEach((s, i) => play(e, s, STANDARD[s], 0.05 * i));
  const r = e.advance(4)[0];
  assert.equal(r.coverage, 0.5); assert.equal(r.grade, 'ok');
  e = ev(mk([strumAll(0)], { lengthBeats: 4 }));
  [0, 1].forEach((s, i) => play(e, s, STANDARD[s], 0.05 * i));
  assert.equal(e.advance(4)[0].grade, 'miss');
});

test('direção inferida pela ordem das cordas rebaixa perfeita para boa', () => {
  const down = ev(mk([strumAll(0, 'D')], { lengthBeats: 4 }));
  [0, 1, 2, 3, 4, 5].forEach((s, i) => play(down, s, STANDARD[s], 0.02 * i));
  const rd = down.drain()[0]; assert.equal(rd.dirOk, true); assert.equal(rd.grade, 'perfect');
  const up = ev(mk([strumAll(0, 'D')], { lengthBeats: 4 }));
  [5, 4, 3, 2, 1, 0].forEach((s, i) => play(up, s, STANDARD[s], 0.02 * i));
  const ru = up.drain()[0]; assert.equal(ru.dirOk, false); assert.equal(ru.grade, 'good');
});

test('rigor: pitch de palhetada só é exigido no modo estrito', () => {
  const s = mk([strumAll(0)], { lengthBeats: 4 });
  const loose = ev(s, { rigor: 'normal' });
  [0, 1, 2, 3, 4, 5].forEach((st, i) => play(loose, st, STANDARD[st] + 1, 0.02 * i));
  assert.equal(loose.drain()[0].grade, 'perfect');
  const strict = ev(s, { rigor: 'strict' });
  [0, 1, 2, 3, 4, 5].forEach((st, i) => play(strict, st, STANDARD[st] + 1, 0.02 * i));
  assert.equal(strict.advance(5)[0].grade, 'miss');
});

test('repetições (passadas): evento da passada seguinte é avaliado separadamente', () => {
  const e = ev(mk([note(0, 4, 0)], { lengthBeats: 4 }), { passes: 3 });
  play(e, 4, 59, 0); play(e, 4, 59, 4.02);
  assert.equal(e.drain().length, 2);
  assert.equal(e.advance(100).length, 1);             // terceira passada nunca tocada = perdida
  assert.equal(e.summary().expected, 3);
});

test('eventos só-guia não são avaliados', () => {
  const s = mk([note(0, 3, 0), note(1, 3, 2, { tech: 'hammer', guide: true, check: { strings: false, pitch: false, timing: false } })]);
  assert.deepEqual(validateScore(s), []);
  const e = ev(s, { passes: 1 }); play(e, 3, 55, 0);
  assert.equal(e.advance(10).length, 1, 'só o evento avaliável gera resultado'); assert.equal(e.summary().expected, 1);
});

test('modo esperar: tentativa correta, nota errada, falta de corda, corda a evitar', () => {
  const s = mk([{ beat: 0, strum: { dir: 'D', strings: [2, 3, 4, 5], frets: [-1, -1, 0, 2, 3, 2] }, avoid: [0, 1] }]);
  const E = s.events[0], P = (st, n) => ({ string: st, note: n });
  assert.equal(evalAttempt(E, [P(2, 50), P(3, 57), P(4, 62), P(5, 66)]).ok, true);
  assert.deepEqual(evalAttempt(E, [P(2, 50), P(3, 57), P(4, 62)]).missing, [5]);
  assert.deepEqual(evalAttempt(E, [P(2, 50), P(3, 57), P(4, 62), P(5, 66), P(0, 40)]).avoid, [0]);
  const single = mk([note(0, 4, 0)]).events[0];
  assert.equal(evalAttempt(single, [P(4, 59), P(3, 55)]).ok, false, 'corda extra reprova nota única');
  assert.deepEqual(evalAttempt(single, [P(4, 60)], {}).wrongPitch, [4]);
});

test('validateScore aponta erros reais', () => {
  const bad = normalizeScore({ id: 'x', title: 'x', bpm: 10, level: 9, events: [{ beat: 99, notes: [{ string: 7, fret: 1 }] }] });
  const errs = validateScore(bad);
  assert.ok(errs.length >= 3, errs.join('; '));
});

test('notas simultâneas (melodia + baixo) chegam espalhadas e contam como um evento só', () => {
  const s = mk([{ beat: 0, notes: [{ string: 4, fret: 0 }, { string: 0, fret: 3 }] }], { lengthBeats: 4 });
  const e = ev(s, { passes: 1 });
  assert.equal(play(e, 4, 59, 0.0)[0].type, 'hit');
  assert.equal(play(e, 0, 43, 0.06)[0].type, 'hit', 'baixo 30 ms depois não é "extra"');
  const r = e.drain()[0]; assert.equal(r.coverage, 1); assert.equal(r.grade, 'perfect');
});

test('nota única errada pode ser corrigida tocando de novo dentro da janela', () => {
  const e = ev(mk([note(0, 4, 0)]), { passes: 1 });
  assert.equal(play(e, 4, 60, 0)[0].type, 'wrongPitch');
  assert.equal(play(e, 4, 59, 0.1)[0].type, 'hit');
  assert.equal(e.drain()[0].grade, 'good');
});

test('sem validar corda: qualquer corda no tempo certo acerta, e fora do tempo não', async () => {
  const { Evaluator } = await import('../js/engine/evaluator.js');
  const { normalizeScore } = await import('../js/engine/score.js');
  const sc = normalizeScore({ id: 't', title: 't', bpm: 100, lengthBeats: 4, events: [{ beat: 0, notes: [{ string: 4, fret: 0 }] }, { beat: 1, notes: [{ string: 3, fret: 2 }, { string: 2, fret: 2 }] }] });
  const ev = new Evaluator(sc, { checkStrings: false, passes: 1 });
  ev.noteOn({ string: 0, note: 40, beat: 0.02 });       // corda errada, tempo certo
  ev.noteOn({ string: 5, note: 64, beat: 1.01 });       // outra corda, tempo certo (acorde de 2 cordas)
  const out = ev.advance(10);
  assert.equal(out.length, 2); assert.ok(out.every((r) => r.grade !== 'miss'), 'os dois eventos acertaram só pelo tempo');
  const s = ev.summary(); assert.equal(s.miss, 0); assert.equal(s.perfect + s.good + s.ok, 2);
  const strict = new Evaluator(sc, { passes: 1 }); strict.noteOn({ string: 0, note: 40, beat: 0.02 }); strict.advance(10);
  assert.ok(strict.summary().miss >= 1, 'com validação, a corda errada perde');
});

test('sem validar corda: as outras cordas da mesma palhetada não viram "extra"; fora do tempo sim', async () => {
  const { Evaluator } = await import('../js/engine/evaluator.js');
  const { normalizeScore } = await import('../js/engine/score.js');
  const sc = normalizeScore({ id: 't2', title: 't', bpm: 100, lengthBeats: 4, events: [{ beat: 0, strum: { dir: 'D', strings: [0, 1, 2, 3, 4, 5] } }] });
  const ev = new Evaluator(sc, { checkStrings: false, passes: 1 });
  const fb = [0, 1, 2, 3, 4, 5].map((s, i) => ev.noteOn({ string: s, note: 40 + s, beat: 0.01 + i * 0.04 })[0].type);
  assert.deepEqual(fb, Array(6).fill('hit'));
  assert.equal(ev.extras, 0, 'a palhetada inteira não gera extras');
  assert.equal(ev.noteOn({ string: 2, note: 50, beat: 2.5 })[0].type, 'extra', 'fora do tempo continua sendo extra');
});

const em = { id: 'em', title: 'Em', bpm: 100, lengthBeats: 4, events: [{ beat: 0, strum: { dir: 'D', strings: [0, 1, 2, 3, 4, 5], frets: [0, 2, 2, 0, 0, 0] } }] };
const strumNotes = (ev, notes) => notes.forEach((n, i) => ev.noteOn({ string: i, note: n, beat: 0.01 + i * 0.04 }));

test('validação pelo ACORDE: acorde certo em qualquer corda passa; acorde diferente falha com explicação', async () => {
  const { Evaluator } = await import('../js/engine/evaluator.js');
  const { normalizeScore } = await import('../js/engine/score.js');
  const sc = normalizeScore(em);
  const good = new Evaluator(sc, { validate: 'chord', passes: 1 });
  strumNotes(good, [40, 47, 52, 55, 59, 64]);                         // E B E G B E = Em
  const rg = good.advance(10); assert.equal(rg.length, 1); assert.notEqual(rg[0].grade, 'miss'); assert.equal(rg[0].why, null);
  const bad = new Evaluator(sc, { validate: 'chord', passes: 1 });
  strumNotes(bad, [41, 48, 53, 57, 60, 65]);                          // F C F A C F = Fm: terça diferente
  const rb = bad.advance(10); assert.equal(rb[0].grade, 'miss'); assert.match(rb[0].why.text, /Acorde diferente do pedido/);
  assert.equal(bad.noteOn({ string: 0, note: 40, beat: 3.9 })[0].type, 'extra', 'fora do tempo continua extra');
});

test('validação pelo BRAÇO: casas apertadas = digitação pedida (mais o tempo)', async () => {
  const { Evaluator } = await import('../js/engine/evaluator.js');
  const { normalizeScore } = await import('../js/engine/score.js');
  const sc = normalizeScore(em);
  let neck = new Map([[1, 2], [2, 2]]);                               // A casa 2 e D casa 2 = Em
  const ev = new Evaluator(sc, { validate: 'neck', passes: 1, neck: () => neck });
  assert.equal(ev.noteOn({ string: 0, note: 40, beat: 0.01 })[0].type, 'hit');
  const ok = ev.advance(10); assert.notEqual(ok[0].grade, 'miss');
  neck = new Map([[1, 3], [2, 2]]);                                   // corda A na casa errada
  const ev2 = new Evaluator(sc, { validate: 'neck', passes: 1, neck: () => neck });
  const fb = ev2.noteOn({ string: 0, note: 40, beat: 0.01 })[0];
  assert.equal(fb.type, 'wrongNeck'); assert.match(fb.why.text, /Corda 5: você apertou a casa 3, o pedido é a 2/);
  assert.equal(ev2.advance(10)[0].grade, 'miss');
  neck = new Map();                                                   // nada apertado
  const ev3 = new Evaluator(sc, { validate: 'neck', passes: 1, neck: () => neck });
  assert.match(ev3.noteOn({ string: 0, note: 40, beat: 0.01 })[0].why.text, /Falta apertar a corda 5, casa 2/);
  const ev4 = new Evaluator(sc, { validate: 'neck', passes: 1, neck: () => null });   // sem sensor (demo): só o tempo
  assert.equal(ev4.noteOn({ string: 0, note: 40, beat: 0.01 })[0].type, 'hit');
});

test('Ré maior tocado nas 6 cordas: montagem certa passa mesmo com o som "Dadd9/E"; som por acorde/corda a corda exigem mais', async () => {
  const { Evaluator } = await import('../js/engine/evaluator.js');
  const { normalizeScore } = await import('../js/engine/score.js');
  // D: cordas 3,4,5 (D G B E agudo) em [0,2,3,2] -> pedido toca só as 4 de cima; o aluno toca as 6 (E e A soltas a mais)
  const d = normalizeScore({ id: 'd', title: 'D', bpm: 100, lengthBeats: 4, events: [{ beat: 0, strum: { dir: 'D', strings: [2, 3, 4, 5], frets: [-1, -1, 0, 2, 3, 2] } }] });
  const neck = new Map([[3, 2], [4, 3], [5, 2]]);
  const six = [40, 45, 50, 57, 62, 66];                                  // E A D A' D' F# = o que soa nas 6 cordas
  const play = (opts) => { const e = new Evaluator(d, { passes: 1, neck: () => neck, ...opts }); six.forEach((n, i) => e.noteOn({ string: i, note: n, beat: 0.01 + i * 0.03 })); return e.advance(10); };
  const a = play({ neckOn: true, sound: 'off' }); assert.equal(a.length, 1); assert.notEqual(a[0].grade, 'miss', 'montagem certa = acerto');
  assert.equal(a[0].why, null);
  const b = play({ neckOn: true, sound: 'chord', rigor: 'strict' }); assert.notEqual(b[0].grade, 'miss', 'som por acorde: Dadd9/E (cordas soltas a mais) conta como D'); assert.ok(b[0].heardName, 'guarda o nome do que soou');
  const c = play({ neckOn: true, sound: 'strings' }); assert.ok(c.length >= 1);
  const wrongNeck = new Map([[3, 2], [4, 3]]);                           // falta o dedo da corda 1
  const e2 = new Evaluator(d, { passes: 1, neck: () => wrongNeck, neckOn: true, sound: 'off' }); six.forEach((n, i) => e2.noteOn({ string: i, note: n, beat: 0.01 + i * 0.03 }));
  assert.equal(e2.advance(10)[0].grade, 'miss', 'montagem errada falha mesmo com o som dentro do tempo');
  // neck + som por acorde: montagem errada derruba, montagem certa + acorde certo passa
  const e3 = new Evaluator(d, { passes: 1, neck: () => wrongNeck, neckOn: true, sound: 'chord' }); [50, 57, 62, 66].forEach((n, i) => e3.noteOn({ string: i + 2, note: n, beat: 0.01 + i * 0.03 }));
  assert.equal(e3.advance(10)[0].grade, 'miss');
  const e4 = new Evaluator(d, { passes: 1, neck, neckOn: true, sound: 'chord' }); e4.neck = () => neck; [50, 57, 62, 66].forEach((n, i) => e4.noteOn({ string: i + 2, note: n, beat: 0.01 + i * 0.03 }));
  assert.notEqual(e4.advance(10)[0].grade, 'miss');
});

test('som pelo ACORDE: variações contam como o acorde pedido; terça errada continua errada; corda a corda cobra tudo', async () => {
  const { Evaluator } = await import('../js/engine/evaluator.js');
  const { normalizeScore } = await import('../js/engine/score.js');
  const c = normalizeScore({ id: 'c', title: 'C', bpm: 100, lengthBeats: 4, events: [{ beat: 0, strum: { dir: 'D', strings: [1, 2, 3, 4, 5], frets: [-1, 3, 2, 0, 1, 0] } }] });
  const run = (notes, opts) => { const e = new Evaluator(c, { passes: 1, neckOn: false, sound: 'chord', ...opts }); notes.forEach((n, i) => e.noteOn({ string: i % 6, note: n, beat: 0.01 + i * 0.03 })); return e.advance(10)[0]; };
  assert.notEqual(run([52, 48, 55, 60, 64, 62]).grade, 'miss', 'Cadd9/E (E grave, D a mais) = C');
  assert.equal(run([48, 51, 55, 60]).grade, 'miss', 'Cm (terça menor) não é C');
  const am = normalizeScore({ id: 'am', title: 'Am', bpm: 100, lengthBeats: 4, events: [{ beat: 0, strum: { dir: 'D', strings: [1, 2, 3, 4, 5], frets: [-1, 0, 2, 2, 1, 0] } }] });
  const e = new Evaluator(am, { passes: 1, neckOn: false, sound: 'chord' }); [40, 45, 52, 57, 60, 64].forEach((n, i) => e.noteOn({ string: i, note: n, beat: 0.01 + i * 0.03 }));
  assert.notEqual(e.advance(10)[0].grade, 'miss', 'Am/E conta como Am');
  const strict = new Evaluator(c, { passes: 1, neckOn: false, sound: 'strings' }); [40, 52, 55, 60, 64].forEach((n, i) => strict.noteOn({ string: i, note: n, beat: 0.01 + i * 0.03 }));
  assert.ok(strict.extras >= 1, 'corda a corda: a corda a mais (Mi grave) é cobrada');
});

test('janela de acerto: ±ms por andamento e tolerância; nunca passa de meia fatia', async () => {
  const { windowsMs, TOLERANCE } = await import('../js/engine/evaluator.js');
  const n = windowsMs(80, 2), s = windowsMs(80, 2, TOLERANCE.strict), w = windowsMs(80, 2, TOLERANCE.wide);
  assert.equal(Math.round(n.ok), 169); assert.ok(s.ok < n.ok && n.ok < w.ok);
  assert.ok(windowsMs(60, 1, 1.6).ok <= 60000 / 60 / 1 * 0.5, 'a janela ampla não invade a fatia vizinha');
  assert.ok(windowsMs(160, 4).ok < windowsMs(80, 4).ok, 'mais rápido, janela mais estreita');
});

test('palhetada REAL da AG01 (cordas chegam espaçadas até 0,66 s): todas as cordas são reconhecidas em vários andamentos e modos', async () => {
  const { Evaluator } = await import('../js/engine/evaluator.js');
  const { normalizeScore } = await import('../js/engine/score.js');
  // espaçamentos entre cordas medidos nas capturas da guitarra (s): palhetada rápida, média e lenta
  const REAL = { rapida: [0.05, 0.06, 0.07, 0.07, 0.05], media: [0.06, 0.09, 0.12, 0.15, 0.09], lenta: [0.15, 0.18, 0.12, 0.21, 0.12] };
  const em = (bpm, sub, slots) => normalizeScore({ id: 'r' + bpm, title: 't', bpm, beatsPerBar: 4, subdivision: sub, lengthBeats: 4, events: slots.map((i) => ({ beat: i / sub, dur: 1 / sub, strum: { dir: 'D', strings: [0, 1, 2, 3, 4, 5], frets: [0, 2, 2, 0, 0, 0] } })) });
  const cases = [[60, 1, [0, 1, 2, 3], 'lenta'], [80, 1, [0, 1, 2, 3], 'media'], [100, 1, [0, 1, 2, 3], 'media'], [120, 1, [0, 1, 2, 3], 'rapida'], [80, 2, [0, 2, 4, 6], 'media'], [80, 2, [0, 1, 2, 3, 4, 5, 6, 7], 'rapida'], [60, 2, [0, 1, 2, 3, 4, 5, 6, 7], 'rapida']];
  for (const [bpm, sub, slots, kind] of cases) for (const mode of [{ sound: 'strings', neckOn: false }, { sound: 'off', neckOn: false }, { sound: 'chord', neckOn: false }]) {
    const sc = em(bpm, sub, slots), e = new Evaluator(sc, { passes: 1, ...mode });
    const bs = 60 / bpm, lateness = 0.03;            // você chega 30 ms depois da batida
    sc.events.forEach((ev) => { let t = ev.beat * bs + lateness; [0, ...REAL[kind]].forEach((gap, i) => { t += gap; e.noteOn({ string: i, note: [40, 47, 52, 55, 59, 64][i], beat: t / bs }); }); });
    const res = e.advance(100), label = `${bpm}bpm sub${sub} ${kind} ${mode.sound}`;
    assert.equal(res.length, sc.events.length, label);
    assert.ok(res.every((r) => r.grade !== 'miss'), `${label}: nenhuma palhetada perdida (${res.map((r) => r.grade).join(',')})`);
    if (mode.sound === 'strings') assert.ok(res.every((r) => r.stringsOk === 6), `${label}: as 6 cordas reconhecidas (${res.map((r) => r.stringsOk).join(',')})`);
    assert.equal(e.extras, 0, `${label}: sem notas "extras"`);
  }
});

test('direção ↓/↑ lida pela ordem das cordas: desligada, rebaixa (padrão) ou exige', async () => {
  const { Evaluator } = await import('../js/engine/evaluator.js');
  const { normalizeScore } = await import('../js/engine/score.js');
  const { dirOfOrder } = await import('../js/music/theory.js');
  assert.equal(dirOfOrder([0, 1, 2, 3, 4, 5]), 'D'); assert.equal(dirOfOrder([5, 4, 3, 2, 1, 0]), 'U');
  assert.equal(dirOfOrder([0, 1]), null, 'com 2 cordas não dá para saber'); assert.equal(dirOfOrder([2, 0, 3, 1]), null, 'ordem confusa não conta');
  const sc = (dir) => normalizeScore({ id: 'd' + dir, title: 't', bpm: 80, lengthBeats: 4, events: [{ beat: 0, strum: { dir, strings: [0, 1, 2, 3, 4, 5], frets: [0, 2, 2, 0, 0, 0] }, check: { dir: true } }] });
  const play = (want, played, opts) => {
    const e = new Evaluator(sc(want), { passes: 1, ...opts }), order = played === 'D' ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 0];
    order.forEach((s, i) => e.noteOn({ string: s, note: [40, 47, 52, 55, 59, 64][s], beat: 0.02 + i * 0.08 }));
    return e.advance(10)[0];
  };
  for (const extra of [{}, { sound: 'off' }, { sound: 'chord' }]) {                // corda a corda, só tempo e pelo acorde
    assert.notEqual(play('D', 'D', extra).grade, 'miss', 'direção certa passa');
    assert.equal(play('D', 'U', { dirMode: 'strict', ...extra }).grade, 'miss', `exigir: ↑ no lugar de ↓ erra (${JSON.stringify(extra)})`);
    assert.match(play('D', 'U', { dirMode: 'strict', ...extra }).why.text, /Direção errada: o pedido era ↓, você fez ↑/);
    const soft = play('D', 'U', { dirMode: 'soft', ...extra }); assert.notEqual(soft.grade, 'miss'); assert.equal(soft.dirOk, false); assert.notEqual(soft.grade, 'perfect', 'rebaixa');
    assert.notEqual(play('D', 'U', { dirMode: 'off', ...extra }).grade, 'miss', 'desligado: não confere');
    assert.notEqual(play('U', 'U', { dirMode: 'strict', ...extra }).grade, 'miss', 'palhetada para cima pedida e feita');
  }
});

test('MONTAGEM de acorde: levantar a mão, montar certo e segurar; sem levantar, casa errada, palhetada opcional/obrigatória e sem sensor', async () => {
  const { Evaluator } = await import('../js/engine/evaluator.js');
  const { normalizeScore } = await import('../js/engine/score.js');
  const chord = (beat, frets) => ({ beat, dur: 4, strum: { dir: 'D', strings: frets.map((f, s) => (f >= 0 ? s : -1)).filter((s) => s >= 0), frets, fingers: [0, 0, 0, 0, 0, 0] }, check: { strings: true, pitch: false, timing: true, dir: false } });
  const EM = [0, 2, 2, 0, 0, 0], AM = [-1, 0, 2, 2, 1, 0];                    // Em: corda 5(A)=2, 4(D)=2 | Am: corda 4(D)=2, 3(G)=2, 2(B)=1
  const score = (strum = false) => normalizeScore({ id: 'asm', title: 'm', bpm: 60, beatsPerBar: 4, subdivision: 2, lengthBeats: 8, mode: 'timed', assemble: { hold: 0.3, strum }, events: [chord(0, EM), chord(4, AM)] });
  const mk = (strum, neckRef) => new Evaluator(score(strum), { passes: 1, neck: () => neckRef.m });
  const press = (...pairs) => new Map(pairs);
  // 1) fluxo certo: monta Em perto do tempo 0, levanta a mão, monta Am no tempo 4
  let nk = { m: press() }; let e = mk(false, nk);
  e.neckUpdate(0); nk.m = press([1, 2], [2, 2]); e.neckUpdate(0.05); e.advance(0.2); assert.equal(e.results.length, 0, 'ainda não segurou 0,3 s');
  e.advance(0.4); assert.equal(e.results.length, 1); assert.notEqual(e.results[0].grade, 'miss'); assert.ok(Math.abs(e.results[0].delta - 50) < 1, 'tempo = instante em que a montagem ficou certa (+50 ms)');
  nk.m = press(); e.neckUpdate(2); e.advance(2.1);                              // levantou a mão
  nk.m = press([2, 2], [3, 2], [4, 1]); e.neckUpdate(3.9); e.advance(4.5);
  assert.equal(e.results.length, 2); assert.notEqual(e.results[1].grade, 'miss'); assert.ok(e.results[1].delta < 0, 'montou 100 ms antes: adiantado');
  // 2) não levantou a mão entre os acordes: erro com a explicação
  nk = { m: press() }; e = mk(false, nk);
  nk.m = press([1, 2], [2, 2]); e.neckUpdate(0); e.advance(0.5); assert.equal(e.results[0].grade !== 'miss', true);
  nk.m = press([2, 2], [3, 2], [4, 1]); e.neckUpdate(3.9); e.advance(5);       // trocou os dedos direto, sem soltar tudo
  assert.equal(e.results[1].grade, 'miss'); assert.match(e.results[1].why.text, /Levante a mão/);
  // 3) casa errada
  nk = { m: press() }; e = mk(false, nk); nk.m = press([1, 3], [2, 2]); e.neckUpdate(0); e.advance(2);
  assert.equal(e.results[0].grade, 'miss'); assert.match(e.results[0].why.text, /Corda 5: você apertou a casa 3, o pedido é a 2/);
  // 4) corda que deveria ficar solta está apertada
  nk = { m: press() }; e = mk(false, nk); nk.m = press([1, 2], [2, 2], [5, 3]); e.neckUpdate(0); e.advance(2);
  assert.equal(e.results[0].grade, 'miss'); assert.match(e.results[0].why.text, /deveria ficar solta/);
  // 5) palhetada obrigatória: montou e segurou, mas não palhetou -> erro; palhetando -> acerto
  nk = { m: press() }; e = mk(true, nk); nk.m = press([1, 2], [2, 2]); e.neckUpdate(0); e.advance(0.5); assert.equal(e.results.length, 0, 'espera a palhetada');
  e.advance(6); assert.equal(e.results[0].grade, 'miss'); assert.match(e.results[0].why.text, /faltou palhetar/);
  nk = { m: press() }; e = mk(true, nk); nk.m = press([1, 2], [2, 2]); e.neckUpdate(0); e.advance(0.5); e.noteOn({ string: 0, note: 40, beat: 0.8 }); e.advance(0.9);
  assert.equal(e.results.length, 1); assert.notEqual(e.results[0].grade, 'miss');
  // 6) segurar: desmontar antes de 0,3 s reinicia a contagem
  nk = { m: press() }; e = mk(false, nk); nk.m = press([1, 2], [2, 2]); e.neckUpdate(0); e.advance(0.05); nk.m = press([1, 2]); e.neckUpdate(0.1); e.advance(0.12);
  nk.m = press([1, 2], [2, 2]); e.neckUpdate(0.15); e.advance(0.3); assert.equal(e.results.length, 0, 'recomeçou a segurar'); e.advance(0.5); assert.equal(e.results.length, 1); assert.notEqual(e.results[0].grade, 'miss');
  // desmontou e só refez DEPOIS da janela de tempo: atrasado
  nk = { m: press() }; e = mk(false, nk); nk.m = press([1, 2], [2, 2]); e.neckUpdate(0); e.advance(0.1); nk.m = press([1, 2]); e.neckUpdate(0.15); e.advance(0.4); assert.equal(e.results[0].grade, 'miss');
  // 7) sem sensor (demo): resolve no tempo, avisando que não conferiu
  e = new Evaluator(score(false), { passes: 1, neck: () => null }); e.advance(0.1); assert.equal(e.results[0].why.type, 'nosensor');
});

test('MONTAGEM com o score REAL do gerador: sem apertar nada o acorde NÃO conta como montado; montando certo conta', async () => {
  const { Evaluator } = await import('../js/engine/evaluator.js');
  const { normalizeScore } = await import('../js/engine/score.js');
  const { assembleDrill } = await import('../js/content/chord-drills.js');
  const sc = normalizeScore(assembleDrill(['G', 'D'], { bpm: 60, beatsPerChord: 4, rounds: 1 }).score);
  assert.deepEqual(sc.events[0].strum.frets, [3, 2, 0, 0, 0, -1]);
  let nk = new Map(); const e = new Evaluator(sc, { passes: 1, neck: () => nk });
  e.advance(-3.8); e.advance(0.1); assert.equal(e.results.length, 0, 'sem apertar nada: nada resolvido dentro da janela');
  nk = new Map([[0, 3], [1, 2]]); e.neckUpdate(0.12); e.advance(0.5);
  assert.equal(e.results.length, 1); assert.notEqual(e.results[0].grade, 'miss');
  const e2 = new Evaluator(sc, { passes: 1, neck: () => new Map() }); e2.advance(3); assert.equal(e2.results[0].grade, 'miss', 'não montou a tempo: perdeu');
});
