// Pista horizontal de ritmo (estilo "Slider Tab"): o tempo corre da direita para a esquerda até a barra de agora.
// Seis linhas de corda numeradas 1–6 (1 = mais fina, em cima), blocos dourados com a seta da palhetada (↓/↑) e
// a divisão do compasso configurada (compasso > tempo > subdivisão). Sem bolinhas: o bloco cobre as cordas do acorde
// e o número da casa aparece escrito dentro dele. Mesma interface do Highway:
//   new Lane(canvas, () => ({ score, pos, results, passes, state })).start() / .stop()

const SPAN_BEATS = 7.4;      // batidas visíveis no total (antes + depois da barra de agora)
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
    c.save(); c.translate(x, y); c.strokeStyle = color; c.lineWidth = Math.max(3, size * 0.2); c.lineCap = 'round'; c.lineJoin = 'round';
    for (let i = 0; i < n; i++) { const oy = (i - (n - 1) / 2) * size * 0.62 * d; c.beginPath(); c.moveTo(-size * 0.5, -size * 0.24 * d + oy); c.lineTo(0, size * 0.24 * d + oy); c.lineTo(size * 0.5, -size * 0.24 * d + oy); c.stroke(); }
    c.restore();
  }

  draw() {
    const v = this.view(), c = this.ctx, C = this.colors;
    if (!v?.score) return;
    const [W, H] = this.fit();
    c.clearRect(0, 0, W, H);
    const sc = v.score, len = sc.lengthBeats, bpb = sc.beatsPerBar, sub = Math.max(1, Math.min(4, sc.subdivision || 2));
    const pos = v.pos, pastF = Math.max(0.1, Math.min(0.6, v.pastFrac ?? 0.3)), ppb = (W - 54) / SPAN_BEATS, nowX = Math.round(Math.max(110, 40 + (W - 54) * pastF));
    const TAIL_BEATS = (nowX - 36) / ppb, VIS_BEATS = (W - nowX) / ppb;   // quanto cabe para trás (acertos continuam visíveis) e para a frente
    const X = (abs) => nowX + (abs - pos) * ppb;
    const top = 80, bottom = H - 12, rowH = (bottom - top) / 6, rowY = (s) => top + (5 - s) * rowH + rowH / 2;   // s=5 (corda 1, aguda) em cima

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
      const faded = abs < pos - 1e-6 ? 0.6 : 1;
      c.globalAlpha = faded;
      c.strokeStyle = bar ? 'rgba(255,255,255,.4)' : onBeat ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.07)';
      c.lineWidth = bar ? 2 : 1; if (!onBeat) c.setLineDash([2, 5]);
      c.beginPath(); c.moveTo(x, 40); c.lineTo(x, bottom + 4); c.stroke(); c.setLineDash([]);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      if (onBeat) { c.fillStyle = bar ? C['--accent'] : C['--tx']; c.font = `${bar ? 800 : 700} ${bar ? 18 : 15}px ui-rounded,system-ui`; c.fillText(String(bi + 1), x, 14); }
      else { const j = Math.round((abs - Math.floor(abs)) * sub); c.fillStyle = C['--tx-3']; c.font = '600 12px ui-sans-serif,system-ui'; c.fillText(SUB_LABELS[sub]?.[j] || '', x, 14); }
      // seta fantasma da mão (↓ nos tempos, ↑ nos contratempos)
      c.globalAlpha = faded * 0.3; this.chevron(x, 31, onBeat ? 'D' : 'U', onBeat ? 10 : 8, C['--tx-2'], 1); c.globalAlpha = 1;
      if (bar && abs >= 0) { c.fillStyle = C['--tx-3']; c.font = '600 10px ui-sans-serif'; c.textAlign = 'left'; c.fillText(`c.${Math.floor(abs / bpb) + 1}`, x + 5, bottom + 4 - 0); }
    }

    // faixa de acordes: cada trecho vira uma barra com o nome; a TROCA é marcada por uma linha vertical colorida
    if (sc.chords?.length) this.drawChords(sc, v, pos, X, nowX, top, bottom, W);

    // eventos (blocos)
    const p0 = Math.max(0, Math.floor((pos - TAIL_BEATS - 1) / len)), p1 = Math.floor((pos + VIS_BEATS + 1) / len);
    for (let p = p0; p <= p1 && p < v.passes; p++) sc.events.forEach((ev, i) => {
      const abs = p * len + ev.beat, x = X(abs);
      if (x < 30 - ppb || x > W + 40) return;
      const res = v.results.get(`${p}:${i}`), past = nowX - x;
      const room = Math.max(1, nowX - 40);   // espaço para trás: o resultado só esmaece aos poucos até a borda
      c.globalAlpha = res ? Math.max(0.5, 1 - Math.max(0, past) / room * 0.5) : past > ppb * 0.35 ? Math.max(0.08, 1 - (past - ppb * 0.35) / (ppb * 0.7)) : 1;
      this.drawEvent(ev, x, rowY, rowH, ppb, res, v);
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

  drawChords(sc, v, pos, X, nowX, top, bottom, W) {
    const c = this.ctx, C = this.colors, len = sc.lengthBeats, passes = v.passes, y0 = 42, h = 28;
    const segs = [];   // trechos [início, fim) em batidas absolutas, com o acorde
    const first = Math.max(0, Math.floor((pos - 1) / len)), lastP = Math.min(passes - 1, Math.floor((pos + 6) / len) + 1);
    for (let p = first; p <= lastP; p++) sc.chords.forEach((ch, k) => {
      const start = p * len + ch.beat, next = sc.chords[k + 1] ? p * len + sc.chords[k + 1].beat : (p + 1) * len;
      const prev = segs[segs.length - 1];
      if (prev && prev.id === ch.chordId && Math.abs(prev.end - start) < 1e-6) prev.end = next;   // mesmo acorde seguido: um trecho só
      else segs.push({ id: ch.chordId, start, end: next, change: !!prev || p * len + ch.beat > 0 });
    });
    c.textBaseline = 'middle'; c.textAlign = 'left';
    segs.forEach((sg, idx) => {
      const x0 = X(sg.start), x1 = X(sg.end); if (x1 < 36 || x0 > W) return;
      const cur = pos >= sg.start - 1e-6 && pos < sg.end - 1e-6, soon = !cur && sg.start > pos && sg.start - pos <= 2 && v.state === 'running', prevSeg = segs[idx - 1];
      const isChange = prevSeg && prevSeg.id !== sg.id;
      const bx = Math.max(38, x0 + 3), bw = Math.max(0, x1 - 3 - bx); if (bw < 6) return;
      const pulse = soon ? 0.5 + 0.5 * Math.sin(performance.now() / 110) : 0;
      c.beginPath(); c.roundRect(bx, y0, bw, h, 9);
      c.fillStyle = cur ? C['--accent'] : soon ? `rgba(245,165,36,${0.18 + 0.3 * pulse})` : 'rgba(255,255,255,.07)'; c.fill();
      if (soon) { c.strokeStyle = C['--accent']; c.lineWidth = 2; c.stroke(); }
      c.save(); c.beginPath(); c.rect(bx, y0, bw, h); c.clip();
      c.fillStyle = cur ? '#1b1200' : soon ? C['--accent'] : C['--tx-2']; c.font = '800 17px ui-rounded,system-ui';
      c.fillText((isChange && !cur ? (soon ? (sc.assemble ? 'LEVANTE A MÃO → ' : 'TROQUE → ') : '→ ') : '') + sg.id, bx + 10, y0 + h / 2 + 1);
      c.restore();
      // linha de troca: atravessa toda a pista no instante exato em que o acorde muda
      if (isChange && x0 > 36 && x0 < W) {
        c.strokeStyle = soon || cur ? C['--accent'] : 'rgba(245,165,36,.45)'; c.lineWidth = soon ? 3 : 2; c.setLineDash([6, 4]);
        c.beginPath(); c.moveTo(x0, y0 + h); c.lineTo(x0, bottom + 4); c.stroke(); c.setLineDash([]);
      }
    });
  }

  drawEvent(ev, x, rowY, rowH, ppb, res, v = {}) {
    const c = this.ctx, C = this.colors, guide = !ev.check.strings && ev.kind !== 'rest';
    const strings = ev.kind === 'strum' ? ev.strum.strings : (ev.notes || []).map((n) => n.string);
    if (!strings.length) return;
    const lo = Math.min(...strings), hi = Math.max(...strings);
    // LARGURA = JANELA DE ACERTO: tocar dentro do bloco (antes ou depois do centro) conta como acerto. O centro é o instante exato.
    const px = (ms) => ms / 1000 * (v.bpmEff || 60) / 60 * ppb;
    const w = v.okMs ? Math.max(26, 2 * px(v.okMs)) : Math.max(44, Math.min(ppb * Math.min(ev.dur || 0.5, 1) * 0.86, 84));
    const y0 = Math.max(74, rowY(hi) - rowH * 0.46 - 28), y1 = rowY(lo) + rowH * 0.46, bx = x - w / 2;
    const okAll = res && res.grade !== 'miss';
    const base = res ? (res.grade === 'miss' ? ['#7a2f3a', '#a4414f'] : res.grade === 'ok' ? ['#c98a14', '#f1b43c'] : ['#2f9e6e', '#43d493']) : ['#c28a1c', '#f3c35a'];
    const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, base[1]); g.addColorStop(1, base[0]);
    c.beginPath(); c.roundRect(bx, y0, w, y1 - y0, 7);
    if (guide) { c.fillStyle = 'rgba(255,255,255,.05)'; c.fill(); c.setLineDash([4, 4]); c.strokeStyle = C['--tx-2']; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]); }
    else { c.fillStyle = g; c.shadowColor = 'rgba(243,195,90,.35)'; c.shadowBlur = res ? 0 : 10; c.fill(); c.shadowBlur = 0; }
    // brilho no topo do bloco (como no app de referência)
    if (!guide) { const h = c.createLinearGradient(0, y0, 0, y0 + (y1 - y0) * 0.5); h.addColorStop(0, 'rgba(255,255,255,.28)'); h.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = h; c.beginPath(); c.roundRect(bx, y0, w, (y1 - y0) * 0.5, 7); c.fill(); }
    // faixas dentro do bloco: "bom" (mais claro) e "perfeito" (ainda mais) em volta da linha central do tempo exato
    if (v.okMs && !guide) {
      c.save(); c.beginPath(); c.roundRect(bx, y0, w, y1 - y0, 7); c.clip();
      c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(x - px(v.goodMs), y0, 2 * px(v.goodMs), y1 - y0);
      c.fillStyle = 'rgba(255,255,255,.16)'; c.fillRect(x - px(v.perfectMs), y0, 2 * px(v.perfectMs), y1 - y0);
      c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(x - 0.75, y0, 1.5, y1 - y0);
      c.restore();
    }
    // seta da palhetada
    const dir = ev.kind === 'strum' ? ev.strum.dir : ev.pick;
    if (v.score?.assemble) { c.fillStyle = '#fff6df'; c.font = '800 11px ui-rounded,system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('MONTAR', x, y0 + 14); c.font = '700 10px ui-sans-serif'; c.fillText(`segure ${String(v.score.assemble.hold ?? 0.3).replace('.', ',')} s`, x, y0 + 28); }
    else if (dir) this.chevron(x, y0 + Math.min(34, (y1 - y0) * 0.36), dir, Math.min(w * 0.78, 30), guide ? C['--tx-2'] : '#fff6df', 2);
    if (ev.tech && TECH_LABEL[ev.tech]) { c.fillStyle = C['--tx-3']; c.font = '600 10px ui-sans-serif'; c.fillText(TECH_LABEL[ev.tech], x, y1 + 8); }
    (ev.avoid || []).forEach((s) => { const y = rowY(s); c.strokeStyle = C['--avoid']; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x - 6, y - 6); c.lineTo(x + 6, y + 6); c.moveTo(x + 6, y - 6); c.lineTo(x - 6, y + 6); c.stroke(); });
    // resultado bem visível: ✓ verde e quantos ms você chegou antes (−) ou depois (+) do tempo exato; ✕ se perdeu
    if (res && !guide) {
      c.textAlign = 'center'; c.textBaseline = 'middle';
      if (okAll) {
        c.fillStyle = '#eafff4'; c.font = '900 24px ui-rounded,system-ui'; c.fillText('✓', x, y1 - 32);
        if (res.delta != null) { const d = Math.round(res.delta); c.fillStyle = Math.abs(d) <= (v.perfectMs || 40) ? '#9ff5c9' : '#fff0c2'; c.font = '800 12px ui-sans-serif,system-ui'; c.fillText(`${d > 0 ? '+' : ''}${d} ms`, x, y1 - 12); }
      } else { c.fillStyle = '#ffe3e7'; c.font = '900 24px ui-rounded,system-ui'; c.fillText('✕', x, y1 - 22); }
    }
  }
}
