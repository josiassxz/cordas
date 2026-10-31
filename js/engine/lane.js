// Pista vertical de ritmo ("setas descendo"): o tempo corre de cima para baixo até a linha de acerto.
// Mostra exatamente a divisão do compasso configurada: compassos, batidas (1 2 3 4) e subdivisões (e & a / trip let),
// uma coluna da "mão" (↓ nos tempos, ↑ nos contratempos; as batidas do exercício acendem, as demais ficam fantasma)
// e uma coluna por corda, para sempre dar para ver QUAL corda tocar e em qual casa/dedo.
// Mesma interface do Highway: new Lane(canvas, () => ({ score, pos, results, passes, state })).start()/stop().

const VIS_BEATS = 4.2;       // batidas visíveis acima da linha de acerto
const TAIL_BEATS = 0.9;      // batidas abaixo da linha (já passaram)
const NAMES = ['E', 'A', 'D', 'G', 'B', 'E'];
const SUB_LABELS = { 1: [''], 2: ['', '&'], 3: ['', 'tri', 'let'], 4: ['', 'e', '&', 'a'] };
const TECH_LABEL = { hammer: 'martelo', pull: 'puxada', slide: 'slide', bend: 'bend', vibrato: 'vibrato', mute: 'abafado', palm: 'P.M.' };

export class Lane {
  constructor(canvas, view) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.view = view; this.raf = 0; this.colors = {};
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['--tx', '--tx-2', '--tx-3', '--hair-2', '--accent', '--ok', '--bad', '--expected', '--f1', '--f2', '--f3', '--f4', '--avoid']) this.colors[k] = cs.getPropertyValue(k).trim() || '#888';
  }
  start() { const loop = () => { this.draw(); this.raf = requestAnimationFrame(loop); }; loop(); }
  stop() { cancelAnimationFrame(this.raf); }

  fit() {
    const dpr = window.devicePixelRatio || 1, w = this.cv.clientWidth, h = this.cv.clientHeight;
    if (this.cv.width !== Math.round(w * dpr) || this.cv.height !== Math.round(h * dpr)) { this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [w, h];
  }

  // Seta ↓/↑ com haste e ponta; (x,y) = centro.
  arrow(x, y, dir, size, color, glow = 0) {
    const c = this.ctx, s = size, d = dir === 'D' ? 1 : -1;
    c.save(); c.translate(x, y); c.scale(1, d);
    if (glow) { c.shadowColor = color; c.shadowBlur = glow; }
    c.fillStyle = color; c.strokeStyle = color; c.lineWidth = s * 0.26; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(0, -s * 0.62); c.lineTo(0, s * 0.1); c.stroke();                       // haste
    c.beginPath(); c.moveTo(-s * 0.56, s * 0.0); c.lineTo(0, s * 0.64); c.lineTo(s * 0.56, s * 0.0); c.closePath(); c.fill(); // ponta
    c.restore();
  }

  draw() {
    const v = this.view(), c = this.ctx, C = this.colors;
    if (!v?.score) return;
    const [W, H] = this.fit();
    c.clearRect(0, 0, W, H);
    const sc = v.score, len = sc.lengthBeats, bpb = sc.beatsPerBar, sub = Math.max(1, Math.min(4, sc.subdivision || 2));
    const pos = v.pos, hitY = Math.round(H * 0.8), topY = 26, ppb = (hitY - topY) / VIS_BEATS;
    const Y = (abs) => hitY - (abs - pos) * ppb;

    // geometria horizontal: [gutter | mão | cordas]
    const gutter = 58, hand = 64, laneL = gutter + hand + 10, laneR = W - 24, lw = Math.max(120, laneR - laneL);
    const colW = lw / 6, SX = (s) => laneL + colW * (s + 0.5);

    // fundo e colunas das cordas (grave à esquerda, aguda à direita)
    for (let s = 0; s < 6; s++) {
      c.fillStyle = s % 2 ? 'rgba(255,255,255,.018)' : 'rgba(255,255,255,.036)'; c.fillRect(laneL + colW * s, topY - 8, colW, H - topY - 4);
      c.strokeStyle = C['--hair-2']; c.lineWidth = 1 + (5 - s) * 0.0 + (s < 3 ? 0.8 : 0.2);
      c.beginPath(); c.moveTo(SX(s), topY - 8); c.lineTo(SX(s), H - 4); c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,.035)'; c.fillRect(gutter + 4, topY - 8, hand + 4, H - topY - 4);

    // grade de tempo: compasso > batida > subdivisão (com rótulos)
    const slot = 1 / sub, first = Math.floor((pos - TAIL_BEATS) / slot), last = Math.ceil((pos + VIS_BEATS + 0.2) / slot);
    c.textBaseline = 'middle';
    for (let k = first; k <= last; k++) {
      const abs = k * slot, y = Y(abs); if (y < topY - 10 || y > H) continue;
      const beat = Math.round(abs * 1e6) / 1e6, onBeat = Math.abs(abs - Math.round(abs)) < 1e-6;
      const bi = ((Math.round(abs) % bpb) + bpb) % bpb, bar = onBeat && bi === 0;
      const past = abs < pos - 1e-6 ? Math.max(0.25, 1 - (pos - abs) / TAIL_BEATS) : 1;
      c.globalAlpha = past;
      c.strokeStyle = bar ? 'rgba(255,255,255,.34)' : onBeat ? 'rgba(255,255,255,.17)' : 'rgba(255,255,255,.06)';
      c.lineWidth = bar ? 2 : 1; if (!onBeat) c.setLineDash([2, 5]);
      c.beginPath(); c.moveTo(gutter - 6, y); c.lineTo(laneR + 8, y); c.stroke(); c.setLineDash([]);
      // rótulo: número do tempo (grande) ou subdivisão (pequeno)
      if (abs >= -1e-6 || true) {
        c.textAlign = 'right';
        if (onBeat) { c.fillStyle = bar ? C['--accent'] : C['--tx']; c.font = `${bar ? 800 : 700} ${bar ? 20 : 17}px ui-rounded,system-ui`; c.fillText(String(bi + 1), gutter - 12, y); }
        else { const j = Math.round((abs - Math.floor(abs)) * sub); c.fillStyle = C['--tx-3']; c.font = '600 12px ui-sans-serif,system-ui'; c.fillText(SUB_LABELS[sub]?.[j] || '', gutter - 12, y); }
      }
      if (bar && abs >= 0) { c.textAlign = 'right'; c.fillStyle = C['--tx-3']; c.font = '600 10px ui-sans-serif,system-ui'; c.fillText(`compasso ${Math.floor(abs / bpb) + 1}`, laneR + 6, y - 8); }
      c.globalAlpha = 1;
    }

    // coluna da mão: seta fantasma em cada fatia (↓ nos tempos, ↑ nos contratempos); as do exercício acendem depois
    const handX = gutter + 4 + (hand + 4) / 2;
    for (let k = first; k <= last; k++) {
      const abs = k * slot, y = Y(abs); if (y < topY || y > H - 6 || abs < -1e-6) continue;
      const onBeat = Math.abs(abs - Math.round(abs)) < 1e-6;
      c.globalAlpha = (abs < pos ? Math.max(0.05, 0.2 - (pos - abs) / TAIL_BEATS * 0.2) : 0.2);
      this.arrow(handX, y, onBeat ? 'D' : 'U', onBeat ? 17 : 13, C['--tx-2']);
      c.globalAlpha = 1;
    }

    // acordes da progressão
    if (sc.chords?.length) {
      c.font = '800 17px ui-rounded,system-ui'; c.textAlign = 'left';
      for (let p = Math.max(0, Math.floor((pos - TAIL_BEATS) / len)); p * len <= pos + VIS_BEATS && p < v.passes; p++) for (const ch of sc.chords) {
        const abs = p * len + ch.beat, y = Y(abs); if (y < topY - 4 || y > H) continue;
        c.fillStyle = abs < pos ? C['--tx-3'] : C['--tx']; c.fillText(ch.chordId, laneL + 6, y - 14);
      }
    }

    // eventos
    const p0 = Math.max(0, Math.floor((pos - TAIL_BEATS - 1) / len)), p1 = Math.floor((pos + VIS_BEATS + 1) / len);
    for (let p = p0; p <= p1 && p < v.passes; p++) sc.events.forEach((ev, i) => {
      const abs = p * len + ev.beat, y = Y(abs);
      if (y < topY - 30 || y > H + 20) return;
      const res = v.results.get(`${p}:${i}`), past = hitY - y;
      c.globalAlpha = res ? Math.max(0.15, 1 - Math.max(0, past) / (ppb * 1.2)) : past > ppb * 0.35 ? Math.max(0.1, 1 - (past - ppb * 0.35) / (ppb * 0.7)) : 1;
      this.drawEvent(ev, y, SX, colW, handX, res);
      c.globalAlpha = 1;
    });

    // linha de acerto + pulso do metrônomo
    const frac = pos - Math.floor(pos), pulse = pos >= 0 && v.state === 'running' ? Math.max(0, 1 - frac * 3.2) : 0;
    const accent = pos >= 0 && Math.floor(pos) % bpb === 0;
    const gcol = accent ? '245,165,36' : '255,255,255';
    const g = c.createLinearGradient(0, hitY - 18, 0, hitY + 18);
    g.addColorStop(0, `rgba(${gcol},0)`); g.addColorStop(0.5, `rgba(${gcol},${0.18 + 0.5 * pulse})`); g.addColorStop(1, `rgba(${gcol},0)`);
    c.fillStyle = g; c.fillRect(gutter - 6, hitY - 18, laneR - gutter + 14, 36);
    c.fillStyle = `rgba(255,255,255,${0.75 + 0.25 * pulse})`; c.fillRect(gutter - 6, hitY - 1.5, laneR - gutter + 14, 3);
    // rótulos das cordas na linha de acerto
    c.textAlign = 'center'; c.font = '700 12px ui-sans-serif,system-ui'; c.fillStyle = C['--tx-2'];
    for (let s = 0; s < 6; s++) c.fillText(NAMES[s], SX(s), hitY + 26);
    c.fillStyle = C['--tx-3']; c.font = '600 10px ui-sans-serif'; c.fillText('mão', handX, hitY + 26);

    if (pos < 0) { c.fillStyle = C['--accent']; c.font = '800 96px ui-rounded,system-ui'; c.textAlign = 'center'; c.globalAlpha = 0.9; c.fillText(String(Math.ceil(-pos)), laneL + lw / 2, H * 0.4); c.globalAlpha = 1; }
    if (v.state === 'paused') { c.fillStyle = 'rgba(10,11,15,.66)'; c.fillRect(0, 0, W, H); c.fillStyle = C['--tx']; c.font = '700 24px ui-rounded,system-ui'; c.textAlign = 'center'; c.fillText('Pausado', W / 2, H / 2 - 8); c.fillStyle = C['--tx-2']; c.font = '14px ui-sans-serif'; c.fillText('Tempo, metrônomo e avaliação estão parados', W / 2, H / 2 + 20); }
  }

  drawEvent(ev, y, SX, colW, handX, res) {
    const c = this.ctx, C = this.colors, guide = !ev.check.strings && ev.kind !== 'rest';
    const stateColor = (s) => (res ? (s === 'ok' ? C['--ok'] : s === 'pitch' ? C['--accent'] : C['--bad']) : null);
    const fingerColor = (f) => (f ? C[`--f${f}`] : C['--expected']);
    const strings = ev.kind === 'strum' ? ev.strum.strings : (ev.notes || []).map((n) => n.string);
    if (!strings.length) return;
    const gc = res ? (res.grade === 'miss' ? C['--bad'] : res.grade === 'ok' ? C['--accent'] : C['--ok']) : C['--tx'];
    const h = Math.min(30, colW * 0.62);
    if (ev.kind === 'strum') {
      const x0 = SX(Math.min(...strings)) - colW * 0.42, x1 = SX(Math.max(...strings)) + colW * 0.42;
      c.beginPath(); c.roundRect(x0, y - h / 2 - 3, x1 - x0, h + 6, (h + 6) / 2);
      c.fillStyle = res ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.09)'; c.fill();
      c.strokeStyle = res ? gc : 'rgba(255,255,255,.28)'; c.lineWidth = 1.5; if (guide) c.setLineDash([4, 4]); c.stroke(); c.setLineDash([]);
    }
    strings.forEach((s) => {
      const f = ev.kind === 'strum' ? ev.strum.frets?.[s] : ev.notes.find((n) => n.string === s)?.fret;
      const fin = ev.kind === 'strum' ? ev.strum.fingers?.[s] : ev.notes.find((n) => n.string === s)?.finger;
      const col = stateColor(res?.strings?.[s]) || fingerColor(fin), r = h * 0.5;
      c.beginPath(); c.arc(SX(s), y, r, 0, 6.3);
      if (guide) { c.strokeStyle = C['--tx-2']; c.setLineDash([3, 3]); c.lineWidth = 1.5; c.stroke(); c.setLineDash([]); } else { c.fillStyle = col; c.globalAlpha *= res?.strings?.[s] === 'miss' ? 0.5 : 1; c.fill(); c.globalAlpha = Math.min(1, c.globalAlpha / (res?.strings?.[s] === 'miss' ? 0.5 : 1)); }
      if (f != null && !guide) { c.fillStyle = '#10131a'; c.font = '800 13px ui-rounded,system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(f), SX(s), y + 0.5); }
    });
    // seta da mão (↓/↑) na coluna da mão — a "batida" do exercício
    const dir = ev.kind === 'strum' ? ev.strum.dir : ev.pick;
    if (dir) {
      c.beginPath(); c.arc(handX, y, 19, 0, 6.3); c.fillStyle = 'rgba(255,255,255,.08)'; c.fill(); c.strokeStyle = gc; c.lineWidth = 2; c.stroke();
      this.arrow(handX, y, dir, 20, gc, res ? 0 : 10);
    }
    if (ev.tech && TECH_LABEL[ev.tech]) { c.fillStyle = C['--tx-3']; c.font = '600 10px ui-sans-serif'; c.textAlign = 'center'; c.fillText(TECH_LABEL[ev.tech], handX, y + 28); }
    (ev.avoid || []).forEach((s) => { const x = SX(s); c.strokeStyle = C['--avoid']; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x - 6, y - 6); c.lineTo(x + 6, y + 6); c.moveTo(x + 6, y - 6); c.lineTo(x - 6, y + 6); c.stroke(); });
  }
}
