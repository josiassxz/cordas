import { Guitar } from './midi.js';
import { Audio } from './audio.js';
import { RhythmSession } from './rhythm.js';
import {
  CHORDS, CHORD_GROUPS, PROGRESSIONS, PATTERNS, INSTRUMENTS, STANDARD,
  chordById, detectChord, matchChord, noteName, pcName, setFlats,
} from './music.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------- ícones ----------
const ICONS = {
  home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
  chord: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18M15 3v18"/>',
  wave: '<path d="M3 12h2l2-6 3 12 3-9 2 5 2-2h4"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.3l2-1.5-2-3.4-2.3 1a7 7 0 00-2.3-1.3L14 3h-4l-.3 2.5a7 7 0 00-2.3 1.3l-2.3-1-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .9.1 1.3l-2 1.5 2 3.4 2.3-1a7 7 0 002.3 1.3L10 21h4l.3-2.5a7 7 0 002.3-1.3l2.3 1 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z"/>',
  guitar: '<path d="M14 4l6 6-2 2-2-1-4 4a4 4 0 11-5-5l4-4-1-2 2-2zM9 15h.01"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
const paintIcons = (root = document) => $$('i[data-icon]', root).forEach((el) => { el.innerHTML = icon(el.dataset.icon); });

// ---------- estado e persistência ----------
const KEY = 'corda.v1';
const defaults = { settings: { latency: 80, rigor: 'normal', flats: false, synth: false, auto: true }, chords: {}, sessions: [], days: [] };
let store = (() => { try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...defaults }; } })();
store.settings = { ...defaults.settings, ...store.settings };
const save = () => localStorage.setItem(KEY, JSON.stringify(store));
setFlats(store.settings.flats);

const guitar = new Guitar();
const audio = new Audio();
const VIEWS = ['home', 'chords', 'rhythm', 'train'];
let view = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
let hooks = {}; // ganchos da tela atual
let cleanup = null;

// ---------- utilidades de UI ----------
function toast(msg, ms = 3600) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), ms);
}
const today = () => new Date().toISOString().slice(0, 10);
function markDay() { if (!store.days.includes(today())) { store.days.push(today()); save(); } }
function streak() {
  let n = 0; const d = new Date();
  for (;;) { const k = d.toISOString().slice(0, 10); if (store.days.includes(k)) { n++; d.setDate(d.getDate() - 1); } else if (n === 0 && k === today()) d.setDate(d.getDate() - 1); else break; }
  return n;
}
const chordStat = (id) => (store.chords[id] ||= { ok: 0, tries: 0, streak: 0 });
const mastered = (id) => (store.chords[id]?.streak || 0) >= 3;

// ---------- diagrama de acorde ----------
function diagram(c) {
  const X = (s) => 40 + s * 28, Y = (r) => 52 + r * 36;
  let g = '';
  for (let s = 0; s < 6; s++) g += `<line class="d-str" x1="${X(s)}" y1="${Y(0)}" x2="${X(s)}" y2="${Y(5)}"/>`;
  for (let r = 0; r <= 5; r++) g += `<line class="d-fret" x1="${X(0)}" y1="${Y(r)}" x2="${X(5)}" y2="${Y(r)}"/>`;
  if (c.base === 1) g += `<line class="d-nut" x1="${X(0) - 3}" y1="${Y(0)}" x2="${X(5) + 3}" y2="${Y(0)}"/>`;
  else g += `<text class="d-base" x="${X(0) - 30}" y="${Y(0) + 22}">${c.base}ª</text>`;
  const fingerRows = {};
  c.frets.forEach((f, s) => {
    if (f < 0) g += `<path class="d-mark" d="M${X(s) - 6} 30l12 12M${X(s) + 6} 30l-12 12"/>`;
    else if (f === 0) g += `<circle class="d-mark" cx="${X(s)}" cy="36" r="6"/>`;
    else (fingerRows[c.fingers[s]] ||= []).push(s);
  });
  c.frets.forEach((f, s) => {
    if (f <= 0) return;
    const f1 = c.fingers[s], group = fingerRows[f1];
    const row = f - c.base + 0.5;
    if (f1 === 1 && group.length > 1 && s === group[0]) {
      g += `<rect class="d-dot" x="${X(group[0]) - 12}" y="${Y(row) - 12}" width="${X(group[group.length - 1]) - X(group[0]) + 24}" height="24" rx="12"/>`;
      g += `<text class="d-txt" x="${X(s)}" y="${Y(row)}">1</text>`;
    } else if (f1 === 1 && group.length > 1) {
      g += `<text class="d-txt" x="${X(s)}" y="${Y(row)}">1</text>`;
    } else {
      g += `<circle class="d-dot" cx="${X(s)}" cy="${Y(row)}" r="12"/><text class="d-txt" x="${X(s)}" y="${Y(row)}">${f1 || ''}</text>`;
    }
  });
  return `<svg viewBox="0 0 220 250" role="img" aria-label="Diagrama do acorde ${c.name}">${g}</svg>`;
}
const chordNotesText = (c) => [...new Set(c.notes.map((n) => pcName(n)))].join(' · ');
const QNAMES = { maj: 'Maior', min: 'Menor', 7: 'Dominante (7)', maj7: 'Maior com sétima', m7: 'Menor com sétima', sus2: 'Suspenso 2', sus4: 'Suspenso 4' };

// ---------- conexão ----------
async function connect() {
  if (guitar.status === 'connected') { guitar.disconnect(); return; }
  if (guitar.status === 'demo') { guitar.setStatus('idle', ''); return; }
  if (!guitar.supported) { toast('Este navegador não suporta Bluetooth. Abra o Corda no Google Chrome.'); return; }
  try { await guitar.connect(); toast('Guitarra conectada. Pode tocar!'); markDay(); }
  catch (e) {
    if (e.name === 'NotFoundError') toast('Nenhuma guitarra escolhida. Feche o app da Aeroband e ligue a guitarra.');
    else toast('Não consegui conectar: ' + (e.message || e.name));
  }
}
guitar.addEventListener('status', (e) => {
  const { status, name } = e.detail;
  const pill = $('#conn');
  pill.dataset.s = status;
  $('#connText').textContent = { idle: 'Conectar guitarra', connecting: 'Conectando…', connected: name || 'Conectada', demo: 'Modo demo' }[status];
  if (view === 'home') render();
});

// ---------- dock ao vivo ----------
const inst = INSTRUMENTS[0];
$('#dockStrings').innerHTML = inst.labels.map((l, i) => `<div class="str" data-s="${i}"><small>${l}</small><b>–</b></div>`).join('');
const fadeTimers = {};
guitar.addEventListener('notes', (e) => {
  const act = e.detail.active;
  $$('.str').forEach((el) => {
    const s = +el.dataset.s, n = act.get(s);
    if (n !== undefined) { el.classList.add('on'); el.classList.remove('fade'); $('b', el).textContent = noteName(n); clearTimeout(fadeTimers[s]); }
    else if (el.classList.contains('on')) {
      el.classList.remove('on'); el.classList.add('fade');
      clearTimeout(fadeTimers[s]); fadeTimers[s] = setTimeout(() => el.classList.remove('fade'), 500);
    }
  });
  const ch = act.size >= 2 ? detectChord([...act.values()]) : null;
  $('#dockChord').textContent = ch ? ch.name : '—';
});
guitar.addEventListener('noteon', (e) => {
  if (store.settings.synth && guitar.status === 'connected') audio.pluck(e.detail.note, audio.context.currentTime, 0.35);
});

// ---------- eventos de palhetada para a tela atual ----------
guitar.addEventListener('strumstart', (e) => hooks.strumstart?.(e.detail));
guitar.addEventListener('strum', (e) => { markDay(); hooks.strum?.(e.detail); });

// Demo sem guitarra: espaço = para baixo, seta ↑ = para cima, X = errar de propósito
function demoStrum(dir = 'D', wrong = false) {
  let chord = hooks.demoChord?.() || chordById('Em');
  if (wrong) chord = CHORDS[(CHORDS.indexOf(chord) + 3) % CHORDS.length];
  const byString = Array(6).fill(null);
  chord.frets.forEach((f, s) => { if (f >= 0) byString[s] = STANDARD[s] + f; });
  guitar.simulateStrum(byString, dir);
  if (!store.settings.synth) audio.strum(chord.notes, audio.context.currentTime, dir, 0.3);
}
addEventListener('keydown', (e) => {
  if (e.target.closest('input,select,textarea,dialog') || e.metaKey || e.ctrlKey) return;
  if (guitar.status === 'connected') return;
  if (e.code === 'Space') { e.preventDefault(); demoStrum('D'); }
  else if (e.code === 'ArrowUp') { e.preventDefault(); demoStrum('U'); }
  else if (e.code === 'ArrowDown') { e.preventDefault(); demoStrum('D'); }
  else if (e.key === 'x' || e.key === 'X') demoStrum('D', true);
});

// ---------- roteador ----------
const TITLES = { home: 'Início', chords: 'Acordes', rhythm: 'Ritmo', train: 'Treino' };
function go(v) { if (location.hash.slice(1) !== v) location.hash = v; else render(); }
addEventListener('hashchange', () => { const v = location.hash.slice(1); if (VIEWS.includes(v) && v !== view) { view = v; render(); } });
function render() {
  cleanup?.(); cleanup = null; hooks = {};
  $('#title').textContent = TITLES[view];
  $$('.nav button').forEach((b) => b.classList.toggle('on', b.dataset.nav === view));
  const el = $('#view');
  el.innerHTML = '';
  ({ home: renderHome, chords: renderChords, rhythm: (e) => renderRhythm(e, false), train: (e) => renderRhythm(e, true) })[view](el);
  paintIcons(el);
  el.scrollTop = 0;
}

// ---------- tela: início ----------
function renderHome(el) {
  const masteredN = CHORDS.filter((c) => mastered(c.id)).length;
  const sess = store.sessions.slice(-10);
  const avg = sess.length ? Math.round(sess.reduce((a, s) => a + s.accuracy, 0) / sess.length) : null;
  const connected = guitar.status === 'connected' || guitar.status === 'demo';
  const hero = connected
    ? `<div><h2>${guitar.status === 'demo' ? 'Modo demo ligado' : 'Guitarra pronta'}</h2>
         <p>${guitar.status === 'demo' ? 'Use a tecla <b>Espaço</b> para palhetar para baixo, <b>↑</b> para cima e <b>X</b> para errar de propósito.' : 'Toque qualquer corda para testar. Quando estiver pronto, escolha um treino abaixo.'}</p></div>
       <button class="primary" data-go="chords">Começar pelos acordes</button>`
    : `<div><h2>Vamos tocar?</h2>
         <p>Conecte a sua Aeroband para praticar acordes e ritmo com avaliação em tempo real.</p>
         <ol class="steps"><li>Feche o app da Aeroband (só um app conecta por vez)</li><li>Ligue a guitarra</li><li>Clique em conectar e escolha “AeroBand Midi”</li></ol>
         <div class="row-btns"><button class="primary" data-action="connect">Conectar guitarra</button><button class="btn" data-action="demo">Experimentar sem guitarra</button></div>
         ${guitar.supported ? '' : '<p class="hint" style="margin-top:12px;color:var(--bad)">Este navegador não tem Bluetooth web. Use o Google Chrome.</p>'}</div>`;
  el.innerHTML = `
    <section class="hero">${hero}</section>
    <div class="grid g4" style="margin-bottom:16px">
      <div class="card tile"><b>${masteredN}<small> / ${CHORDS.length}</small></b><small>acordes dominados</small></div>
      <div class="card tile"><b>${avg === null ? '–' : avg + '%'}</b><small>precisão rítmica (últimas sessões)</small></div>
      <div class="card tile"><b>${streak()}</b><small>${streak() === 1 ? 'dia seguido' : 'dias seguidos'}</small></div>
      <div class="card tile"><b>${store.sessions.length}</b><small>sessões de ritmo</small></div>
    </div>
    <div class="grid g3" style="margin-bottom:16px">
      <button class="card go" data-go="chords"><i data-icon="chord"></i><b>Acordes</b><small>Aprenda formas e confirme com a guitarra se acertou.</small></button>
      <button class="card go" data-go="rhythm"><i data-icon="wave"></i><b>Ritmo</b><small>Palhetadas no tempo certo, com metrônomo e nota de precisão.</small></button>
      <button class="card go" data-go="train"><i data-icon="target"></i><b>Treino</b><small>Progressões de acordes no ritmo: o treino completo.</small></button>
    </div>
    <div class="card"><h2>Instrumentos</h2><div class="soon">
      ${INSTRUMENTS.map((i) => `<span class="chip" ${i.ready ? 'style="border-color:var(--acc);color:var(--acc2)"' : ''}>${i.name}${i.ready ? ' · ativo' : ' · em breve'}</span>`).join('')}
    </div></div>`;
}

// ---------- tela: acordes ----------
function renderChords(el) {
  let id = sessionStorage.getItem('corda.chord') || 'Em';
  let timer;
  const lib = CHORD_GROUPS.map((g) => `<h3>${g}</h3><div class="chips">${CHORDS.filter((c) => c.group === g).map((c) =>
    `<button class="cchip" data-chord="${c.id}">${c.name}</button>`).join('')}</div>`).join('');
  el.innerHTML = `<div class="grid g2">
    <section class="card practice" aria-live="polite">
      <small id="cq"></small><div class="cname" id="cname"></div><div class="csub" id="cnotes"></div>
      <div class="diagram" id="cdiag"></div>
      <div class="feedback" id="cfb"></div>
      <div class="row-btns" style="margin-top:8px">
        <button class="btn" data-act="hear">▶ Ouvir</button>
        <button class="btn" data-act="skip">Próximo acorde →</button>
      </div>
      <div class="meter" title="Progresso do acorde"><i id="cbar" style="width:0"></i></div>
      <small id="cprog"></small>
    </section>
    <section class="card lib"><h2>Biblioteca</h2>${lib}</section></div>`;

  const idle = () => {
    const live = guitar.status === 'connected';
    $('#cfb').className = 'feedback';
    $('#cfb').innerHTML = guitar.status === 'idle'
      ? '<span>Conecte a guitarra, ou aperte <b>Espaço</b> para testar no modo demo</span>'
      : `<span class="listen"></span><span>${live ? 'Ouvindo… toque o acorde' : 'Demo: aperte Espaço para palhetar'}</span>`;
  };
  const set = (newId) => {
    id = newId; sessionStorage.setItem('corda.chord', id);
    const c = chordById(id);
    $('#cname').textContent = c.name;
    $('#cq').textContent = QNAMES[c.q] || c.q;
    $('#cnotes').textContent = 'Notas: ' + chordNotesText(c);
    $('#cdiag').innerHTML = diagram(c);
    $$('.cchip', el).forEach((b) => { b.classList.toggle('on', b.dataset.chord === id); b.classList.toggle('done', mastered(b.dataset.chord)); });
    const st = chordStat(id);
    $('#cbar').style.width = Math.min(100, (st.streak / 3) * 100) + '%';
    $('#cprog').textContent = mastered(id) ? 'Dominado ★ — continue para manter a prática' : `Acerte ${3 - st.streak} ${3 - st.streak === 1 ? 'vez' : 'vezes'} seguidas para dominar`;
    idle();
  };
  const next = () => { const list = CHORDS; set(list[(list.findIndex((c) => c.id === id) + 1) % list.length].id); };

  hooks.demoChord = () => chordById(id);
  hooks.strum = (s) => {
    if (s.count < 2) return;
    const c = chordById(id), st = chordStat(id);
    const r = matchChord(s.notes, c, store.settings.rigor);
    st.tries++;
    const fb = $('#cfb');
    if (r.ok) {
      st.ok++; st.streak++; save();
      set(id); fb.className = 'feedback ok'; fb.innerHTML = `<span>✓ Isso! ${c.name}${st.streak >= 3 ? ' — dominado ★' : ''}</span>`;
      clearTimeout(timer);
      if (store.settings.auto) timer = setTimeout(next, 1600); else timer = setTimeout(idle, 2000);
    } else {
      st.streak = 0; save();
      const heard = s.chord?.name;
      const why = r.missing.length ? `faltou a nota ${r.missing.join(', ')}` : `sobrou a nota ${r.extra.join(', ')}`;
      fb.className = 'feedback bad';
      fb.innerHTML = `<span>${heard ? `Ouvi <b>${heard}</b>` : 'Não reconheci o acorde'} — ${why}. Tente de novo.</span>`;
      $('#cbar').style.width = '0';
      clearTimeout(timer); timer = setTimeout(idle, 3200);
    }
  };
  el.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-chord]'); if (chip) set(chip.dataset.chord);
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'hear') audio.strum(chordById(id).notes);
    if (a === 'skip') next();
  });
  cleanup = () => clearTimeout(timer);
  set(id);
}

// ---------- telas: ritmo e treino ----------
const cfg = { bpm: 80, pattern: 'pop', prog: 'gdem', bars: 8, guide: false };
const ARROW = { D: '↓', U: '↑', '-': '·' };
const COUNT = ['1', '&', '2', '&', '3', '&', '4', '&'];

function renderRhythm(el, withChords) {
  let session = null;
  const pat = () => PATTERNS.find((p) => p.id === cfg.pattern);
  const prog = () => PROGRESSIONS.find((p) => p.id === cfg.prog);
  const barChords = () => (withChords ? Array.from({ length: cfg.bars }, (_, b) => chordById(prog().chords[b % prog().chords.length])) : null);
  let lastRes = null;

  const setup = () => {
    el.innerHTML = `<div class="grid" style="gap:16px">
      <section class="card cfg">
        <div><div class="lab">Padrão de batida</div><div class="pats">${PATTERNS.map((p) =>
          `<button class="pat ${p.id === cfg.pattern ? 'on' : ''}" data-pat="${p.id}"><b>${p.name}</b><code>${[...p.slots].map((c) => ARROW[c]).join(' ')}</code></button>`).join('')}</div></div>
        ${withChords ? `<div><div class="lab">Progressão</div><div class="pats">${PROGRESSIONS.map((p) =>
          `<button class="pat ${p.id === cfg.prog ? 'on' : ''}" data-prog="${p.id}"><b>${p.name}</b><small>${p.desc}</small></button>`).join('')}</div></div>` : ''}
        <div class="grid g3">
          <div><div class="lab"><span>Andamento</span></div><div class="bpm"><button class="btn" data-bpm="-5">−</button><b id="bpmv">${cfg.bpm}</b><button class="btn" data-bpm="5">+</button></div>
            <input type="range" id="bpmr" min="50" max="160" value="${cfg.bpm}" aria-label="BPM"></div>
          <div><div class="lab"><span>Duração</span></div><div class="row-btns">${[4, 8, 16].map((n) => `<button class="btn ${cfg.bars === n ? 'on' : ''}" data-bars="${n}">${n} compassos</button>`).join('')}</div></div>
          <div><div class="lab"><span>Guia sonoro</span></div><button class="btn ${cfg.guide ? 'on' : ''}" data-guide>${cfg.guide ? 'Ligado: toca a batida junto' : 'Desligado: só metrônomo'}</button></div>
        </div>
        <div class="row-btns"><button class="primary" data-start>▶ Começar</button>
          <small>${guitar.status === 'idle' ? 'Sem guitarra: conecte ou use o modo demo (Espaço = ↓, ↑ = ↑).' : 'Uma contagem de 1 compasso antes de começar.'}</small></div>
      </section>
      ${lastRes ? resultCard(lastRes) : ''}
    </div>`;
  };

  const resultCard = (r) => {
    const late = Math.round(r.meanDelta);
    const tip = Math.abs(late) < 15 ? 'Seu tempo está muito bem calibrado.'
      : late > 0 ? `Você tende a tocar ${late} ms atrasado.` : `Você tende a tocar ${-late} ms adiantado.`;
    const apply = Math.abs(late) >= 30 ? `<button class="btn" data-apply="${late}">Compensar ${late > 0 ? '−' : '+'}${Math.abs(late)} ms de latência</button>` : '';
    return `<section class="card result"><h2>Resultado</h2>
      <div class="score">${r.accuracy}%</div>
      <div class="stats">
        <div><b>${r.perfect}</b><small>perfeitas</small></div><div><b>${r.good}</b><small>boas</small></div>
        <div><b>${r.ok}</b><small>no limite</small></div><div><b>${r.miss}</b><small>perdidas</small></div>
        <div><b>${r.extras}</b><small>fora de lugar</small></div>
        ${r.dirAccuracy !== null ? `<div><b>${r.dirAccuracy}%</b><small>direção certa</small></div>` : ''}
        ${r.chordTotal ? `<div><b>${r.chordOk}/${r.chordTotal}</b><small>acordes certos</small></div>` : ''}
      </div>
      <p class="hint">${tip}</p><div class="row-btns" style="margin-top:12px">${apply}<button class="btn" data-again>Tentar de novo</button></div></section>`;
  };

  const stageHTML = () => `<section class="card stage" aria-live="off">
    ${withChords ? `<div class="now"><div><small>Agora</small><div class="big" id="nowc">–</div></div><div><small>Depois</small><div class="nxt" id="nextc">–</div></div></div>`
      : `<div class="count" id="count">·</div>`}
    <div class="beats" id="beats">${[...pat().slots].map((c, i) => `<div class="beat ${c === '-' ? 'rest' : ''}" data-i="${i}"><span class="ar">${ARROW[c]}</span><small>${COUNT[i]}</small></div>`).join('')}</div>
    <div class="tmeter" aria-hidden="true"><span class="lbl" style="left:0">cedo</span><span class="lbl" style="right:0">tarde</span><div class="track"></div><div class="mid"></div><div class="needle" id="needle"></div></div>
    <div class="hint" id="fb">Preparando…</div>
    <div class="bars" id="barsel">${Array.from({ length: cfg.bars }, () => '<i></i>').join('')}</div>
    <button class="btn" data-stop>■ Parar</button></section>`;

  const start = () => {
    markDay();
    const chords = barChords();
    el.innerHTML = stageHTML();
    const beats = $$('.beat', el), bars = $$('#barsel i', el), needle = $('#needle', el), fb = $('#fb', el);
    const bpmMs = 60000 / cfg.bpm / 2;
    session = new RhythmSession({
      audio, bpm: cfg.bpm, pattern: [...pat().slots], bars: cfg.bars, chords, latency: store.settings.latency, guide: cfg.guide,
      on: {
        slot: (slot) => {
          beats.forEach((b) => b.classList.remove('now'));
          if (slot < 0) {
            const n = Math.floor((slot + 8) / 2) + 1;
            if (!withChords) $('#count', el).textContent = n; else $('#nowc', el).textContent = String(n);
            fb.textContent = 'Contagem…';
            if (chords) $('#nextc', el).textContent = chords[0].name;
            beats.forEach((b) => b.className = b.className.replace(/\b(perfect|good|ok|miss|extra)\b/g, '').trim());
            return;
          }
          const bar = Math.floor(slot / 8), i = slot % 8;
          if (i === 0) {
            beats.forEach((b) => b.className = b.className.replace(/\b(perfect|good|ok|miss|extra)\b/g, '').trim());
            bars.forEach((b, k) => { if (k === bar) b.className = 'cur'; });
            if (chords) { $('#nowc', el).textContent = chords[bar].name; $('#nowc', el).className = 'big'; $('#nextc', el).textContent = chords[bar + 1]?.name || '—'; }
            else $('#count', el).textContent = '♪';
            fb.textContent = 'Toque!';
          }
          beats[i].classList.add('now');
        },
        result: (r) => {
          const b = beats[r.slot % 8]; if (!b) return;
          if (r.grade === 'extra') { b.classList.add('extra'); return; }
          b.classList.remove('perfect', 'good', 'ok', 'miss'); b.classList.add(r.grade);
          if (r.grade === 'miss') return;
          const lim = Math.min(200, bpmMs * 0.9);
          needle.style.opacity = 1; needle.style.left = `${50 + Math.max(-1, Math.min(1, r.delta / lim)) * 50}%`;
          const ms = Math.round(r.delta);
          fb.textContent = { perfect: 'Perfeito!', good: 'Bom', ok: 'No limite' }[r.grade] + (Math.abs(ms) > 10 ? ` · ${ms > 0 ? 'atrasado' : 'adiantado'} ${Math.abs(ms)} ms` : '');
        },
        chord: ({ bar, ok }) => { bars[bar]?.classList.toggle('pass', ok); bars[bar]?.classList.toggle('fail', !ok); if (session && bar === Math.floor(session.lastSlot / 8)) $('#nowc', el)?.classList.add(ok ? 'good' : 'bad'); },
        finish: (sum) => {
          store.sessions.push({ date: today(), mode: withChords ? 'train' : 'rhythm', accuracy: sum.accuracy, bpm: cfg.bpm });
          store.sessions = store.sessions.slice(-200); save();
          lastRes = sum; session = null; setup(); paintIcons(el);
          el.scrollTop = 0;
        },
      },
    });
    session.start();
  };

  hooks.demoChord = () => { const ch = barChords(); return ch ? ch[Math.max(0, Math.min(cfg.bars - 1, session?.lastSlot >= 0 ? Math.floor(session.lastSlot / 8) : 0))] : chordById('Em'); };
  let pending = null;
  hooks.strumstart = (s) => {
    if (!session) return;
    pending = session.onset(s.t, 'S');
  };
  hooks.strum = (s) => {
    if (!session) return;
    if (pending && pending.grade !== 'extra' && pending.grade !== 'miss') {
      const exp = session.pattern[pending.slot % 8];
      pending.dirOk = s.dir === 'S' ? null : s.dir === exp;
    }
    pending = null;
    if (withChords && s.count >= 3) {
      const bar = session.barOf(s.t), chords = session.chords;
      if (chords?.[bar]) {
        const ok = matchChord(s.notes, chords[bar], store.settings.rigor).ok;
        session.noteChord(bar, ok);
      }
    }
  };

  el.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.pat) { cfg.pattern = t.dataset.pat; setup(); }
    else if (t.dataset.prog) { cfg.prog = t.dataset.prog; setup(); }
    else if (t.dataset.bpm) { cfg.bpm = Math.max(50, Math.min(160, cfg.bpm + +t.dataset.bpm)); setup(); }
    else if (t.dataset.bars) { cfg.bars = +t.dataset.bars; setup(); }
    else if ('guide' in t.dataset) { cfg.guide = !cfg.guide; setup(); }
    else if ('start' in t.dataset || 'again' in t.dataset) start();
    else if ('stop' in t.dataset) { session?.stop(true); session = null; setup(); }
    else if (t.dataset.apply) {
      store.settings.latency = Math.max(0, Math.min(250, store.settings.latency + +t.dataset.apply)); save();
      toast(`Latência ajustada para ${store.settings.latency} ms`);
      lastRes = { ...lastRes, meanDelta: 0 }; setup();
    }
  });
  el.addEventListener('input', (e) => { if (e.target.id === 'bpmr') { cfg.bpm = +e.target.value; $('#bpmv', el).textContent = cfg.bpm; } });
  cleanup = () => { session?.stop(true); session = null; };
  setup();
}

// ---------- instrumentos, ajustes e eventos globais ----------
function openInstrumentMenu(btn) {
  const m = $('#menu');
  if (!m.hidden) { m.hidden = true; return; }
  m.innerHTML = INSTRUMENTS.map((i) => `<button ${i.ready ? '' : 'disabled'}><span>${i.name}</span><small>${i.ready ? '✓' : 'em breve'}</small></button>`).join('');
  m.hidden = false;
}
function openSettings() {
  const s = store.settings;
  $('#latency').value = s.latency; $('#latOut').textContent = s.latency + ' ms';
  $('#rigor').value = s.rigor; $('#flats').value = s.flats ? '1' : '0';
  $('#synth').checked = s.synth; $('#auto').checked = s.auto;
  $('#settings').showModal();
}
$('#latency').addEventListener('input', (e) => { store.settings.latency = +e.target.value; $('#latOut').textContent = e.target.value + ' ms'; save(); });
$('#rigor').addEventListener('change', (e) => { store.settings.rigor = e.target.value; save(); });
$('#flats').addEventListener('change', (e) => { store.settings.flats = e.target.value === '1'; setFlats(store.settings.flats); save(); render(); });
$('#synth').addEventListener('change', (e) => { store.settings.synth = e.target.checked; save(); });
$('#auto').addEventListener('change', (e) => { store.settings.auto = e.target.checked; save(); });

document.addEventListener('click', (e) => {
  if (!e.target.closest('#menu,.instr')) $('#menu').hidden = true;
  const nav = e.target.closest('[data-nav]'); if (nav) return go(nav.dataset.nav);
  const g = e.target.closest('[data-go]'); if (g) return go(g.dataset.go);
  const a = e.target.closest('[data-action]')?.dataset.action;
  if (a === 'connect') connect();
  else if (a === 'demo') { guitar.startDemo(); markDay(); }
  else if (a === 'settings') openSettings();
  else if (a === 'instruments') openInstrumentMenu();
  else if (a === 'reset' && confirm('Apagar todo o progresso salvo neste navegador?')) { store = { ...defaults, settings: store.settings }; save(); $('#settings').close(); render(); }
});

paintIcons();
render();
