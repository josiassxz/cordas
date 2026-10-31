// Avaliador puro: compara notas recebidas do dispositivo (corda, nota, posição em batidas) com o Score.
// Sem DOM, sem relógio: o chamador informa a posição `beat` de cada nota (Transport.beatAtPerf).
import { STANDARD, matchChord, pcName, detectChord, dirOfOrder, dirArrow } from '../music/theory.js';
import { expectedStrings, expectedPitch, isScored } from './score.js';

export const GRADE_WEIGHT = { perfect: 1, good: 0.75, ok: 0.45, miss: 0 };

// Janelas de acerto em ms, proporcionais ao andamento efetivo: em tempos rápidos ficam mais estreitas.
export const TOLERANCE = { strict: 0.6, normal: 1, wide: 1.6 };
export function windowsMs(bpmEff, subdivision = 2, scale = 1) {
  const slot = 60000 / bpmEff / subdivision;
  // `ok` é a janela inteira de acerto (antes e depois da batida): é a METADE da largura do bloco na pista. Nunca passa de meia fatia.
  return { perfect: Math.min(55 * scale, slot * 0.15 * scale), good: Math.min(110 * scale, slot * 0.3 * scale), ok: Math.min(200 * scale, slot * 0.45 * scale, slot * 0.5) };
}
// Na AG01 uma palhetada leva de ~0,3 a ~0,7 s para chegar (até 0,2 s entre duas cordas): a janela que junta as cordas de uma
// palhetada vai até 100% do intervalo para o próximo evento, entre 330 ms e 900 ms.
const SPREAD = { min: 330, max: 900, frac: 1 };
const gradeOf = (aMs, w) => (aMs <= w.perfect ? 'perfect' : aMs <= w.good ? 'good' : 'ok');
const capOk = (g) => (g === 'perfect' || g === 'good' ? 'ok' : g);

export class Evaluator {
  // o: { pitchOffset, rigor:'root'|'normal'|'strict', passes, bpm (efetivo), strings }
  constructor(score, o = {}) {
    this.score = score; this.len = score.lengthBeats;
    this.passes = o.passes ?? Infinity; this.offset = o.pitchOffset ?? 0; this.rigor = o.rigor ?? 'normal';
    // Validação em duas partes independentes (o tempo da batida sempre conta):
    //   neckOn  = conferir a MONTAGEM no braço (casas apertadas = digitação pedida; usa os sensores de casa)
    //   sound   = 'off' (não confere o som) · 'chord' (as notas tocadas formam o acorde pedido) · 'strings' (corda a corda)
    // `validate` ('strings'|'chord'|'neck'|'timing') é o atalho antigo.
    const old = { strings: [false, 'strings'], chord: [false, 'chord'], neck: [true, 'off'], timing: [false, 'off'] }[o.validate || (o.checkStrings === false ? 'timing' : 'strings')];
    this.neckOn = o.neckOn ?? old[0]; this.sound = o.sound ?? old[1]; this.free = this.sound !== 'strings';
    this.tol = TOLERANCE[o.tolerance] ?? 1;
    this.dirMode = o.dirMode || 'soft';   // 'off' não confere ↓/↑ · 'soft' (padrão) rebaixa a nota · 'strict' direção errada = erro
    this.neck = o.neck || null;
    this.asm = score.assemble || null;   // exercício de MONTAGEM de acorde (levantar a mão, montar, segurar)
    this.lastLift = -Infinity; this.prevComplete = -Infinity;   // () => Map(corda -> casa apertada) | null (sem sensor)
    this.tuning = o.strings ?? STANDARD; this.bpm = o.bpm ?? score.bpm; this.sub = score.subdivision;
    this.events = score.events.map((ev, i) => ({ ev, i })).filter((x) => isScored(x.ev));
    this.gapOf = new Map(this.events.map((x, k) => { const nx = this.events[(k + 1) % this.events.length].ev, g = nx.beat - x.ev.beat; return [x.ev, g > 1e-6 ? g : (this.len - x.ev.beat + this.events[0].ev.beat) || this.len]; }));
    this.states = new Map(); this.cursor = { p: 0, k: 0 }; this.pending = []; this.results = []; this.extras = 0; this.avoidHits = 0;
  }

  setTempo(bpmEff) { this.bpm = bpmEff; }
  get win() { return windowsMs(this.bpm, this.sub, this.tol); }
  toBeats(ms) { return ms * this.bpm / 60000; }
  // Eventos com várias cordas (palhetada ou notas simultâneas) chegam espalhados no tempo.
  spreadB(ev) {
    if (!(ev.kind === 'strum' || expectedStrings(ev).length > 1)) return 0;
    const gapMs = (this.gapOf.get(ev) ?? 4) * 60000 / this.bpm;   // tempo até o PRÓXIMO evento avaliado
    return this.toBeats(Math.min(SPREAD.max, Math.max(SPREAD.min, gapMs * SPREAD.frac)));
  }
  // Fim da janela de um evento: com tempo exigido, só a tolerância; sem tempo ("esperar acerto"), vale o trecho
  // inteiro do compasso/acorde (dur) — a linha do tempo anda no BPM configurado e o acerto pode vir a qualquer momento dele.
  endB(ev) { const okB = this.toBeats(this.win.ok); return ev.check.timing ? okB + this.spreadB(ev) : Math.max(okB + this.spreadB(ev), ev.dur || 0); }
  stateOf(p, k) {
    const { ev, i } = this.events[k], key = `${p}:${i}`;
    let st = this.states.get(key);
    if (!st) this.states.set(key, st = { key, p, i, ev, beat: p * this.len + ev.beat, matched: new Map(), order: [], firstBeat: null, avoid: 0, resolved: false });
    return st;
  }

  // Registra uma nota ligada. Devolve o feedback imediato: [{type:'hit'|'wrongPitch'|'avoid'|'extra', string, note, key?, expectedNote?}]
  noteOn({ string, note, beat }) {
    if (this.asm) return this.asmNote(beat);
    if (!this.events.length) return [];
    const okB = this.toBeats(this.win.ok);
    if (beat < this.events[0].ev.beat - okB) return [];
    const pb = Math.floor(beat / this.len);
    let best = null, bestDist = Infinity, near = false, avoidSt = null, tail = null;
    for (let p = Math.max(0, pb - 1); p <= pb + 1 && p < this.passes; p++) {
      for (let k = 0; k < this.events.length; k++) {
        const st = this.stateOf(p, k);
        // sem validar corda: as demais cordas da MESMA palhetada chegam depois da 1ª e não são "extras"
        if (this.free && st.resolved && st.firstBeat != null && beat >= st.firstBeat - this.toBeats(20) && beat <= st.firstBeat + this.spreadB(st.ev) + this.toBeats(40) && beat - (st.lastNote ?? st.firstBeat) <= this.toBeats(260) && !st.order.includes(string)) tail ||= st;   // a MESMA corda de novo = palhetada nova   // continua a mesma palhetada: a corda seguinte chega até 260 ms depois da anterior
        if (st.resolved || beat < st.beat - okB || beat > st.beat + this.endB(st.ev)) continue;
        if (this.free) { if (this.deferred(st.ev) && st.firstBeat != null && (beat > st.firstBeat + this.spreadB(st.ev) + this.toBeats(60) || st.heard?.some((h) => h.string === string))) continue; if (expectedStrings(st.ev).length && !st.matched.size) { const d = st.firstBeat != null ? 0 : Math.abs(beat - st.beat); if (d < bestDist) { best = st; bestDist = d; } } continue; }
        if (st.ev.avoid?.includes(string)) avoidSt ||= st;
        if (!expectedStrings(st.ev).includes(string)) { near = true; continue; }
        const m = st.matched.get(string);
        if (m?.ok) continue;
        if (st.firstBeat != null && expectedStrings(st.ev).length > 1 && beat > st.firstBeat + this.spreadB(st.ev)) continue;
        const d = st.firstBeat != null ? 0 : Math.abs(beat - st.beat);   // a palhetada já em andamento fica com as cordas que faltam
        if (d < bestDist) { best = st; bestDist = d; }
      }
    }
    if (tail) { tail.lastNote = beat; return [{ type: 'hit', string, note, key: tail.key, tail: true }]; }   // a palhetada em andamento tem prioridade sobre abrir a próxima
    if (!best) {
      if (avoidSt) { avoidSt.avoid++; this.avoidHits++; return [{ type: 'avoid', string, note, key: avoidSt.key }]; }
      this.extras++; return [{ type: 'extra', string, note, near }];
    }
    if (this.free) {   // sem validar corda a corda: a 1ª nota na janela define o tempo; o resto depende do modo
      const st = best, exp = expectedStrings(st.ev);
      if (st.firstBeat == null) st.firstBeat = beat;
      st.lastNote = beat; st.order.push(string);
      const nr = this.neckOn ? this.neckCheck(st.ev) : { ok: true };
      if (this.deferred(st.ev)) {
        const first = !st.heard?.length; st.neckRes ??= nr; (st.heard ||= []).push({ string, note });
        return [{ type: first && !nr.ok ? 'wrongNeck' : 'hit', string, note, key: st.key, why: first && !nr.ok ? nr.why : undefined }];   // montagem errada avisa já na 1ª corda; o resultado sai ao fim da palhetada
      }   // avalia quando a palhetada terminar (advance)
      if (nr.ok) for (const x of exp) st.matched.set(x, { ok: true, note, beat });
      else st.why = nr.why;
      this.resolve(st);
      return [{ type: nr.ok ? 'hit' : 'wrongNeck', string, note, key: st.key, why: st.why }];
    }
    const exp = expectedPitch(best.ev, string, this.offset, this.tuning);
    const checked = best.ev.check.pitch && exp != null && (best.ev.kind === 'note' || this.rigor === 'strict');
    const pitchOk = !checked || note === exp;
    best.matched.set(string, { ok: pitchOk, note, beat });
    if (pitchOk && best.firstBeat == null) { best.firstBeat = beat; if (this.neckOn) best.neckRes = this.neckCheck(best.ev); }   // o tempo conta a partir da 1ª nota CORRETA
    best.order.push(string);
    const fb = [{ type: pitchOk ? 'hit' : 'wrongPitch', string, note, expectedNote: exp, key: best.key }];
    if (expectedStrings(best.ev).every((s) => best.matched.get(s)?.ok)) this.resolve(best);
    return fb;
  }

  // Finaliza (como perdidos ou parciais) os eventos cuja janela já expirou antes de `beat`. Devolve os resultados.
  advance(beat) {
    if (this.asm) { this.asmTick(beat); const o = this.pending; this.pending = []; return o; }
    const okB = this.toBeats(this.win.ok);
    while (this.cursor.p < this.passes) {
      const { p, k } = this.cursor;
      if (k >= this.events.length) { this.cursor = { p: p + 1, k: 0 }; continue; }
      const st = this.stateOf(p, k);
      if (!st.resolved) {
        if (this.deferred(st.ev) && st.heard?.length && (beat > st.firstBeat + this.spreadB(st.ev) + this.toBeats(60) || st.beat + this.endB(st.ev) < beat)) this.resolveChord(st);
        else { if (st.beat + this.endB(st.ev) >= beat) break; this.resolve(st); }
      }
      this.cursor.k++;
    }
    const out = this.pending; this.pending = []; return out;
  }
  drain() { const out = this.pending; this.pending = []; return out; }

  // Resolver só quando a palhetada terminar: acorde pelo som, ou direção ↓/↑ (precisa ver as cordas na ordem)
  deferred(ev) { return this.sound === 'chord' || (this.dirMode !== 'off' && ev.kind === 'strum' && ev.strum?.dir && ev.check.dir && expectedStrings(ev).length >= 3); }
  // ---- validação pelo ACORDE: variações contam como o acorde pedido ----
  // O que define o acorde é a raiz + a terça (ou a 2ª/4ª nos suspensos) + a sétima, se o pedido tiver. Notas a mais
  // (add9, baixo diferente como /E, quinta dobrada…) NÃO tiram o acerto: C pedido e Cadd9/E tocado = C certo.
  resolveChord(st) {
    const ev = st.ev, exp = expectedStrings(ev), want = exp.map((x) => expectedPitch(ev, x, this.offset, this.tuning)).filter((n) => n != null);
    const heardNotes = st.heard.map((h) => h.note), P = new Set(heardNotes.map((n) => n % 12));
    const rootPc = want.length ? Math.min(...want) % 12 : null;
    const rel = new Set(want.map((n) => ((n % 12) - rootPc + 12) % 12));
    const essential = new Set([0]);
    for (const [a, b] of [[4, 3], [3, 4]]) if (rel.has(a)) essential.add(a);          // terça (maior ou menor)
    if (![3, 4].some((x) => rel.has(x))) { if (rel.has(2)) essential.add(2); if (rel.has(5)) essential.add(5); if (rel.size === 2 && rel.has(7)) essential.add(7); }   // sus / power chord
    for (const x of [10, 11]) if (rel.has(x)) essential.add(x);                          // sétima, se o pedido a tem
    const missing = [...essential].filter((r) => !P.has((rootPc + r) % 12));
    let ok;
    if (this.sound !== 'chord' || rootPc == null) ok = true;
    else if (this.rigor === 'root') ok = P.has(rootPc) && (want.length < 2 || P.size >= 2);
    else ok = missing.length === 0;
    const nk = st.neckRes && !st.neckRes.ok ? st.neckRes : null;
    st.heardName = detectChord(heardNotes)?.name || null;   // o que o som realmente formou (para mostrar ao vivo)
    if (ok && !nk) for (const x of exp) st.matched.set(x, { ok: true, note: 0, beat: st.firstBeat });
    else if (nk) st.why = nk.why;
    else st.why = { type: 'chord', text: `Acorde diferente do pedido — faltou ${missing.map((r) => pcName(rootPc + r)).join(', ')}${st.heardName ? ` (você fez ${st.heardName})` : ''}` };
    return this.resolve(st);
  }
  // ---- validação pelo BRAÇO: as casas apertadas agora são as do acorde pedido? (sem sensor = não confere) ----
  neckCheck(ev) {
    const nk = this.neck?.(); if (!nk) return { ok: true, unavailable: true };
    const need = ev.kind === 'strum' ? ev.strum.strings.map((x) => [x, ev.strum.frets?.[x] ?? 0]) : (ev.notes || []).map((n) => [n.string, n.fret]);
    for (const [x, f] of need.filter(([, f]) => f > 0)) {
      const got = nk.get(x);
      if (got !== f) return { ok: false, why: { type: 'neck', text: got == null ? `Falta apertar a corda ${6 - x}, casa ${f}` : `Corda ${6 - x}: você apertou a casa ${got}, o pedido é a ${f}` } };
    }
    return { ok: true };
  }

  // ================= MONTAGEM DE ACORDE =================
  // Para cada acorde (um evento por acorde): 1) levantar a mão (nenhuma casa apertada) depois do acorde anterior;
  // 2) montar exatamente as casas do acorde; 3) segurar `hold` s; 4) (opcional) palhetar. O TEMPO vale pelo instante em que a
  // montagem ficou certa (a janela de acerto é a mesma dos outros exercícios). Precisa dos sensores de casa (CC 49/50).
  // casas do acorde por corda (-1 = não toca): vêm de strum.frets ou, nos exercícios de troca de acordes, de `notes`
  asmFrets(ev) {
    if (ev.strum?.frets) return ev.strum.frets;
    const f = Array(6).fill(-1); for (const n of ev.notes || []) f[n.string] = n.fret; return f;
  }
  asmNeed(ev) { return this.asmFrets(ev).map((fr, s) => [s, fr]).filter(([, fr]) => fr > 0); }
  asmCorrect(ev, nk) {
    const f = this.asmFrets(ev);
    for (const [s, fr] of this.asmNeed(ev)) if (nk.get(s) !== fr) return false;
    for (const [s] of nk) if (f[s] === 0) return false;   // corda que deveria ficar solta está apertada
    return true;
  }
  asmWhy(ev, nk, liftOk) {
    if (!liftOk) return { type: 'lift', text: 'Levante a mão antes de montar o próximo acorde' };
    const f = this.asmFrets(ev);
    for (const [s, fr] of this.asmNeed(ev)) { const got = nk.get(s); if (got == null) return { type: 'asm', text: `Falta apertar a corda ${6 - s}, casa ${fr}` }; if (got !== fr) return { type: 'asm', text: `Corda ${6 - s}: você apertou a casa ${got}, o pedido é a ${fr}` }; }
    for (const [s, g] of nk) if (f[s] === 0) return { type: 'asm', text: `A corda ${6 - s} deveria ficar solta (você apertou a casa ${g})` };
    return { type: 'asm', text: 'Montagem diferente do pedido' };
  }
  neckUpdate(beat) { this.asmTick(beat); }
  asmNote(beat) { for (const st of this.asmActive ? [this.asmActive] : []) if (st.held && !st.strummed) { st.strummed = true; this.asmTick(beat); } return []; }
  asmTick(beat) {
    const okB = this.toBeats(this.win.ok), holdB = this.toBeats((this.asm.hold ?? 0.3) * 1000), nk = this.neck?.();
    if (nk && nk.size === 0) this.lastLift = beat;
    while (this.cursor.p < this.passes) {
      const { p, k } = this.cursor;
      if (k >= this.events.length) { this.cursor = { p: p + 1, k: 0 }; continue; }
      const st = this.stateOf(p, k);
      if (st.resolved) { this.cursor.k++; continue; }
      this.asmActive = st;
      if (!nk) {   // sem sensor (modo demo): não dá para conferir a montagem; resolve no tempo como "no limite" avisando
        if (beat < st.beat) return;
        st.firstBeat = st.beat + okB * 0.9; for (const x of expectedStrings(st.ev)) st.matched.set(x, { ok: true, note: 0, beat });
        st.why = { type: 'nosensor', text: 'Sem sensor de casas: montagem não conferida' }; this.resolve(st); this.prevComplete = beat; this.cursor.k++; continue;
      }
      const first = p === 0 && k === 0, liftOk = first || this.lastLift > this.prevComplete;
      const correct = liftOk && this.asmCorrect(st.ev, nk);
      if (!st.held) {
        if (correct) { st.est ??= beat; if (beat - st.est >= holdB) { st.held = true; st.complete = st.est; } } else st.est = null;
      }
      if (st.held && (!this.asm.strum || st.strummed)) {
        st.firstBeat = st.complete; for (const x of expectedStrings(st.ev)) st.matched.set(x, { ok: true, note: 0, beat: st.complete });
        this.resolve(st); this.prevComplete = beat; this.cursor.k++; continue;
      }
      const lateEst = beat > st.beat + okB && st.est == null, lateStrum = st.held && this.asm.strum && beat > st.beat + okB + holdB + (st.ev.dur || 1);
      if (lateEst || lateStrum) {
        st.why = lateStrum ? { type: 'asm', text: 'Montou, mas faltou palhetar' } : this.asmWhy(st.ev, nk, liftOk);
        this.resolve(st); this.prevComplete = beat; this.cursor.k++; continue;
      }
      return;   // só um acorde por vez está "ativo"
    }
  }

  resolve(st) {
    st.resolved = true;
    const ev = st.ev, exp = expectedStrings(ev);
    const okStrings = exp.filter((s) => st.matched.get(s)?.ok);
    const coverage = exp.length ? okStrings.length / exp.length : 1;
    const delta = st.firstBeat == null ? null : (st.firstBeat - st.beat) * 60000 / this.bpm;
    let grade = 'miss', dirOk = null, dir = null;
    if (okStrings.length) {
      grade = ev.check.timing && delta != null ? gradeOf(Math.abs(delta), this.win) : 'perfect';
      if (coverage < 1) grade = coverage < 0.5 ? 'miss' : capOk(grade);
      if (st.avoid) grade = capOk(grade);
      dir = dirOfOrder(st.order.filter((s) => st.matched.get(s)?.ok));   // null = não dá para saber (poucas cordas)
      if (this.dirMode !== 'off' && ev.check.dir && ev.strum?.dir && dir) {
        dirOk = dir === ev.strum.dir;
        if (!dirOk) {
          if (this.dirMode === 'strict') { grade = 'miss'; st.why ||= { type: 'dir', text: `Direção errada: o pedido era ${dirArrow(ev.strum.dir)}, você fez ${dirArrow(dir)}` }; }
          else if (grade === 'perfect') grade = 'good';
        }
      }
    }
    if (st.neckRes && !st.neckRes.ok && grade !== 'miss') { grade = 'miss'; st.why = st.neckRes.why; }
    const strings = {};
    for (const s of exp) { const m = st.matched.get(s); strings[s] = m ? (m.ok ? 'ok' : 'pitch') : 'miss'; }
    const r = { key: st.key, p: st.p, i: st.i, beat: st.beat, grade, delta, coverage, dirOk, dir, strings, avoid: st.avoid, stringsOk: okStrings.length, stringsTotal: exp.length, timed: !!ev.check.timing, why: st.why || null, heardName: st.heardName || null };
    this.results.push(r); this.pending.push(r);
    return r;
  }

  summary() {
    const rs = this.results, n = rs.length;
    const count = (g) => rs.filter((r) => r.grade === g).length;
    const timed = rs.filter((r) => r.grade !== 'miss' && r.timed && r.delta != null);
    const dirs = rs.filter((r) => r.dirOk !== null);
    return {
      expected: n, perfect: count('perfect'), good: count('good'), ok: count('ok'), miss: count('miss'), extras: this.extras, avoidHits: this.avoidHits,
      accuracy: n ? Math.round(rs.reduce((a, r) => a + GRADE_WEIGHT[r.grade], 0) / n * 100) : 0,
      timingMeanMs: timed.length ? timed.reduce((a, r) => a + r.delta, 0) / timed.length : null,
      stringsOk: rs.reduce((a, r) => a + r.stringsOk, 0), stringsTotal: rs.reduce((a, r) => a + r.stringsTotal, 0),
      dirAccuracy: dirs.length ? Math.round(dirs.filter((r) => r.dirOk).length / dirs.length * 100) : null,
    };
  }
}

// Modo "esperar": avalia uma tentativa (conjunto de notas tocadas) contra um evento, sem tempo.
export function evalAttempt(ev, played, { pitchOffset = 0, rigor = 'normal', strings = STANDARD } = {}) {
  const exp = expectedStrings(ev), got = new Map();
  for (const n of played) got.set(n.string, n.note);
  const missing = exp.filter((s) => !got.has(s));
  const wrongPitch = exp.filter((s) => {
    if (!got.has(s)) return false;
    const p = expectedPitch(ev, s, pitchOffset, strings);
    return ev.check.pitch && p != null && (ev.kind === 'note' || rigor === 'strict') && got.get(s) !== p;
  });
  const avoid = (ev.avoid || []).filter((s) => got.has(s));
  const extras = [...got.keys()].filter((s) => !exp.includes(s) && !avoid.includes(s));
  const ok = !missing.length && !wrongPitch.length && !avoid.length && (ev.kind === 'strum' || !extras.length);
  return { ok, missing, wrongPitch, avoid, extras, good: exp.filter((s) => got.has(s) && !wrongPitch.includes(s)) };
}

// Acorde tocado num trecho (v1): usa matchChord sobre todas as notas ouvidas.
export function chordCheck(notes, chord, rigor) {
  if (notes.length < 2) return { ok: false, heard: false };
  return { ok: matchChord(notes, { root: chord.root, q: chord.q }, rigor).ok, heard: true };
}
