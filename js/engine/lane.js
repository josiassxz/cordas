// Pista horizontal de ritmo (estilo "Slider Tab"): o tempo corre da direita para a esquerda até a barra de agora.
// Seis linhas de corda numeradas 1–6 (1 = mais fina, em cima), blocos dourados com a seta da palhetada (↓/↑) e
// a divisão do compasso configurada (compasso > tempo > subdivisão). Sem bolinhas: o bloco cobre as cordas do acorde
// e o número da casa aparece escrito dentro dele. Mesma interface do Highway:
//   new Lane(canvas, () => ({ score, pos, results, passes, state })).start() / .stop()

const VIS_BEATS = 5.2;       // batidas visíveis à direita da barra de agora
const TAIL_BEATS = 0.8;      // batidas já passadas, à esquerda
const SUB_LABELS = { 1: [''], 2: ['', '&'], 3: ['', 'tri', 'let'], 4: ['', 'e', '&', 'a'] };
const TECH_LABEL = { hammer: 'martelo', pull: 'puxada', slide: 'slide', bend: 'bend', vibrato: 'vibrato', mute: 'abafado', palm: 'P.M.' };

export class Lane {
  constructor(canvas, view) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.view = view; this.raf = 0; this.colors = {};
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['--tx', '--tx-2', '--tx-3', '--hair-2', '--accent', '--accent-2', '--ok', '--bad', '--expected', '--f1', '--f2', '--f3', '--f4', '--avoid']) this.colors[k] = cs.getPropertyValue(k).trim() || '#888';
  }
  start() { const loop = () => { this.draw(); this.raf = requestAnimationFrame(loop); }; loop(); }
  stop() { cancelAnimationFrame(this.raf); }

  fit() {
    const dpr = window.devicePixelRatio || 1, w = this.cv.clientWidth, h = this.cv.clientHeight;
    if (this.cv.width !== Math.round(w * dpr) || this.cv.height !== Math.round(h * dpr)) { this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [w, h];
  }

  // Chevron(s) de palhetada: ↓ = "v", ↑ = "^"; (x,y) = centro.
  chevron(x, y, dir, size, color, n = 2) {
    const c = this.ctx, d = dir === 'D' ? 1 : -1;
    c.save(); c.translate(x, y); c.strokeStyle = color; c.lineWidth = Math.max(2.4, size * 0.22); c.lineCap = 'round'; c.lineJoin = 'round';
    for (let i = 0; i < n; i++) { const oy = (i - (n - 1) / 2) * size * 0.62 * d; c.beginPath(); c.moveTo(-size * 0.5, -size * 0.22 * d + oy); c.lineTo(0, size * 0.22 * d + oy); c.lineTo(size * 0.5, -size * 0.22 * d + oy); c.stroke(); }
    c.restore();
  }

  draw() {
    const v = this.view(), c = this.ctx, C = this.colors;
    if (!v?.score) return;
    const [W, H] = this.fit();
    c.clearRect(0, 0, W, H);
    const sc = v.score, len = sc.lengthBeats, bpb = sc.beatsPerBar, sub = Math.max(1, Math.min(4, sc.subdivision || 2));
    const pos = v.pos, nowX = Math.round(Math.max(70, Math.min(150, W * 0.13))), ppb = (W - nowX - 18) / VIS_BEATS;
    const X = (abs) => nowX + (abs - pos) * ppb;
    const top = 62, bottom = H - 14, rowH = (bottom - top) / 6, rowY = (s) => top + (5 - s) * rowH + rowH / 2;   // s=5 (corda 1, aguda) em cima

    // faixa de cima (contagem e mão) e linhas das cordas
    c.fillStyle = 'rgba(255,255,255,.035)'; c.fillRect(0, 0, W, 40);
    for (let s = 0; s < 6; s++) {
      const y = rowY(s), isBass = s < 3;
      c.strokeStyle = isBass ? 'rgba(212,160,60,.55)' : 'rgba(255,255,255,.2)'; c.lineWidth = isBass ? 1.4 : 1;
      c.beginPath(); c.moveTo(34, y); c.lineTo(W, y); c.stroke();
      c.fillStyle = isBass ? '#d4a03c' : C['--tx-2']; c.font = '600 14px ui-rounded,system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(6 - s), 16, y);
    }

    // grade do tempo: compasso > tempo > subdivisão, com rótulos na faixa de cima
    const slot = 1 / sub, first = Math.floor((pos - TAIL_BEATS) / slot), last = Math.ceil((pos + VIS_BEATS + 0.3) / slot);
    for (let k = first; k <= last; k++) {
      const abs = k * slot, x = X(abs); if (x < 36 || x > W + 4) continue;
      const onBeat = Math.abs(abs - Math.round(abs)) < 1e-6, bi = ((Math.round(abs) % bpb) + bpb) % bpb, bar = onBeat && bi === 0;
      const faded = abs < pos - 1e-6 ? 0.35 : 1;
      c.globalAlpha = faded;
      c.strokeStyle = bar ? 'rgba(255,255,255,.4)' : onBeat ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.07)';
      c.lineWidth = bar ? 2 : 1; if (!onBeat) c.setLineDash([2, 5]);
      c.beginPath(); c.moveTo(x, 40); c.lineTo(x, bottom + 4); c.stroke(); c.setLineDash([]);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      if (onBeat) { c.fillStyle = bar ? C['--accent'] : C['--tx']; c.font = `${bar ? 800 : 700} ${bar ? 18 : 15}px ui-rounded,system-ui`; c.fillText(String(bi + 1), x, 14); }
      else { const j = Math.round((abs - Math.floor(abs)) * sub); c.fillStyle = C['--tx-3']; c.font = '600 12px ui-sans-serif,system-ui'; c.fillText(SUB_LABELS[sub]?.[j] || '', x, 14); }
      // seta fantasma da mão (↓ nos tempos, ↑ nos contratempos)
      c.globalAlpha = faded * 0.3; this.chevron(x, 31, onBeat ? 'D' : 'U', onBeat ? 8 : 6, C['--tx-2'], 1); c.globalAlpha = 1;
      if (bar && abs >= 0) { c.fillStyle = C['--tx-3']; c.font = '600 10px ui-sans-serif'; c.textAlign = 'left'; c.fillText(`c.${Math.floor(abs / bpb) + 1}`, x + 5, bottom + 4 - 0); }
    }

    // acordes da progressão (nome grande acima das cordas)
    if (sc.chords?.length) {
      c.font = '800 16px ui-rounded,system-ui'; c.textAlign = 'left'; c.textBaseline = 'middle';
      for (let p = Math.max(0, Math.floor((pos - TAIL_BEATS) / len)); p * len <= pos + VIS_BEATS && p < v.passes; p++) for (const ch of sc.chords) {
        const x = X(p * len + ch.beat); if (x < 36 || x > W) continue;
        c.fillStyle = x < nowX ? C['--tx-3'] : C['--tx']; c.fillText(ch.chordId, x + 4, 52);
      }
    }

    // eventos (blocos)
    const p0 = Math.max(0, Math.floor((pos - TAIL_BEATS - 1) / len)), p1 = Math.floor((pos + VIS_BEATS + 1) / len);
    for (let p = p0; p <= p1 && p < v.passes; p++) sc.events.forEach((ev, i) => {
      const abs = p * len + ev.beat, x = X(abs);
      if (x < 30 - ppb || x > W + 40) return;
      const res = v.results.get(`${p}:${i}`), past = nowX - x;
      c.globalAlpha = res ? Math.max(0.15, 1 - Math.max(0, past) / (ppb * 1.2)) : past > ppb * 0.35 ? Math.max(0.08, 1 - (past - ppb * 0.35) / (ppb * 0.7)) : 1;
      this.drawEvent(ev, x, rowY, rowH, ppb, res);
      c.globalAlpha = 1;
    });

    // barra de agora: haste branca com cabeça e pulso na batida
    const frac = pos - Math.floor(pos), pulse = pos >= 0 && v.state === 'running' ? Math.max(0, 1 - frac * 3) : 0;
    const accent = pos >= 0 && Math.floor(pos) % bpb === 0;
    const glow = c.createLinearGradient(nowX - 26, 0, nowX + 26, 0), gc = accent ? '245,165,36' : '255,255,255';
    glow.addColorStop(0, `rgba(${gc},0)`); glow.addColorStop(0.5, `rgba(${gc},${0.1 + 0.4 * pulse})`); glow.addColorStop(1, `rgba(${gc},0)`);
    c.fillStyle = glow; c.fillRect(nowX - 26, top - 12, 52, bottom - top + 20);
    c.fillStyle = '#fff'; c.beginPath(); c.roundRect(nowX - 3.5, top - 8, 7, bottom - top + 14, 4); c.fill();
    c.beginPath(); c.arc(nowX, top - 11, 5.5 + 2 * pulse, 0, 6.3); c.fill();

    if (pos < 0) { c.fillStyle = C['--accent']; c.font = '800 80px ui-rounded,system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.globalAlpha = 0.9; c.fillText(String(Math.ceil(-pos)), W * 0.55, H / 2 + 6); c.globalAlpha = 1; }
    if (v.state === 'paused') { c.fillStyle = 'rgba(10,11,15,.66)'; c.fillRect(0, 0, W, H); c.fillStyle = C['--tx']; c.font = '700 22px ui-rounded,system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Pausado', W / 2, H / 2 - 8); c.fillStyle = C['--tx-2']; c.font = '14px ui-sans-serif'; c.fillText('Tempo, metrônomo e avaliação estão parados', W / 2, H / 2 + 18); }
  }

  drawEvent(ev, x, rowY, rowH, ppb, res) {
    const c = this.ctx, C = this.colors, guide = !ev.check.strings && ev.kind !== 'rest';
    const strings = ev.kind === 'strum' ? ev.strum.strings : (ev.notes || []).map((n) => n.string);
    if (!strings.length) return;
    const lo = Math.min(...strings), hi = Math.max(...strings);
    const w = Math.max(34, Math.min(ppb * Math.min(ev.dur || 0.5, 1) * 0.86, 78));
    const y0 = rowY(hi) - rowH * 0.46 - 24, y1 = rowY(lo) + rowH * 0.46, bx = x - w / 2;
    const okAll = res && res.grade !== 'miss';
    const base = res ? (res.grade === 'miss' ? ['#7a2f3a', '#a4414f'] : res.grade === 'ok' ? ['#c98a14', '#f1b43c'] : ['#2f9e6e', '#43d493']) : ['#c28a1c', '#f3c35a'];
    const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, base[1]); g.addColorStop(1, base[0]);
    c.beginPath(); c.roundRect(bx, y0, w, y1 - y0, 7);
    if (guide) { c.fillStyle = 'rgba(255,255,255,.05)'; c.fill(); c.setLineDash([4, 4]); c.strokeStyle = C['--tx-2']; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]); }
    else { c.fillStyle = g; c.shadowColor = 'rgba(243,195,90,.35)'; c.shadowBlur = res ? 0 : 10; c.fill(); c.shadowBlur = 0; }
    // brilho no topo do bloco (como no app de referência)
    if (!guide) { const h = c.createLinearGradient(0, y0, 0, y0 + (y1 - y0) * 0.5); h.addColorStop(0, 'rgba(255,255,255,.28)'); h.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = h; c.beginPath(); c.roundRect(bx, y0, w, (y1 - y0) * 0.5, 7); c.fill(); }
    // seta da palhetada
    const dir = ev.kind === 'strum' ? ev.strum.dir : ev.pick;
    if (dir) this.chevron(x, y0 + 17, dir, 12, guide ? C['--tx-2'] : '#fff6df', 2);
    // número da casa escrito em cada corda tocada (sem bolinha); a cor do dedo vira um traço embaixo do número
    c.textAlign = 'center'; c.textBaseline = 'middle';
    strings.forEach((s) => {
      const f = ev.kind === 'strum' ? ev.strum.frets?.[s] : ev.notes.find((n) => n.string === s)?.fret;
      const fin = ev.kind === 'strum' ? ev.strum.fingers?.[s] : ev.notes.find((n) => n.string === s)?.finger;
      const y = rowY(s), bad = res?.strings?.[s] && res.strings[s] !== 'ok';
      if (f != null && !guide) { c.fillStyle = bad ? '#3b0d14' : '#2a1d00'; c.font = '800 14px ui-rounded,system-ui'; c.fillText(String(f), x, y + 0.5); }
      if (fin && !guide) { c.fillStyle = C[`--f${fin}`]; c.beginPath(); c.roundRect(x - 8, y + 9, 16, 3, 2); c.fill(); }
    });
    if (ev.tech && TECH_LABEL[ev.tech]) { c.fillStyle = C['--tx-3']; c.font = '600 10px ui-sans-serif'; c.fillText(TECH_LABEL[ev.tech], x, y1 + 8); }
    (ev.avoid || []).forEach((s) => { const y = rowY(s); c.strokeStyle = C['--avoid']; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x - 6, y - 6); c.lineTo(x + 6, y + 6); c.moveTo(x + 6, y - 6); c.lineTo(x - 6, y + 6); c.stroke(); });
    void okAll;
  }
}
