// Ritmo: metrônomo visual/sonoro, padrões, acordes no ritmo (v1), construtor por corda e trilha de níveis.
import { esc, icon, paintIcons, clamp } from '../core/dom.js';
import { Transport } from '../engine/transport.js';
import { Lane } from '../engine/lane.js';
import { pickChords } from '../ui/chord-picker.js';
import { TIME_SIGNATURES, SUBDIVISIONS, STRUM_PATTERNS, PROGRESSIONS, shapeOf, allShapes, upgradeShapes, ensureShapes } from '../content/patterns.js';
import { strumScore } from '../content/techniques.js';
import { normalizeScore } from '../engine/score.js';

// Padrões por compasso: o número de posições = batidas × subdivisão do compasso.
const BY_SIG = {
  '2/4': [['Marcha', 'D-D-'], ['Polca', 'D-DU']], '3/4': [['Valsa', 'D-D-D-'], ['Valsa com cima', 'D-DUD-']],
  '4/4': STRUM_PATTERNS.map((p) => [p.name, p.slots]), '5/4': [['3 + 2', 'D-D-D-D-D-'], ['Irregular', 'D-DUD-D-DU']],
  '6/8': [['Balada 6/8', 'D--D-U'], ['Cavalgada 6/8', 'D-UD-U']], '12/8': [['Blues lento', 'D--D--D--D--'], ['Shuffle 12/8', 'D-UD-UD-UD-U']],
};
const sigOf = (id) => TIME_SIGNATURES.find((t) => t.id === id);
const PATHS = [
  ['Só para baixo', 'D-D-D-D-', 60, 'Em'], ['Pop clássico', 'D-DU-UDU', 70, 'Em'], ['Balada', 'D--U-UDU', 76, 'Am'], ['Rock', 'D-D-D-DU', 88, 'E'],
  ['Folk', 'D-DUDU-U', 92, 'G'], ['Colcheias contínuas', 'DUDUDUDU', 100, 'C'], ['Cavalgada', 'D-DUD-DU', 96, 'Em'],
];
const TABS = [['metro', 'Metrônomo'], ['patterns', 'Padrões'], ['chords', 'Acordes no ritmo'], ['builder', 'Construtor'], ['path', 'Trilha']];

export default {
  id: 'rhythm', title: 'Ritmo', icon: 'wave', order: 40,
  mount(el, app, params) {
    let tab = params.tab || 'metro', cleanup = null, run = null, bs = null;
    const ps = [];
    const store = app.store;
    upgradeShapes();
    const shell = () => {
      el.innerHTML = `<div class="page rhythm"><div class="tabs" role="tablist">${TABS.map(([id, n]) => `<button role="tab" data-tab="${id}" aria-selected="${id === tab}">${n}</button>`).join('')}</div><div id="rtab"></div></div>`;
      show();
    };
    const box = () => el.querySelector('#rtab');
    function show() {
      cleanup?.(); cleanup = null; run?.destroy(); run = null; app.demoChord = null;
      el.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
      const fn = { metro: metro, patterns: () => patterns(false), chords: () => patterns(true), builder: builder, path: path }[tab];
      cleanup = fn(box()) || null; paintIcons(el);
    }
    el.addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; show(); } });

    // ---------- iniciar prática (volta para a aba ao fechar) ----------
    function launch(host, score, meta = {}, o = {}) {
      run?.destroy();
      run = app.practice.start(score, { host, meta, repeat: o.repeat ?? 'once', guide: o.guide, autostart: false, onClose: () => { run?.destroy(); run = null; show(); } });
      paintIcons(host);
    }

    // ================= Metrônomo =================
    function metro(root) {
      const s = { bpm: store.get('rhythm.bpm', 90), sig: store.get('rhythm.sig', '4/4'), sub: 1, speed: 1, subClick: false, accel: false };
      let tr = null, queue = [], raf = 0, active = -1, bars = 0, taps = [];
      const sg = () => sigOf(s.sig);
      root.innerHTML = `<div class="rt-metro panel">
        <div class="rt-dots" id="dots" aria-hidden="true"></div>
        <div class="rt-bpm"><button class="btn icon lg" data-b="-5" aria-label="Diminuir 5 BPM">−</button><div><div class="big-num num" id="bpmv">${s.bpm}</div><small class="dim" id="bpmsub">BPM</small></div><button class="btn icon lg" data-b="5" aria-label="Aumentar 5 BPM">+</button></div>
        <input type="range" id="bpmr" min="30" max="240" value="${s.bpm}" aria-label="BPM">
        <div class="row wrap center" style="margin:6px 0 2px"><button class="play-lg" data-a="toggle" aria-label="Iniciar"></button><button class="btn icon" data-a="restart" aria-label="Reiniciar" title="Reiniciar">${icon('restart')}</button><button class="btn" data-a="tap">Tap tempo</button></div>
        <div class="pr-hw lane" id="mlane" style="height:220px;max-width:none"><canvas aria-label="Pista do metrônomo"></canvas></div>
        <div class="rt-opts">
          <div class="field"><span class="h3">Compasso</span><div class="seg" id="sigs">${TIME_SIGNATURES.map((t) => `<button data-sig="${t.id}" aria-pressed="${t.id === s.sig}" title="${t.note}">${t.label}</button>`).join('')}</div></div>
          <div class="field"><span class="h3">Subdivisão</span><div class="seg" id="subs">${SUBDIVISIONS.map((t) => `<button data-sub="${t.id}" aria-pressed="${t.id === s.sub}">${t.label}</button>`).join('')}</div></div>
          <div class="field"><span class="h3">Velocidade (prática reduzida)</span><div class="seg" id="spd">${[0.5, 0.75, 1, 1.25].map((v) => `<button data-spd="${v}" aria-pressed="${v === s.speed}">${v * 100}%</button>`).join('')}</div></div>
          <div class="field"><span class="h3">Opções</span><div class="row wrap"><label class="chip pr-toggle"><input type="checkbox" id="subclick"> Clicar subdivisões</label><label class="chip pr-toggle"><input type="checkbox" id="accel"> +2 BPM a cada 4 compassos</label></div></div>
        </div></div>`;
      const q = (x) => root.querySelector(x);
      const drawDots = () => { q('#dots').innerHTML = Array.from({ length: sg().beats }, (_, i) => `<span class="dot-b ${i === 0 ? 'acc' : ''}" data-i="${i}"></span>`).join(''); };
      const paintPlay = () => { const b = q('[data-a=toggle]'), r = tr?.state === 'running'; b.innerHTML = icon(r ? 'pause' : 'play'); b.setAttribute('aria-label', r ? 'Pausar' : tr?.state === 'paused' ? 'Continuar' : 'Iniciar'); };
      const paintBpm = () => { q('#bpmv').textContent = s.bpm; q('#bpmr').value = s.bpm; q('#bpmsub').textContent = s.speed !== 1 ? `BPM · efetivo ${Math.round(s.bpm * s.speed)}` : 'BPM'; store.set('rhythm.bpm', s.bpm); };
      function build() {
        const was = tr?.state; tr?.stop();
        tr = new Transport(app.audio, { bpm: s.bpm, speed: s.speed, beatsPerBar: sg().beats, subdivision: s.sub, click: true, subClick: s.subClick });
        tr.addEventListener('tick', (e) => {
          const d = e.detail; queue.push(d);
          if (d.isBar && d.beat > 0 && s.accel && ++bars % 4 === 0) { s.bpm = Math.min(240, s.bpm + 2); tr.setBpm(s.bpm); paintBpm(); }
        });
        tr.addEventListener('state', paintPlay);
        drawDots(); bars = 0; active = -1; queue = [];
        if (was === 'running') tr.start({ countInBeats: 0 });
        paintPlay();
      }
      const loop = () => {
        const now = app.audio.ctx?.currentTime ?? 0;
        while (queue.length && queue[0].time <= now) {
          const d = queue.shift();
          if (d.isBeat) { const i = ((Math.round(d.beat) % sg().beats) + sg().beats) % sg().beats; root.querySelectorAll('.dot-b').forEach((x) => x.classList.toggle('on', +x.dataset.i === i)); }
        }
        raf = requestAnimationFrame(loop);
      };
      const mlane = new Lane(q('#mlane canvas'), () => ({
        score: { beatsPerBar: sg().beats, subdivision: s.sub, lengthBeats: sg().beats, bpm: s.bpm, events: Array.from({ length: sg().beats }, (_, beat) => ({ beat, kind: 'strum', strum: { dir: 'D', strings: [0, 1, 2, 3, 4, 5] }, check: { strings: true }, dur: 1 })) },
        pos: tr ? tr.position() : 0, results: new Map(), passes: Infinity, state: tr?.state === 'paused' ? 'paused' : 'running',
      }));
      mlane.start();
      build(); loop();
      root.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.a === 'toggle') { if (!tr.state || tr.state === 'stopped') tr.start({ countInBeats: 0 }); else tr.toggle(); paintPlay(); }
        else if (b.dataset.a === 'restart') { tr.restart({ countInBeats: 0 }); bars = 0; queue = []; }
        else if (b.dataset.a === 'tap') { const n = performance.now(); taps = taps.filter((t) => n - t < 2500); taps.push(n); if (taps.length >= 2) { const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1); s.bpm = clamp(Math.round(60000 / iv), 30, 240); tr.setBpm(s.bpm); paintBpm(); } }
        else if (b.dataset.b) { s.bpm = clamp(s.bpm + +b.dataset.b, 30, 240); tr.setBpm(s.bpm); paintBpm(); }
        else if (b.dataset.sig) { s.sig = b.dataset.sig; store.set('rhythm.sig', s.sig); root.querySelectorAll('[data-sig]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); s.sub = sg().sub; root.querySelectorAll('[data-sub]').forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.sub === s.sub))); build(); }
        else if (b.dataset.sub) { s.sub = +b.dataset.sub; root.querySelectorAll('[data-sub]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); build(); }
        else if (b.dataset.spd) { s.speed = +b.dataset.spd; root.querySelectorAll('[data-spd]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); tr.setSpeed(s.speed); paintBpm(); }
      });
      q('#bpmr').addEventListener('input', (e) => { s.bpm = +e.target.value; tr.setBpm(s.bpm); paintBpm(); });
      q('#subclick').addEventListener('change', (e) => { s.subClick = e.target.checked; if (tr) tr.subClick = s.subClick; });
      q('#accel').addEventListener('change', (e) => { s.accel = e.target.checked; });
      const key = (e) => { if (e.target.closest?.('input,select,textarea,dialog')) return; if (e.key === 'p' || e.key === 'P') { e.preventDefault(); q('[data-a=toggle]').click(); } };
      document.addEventListener('keydown', key);
      return () => { cancelAnimationFrame(raf); mlane.stop(); tr?.stop(); document.removeEventListener('keydown', key); };
    }

    // ================= Padrões / Acordes no ritmo =================
    function patterns(withProg) {
      const root = box();
      const s = (ps[withProg ? 1 : 0] ||= { sig: '4/4', pat: 0, chord: 'Em', prog: PROGRESSIONS[0].id, bars: 8, bpm: 80, guide: false, repeat: 'once' });
      const chords = allShapes().map((c) => c.symbol);
      const draw = () => {
        const pats = BY_SIG[s.sig]; s.pat = Math.min(s.pat, pats.length - 1);
        root.innerHTML = `<div class="panel col rt-cfg">
          <div class="field"><span class="h3">Compasso</span><div class="seg">${TIME_SIGNATURES.map((t) => `<button data-sig="${t.id}" aria-pressed="${t.id === s.sig}">${t.label}</button>`).join('')}</div></div>
          <div class="field"><span class="h3">Padrão de batida</span><div class="rt-pats">${pats.map(([n, sl], i) => `<button class="rt-pat" data-pat="${i}" aria-pressed="${i === s.pat}"><b>${esc(n)}</b><code>${[...sl].map((c) => (c === 'D' ? '↓' : c === 'U' ? '↑' : '·')).join(' ')}</code></button>`).join('')}</div></div>
          ${withProg ? `<div class="field"><span class="h3">Progressão (um acorde por compasso)</span><div class="rt-pats">${PROGRESSIONS.map((p) => `<button class="rt-pat" data-prog="${p.id}" aria-pressed="${p.id === s.prog}"><b>${esc(p.name)}</b><small class="dim">${esc(p.desc)}</small></button>`).join('')}<button class="rt-pat" data-pickprog aria-pressed="${s.prog === 'custom'}"><b>${s.prog === 'custom' ? esc((s.custom || []).join(' – ')) : '＋ Montar a minha'}</b><small class="dim">${s.prog === 'custom' ? 'Sua sequência — toque para editar' : 'Escolha os acordes numa lista visual'}</small></button></div></div>`
            : `<div class="field"><span class="h3">Acorde</span><select id="chord">${chords.map((c) => `<option ${c === s.chord ? 'selected' : ''}>${c}</option>`).join('')}</select></div>`}
          <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
            <div class="field"><span class="h3">Andamento <b class="num" id="bv">${s.bpm}</b> BPM</span><input type="range" id="bpm" min="40" max="160" value="${s.bpm}"></div>
            <div class="field"><span class="h3">Duração</span><div class="seg">${[4, 8, 16].map((n) => `<button data-bars="${n}" aria-pressed="${n === s.bars}">${n} compassos</button>`).join('')}</div></div>
            <div class="field"><span class="h3">Opções</span><div class="row wrap"><label class="chip pr-toggle"><input type="checkbox" id="guide" ${s.guide ? 'checked' : ''}> Guia sonoro</label></div></div>
          </div>
          <div class="row"><button class="btn primary lg" data-go>${icon('play')} Praticar</button><small class="dim">Sem guitarra? Use o modo demo: Espaço = ↓, ↑ = ↑.</small></div></div>`;
        paintIcons(root);
        root.querySelectorAll('input[type=range]').forEach((r) => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min)) * 100 + '%'));
      };
      draw();
      root.onclick = async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.sig) { s.sig = b.dataset.sig; s.pat = 0; draw(); }
        else if (b.dataset.pat) { s.pat = +b.dataset.pat; draw(); }
        else if (b.dataset.prog) { s.prog = b.dataset.prog; draw(); }
        else if ('pickprog' in b.dataset) { pickChords({ title: 'Monte sua progressão (um acorde por compasso)', initial: s.custom || [], min: 2, max: 16, presets: PROGRESSIONS.map((p) => ({ name: p.name, symbols: p.chords })) }).then((seq) => { if (seq) { s.custom = seq.map((x) => x.symbol); s.prog = 'custom'; draw(); } }); }
        else if (b.dataset.bars) { s.bars = +b.dataset.bars; draw(); }
        else if ('go' in b.dataset) {
          const sg = sigOf(s.sig), [pname, slots] = BY_SIG[s.sig][s.pat], pr = s.prog === 'custom' && s.custom ? { id: 'custom-' + s.custom.join('_'), name: 'Minha progressão', chords: s.custom } : PROGRESSIONS.find((p) => p.id === s.prog);
          if (withProg) { try { await ensureShapes(pr.chords); } catch (err) { app.toast(err.message); return; } }
          const score = strumScore({ id: `rhythm-${withProg ? 'prog' : 'pat'}-${s.sig}-${slots}-${withProg ? s.prog : s.chord}`.replace(/[^\w-]/g, '_'), title: withProg ? `${pname} · ${pr.name}` : `${pname} · ${s.chord}`, technique: withProg ? 'chord-change' : 'rhythm', level: 2, bpm: s.bpm, chords: withProg ? pr.chords : [s.chord], slots, bars: s.bars, beatsPerBar: sg.beats, sub: sg.sub });
          const host = root; launch(host, score, {}, { guide: s.guide });
        }
      };
      root.oninput = (e) => { if (e.target.id === 'bpm') { s.bpm = +e.target.value; root.querySelector('#bv').textContent = s.bpm; e.target.style.setProperty('--p', ((e.target.value - e.target.min) / (e.target.max - e.target.min)) * 100 + '%'); } };
      root.onchange = (e) => { if (e.target.id === 'chord') s.chord = e.target.value; if (e.target.id === 'guide') s.guide = e.target.checked; };
      return () => { root.onclick = root.oninput = root.onchange = null; };
    }

    // ================= Construtor de padrão por corda =================
    function builder() {
      const root = box();
      const s = (bs ||= { sig: '4/4', sub: 2, chord: 'Em', bpm: 76, bars: 4, cells: null, name: '' });
      const slotsN = () => sigOf(s.sig).beats * s.sub;
      const reset = () => { const pat = slotsN() === 8 ? 'D-DU-UDU' : null; s.cells = Array.from({ length: slotsN() }, (_, i) => ({ dir: pat ? pat[i] : i % s.sub === 0 ? 'D' : '-', strings: [0, 1, 2, 3, 4, 5] })); };
      if (!s.cells) reset();
      const saved = () => store.get('rhythm.custom', []);
      const label = (i) => { const per = s.sub; return i % per === 0 ? String(i / per + 1) : s.sub === 2 ? '&' : s.sub === 3 ? (i % 3 === 1 ? 'e' : 'a') : (['', 'e', '&', 'a'][i % 4]); };
      function build() {
        const sh = shapeOf(s.chord), sg = sigOf(s.sig), one = [];
        s.cells.forEach((c, i) => {
          if (c.dir === '-') return;
          const st = c.strings.filter((x) => sh.strings.includes(x)); if (!st.length) return;
          const beat = i / s.sub;
          if (st.length === 1) one.push({ beat, dur: 1 / s.sub, notes: [{ string: st[0], fret: sh.frets[st[0]], ...(sh.fingers[st[0]] ? { finger: sh.fingers[st[0]] } : {}) }] });
          else one.push({ beat, dur: 1 / s.sub, strum: { dir: c.dir, strings: st, frets: sh.frets, fingers: sh.fingers }, check: { dir: true } });
        });
        const events = [];
        for (let b = 0; b < s.bars; b++) one.forEach((e) => events.push({ ...e, beat: e.beat + b * sg.beats }));
        const nm = (s.name || 'meu').replace(/[^\w-]/g, '_');
        return normalizeScore({ id: `rhythm-custom-${nm}`, title: `Meu padrão${s.name ? ': ' + s.name : ''} · ${s.chord}`, technique: 'rhythm', level: 3, bpm: s.bpm, beatsPerBar: sg.beats, subdivision: s.sub, lengthBeats: s.bars * sg.beats, events, chords: [{ beat: 0, chordId: s.chord, root: sh.root, q: sh.q, frets: sh.frets, fingers: sh.fingers }] });
      }
      const draw = () => {
        const n = slotsN(), sh = shapeOf(s.chord);
        root.innerHTML = `<div class="panel col rt-cfg">
          <p class="muted">Clique em cada posição para alternar <b>pausa · ↓ · ↑</b>. Embaixo, escolha quais cordas soam em cada posição (uma só corda vira nota isolada: ótimo para baixo alternado).</p>
          <div class="row wrap"><div class="seg">${TIME_SIGNATURES.map((t) => `<button data-sig="${t.id}" aria-pressed="${t.id === s.sig}">${t.label}</button>`).join('')}</div>
            <div class="seg">${[1, 2, 3, 4].map((v) => `<button data-sub="${v}" aria-pressed="${v === s.sub}">${SUBDIVISIONS[v - 1].label}</button>`).join('')}</div>
            <select id="chord" aria-label="Acorde">${allShapes().map((c) => `<option ${c.symbol === s.chord ? 'selected' : ''}>${c.symbol}</option>`).join('')}</select></div>
          <div class="rt-grid" style="--n:${n}"><div class="rt-g-h"></div>${Array.from({ length: n }, (_, i) => `<div class="rt-g-h ${i % s.sub === 0 ? 'beat' : ''}">${label(i)}</div>`).join('')}
            <div class="rt-g-l">Direção</div>${s.cells.map((c, i) => `<button class="rt-cell dir ${c.dir}" data-dir="${i}" aria-label="Posição ${i + 1}: ${c.dir === 'D' ? 'para baixo' : c.dir === 'U' ? 'para cima' : 'pausa'}">${c.dir === 'D' ? '↓' : c.dir === 'U' ? '↑' : '·'}</button>`).join('')}
            ${[5, 4, 3, 2, 1, 0].map((st) => `<div class="rt-g-l">${6 - st}ª <small class="dim">${['E', 'A', 'D', 'G', 'B', 'E'][st]}${sh.strings.includes(st) ? '' : ' ✕'}</small></div>${s.cells.map((c, i) => `<button class="rt-cell str ${c.strings.includes(st) && c.dir !== '-' ? 'on' : ''}" data-str="${i}:${st}" ${c.dir === '-' || !sh.strings.includes(st) ? 'disabled' : ''} aria-label="Corda ${6 - st} na posição ${i + 1}" aria-pressed="${c.strings.includes(st)}"></button>`).join('')}`).join('')}</div>
          <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))"><div class="field"><span class="h3">Andamento <b class="num" id="bv">${s.bpm}</b></span><input type="range" id="bpm" min="40" max="140" value="${s.bpm}" style="--p:${((s.bpm - 40) / 100) * 100}%"></div>
            <div class="field"><span class="h3">Compassos</span><div class="seg">${[2, 4, 8].map((v) => `<button data-bars="${v}" aria-pressed="${v === s.bars}">${v}</button>`).join('')}</div></div>
            <div class="field"><span class="h3">Nome (para salvar)</span><input type="text" id="pname" value="${esc(s.name)}" placeholder="ex.: Minha balada"></div></div>
          <div class="row wrap"><button class="btn primary lg" data-act="go">${icon('play')} Praticar</button><button class="btn" data-act="hear">Pré-ouvir</button><button class="btn" data-act="save">Salvar padrão</button><button class="btn ghost" data-act="clear">Limpar</button></div>
          ${saved().length ? `<div><div class="h3" style="margin:8px 0">Meus padrões</div><div class="row wrap">${saved().map((p, i) => `<span class="chip"><button data-load="${i}">${esc(p.name)} · ${p.sig}</button><button data-del="${i}" aria-label="Apagar ${esc(p.name)}">${icon('x')}</button></span>`).join('')}</div></div>` : ''}</div>`;
        paintIcons(root);
      };
      draw();
      root.onclick = (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.sig) { s.sig = b.dataset.sig; s.sub = sigOf(s.sig).sub; reset(); draw(); }
        else if (b.dataset.sub) { s.sub = +b.dataset.sub; reset(); draw(); }
        else if (b.dataset.bars) { s.bars = +b.dataset.bars; draw(); }
        else if (b.dataset.dir) { const c = s.cells[+b.dataset.dir]; c.dir = { '-': 'D', D: 'U', U: '-' }[c.dir]; draw(); }
        else if (b.dataset.str) { const [i, st] = b.dataset.str.split(':').map(Number), c = s.cells[i]; c.strings = c.strings.includes(st) ? c.strings.filter((x) => x !== st) : [...c.strings, st].sort(); if (!c.strings.length) c.dir = '-'; draw(); }
        else if (b.dataset.load) { const p = saved()[+b.dataset.load]; Object.assign(s, { sig: p.sig, sub: p.sub, chord: p.chord, bpm: p.bpm, name: p.name, cells: p.cells }); draw(); }
        else if (b.dataset.del) { store.update('rhythm.custom', (a) => a.filter((_, i) => i !== +b.dataset.del), []); draw(); }
        else if (b.dataset.act === 'clear') { s.cells.forEach((c) => { c.dir = '-'; }); draw(); }
        else if (b.dataset.act === 'save') { s.name = root.querySelector('#pname').value.trim() || `Padrão ${saved().length + 1}`; store.update('rhythm.custom', (a) => [...a.filter((p) => p.name !== s.name), { name: s.name, sig: s.sig, sub: s.sub, chord: s.chord, bpm: s.bpm, cells: s.cells }], []); app.toast('Padrão salvo'); draw(); }
        else if (b.dataset.act === 'hear') {
          const sc = build(); if (!sc.events.length) return app.toast('Marque pelo menos uma posição');
          const ctx = app.audio.context, t0 = ctx.currentTime + 0.1, off = app.store.get('settings.pitchOffset', 0), sh = shapeOf(s.chord);
          sc.events.filter((x) => x.beat < sigOf(s.sig).beats).forEach((x) => { const t = t0 + x.beat * 60 / s.bpm; if (x.kind === 'strum') app.audio.strum(x.strum.strings.map((q) => sh.notes[sh.strings.indexOf(q)] + off), t, x.strum.dir, 0.3); else app.audio.pluck(sh.notes[sh.strings.indexOf(x.notes[0].string)] + off, t, 0.35); });
        } else if (b.dataset.act === 'go') {
          const sc = build(); if (!sc.events.length) return app.toast('Marque pelo menos uma posição');
          launch(root, sc);
        }
      };
      root.oninput = (e) => { if (e.target.id === 'bpm') { s.bpm = +e.target.value; root.querySelector('#bv').textContent = s.bpm; e.target.style.setProperty('--p', ((s.bpm - 40) / 100) * 100 + '%'); } };
      root.onchange = (e) => { if (e.target.id === 'chord') { s.chord = e.target.value; draw(); } if (e.target.id === 'pname') s.name = e.target.value; };
      return () => { root.onclick = root.oninput = root.onchange = null; };
    }

    // ================= Trilha de níveis =================
    function path() {
      const root = box(), bestMap = () => store.get('practice.best', {});
      const draw = () => {
        const b = bestMap();
        root.innerHTML = `<div class="panel col"><p class="muted">Cada nível libera o próximo ao atingir <b>70%</b>. O BPM e a complexidade sobem aos poucos.</p><div class="rt-levels">${PATHS.map(([name, slots, bpm, chord], i) => {
          const id = `rhythm-lvl-${i + 1}`, prev = i ? b[`rhythm-lvl-${i}`] || 0 : 100, open = prev >= 70, got = b[id];
          return `<button class="rt-level ${open ? '' : 'locked'}" ${open ? `data-lvl="${i}"` : 'disabled'} aria-label="Nível ${i + 1}: ${name}${open ? '' : ' (bloqueado)'}"><span class="n">${i + 1}</span><span class="grow"><b>${name}</b><small class="dim">${chord} · ${bpm} BPM · <code>${[...slots].map((c) => (c === 'D' ? '↓' : c === 'U' ? '↑' : '·')).join(' ')}</code></small></span>${got != null ? `<span class="best num ${got >= 70 ? 'ok' : ''}">${got}%</span>` : open ? `<span class="chip">novo</span>` : icon('flag')}</button>`;
        }).join('')}</div></div>`;
        paintIcons(root);
      };
      draw();
      root.onclick = (e) => {
        const b = e.target.closest('[data-lvl]'); if (!b) return;
        const i = +b.dataset.lvl, [name, slots, bpm, chord] = PATHS[i];
        const sc = strumScore({ id: `rhythm-lvl-${i + 1}`, title: `Nível ${i + 1} · ${name}`, technique: 'rhythm', level: Math.min(5, 1 + Math.floor(i / 2)), bpm, chords: [chord], slots, bars: 8 });
        launch(root, sc);
      };
      return () => { root.onclick = null; };
    }

    shell();
    return () => { cleanup?.(); run?.destroy(); run = null; };
  },
};
