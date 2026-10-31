// Músicas: biblioteca local + página de estudo (player, loop A–B, mixer honesto, análise estimada e corrigível, prática de acordes).
import { icon, esc, fmtTime, clamp, paintIcons } from '../core/dom.js';
import { Library, ACCEPT } from '../songs/library.js';
import { idbAudioDb } from '../songs/db.js';
import { importSong, decodeWithWebAudio } from '../songs/import.js';
import { analyzeSong } from '../songs/job.js';
import { SongPlayer, RATE_MIN, RATE_MAX } from '../songs/player.js';
import { LIMITS } from '../songs/analysis.js';
import { addChord, editChord, removeChord, moveChord, chordAt, nextChord, spans, tapTempo, nudgeLoop, normalizeLoop } from '../songs/timeline.js';
import { chordChangeScore } from '../songs/score.js';
import { isValidSymbol } from '../songs/chordnames.js';

let lib = null;
const jobs = new Map(), bus = new EventTarget();   // análises em andamento sobrevivem à troca de tela

const hue = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const dur = (s) => fmtTime(s || 0);
const confLabel = (c) => (c >= 0.7 ? 'alta' : c >= 0.4 ? 'média' : 'baixa');

// Módulos opcionais da frente ACORDES (diagramas/voicings reais). Sem eles, só o nome do acorde.
let chordLib; async function loadChordLib() {
  if (chordLib !== undefined) return chordLib;
  try { const [m, d] = await Promise.all([import('../music/chords.js'), import('../ui/chord-diagram.js')]); chordLib = { voicingsOf: m.voicingsOf, getChord: m.getChord, diagram: d.chordDiagram }; } catch { chordLib = null; }
  return chordLib;
}
// Primeira digitação do acorde (formato da frente ACORDES: {frets, fingers, notes, baseFret…}); nunca lança.
const voicing = (sym) => { try { return chordLib?.voicingsOf?.(sym)?.[0] || chordLib?.getChord?.(sym)?.best || null; } catch { return null; } };
const diagramSvg = (v) => { try { return chordLib?.diagram && v ? chordLib.diagram(v, { size: 'sm' }) : ''; } catch { return ''; } };

function startAnalysis(app, id, opts = {}) {
  if (jobs.has(id)) return jobs.get(id).promise;
  const job = { p: 0 }, emit = () => bus.dispatchEvent(new CustomEvent('job', { detail: { id } }));
  jobs.set(id, job);
  job.promise = analyzeSong(app, lib, id, { ...opts, onProgress: (p) => { job.p = p; emit(); } })
    .catch((e) => app.toast('Falha na análise: ' + e.message)).finally(() => { jobs.delete(id); emit(); });
  emit(); return job.promise;
}

export default {
  id: 'songs', title: 'Músicas', icon: 'music', order: 50,
  mount(el, app, params) {
    lib ||= new Library(app.store, app.songsDb || idbAudioDb());   // app.songsDb: costura de teste
    return params.id && lib.get(params.id) ? songPage(el, app, params.id) : libraryPage(el, app);
  },
};

// ============================== BIBLIOTECA ==============================
function libraryPage(el, app) {
  const st = { query: '', sort: 'recent', tag: '', fav: false };
  el.innerHTML = `<div class="page songs">
    <div class="row wrap songs-bar">
      <label class="search grow" style="max-width:420px;min-width:300px">${icon('search')}<input type="search" id="q" placeholder="Buscar por música, artista ou tag" aria-label="Buscar músicas"></label>
      <select id="sort" aria-label="Ordenar"><option value="recent">Mais recentes</option><option value="played">Tocadas há pouco</option><option value="title">Título</option><option value="artist">Artista</option><option value="bpm">Andamento</option></select>
      <select id="tag" aria-label="Filtrar por tag"><option value="">Todas as tags</option></select>
      <button class="chip" id="favOnly" aria-pressed="false">${icon('heart', 'sm')} Favoritas</button>
      <span class="grow"></span>
      <button class="btn primary" id="pick">${icon('upload')} Importar músicas</button>
      <input type="file" id="file" accept="${ACCEPT}" multiple hidden>
    </div>
    <div class="drop" id="drop" tabindex="0" role="button" aria-label="Importar arquivos de áudio"></div>
    <div id="jobs" class="jobs"></div>
    <div id="list" class="song-list" role="list"></div>
    <p class="hint dim">Seus arquivos ficam somente neste navegador (IndexedDB) e nunca são enviados a lugar nenhum. O Corda não contorna DRM: use arquivos que você adquiriu legalmente, sem proteção.</p>
  </div>`;
  const $ = (s) => el.querySelector(s);

  const paint = () => {
    const items = lib.list(st), tags = lib.allTags();
    $('#tag').innerHTML = '<option value="">Todas as tags</option>' + tags.map((t) => `<option ${t === st.tag ? 'selected' : ''}>${esc(t)}</option>`).join('');
    $('#drop').className = 'drop' + (lib.all.length ? ' compact' : '');
    $('#drop').innerHTML = lib.all.length ? `${icon('upload')}<span>Solte aqui para importar mais (mp3, wav, ogg, m4a, aac, flac)</span>`
      : `${icon('music')}<b>Sua biblioteca está vazia</b><span>Arraste arquivos de áudio para cá ou clique para importar.<br>Depois o Corda estima andamento, tom e acordes para você estudar.</span>`;
    $('#list').innerHTML = items.length ? items.map((s) => {
      const job = jobs.get(s.id);
      return `<div class="song-row" role="listitem" data-id="${s.id}">
        <div class="cover" style="--h:${hue(s.title)}" aria-hidden="true">${esc(s.title[0] || '♪')}</div>
        <button class="open grow" data-act="open"><b>${esc(s.title)}</b><small>${esc(s.artist || 'Artista desconhecido')}${(s.tags || []).map((t) => ` <span class="chip tiny">${esc(t)}</span>`).join('')}</small></button>
        <span class="meta num">${job ? `<span class="spin"></span> analisando ${Math.round(job.p * 100)}%` : s.bpm ? `${Math.round(s.bpm.value)} BPM${s.bpm.source === 'estimado' ? '<sup title="estimado">~</sup>' : ''}` : '<span class="dim">não analisada</span>'}</span>
        <span class="meta">${s.key ? esc(s.key.name) : ''}</span><span class="meta num dim">${dur(s.duration)}</span>
        <button class="btn icon ghost fav ${lib.isFav(s.id) ? 'on' : ''}" data-act="fav" aria-label="Favoritar" aria-pressed="${lib.isFav(s.id)}">${icon('heart')}</button>
      </div>`;
    }).join('') : `<div class="empty">${icon('search')}<span>${lib.all.length ? 'Nenhuma música com esses filtros.' : ''}</span></div>`;
    paintIcons(el);
  };

  async function importFiles(files) {
    let ok = 0;
    for (const f of files) {
      const box = document.createElement('div'); box.className = 'job'; box.innerHTML = `<span class="spin"></span> Importando <b>${esc(f.name)}</b>…`; $('#jobs').append(box);
      try {
        const { meta } = await importSong(f, { library: lib, decode: (ab) => decodeWithWebAudio(app.audio.context, ab) });
        ok++; box.remove(); paint(); startAnalysis(app, meta.id);
      } catch (e) { box.className = 'job bad'; box.innerHTML = `${icon('x')} <span><b>${esc(f.name)}</b>: ${esc(e.message)}</span>`; setTimeout(() => box.remove(), 9000); }
    }
    if (ok) app.toast(`${ok} música(s) importada(s). A análise roda em segundo plano.`);
  }

  $('#q').addEventListener('input', (e) => { st.query = e.target.value; paint(); });
  $('#sort').addEventListener('change', (e) => { st.sort = e.target.value; paint(); });
  $('#tag').addEventListener('change', (e) => { st.tag = e.target.value; paint(); });
  $('#favOnly').addEventListener('click', (e) => { st.fav = !st.fav; e.currentTarget.setAttribute('aria-pressed', st.fav); e.currentTarget.classList.toggle('on', st.fav); paint(); });
  $('#pick').addEventListener('click', () => $('#file').click());
  $('#drop').addEventListener('click', () => $('#file').click());
  $('#drop').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); } });
  $('#file').addEventListener('change', (e) => { importFiles([...e.target.files]); e.target.value = ''; });
  for (const ev of ['dragenter', 'dragover']) el.addEventListener(ev, (e) => { e.preventDefault(); $('#drop').classList.add('over'); });
  for (const ev of ['dragleave', 'drop']) el.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || e.target === $('#drop')) $('#drop').classList.remove('over'); });
  el.addEventListener('drop', (e) => importFiles([...(e.dataTransfer?.files || [])]));
  $('#list').addEventListener('click', (e) => {
    const row = e.target.closest('.song-row'), act = e.target.closest('[data-act]')?.dataset.act; if (!row) return;
    if (act === 'fav') { lib.toggleFav(row.dataset.id); paint(); } else app.navigate('songs', { id: row.dataset.id });
  });
  const onJob = () => paint(); bus.addEventListener('job', onJob);
  paint();
  return () => bus.removeEventListener('job', onJob);
}

// ============================== PÁGINA DA MÚSICA ==============================
function songPage(el, app, id) {
  let S = lib.get(id), player = null, peaks = [], selChord = -1, taps = [], raf = 0, disposed = false, lastPlayed = 0;
  const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  el.innerHTML = `<div class="page song-page">
    <div class="row wrap"><button class="btn ghost" id="back">${icon('chev', 'flip')} Biblioteca</button><span class="grow"></span>
      <button class="btn ghost fav" id="fav">${icon('heart')}</button><button class="btn ghost danger" id="del">Remover</button></div>
    <div class="song-head"><input class="title-in" id="title" aria-label="Título"><input class="artist-in" id="artist" aria-label="Artista" placeholder="Artista">
      <div class="row wrap" id="tags"></div></div>
    <section class="panel player">
      <div class="wave-wrap"><canvas id="wave" aria-label="Forma de onda. Clique para ir a um ponto; arraste as alças A e B do loop."></canvas></div>
      <div class="row wrap player-bar">
        <div class="row"><button class="btn icon ghost" id="back5" aria-label="Voltar 5 segundos" title="← 5 s">${icon('restart')}</button>
          <button class="play-btn" id="play" aria-label="Tocar">${icon('play')}</button>
          <button class="btn icon ghost" id="fwd5" aria-label="Avançar 5 segundos" title="→ 5 s">${icon('repeat')}</button></div>
        <span class="num time" id="time">0:00 / 0:00</span><span class="grow"></span>
        <div class="row" title="Velocidade sem mudar o tom"><span class="dim">Velocidade</span>
          <div class="seg" id="rates">${[0.5, 0.75, 1, 1.25, 1.5].map((r) => `<button data-r="${r}">${r}×</button>`).join('')}</div>
          <input type="range" id="rate" min="${RATE_MIN}" max="${RATE_MAX}" step="0.05" style="width:110px" aria-label="Velocidade"></div>
      </div>
      <div class="row wrap loop-bar"><span class="h3">Loop</span>
        <button class="btn sm" id="setA">Marcar A</button><button class="btn sm" id="setB">Marcar B</button>
        <button class="btn sm" id="loopTgl" aria-pressed="false">${icon('repeat', 'sm')} <span id="loopTxt">Sem loop</span></button>
        <button class="btn sm ghost" id="aMinus" title="A −0,1 s">A−</button><button class="btn sm ghost" id="aPlus" title="A +0,1 s">A+</button>
        <button class="btn sm ghost" id="bMinus">B−</button><button class="btn sm ghost" id="bPlus">B+</button>
        <button class="btn sm ghost" id="loopClr">Limpar</button><span class="grow"></span>
        <button class="btn sm" id="mark">${icon('flag', 'sm')} Marcar trecho difícil</button></div>
    </section>
    <div class="grid song-cols">
      <section class="panel col" id="chordsPanel"></section>
      <div class="col">
        <section class="panel col" id="tempoPanel"></section>
        <section class="panel col" id="mixPanel"></section>
      </div>
    </div>
    <section class="panel col" id="markPanel"></section>
    <section class="panel col" id="practicePanel"></section>
  </div>`;
  const $ = (s) => el.querySelector(s);
  const cv = $('#wave');

  // ---------- cabeçalho ----------
  const head = () => {
    $('#title').value = S.title; $('#artist').value = S.artist || '';
    $('#fav').classList.toggle('on', lib.isFav(id)); $('#fav').setAttribute('aria-pressed', lib.isFav(id));
    $('#tags').innerHTML = (S.tags || []).map((t) => `<button class="chip" data-tag="${esc(t)}" title="Remover tag">${esc(t)} ×</button>`).join('') + `<input type="text" class="tag-in" id="tagIn" placeholder="+ tag" aria-label="Nova tag" maxlength="20">`;
  };
  const refresh = () => { S = lib.get(id); if (player) { player.song = S; player.resetSched(); } head(); panels(); draw(); };
  $('#back').addEventListener('click', () => app.navigate('songs'));
  $('#fav').addEventListener('click', () => { lib.toggleFav(id); head(); });
  let delArm = false;
  $('#del').addEventListener('click', async (e) => {
    if (!delArm) { delArm = true; e.currentTarget.textContent = 'Confirmar remoção'; setTimeout(() => { delArm = false; e.currentTarget.textContent = 'Remover'; }, 4000); return; }
    player?.dispose(); player = null; await lib.remove(id); app.toast('Música removida.'); app.navigate('songs');
  });
  $('#title').addEventListener('change', (e) => lib.update(id, { title: e.target.value.trim() || S.title }));
  $('#artist').addEventListener('change', (e) => lib.update(id, { artist: e.target.value.trim() }));
  $('#tags').addEventListener('click', (e) => { const t = e.target.closest('[data-tag]')?.dataset.tag; if (t) { lib.setTags(id, S.tags.filter((x) => x !== t)); refresh(); } });
  $('#tags').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'tagIn' && e.target.value.trim()) { lib.setTags(id, [...(S.tags || []), e.target.value]); refresh(); $('#tagIn').focus(); } });

  // ---------- forma de onda ----------
  function draw() {
    if (!player) return;
    const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const D = player.duration || S.duration || 1, X = (t) => (t / D) * w, mid = h / 2 + 4, t = player.time;
    const lo = player.loop;
    if (lo.b > lo.a) { g.fillStyle = lo.enabled ? 'rgba(245,165,36,.16)' : 'rgba(255,255,255,.05)'; g.fillRect(X(lo.a), 0, X(lo.b) - X(lo.a), h); }
    if (S.bpm?.value) { const bar = (60 / S.bpm.value) * 4; if (X(bar) > 14) { g.fillStyle = 'rgba(255,255,255,.07)'; for (let b = (S.bpm.offset || 0) % bar; b < D; b += bar) g.fillRect(X(b), 0, 1, h); } }
    const n = peaks.length, bw = w / n;
    for (let i = 0; i < n; i++) { const x = i * bw, a = Math.max(1.5, peaks[i] * (h * 0.38)); g.fillStyle = x < X(t) ? cssv('--accent') : 'rgba(154,161,178,.55)'; g.fillRect(x, mid - a, Math.max(1, bw - 0.8), a * 2); }
    for (const m of S.markers || []) { g.fillStyle = cssv('--expected'); g.fillRect(X(m.t), 0, 2, h); if (m.end) { g.globalAlpha = 0.12; g.fillRect(X(m.t), 0, X(m.end) - X(m.t), h); g.globalAlpha = 1; } g.beginPath(); g.moveTo(X(m.t), 0); g.lineTo(X(m.t) + 11, 5); g.lineTo(X(m.t), 10); g.fill(); }
    if (lo.b > lo.a) for (const [x, lab] of [[X(lo.a), 'A'], [X(lo.b), 'B']]) { g.fillStyle = lo.enabled ? cssv('--accent') : '#8a90a0'; g.fillRect(x - 2, 0, 4, h); g.fillStyle = '#1b1200'; g.font = '700 10px system-ui'; g.fillText(lab, x - 3.5, 11); }
    g.fillStyle = '#fff'; g.fillRect(X(t) - 1, 0, 2, h);
  }
  const frame = () => { if (disposed) return; draw(); raf = requestAnimationFrame(frame); };
  const timeTxt = () => { $('#time').textContent = `${dur(player.time)} / ${dur(player.duration)}`; };

  let drag = null;
  cv.addEventListener('pointerdown', (e) => {
    if (!player) return; cv.setPointerCapture(e.pointerId);
    const r = cv.getBoundingClientRect(), D = player.duration, x = e.clientX - r.left, X = (t) => (t / D) * r.width, lo = player.loop;
    if (lo.b > lo.a && Math.abs(x - X(lo.a)) < 9) drag = 'a'; else if (lo.b > lo.a && Math.abs(x - X(lo.b)) < 9) drag = 'b'; else { drag = 'seek'; player.seek((x / r.width) * D); }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag || !player) return; const r = cv.getBoundingClientRect(), t = clamp(((e.clientX - r.left) / r.width) * player.duration, 0, player.duration), lo = player.loop;
    if (drag === 'seek') player.seek(t); else if (drag === 'a') player.setLoop(Math.min(t, lo.b - 0.5), lo.b, lo.enabled); else player.setLoop(lo.a, Math.max(t, lo.a + 0.5), lo.enabled);
  });
  cv.addEventListener('pointerup', () => { drag = null; persistLoop(); });
  cv.addEventListener('pointermove', (e) => { if (drag || !player) return; const r = cv.getBoundingClientRect(), x = e.clientX - r.left, lo = player.loop, X = (t) => (t / player.duration) * r.width; cv.style.cursor = lo.b > lo.a && (Math.abs(x - X(lo.a)) < 9 || Math.abs(x - X(lo.b)) < 9) ? 'ew-resize' : 'pointer'; });

  const persistLoop = () => { if (player) lib.update(id, { loop: player.loop.b > player.loop.a ? { ...player.loop } : null }); };
  const loopUi = () => {
    const lo = player.loop, has = lo.b > lo.a;
    $('#loopTgl').setAttribute('aria-pressed', lo.enabled); $('#loopTgl').classList.toggle('on', lo.enabled);
    $('#loopTxt').textContent = has ? `${dur(lo.a)} – ${dur(lo.b)}${lo.enabled ? '' : ' (desligado)'}` : 'Sem loop';
  };

  // ---------- painéis ----------
  function panels() { chordsPanel(); tempoPanel(); mixPanel(); markPanel(); practicePanel(); }

  function chordsPanel() {
    const P = $('#chordsPanel'), list = S.chords || [], t = player?.time || 0, cur = chordAt(list, t), nx = nextChord(list, t);
    const card = (label, c) => { const sym = c?.symbol; const v = sym && voicing(sym); return `<div class="now-chord"><small>${label}</small><b>${sym ? esc(sym) : '—'}</b>${diagramSvg(v) ? `<div class="mini-diagram">${diagramSvg(v)}</div>` : ''}</div>`; };
    const job = jobs.get(id);
    P.innerHTML = `<div class="row between"><h3 class="h3">Acordes ${S.analyzed ? '<span class="badge guide" title="Estimado automaticamente; corrija à vontade">estimado</span>' : ''}</h3>
      ${job ? '' : `<button class="btn sm" id="analyze">${S.analyzed ? 'Reanalisar' : 'Analisar'}</button>`}</div>
      ${job ? `<div class="col"><span class="muted">Analisando… ${Math.round(job.p * 100)}%</span><div class="progress"><i style="width:${job.p * 100}%"></i></div></div>` : ''}
      <div class="now-next">${card('Agora', cur.chord)}${card('Próximo', nx)}</div>
      <div class="chord-strip" id="strip" role="list">${list.length ? spans(list, S.duration).map((s, i) => `<button class="cs ${i === cur.index ? 'now' : ''} ${i === selChord ? 'sel' : ''} ${!s.symbol ? 'none' : ''}" data-i="${i}" role="listitem" title="Ir para ${dur(s.t0)}"><b>${s.symbol ? esc(s.symbol) : '—'}</b><small>${dur(s.t0)}${s.manual ? ' ✎' : ''}</small></button>`).join('') : `<span class="dim">Sem acordes ainda. ${job ? '' : 'Clique em Analisar ou adicione à mão abaixo.'}</span>`}</div>
      <div class="row wrap chord-edit"><input type="text" id="cin" class="mono" placeholder="Am, G7, F#m7…" maxlength="10" aria-label="Símbolo do acorde" style="width:130px">
        <button class="btn sm" data-c="add">+ aqui (${dur(t)})</button><button class="btn sm" data-c="set" ${selChord < 0 ? 'disabled' : ''}>Trocar</button>
        <button class="btn sm" data-c="move" ${selChord < 0 ? 'disabled' : ''}>Mover p/ agora</button><button class="btn sm" data-c="none">Sem acorde aqui</button>
        <button class="btn sm danger" data-c="del" ${selChord < 0 ? 'disabled' : ''}>Remover</button></div>
      <p class="hint dim">${S.analyzed ? 'Acordes por correlação de notas, sem separar instrumentos: confira de ouvido. ✎ = corrigido por você (preservado ao reanalisar).' : 'Um arquivo de áudio não contém tablatura nem as cordas tocadas; o Corda só estima os acordes.'}</p>`;
    paintIcons(P);
    P.querySelector('#analyze')?.addEventListener('click', () => { if ((S.chords || []).some((c) => c.manual) && !confirm('Reanalisar mantém seus acordes corrigidos (✎). Continuar?')) return; startAnalysis(app, id); });
    P.querySelector('#strip')?.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (!b) return; selChord = +b.dataset.i; player?.seek(S.chords[selChord].t); P.querySelector('#cin').value = S.chords[selChord].symbol || ''; chordsPanel(); });
    P.querySelector('.chord-edit').addEventListener('click', (e) => {
      const act = e.target.closest('[data-c]')?.dataset.c; if (!act) return;
      const v = P.querySelector('#cin').value.trim(), t0 = player?.time || 0;
      try {
        let next = S.chords || [];
        if (act === 'add') next = addChord(next, t0, v);
        else if (act === 'none') next = addChord(next, t0, null);
        else if (act === 'set') next = editChord(next, selChord, v);
        else if (act === 'move') next = moveChord(next, selChord, t0);
        else if (act === 'del') { next = removeChord(next, selChord); selChord = -1; }
        lib.update(id, { chords: next, analyzed: S.analyzed }); refresh();
      } catch (err) { app.toast(err.message); }
    });
  }

  function tempoPanel() {
    const P = $('#tempoPanel'), b = S.bpm, k = S.key;
    P.innerHTML = `<h3 class="h3">Andamento e tom ${S.analyzed ? '<span class="badge guide">estimado</span>' : ''}</h3>
      ${b ? `<div class="row wrap"><input type="number" id="bpm" class="num bpm-in" min="30" max="260" step="0.1" value="${b.value}" aria-label="BPM"><span class="dim">BPM</span>
        <span class="badge ${b.source === 'manual' ? 'live' : 'guide'}">${b.source === 'manual' ? 'definido por você' : 'confiança ' + confLabel(b.confidence ?? 0)}</span></div>
        <div class="row wrap"><button class="btn sm" id="half">÷2</button><button class="btn sm" id="dbl">×2</button><button class="btn sm" id="tap">Tap tempo</button>
          <button class="btn sm" id="here" title="Define a primeira batida no ponto atual">Batida aqui</button><button class="btn sm ghost" id="oM">−10 ms</button><button class="btn sm ghost" id="oP">+10 ms</button>
          <span class="dim num">1ª batida: ${(b.offset || 0).toFixed(2)} s</span></div>
        ${b.alternatives?.length ? `<p class="hint dim">Alternativas prováveis: ${b.alternatives.map((a) => `<button class="link" data-alt="${a}">${a}</button>`).join(' · ')} (oitava)</p>` : ''}`
      : `<p class="muted">Sem andamento ainda. Analise a música ou defina o BPM batendo o tempo.</p><div class="row"><button class="btn sm" id="tap">Tap tempo</button></div>`}
      <div class="divider" style="margin:6px 0"></div>
      <div class="row between"><span>Tom: <b>${k ? esc(k.name) : '—'}</b> ${k ? `<span class="dim">(confiança ${confLabel(k.confidence)}; talvez ${esc(k.runnerUp)})</span>` : ''}</span></div>
      <details class="limits"><summary>Limites da análise</summary><ul>${LIMITS.map((l) => `<li>${esc(l)}</li>`).join('')}<li>Andamento estimado de música real erra por oitava (×2/÷2) com frequência: use os botões acima.</li></ul></details>`;
    const setBpm = (v, extra = {}) => { v = clamp(+v || 0, 30, 260); lib.update(id, { bpm: { ...(S.bpm || { offset: 0, alternatives: [] }), value: Math.round(v * 10) / 10, source: 'manual', confidence: 1, ...extra } }); refresh(); };
    P.querySelector('#bpm')?.addEventListener('change', (e) => setBpm(e.target.value));
    P.querySelector('#half')?.addEventListener('click', () => setBpm(S.bpm.value / 2));
    P.querySelector('#dbl')?.addEventListener('click', () => setBpm(S.bpm.value * 2));
    P.querySelector('#oM')?.addEventListener('click', () => setBpm(S.bpm.value, { offset: Math.max(0, (S.bpm.offset || 0) - 0.01) }));
    P.querySelector('#oP')?.addEventListener('click', () => setBpm(S.bpm.value, { offset: (S.bpm.offset || 0) + 0.01 }));
    P.querySelector('#here')?.addEventListener('click', () => { const beat = 60 / S.bpm.value; setBpm(S.bpm.value, { offset: (player.time % beat) }); });
    P.querySelectorAll('[data-alt]').forEach((a) => a.addEventListener('click', () => setBpm(+a.dataset.alt)));
    P.querySelector('#tap')?.addEventListener('click', () => {
      const now = performance.now() / 1000; if (taps.length && now - taps.at(-1) > 2.5) taps = []; taps.push(now);
      const v = tapTempo(taps); if (v) setBpm(v, { offset: S.bpm?.offset ?? (player?.time % (60 / v)) });
    });
  }

  function mixPanel() {
    const P = $('#mixPanel'), m = player?.mixer || {};
    const row = (k, label, hint) => `<div class="mix-row"><div class="grow"><b>${label}</b><small class="dim">${hint}</small></div>
      <button class="btn icon sm ghost ${m[k]?.mute ? '' : 'on'}" data-mute="${k}" aria-pressed="${!m[k]?.mute}" aria-label="${m[k]?.mute ? 'Ativar' : 'Silenciar'} ${label}">${icon('volume')}</button>
      <input type="range" min="0" max="1" step="0.01" value="${m[k]?.vol ?? 1}" data-vol="${k}" aria-label="Volume de ${label}" style="width:120px"></div>`;
    P.innerHTML = `<h3 class="h3">Mixer</h3>${row('music', 'Música', 'gravação original')}${row('metro', 'Metrônomo', S.bpm ? `${S.bpm.value} BPM, alinhado à 1ª batida` : 'defina o BPM')}${row('chords', 'Acompanhamento de acordes', 'sintetizado a partir da linha do tempo')}
      <p class="hint dim">Só aparecem faixas que existem de verdade. A gravação não pode ser separada em voz, bateria ou baixo.</p>`;
    P.querySelectorAll('input[type=range]').forEach((r) => r.style.setProperty('--p', r.value * 100 + '%'));
    paintIcons(P);
  }

  function markPanel() {
    const P = $('#markPanel'), ms = [...(S.markers || [])].sort((a, b) => a.t - b.t);
    P.innerHTML = `<h3 class="h3">Trechos difíceis</h3>${ms.length ? ms.map((m) => `<div class="mark-row" data-id="${m.id}">${icon('flag', 'sm')}<input value="${esc(m.name)}" aria-label="Nome do trecho"><span class="num dim">${dur(m.t)}${m.end ? ' – ' + dur(m.end) : ''}</span>
      <button class="btn sm" data-m="go">Ir</button><button class="btn sm" data-m="loop">Repetir</button><button class="btn sm ghost danger" data-m="del">Remover</button></div>`).join('') : '<p class="hint dim">Marque um trecho (com loop A–B definido, ele guarda o intervalo) para voltar a ele depois.</p>'}`;
    paintIcons(P);
  }
  $('#mixPanel').addEventListener('input', (e) => { const k = e.target.dataset.vol; if (k && player) { player.setTrack(k, { vol: +e.target.value }); e.target.style.setProperty('--p', e.target.value * 100 + '%'); } });
  $('#mixPanel').addEventListener('click', (e) => { const k = e.target.closest('[data-mute]')?.dataset.mute; if (k && player) { player.setTrack(k, { mute: !player.mixer[k].mute }); mixPanel(); } });
  $('#markPanel').addEventListener('change', (e) => { const id2 = e.target.closest('.mark-row')?.dataset.id; if (id2) { lib.update(id, { markers: S.markers.map((m) => (m.id === id2 ? { ...m, name: e.target.value } : m)) }); S = lib.get(id); } });
  $('#markPanel').addEventListener('click', (e) => {
    const row = e.target.closest('.mark-row'), a = e.target.closest('[data-m]')?.dataset.m; if (!row || !a) return;
    const m = S.markers.find((x) => x.id === row.dataset.id);
    if (a === 'go') player.seek(m.t); else if (a === 'del') { lib.update(id, { markers: S.markers.filter((x) => x !== m) }); refresh(); }
    else { player.setLoop(m.t, m.end || m.t + 8, true); player.seek(m.t); persistLoop(); loopUi(); if (!player.playing) player.play(); }
  });

  function practicePanel() {
    const P = $('#practicePanel'), ready = !!app.practice?.ready, has = (S.chords || []).some((c) => c.symbol) && S.bpm;
    const lo = player?.loop, range = lo && lo.b > lo.a ? [lo.a, lo.b] : [0, Math.min(S.duration, 32)];
    P.innerHTML = `<div class="row between wrap"><div><h3 class="h3">Praticar com esta música</h3>
      <p class="hint">Gera um exercício de troca de acordes no andamento da música (${S.bpm ? Math.round(S.bpm.value) + ' BPM' : 'defina o BPM'}) para o trecho ${lo && lo.b > lo.a ? 'do loop A–B' : 'inicial'} (${dur(range[0])} – ${dur(range[1])}).</p></div>
      <button class="btn primary" id="practice" ${ready && has ? '' : 'disabled'}>${icon('target')} Praticar os acordes deste trecho</button></div>
      ${ready ? (has ? '' : '<p class="hint dim">Analise a música ou adicione acordes e o BPM para habilitar.</p>') : '<p class="hint dim">O motor de exercícios ainda não está disponível nesta versão; o botão será habilitado quando estiver.</p>'}
      ${S.analyzed && S.bpm?.source !== 'manual' ? '<p class="hint dim">O exercício usa o andamento <b>estimado</b>; se soar fora do tempo, corrija o BPM acima.</p>' : ''}
      <div id="practiceHost"></div>`;
    paintIcons(P);
    P.querySelector('#practice')?.addEventListener('click', async () => {
      await loadChordLib();
      try {
        const score = chordChangeScore(S, range[0], range[1], { lookup: (s) => voicing(s) });
        player?.pause(); lib.update(id, { lastPlayed: Date.now() });
        P.querySelector('#practiceHost').scrollIntoView({ behavior: 'smooth', block: 'center' });
        app.practice.start(score, { host: P.querySelector('#practiceHost'), repeat: 'loop', onFinish: () => lib.update(id, { lastPlayed: Date.now() }) });
      } catch (err) { app.toast(err.message); }
    });
  }

  // ---------- controles do player ----------
  function bindPlayer() {
    player.addEventListener('state', () => { $('#play').innerHTML = icon(player.playing ? 'pause' : 'play'); $('#play').setAttribute('aria-label', player.playing ? 'Pausar' : 'Tocar'); $('#rate').value = player.rate; $('#rate').style.setProperty('--p', ((player.rate - RATE_MIN) / (RATE_MAX - RATE_MIN)) * 100 + '%'); $$r('#rates button').forEach((b) => b.classList.toggle('on', +b.dataset.r === player.rate)); if (player.playing && Date.now() - lastPlayed > 5000) { lastPlayed = Date.now(); lib.update(id, { lastPlayed }); } });
    player.addEventListener('loop', loopUi);
    let lastChord = -2;
    player.addEventListener('time', () => { timeTxt(); const ci = chordAt(S.chords || [], player.time).index; if (ci !== lastChord) { lastChord = ci; chordsPanel(); $('#strip')?.querySelector('.now')?.scrollIntoView({ block: 'nearest', inline: 'center' }); } });
  }
  const $$r = (s) => [...el.querySelectorAll(s)];
  $('#play').addEventListener('click', () => player?.toggle());
  $('#back5').addEventListener('click', () => player?.skip(-5)); $('#fwd5').addEventListener('click', () => player?.skip(5));
  $('#rate').addEventListener('input', (e) => player?.setRate(+e.target.value));
  $('#rates').addEventListener('click', (e) => { const r = e.target.closest('[data-r]')?.dataset.r; if (r) player?.setRate(+r); });
  const setAB = (which) => { const t = player.time, lo = player.loop, has = lo.b > lo.a; which === 'a' ? player.setLoop(t, has && lo.b > t ? lo.b : Math.min(player.duration, t + 8), true) : player.setLoop(has && lo.a < t ? lo.a : Math.max(0, t - 8), t, true); persistLoop(); practicePanel(); };
  $('#setA').addEventListener('click', () => setAB('a')); $('#setB').addEventListener('click', () => setAB('b'));
  $('#loopTgl').addEventListener('click', () => { player.toggleLoop(); persistLoop(); });
  $('#loopClr').addEventListener('click', () => { player.clearLoop(); persistLoop(); practicePanel(); });
  for (const [btn, w, d] of [['aMinus', 'a', -0.1], ['aPlus', 'a', 0.1], ['bMinus', 'b', -0.1], ['bPlus', 'b', 0.1]]) $('#' + btn).addEventListener('click', () => { if (player.loop.b > player.loop.a) { const n = nudgeLoop(player.loop, w, d, player.duration); player.setLoop(n.a, n.b, n.enabled); persistLoop(); } });
  $('#mark').addEventListener('click', () => {
    const lo = player.loop, has = lo.b > lo.a, n = (S.markers || []).length + 1;
    const m = { id: 'm' + Date.now().toString(36), name: `Trecho ${n}`, t: has ? lo.a : player.time, end: has ? lo.b : null };
    lib.update(id, { markers: [...(S.markers || []), m] }); refresh(); app.toast('Trecho marcado. Renomeie na lista abaixo.');
  });

  // atalhos (só nesta tela; param a propagação para não acionar o modo demo do shell)
  const onKey = (e) => {
    if (e.target.closest?.('input,select,textarea') || e.metaKey || e.ctrlKey || !player) return;
    const k = e.key, stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (k === ' ') { stop(); player.toggle(); } else if (k === 'ArrowLeft') { stop(); player.skip(e.shiftKey ? -1 : -5); } else if (k === 'ArrowRight') { stop(); player.skip(e.shiftKey ? 1 : 5); }
    else if (k === '[') { stop(); setAB('a'); } else if (k === ']') { stop(); setAB('b'); } else if (k === 'l' || k === 'L') { stop(); player.toggleLoop(); persistLoop(); }
    else if (k === 'm' || k === 'M') { stop(); $('#mark').click(); } else if (k === '-') { stop(); player.setRate(player.rate - 0.05); } else if (k === '=' || k === '+') { stop(); player.setRate(player.rate + 0.05); }
  };
  document.addEventListener('keydown', onKey);
  const onJob = (e) => { if (e.detail.id !== id) return; if (!jobs.has(id)) refresh(); else chordsPanel(); };
  bus.addEventListener('job', onJob);
  addEventListener('resize', draw);

  // ---------- inicialização ----------
  head(); panels();
  (async () => {
    const [rec] = await Promise.all([lib.audio(id), loadChordLib()]);
    if (disposed) return;
    if (!rec) { el.querySelector('.player').innerHTML = '<div class="empty">O áudio desta música não está mais no navegador. Remova-a e importe novamente.</div>'; return; }
    peaks = rec.peaks?.length ? rec.peaks : new Array(300).fill(0.2);
    player = new SongPlayer(app, S, rec.blob, { chordLookup: (s) => voicing(s) });
    bindPlayer(); player.dispatchEvent(new Event('state')); loopUi(); timeTxt(); panels(); frame();
    if (!S.analyzed && !jobs.has(id)) startAnalysis(app, id);
  })();

  return () => { disposed = true; cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); bus.removeEventListener('job', onJob); removeEventListener('resize', draw); player?.dispose(); };
}
