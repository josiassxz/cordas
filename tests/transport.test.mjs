import test from 'node:test';
import assert from 'node:assert/strict';
import { Transport } from '../js/engine/transport.js';

const mk = (o = {}) => { const c = { t: 10 }; const tr = new Transport(null, { clock: () => c.t, silent: true, bpm: 120, ...o }); return [tr, c]; };

test('posição avança com o relógio e começa na contagem negativa', () => {
  const [tr, c] = mk();
  tr.start({ countInBeats: 4 });
  c.t = 10.12;                       // t0 = now+0.12
  assert.ok(Math.abs(tr.position() - -4) < 1e-9);
  c.t = 10.12 + 1;                   // 1 s a 120 bpm = 2 batidas
  assert.ok(Math.abs(tr.position() - -2) < 1e-9);
  tr.stop();
});

test('pausa congela a posição e retomar continua dali (sem salto)', () => {
  const [tr, c] = mk();
  tr.start({ countInBeats: 0 });
  c.t = 10.12 + 2;                   // 4 batidas
  tr.pause();
  const p = tr.position();
  assert.ok(Math.abs(p - 4) < 1e-9);
  c.t += 30;                         // 30 s parado não podem contar
  assert.equal(tr.position(), p);
  assert.equal(tr.beatAtPerf(performance.now()), null);
  tr.resume();
  c.t += 0.08 + 0.5;                 // 0,5 s = 1 batida depois de retomar
  assert.ok(Math.abs(tr.position() - 5) < 1e-9);
  tr.stop();
});

test('ticks: contagem marcada, compasso e sem repetição após pausa', () => {
  const [tr, c] = mk({ subdivision: 2 });
  const ticks = [];
  tr.addEventListener('tick', (e) => ticks.push(e.detail));
  tr.start({ countInBeats: 4 });
  for (let i = 0; i < 200; i++) { c.t += 0.05; tr.pump(); }
  const beats = ticks.map((t) => t.beat);
  assert.deepEqual(beats.slice(0, 5), [-4, -3.5, -3, -2.5, -2]);
  assert.ok(ticks.filter((t) => t.isBar).every((t) => t.beat % 4 === 0));
  assert.ok(ticks.filter((t) => t.countIn).every((t) => t.beat < 0));
  const n = ticks.length;
  tr.pause(); const pausedAt = tr.position();
  for (let i = 0; i < 20; i++) { c.t += 0.05; tr.pump(); }
  assert.equal(ticks.length, n, 'nenhum tick durante a pausa');
  tr.resume(); for (let i = 0; i < 20; i++) { c.t += 0.05; tr.pump(); }
  tr.stop();
  const after = ticks.slice(n).map((t) => t.beat);
  // Ticks já agendados (até 120 ms à frente) estavam mudos na pausa e são reemitidos; nunca um que já passou.
  const repeated = after.filter((b) => beats.includes(b));
  assert.ok(repeated.every((b) => b >= pausedAt - 1e-9), 'só repete batidas ainda não alcançadas');
  assert.ok(Math.min(...after) >= pausedAt - 1e-9, 'retomada não volta no tempo');
});

test('mudar velocidade preserva a posição; bpm efetivo = bpm * velocidade', () => {
  const [tr, c] = mk();
  tr.start({ countInBeats: 0 });
  c.t = 10.12 + 1;                   // 2 batidas
  tr.setSpeed(0.5);
  assert.equal(tr.effectiveBpm, 60);
  assert.ok(Math.abs(tr.position() - 2) < 1e-9);
  c.t += 2;                          // 2 s a 60 bpm = 2 batidas
  assert.ok(Math.abs(tr.position() - 4) < 1e-9);
  tr.stop();
});

test('reiniciar volta para a contagem', () => {
  const [tr, c] = mk();
  tr.start({ countInBeats: 4 }); c.t += 5; tr.restart({ countInBeats: 4 });
  c.t = c.t + 0.12;
  assert.ok(Math.abs(tr.position() - -4) < 1e-9);
  tr.stop();
});

test('mudar o BPM cancela os cliques já agendados e recalcula o próximo no novo andamento', () => {
  const c = { t: 10 }, scheduled = [];
  const audio = { context: { currentTime: 10, createOscillator: () => ({ frequency: {}, connect() { return { connect() {} }; }, start() {}, stop() { this.stopped = true; }, disconnect() {} }), createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, value: 1 }, connect() { return this; }, disconnect() {} }) }, master: { }, instrumentBus: {} };
  const tr = new Transport(audio, { bpm: 120, beatsPerBar: 4, subdivision: 1, clock: () => c.t });
  tr.makeBus = function () {}; tr.out = { connect() {} };
  tr.blip = function (time) { scheduled.push({ time, o: { stop() { this.dead = true; }, disconnect() {} }, g: { disconnect() {} } }); this.sched.push(scheduled.at(-1)); };
  tr.start({ countInBeats: 0 });
  c.t = 10.3; tr.pump();                                    // 120 BPM: cliques em 10.12, 10.62...
  const before = tr.nextTick;
  tr.setBpm(60);                                            // desacelera: o clique agendado e ainda não tocado é cancelado
  assert.ok(scheduled.filter((e) => e.time > 10.3).every((e) => e.o.dead), 'cliques futuros cancelados');
  assert.ok(tr.nextTick >= tr.position(), 'próximo clique parte da posição atual');
  assert.ok(tr.nextTick <= before + 1, 'não pula batidas');
  tr.stop();
});
