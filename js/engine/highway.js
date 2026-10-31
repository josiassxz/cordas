// Pista "slider tab" em canvas: 6 linhas de corda (aguda em cima), barra de agora, blocos que rolam para a esquerda.
// Cada bloco mostra a casa e a cor do dedo; setas ↑/↓ marcam a palhetada; ✕ marca corda a evitar; tracejado = só guia.
import { expectedStrings } from './score.js';

const VIS_BEATS = 7, TOP = 44, BOTTOM = 14, NOW_FRAC = 0.2;
const TECH_LABEL = { hammer: 'martelo', pull: 'puxada', slide: 'slide', bend: 'bend', vibrato: 'vibrato', mute: 'abafado', palm: 'P.M.' };
const NAMES = ['E', 'A', 'D', 'G', 'B', 'E'];

export class Highway {
  // view(): { score, pos, results:Map, passes, state, mode }
  constructor(canvas, view) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.view = view;
    this.viewPos = 0; this.raf = 0; this.colors = {};
    this.readColors();
  }

  readColors() {
    const cs = getComputedStyle(document.documentElement), g = (n) => cs.getPropertyValue(n).trim();
    for (const k of ['--bg', '--surface', '--raised', '--raised-2', '--tx', '--tx-2', '--tx-3', '--hair-2', '--accent', '--ok', '--bad', '--expected', '--f1', '--f2', '--f3', '--f4', '--avoid']) this.colors[k] = g(k) || '#888';
  }
  start() { const loop = () => { this.draw(); this.raf = requestAnimationFrame(loop); }; loop(); }
  stop() { cancelAnimationFrame(this.raf); }

  fit() {
    const dpr = window.devicePixelRatio || 1, w = this.cv.clientWidth, h = this.cv.clientHeight;
    if (this.cv.width !== Math.round(w * dpr) || this.cv.height !== Math.round(h * dpr)) { this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [w, h];
  }

  pill(x, y, w, h, r) { const c = this.ctx; c.beginPath(); c.roundRect(x, y, w, h, r); }
  fingerColor(f) { return f ? this.colors[`--f${f}`] : this.colors['--expected']; }

  draw() {
    const v = this.view(), c = this.ctx, C = this.colors;
    if (!v?.score) return;
    const [W, H] = this.fit();
    c.clearRect(0, 0, W, H);
    const sc = v.score, len = sc.lengthBeats, bpb = sc.beatsPerBar;
    const target = v.pos;
    this.viewPos = Math.abs(target - this.viewPos) > 3 || v.mode !== 'wait' ? target : this.viewPos + (target - this.viewPos) * 0.18;
    const pos = this.viewPos;
    const nowX = Math.round(W * Math.max(0.1, Math.min(0.6, v.pastFrac ?? NOW_FRAC))), ppb = (W - nowX - 24) / VIS_BEATS, behind = nowX / ppb;
    const laneH = (H - TOP - BOTTOM) / 6, laneY = (s) => TOP + (5 - s) * laneH + laneH / 2;
    const X = (abs) => nowX + (abs - pos) * ppb;

    // fundo das linhas de corda
    for (let s = 0; s < 6; s++) {
      const y = laneY(s);
      c.fillStyle = s % 2 ? 'rgba(255,255,255,.015)' : 'rgba(255,255,255,.03)'; c.fillRect(0, y - laneH / 2, W, laneH);
      c.strokeStyle = C['--hair-2']; c.lineWidth = 1 + (5 - s) * 0.14 + (s < 3 ? 0.5 : 0); c.beginPath(); c.moveTo(34, y); c.lineTo(W, y); c.stroke();
      c.fillStyle = C['--tx-3']; c.font = '600 11px ui-sans-serif,system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(6 - s), 14, y); c.fillStyle = C['--tx-2']; c.fillText(NAMES[s], 28, y - 0.5);
    }
    // grade do tempo: compasso > tempo (1 2 3 4) > subdivisão (e & a / tri let), conforme o compasso e as batidas por tempo configurados
    const sub = Math.max(1, Math.min(4, sc.subdivision || 2)), SUBL = { 1: [''], 2: ['', '&'], 3: ['', 'tri', 'let'], 4: ['', 'e', '&', 'a'] }[sub], slot = 1 / sub;
    for (let k = Math.floor((pos - behind) / slot); k <= Math.ceil((pos + VIS_BEATS + 1) / slot); k++) {
      const abs = k * slot, x = X(abs), onBeat = Math.abs(abs - Math.round(abs)) < 1e-6, bi = ((Math.round(abs) % bpb) + bpb) % bpb, bar = onBeat && bi === 0;
      c.strokeStyle = bar ? 'rgba(255,255,255,.22)' : onBeat ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,.045)'; c.lineWidth = bar ? 1.5 : 1;
      if (!onBeat) c.setLineDash([2, 5]);
      c.beginPath(); c.moveTo(x, TOP - 6); c.lineTo(x, H - BOTTOM); c.stroke(); c.setLineDash([]);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      if (onBeat) { c.fillStyle = bar ? C['--accent'] : C['--tx-2']; c.font = `${bar ? 800 : 600} ${bar ? 13 : 11}px ui-rounded,system-ui`; c.fillText(String(bi + 1), x, TOP - 20); }
      else { c.fillStyle = C['--tx-3']; c.font = '600 10px ui-sans-serif'; c.fillText(SUBL[Math.round((abs - Math.floor(abs)) * sub)] || '', x, TOP - 20); }
    }
    // acordes
    if (sc.chords?.length) {
      c.font = '700 15px ui-rounded,system-ui'; c.textAlign = 'left'; c.textBaseline = 'middle';
      for (let p = Math.max(0, Math.floor((pos - behind) / len)); p * len <= pos + VIS_BEATS && p < v.passes; p++) for (const ch of sc.chords) {
        const x = X(p * len + ch.beat); if (x < 30 || x > W) continue;
        c.fillStyle = x < nowX ? C['--tx-3'] : C['--tx']; c.fillText(ch.chordId, x + 20, 13);
      }
    }

    // eventos
    const p0 = Math.max(0, Math.floor((pos - behind - 1) / len)), p1 = Math.floor((pos + VIS_BEATS + 1) / len);
    for (let p = p0; p <= p1 && p < v.passes; p++) sc.events.forEach((ev, i) => {
      const abs = p * len + ev.beat, x = X(abs);
      if (x < 34 - ppb || x > W + 40) return;
      const res = v.results.get(`${p}:${i}`);
      const past = nowX - x, alpha = res ? Math.max(0.5, 1 - Math.max(0, past) / Math.max(1, nowX - 40) * 0.5) : past > ppb * 0.4 ? Math.max(0.08, 1 - (past - ppb * 0.4) / (ppb * 0.8)) : 1;
      c.globalAlpha = alpha;
      this.drawEvent(ev, x, laneY, laneH, ppb, res);
      c.globalAlpha = 1;
    });

    // barra do agora
    const grad = c.createLinearGradient(nowX - 14, 0, nowX + 14, 0);
    grad.addColorStop(0, 'rgba(245,165,36,0)'); grad.addColorStop(0.5, 'rgba(245,165,36,.35)'); grad.addColorStop(1, 'rgba(245,165,36,0)');
    c.fillStyle = grad; c.fillRect(nowX - 14, TOP - 8, 28, H - TOP - BOTTOM + 14);
    c.fillStyle = C['--tx']; this.pill(nowX - 2.5, TOP - 8, 5, H - TOP - BOTTOM + 14, 3); c.fill();

    if (pos < 0 && v.mode !== 'wait') { c.fillStyle = C['--accent']; c.font = '800 84px ui-rounded,system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.globalAlpha = 0.9; c.fillText(String(Math.ceil(-pos)), W * 0.55, H / 2 + 6); c.globalAlpha = 1; }
    if (v.state === 'paused') { c.fillStyle = 'rgba(10,11,15,.62)'; c.fillRect(0, 0, W, H); c.fillStyle = C['--tx']; c.font = '700 22px ui-rounded,system-ui'; c.textAlign = 'center'; c.fillText('Pausado', W / 2, H / 2 - 8); c.fillStyle = C['--tx-2']; c.font = '14px ui-sans-serif'; c.fillText('Continue quando quiser — o tempo está parado', W / 2, H / 2 + 18); }
  }

  drawEvent(ev, x, laneY, laneH, ppb, res) {
    const c = this.ctx, C = this.colors, h = laneH * 0.66;
    const stateColor = (s) => (res ? (s === 'ok' ? C['--ok'] : s === 'pitch' ? C['--accent'] : C['--bad']) : null);
    const guide = !ev.check.strings && ev.kind !== 'rest';
    if (ev.kind === 'strum') {
      const ss = ev.strum.strings, ys = ss.map(laneY);
      c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, Math.min(...ys)); c.lineTo(x, Math.max(...ys)); c.stroke();
      ss.forEach((s) => {
        const col = stateColor(res?.strings?.[s]) || this.fingerColor(ev.strum.fingers?.[s]);
        const w = 26; this.pill(x - w / 2, laneY(s) - h / 2, w, h, h / 2);
        if (guide) { c.setLineDash([3, 3]); c.strokeStyle = C['--tx-3']; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]); }
        else { c.fillStyle = col; c.globalAlpha *= res?.strings?.[s] === 'miss' ? 0.5 : 1; c.fill(); c.globalAlpha = Math.min(1, c.globalAlpha / (res?.strings?.[s] === 'miss' ? 0.5 : 1)); }
        const f = ev.strum.frets?.[s];
        if (f != null) { c.fillStyle = '#10131a'; c.font = '800 12px ui-rounded,system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; if (!guide) c.fillText(String(f), x, laneY(s) + 0.5); }
      });
      const gc = res ? (res.grade === 'miss' ? C['--bad'] : res.grade === 'ok' ? C['--accent'] : C['--ok']) : C['--tx'];
      c.beginPath(); c.arc(x, 22 + 2, 13, 0, 6.3); c.fillStyle = 'rgba(255,255,255,.07)'; c.fill(); c.strokeStyle = gc; c.lineWidth = 2; c.stroke();
      c.fillStyle = gc; c.font = '800 16px ui-rounded,system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ev.strum.dir === 'D' ? '↓' : '↑', x, 25);
      if (ev.tech && TECH_LABEL[ev.tech]) { c.fillStyle = C['--tx-3']; c.font = '600 10px ui-sans-serif'; c.fillText(TECH_LABEL[ev.tech], x, TOP - 2 + 0); }
    } else if (ev.kind === 'note') {
      const w = Math.max(32, Math.min(ppb * (ev.dur || 0.5) * 0.9, ppb * 3));
      ev.notes.forEach((n) => {
        const y = laneY(n.string), col = stateColor(res?.strings?.[n.string]) || this.fingerColor(n.finger);
        this.pill(x - 4, y - h / 2, w, h, 9);
        if (guide) { c.setLineDash([4, 3]); c.strokeStyle = C['--tx-2']; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]); c.fillStyle = 'rgba(255,255,255,.04)'; c.fill(); }
        else { c.fillStyle = col; c.fill(); }
        c.fillStyle = guide ? C['--tx-2'] : '#10131a'; c.font = '800 13px ui-rounded,system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(n.fret), x - 4 + (n.digit || ev.pick ? 11 : w / 2), y + 0.5);
        if (n.digit) { c.font = '700 10px ui-sans-serif'; c.fillText(n.digit, x - 4 + w - 9, y - h / 2 + 7); }
        if (ev.pick) { c.font = '800 12px ui-rounded'; c.fillText(ev.pick === 'D' ? '↓' : '↑', x - 4 + w - 9, y + 1); }
        if (ev.tech && TECH_LABEL[ev.tech]) { c.fillStyle = C['--tx-3']; c.font = '600 10px ui-sans-serif'; c.fillText(TECH_LABEL[ev.tech], x - 4 + w / 2, y - h / 2 - 5); }
      });
    }
    (ev.avoid || []).forEach((s) => { const y = laneY(s); c.strokeStyle = C['--avoid']; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x - 6, y - 6); c.lineTo(x + 6, y + 6); c.moveTo(x + 6, y - 6); c.lineTo(x - 6, y + 6); c.stroke(); });
  }
}
export { expectedStrings };
