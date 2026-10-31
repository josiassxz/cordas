import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Runner } from '../js/engine/runner.js';
import { Guitar } from '../js/device/guitar.js';
import { STANDARD } from '../js/music/theory.js';

// Relógio falso: 120 bpm => 1 batida = 0,5 s.
function rig(events, { score = {}, opts = {}, settings = {} } = {}) {
  const c = { t: 100 }, guitar = new Guitar(), records = [], calls = { strum: 0, pluck: 0 };
  const audio = { strum: () => calls.strum++, pluck: () => calls.pluck++ };
  const learn = { record: (r) => records.push(r) };
  const raw = { id: 'ex', title: 'Ex', technique: 'picking', level: 1, bpm: 120, lengthBeats: 4, events, ...score };
  const r = new Runner({ guitar, audio, learn, clock: () => c.t, silent: true, settings: () => ({ latency: 0, pitchOffset: 0, rigor: 'normal', ...settings }) }, raw, { autoUpdate: false, ...opts });
  made.push(r);
  const at = (beat) => { c.t = r.transport.t0 + (beat - r.transport.pos0) * 60 / r.transport.effectiveBpm; r.update(); };
  const hit = (string, note) => guitar.handle({ type: 'noteon', ch: string, a: note ?? STANDARD[string], b: 40 }, performance.now());
  return { r, c, at, hit, guitar, records, calls };
}
const made = [];
after(() => made.forEach((r) => r.destroy()));
const four = [0, 1, 2, 3].map((b) => ({ beat: b, notes: [{ string: 4, fret: 0 }] }));

test('execução perfeita: 100%, resumo e registro em app.learn', () => {
  const { r, at, hit, records } = rig(four, { opts: { countIn: 4 } });
  r.start(); assert.equal(r.state, 'countin');
  at(-2); assert.equal(r.state, 'countin');
  for (let b = 0; b < 4; b++) { at(b); hit(4); }
  at(0.01); assert.equal(r.state, 'running');
  at(6);
  assert.equal(r.state, 'finished');
  assert.equal(r.summary().accuracy, 100);
  assert.equal(records.length, 1); assert.equal(records[0].refId, 'ex'); assert.equal(records[0].accuracy, 100);
  assert.equal(records[0].hits.perfect, 4); assert.equal(records[0].stringsOk, 4);
});

test('PAUSA congela relógio e avaliação; CONTINUAR segue do mesmo ponto', () => {
  const { r, c, at, hit } = rig(four, { opts: { countIn: 0 } });
  r.start(); at(0); hit(4);
  at(1.0); r.pause();
  assert.equal(r.state, 'paused');
  const p = r.position(), extras = r.evaluator.summary().extras;
  c.t += 60;                                   // 1 minuto parado
  r.update(); assert.equal(r.position(), p, 'posição não anda na pausa');
  hit(4); hit(3);                              // notas durante a pausa
  assert.equal(r.evaluator.summary().extras, extras, 'avaliação ignora notas na pausa');
  assert.equal(r.evaluator.summary().expected, 1, 'nenhum evento foi dado como perdido na pausa');
  r.resume(); assert.equal(r.state, 'running');
  c.t += 0.08 + 0.5; r.update();               // meia batida? 0,5 s = 1 batida
  assert.ok(Math.abs(r.position() - 2.0) < 1e-6, `retomou de ${p}, agora ${r.position()}`);
  at(2); hit(4); at(3); hit(4); at(6);
  assert.equal(r.state, 'finished');
  assert.equal(r.summary().accuracy, 75, 'a nota do beat 1 não foi tocada');
});

test('pausar na contagem e continuar preserva a contagem', () => {
  const { r, c, at } = rig(four, { opts: { countIn: 4 } });
  r.start(); at(-3); r.pause(); assert.equal(r.state, 'paused');
  c.t += 20; r.resume();
  assert.equal(r.state, 'countin'); assert.ok(r.position() < 0 && r.position() >= -3 - 1e-9);
});

test('REINICIAR zera resultados e volta à contagem', () => {
  const { r, at, hit } = rig(four, { opts: { countIn: 4 } });
  r.start(); at(0); hit(4); at(1.5);
  assert.ok(r.results.size >= 1);
  r.restart();
  assert.equal(r.results.size, 0); assert.equal(r.state, 'countin'); assert.ok(r.position() <= 0);
  assert.equal(r.evaluator.summary().expected, 0);
});

test('velocidade 0,5x: bpm efetivo cai e a posição continua contínua', () => {
  const { r, c, at } = rig(four, { opts: { countIn: 0 } });
  r.start(); at(1);
  r.setSpeed(0.5);
  assert.equal(r.effectiveBpm, 60); assert.ok(Math.abs(r.position() - 1) < 1e-6);
  c.t += 2; assert.ok(Math.abs(r.position() - 3) < 1e-6);
  r.setSpeed(9); assert.equal(r.speed, 2); r.setSpeed(0.01); assert.equal(r.speed, 0.25);
});

test('repetir em laço: não termina sozinho, conta passadas; stop grava resumo', () => {
  const { r, at, hit, records } = rig(four, { opts: { countIn: 0, repeat: 'loop' } });
  r.start();
  for (let p = 0; p < 3; p++) for (let b = 0; b < 4; b++) { at(p * 4 + b); hit(4); }
  at(12.2);
  assert.equal(r.state, 'running'); assert.equal(r.currentPass, 3);
  assert.ok(r.progress > 0 && r.progress < 1);
  r.stop();
  assert.equal(r.state, 'finished'); assert.equal(records.length, 1); assert.equal(r.summary().accuracy, 100);
});

test('repetir N vezes termina após N passadas', () => {
  const { r, at } = rig(four, { opts: { countIn: 0, repeat: 2 } });
  r.start(); at(7.9); assert.equal(r.state, 'running'); at(9.1); assert.equal(r.state, 'finished');
  assert.equal(r.summary().miss, 8);
});

test('rampa de BPM sobe a cada passada até o máximo', () => {
  const { r, at } = rig(four, { score: { ramp: { step: 10, max: 140, everyPasses: 1 } }, opts: { countIn: 0, repeat: 'loop' } });
  r.start(); at(4.1); assert.equal(r.bpm, 130); at(8.2); assert.equal(r.bpm, 140); at(12.3); assert.equal(r.bpm, 140);
});

test('modo esperar: erra, tenta de novo, avança só ao acertar; pausa bloqueia', () => {
  const evs = [{ beat: 0, notes: [{ string: 4, fret: 0 }] }, { beat: 1, notes: [{ string: 3, fret: 0 }] }];
  const { r, hit, guitar, records } = rig(evs, { score: { mode: 'wait', lengthBeats: 4 }, opts: { repeat: 1, wait: true } });
  r.start(); assert.equal(r.mode, 'wait');
  const strum = () => guitar.emit('strum', { t: performance.now(), notes: [], dir: 'S', count: 1 });
  hit(3); strum();                              // corda errada
  assert.equal(r.upcoming().i, 0, 'não avançou');
  r.pause(); hit(4); strum(); assert.equal(r.upcoming().i, 0, 'pausa ignora tentativas');
  r.resume(); hit(4); strum();                  // acertou na 2ª tentativa
  assert.equal(r.upcoming().i, 1);
  hit(3); strum();                              // acertou de primeira
  assert.equal(r.state, 'finished');
  const s = r.summary();
  assert.deepEqual([s.perfect, s.good], [1, 1]); assert.equal(s.accuracy, 88);
  assert.equal(records.length, 1);
});

test('guia sonoro toca no tempo e SILENCIA na pausa', () => {
  const { r, c, at, calls } = rig(four, { opts: { countIn: 0, guide: true } });
  r.start(); at(0.9); at(1.9); const n = calls.pluck; assert.ok(n >= 2, `guia tocou ${n}`);
  r.pause(); c.t += 5; r.update(); at; assert.equal(calls.pluck, n, 'nada agendado na pausa');
  r.resume(); c.t += 0.7; r.update();
  assert.ok(calls.pluck >= n, 'volta a tocar após continuar');
});

test('acordes por trecho (v1): matchChord por compasso conta acertos e erros', () => {
  const Em = [0, 2, 2, 0, 0, 0], Am = [-1, 0, 2, 2, 1, 0];
  const mkStrum = (beat, f) => ({ beat, strum: { dir: 'D', strings: f.map((x, s) => (x >= 0 ? s : -1)).filter((s) => s >= 0), frets: f } });
  const { r, at, hit } = rig([mkStrum(0, Em), mkStrum(4, Am)], { score: { lengthBeats: 8, chords: [{ beat: 0, chordId: 'Em', root: 4, q: 'min' }, { beat: 4, chordId: 'Am', root: 9, q: 'min' }] }, opts: { countIn: 0 } });
  r.start(); at(0); Em.forEach((f, s) => { if (f >= 0) hit(s, STANDARD[s] + f); });
  at(4); [0, 1, 2, 3, 4, 5].forEach((s) => hit(s, STANDARD[s] + Em[s]));   // toca Em onde era Am
  at(10);
  assert.equal(r.state, 'finished');
  assert.deepEqual([r.summary().chordsOk, r.summary().chordsTotal], [1, 2]);
});

test('ponta a ponta com MIDI simulado (guitar.simulateStrum) em tempo real', async () => {
  const clock = () => performance.now() / 1000;
  const guitar = new Guitar(), records = [];
  const evs = [0, 1].map((b) => ({ beat: b, strum: { dir: 'D', strings: [0, 1, 2, 3, 4, 5], frets: [0, 0, 0, 0, 0, 0] } }));
  const r = new Runner({ guitar, audio: null, learn: { record: (x) => records.push(x) }, clock, silent: true, settings: () => ({ latency: 0, pitchOffset: 0, rigor: 'normal' }) },
    { id: 'e2e', title: 'e2e', technique: 'strumming', level: 1, bpm: 150, lengthBeats: 2, events: evs }, { countIn: 1, repeat: 1 });
  const done = new Promise((res) => r.on('finish', res));
  r.start();
  const notes = STANDARD.slice();
  for (const b of [0, 1]) setTimeout(() => guitar.simulateStrum(notes, 'D', 20), Math.max(0, (r.transport.timeOf(b) - clock()) * 1000));
  const sum = await Promise.race([done, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))]);
  assert.equal(sum.expected, 2); assert.ok(sum.accuracy >= 75, `acurácia ${sum.accuracy}`);
  assert.equal(sum.stringsOk, 12); assert.equal(records.length, 1);
  r.destroy();
});

test('score "esperar acerto" agora roda no relógio (BPM configurado) e aceita o acerto em qualquer ponto do trecho', () => {
  const evs = [{ beat: 0, dur: 4, notes: [{ string: 4, fret: 0 }], check: { strings: true, pitch: true, timing: false } }];
  const { r, at, hit } = rig(evs, { score: { mode: 'wait', lengthBeats: 4 }, opts: { repeat: 1, countIn: 0 } });
  r.start(); assert.equal(r.mode, 'timed');
  at(2.5); hit(4); at(4.2); assert.equal(r.summary().miss, 0);
  assert.ok(r.position() > 2, 'o relógio anda');
});

test('se o relógio do exercício for perdido, continuar/atualizar recria o relógio na mesma posição (nunca fica congelado)', () => {
  const { r, c, at } = rig(four, { opts: { countIn: 0 } });
  r.start(); at(2.0);
  const pos = r.position(); assert.ok(pos > 1.5);
  r.pause(); r.transport.stop();                       // algo matou o relógio durante a pausa
  assert.equal(r.state, 'paused');
  r.resume();                                          // continuar tem que funcionar mesmo assim
  assert.equal(r.state, 'running'); assert.equal(r.transport.state, 'running');
  assert.ok(Math.abs(r.position() - pos) < 0.2, 'continua de onde parou');
  c.t += 1; r.update(); assert.ok(r.position() > pos + 0.5, 'a timeline anda');
  r.transport.stop();                                  // morte do relógio com o exercício "tocando"
  c.t += 0.5; r.update();
  assert.equal(r.transport.state, 'running', 'o laço principal recria o relógio parado');
});
