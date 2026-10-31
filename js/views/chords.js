// Tela Acordes: biblioteca (seletor + digitações + diagrama), escuta livre (avalia o que você toca) e troca de acordes (drills).
import { $, $$, esc, icon, paintIcons, toast } from '../core/dom.js';
import { STANDARD, STRING_LABELS, detectChord, pcName, noteName } from '../music/theory.js';
import {
  CATEGORIES, QUALITY_LIST, QUALITIES_BY_ID, parseSymbol, symbolOf, voicingsOf, getChord, searchSymbols, findChords,
  expectedPositions, matchVoicing, diffByString,
} from '../music/chords.js';
import { chordDiagram } from '../ui/chord-diagram.js';
import { pickChords, itemLabel, toItem } from '../ui/chord-picker.js';
import { PROGRESSION_PRESETS, PAIR_PRESETS, POSITION_PRESETS, DRILL_KINDS, buildDrill } from '../content/chord-drills.js';

const ESSENTIALS = ['Em', 'Am', 'E', 'A', 'D', 'C', 'G', 'Dm'];
const TAGS = ['iniciante', 'aberto', 'pestana', 'móvel', 'power', 'jazz', 'inversão', 'slash'];
const strNum = (s) => `${6 - s}ª`;
const diffDots = (d) => `<span class="ch-dots" title="Dificuldade ${d} de 3" aria-label="Dificuldade ${d} de 3">${[1, 2, 3].map((i) => `<i class="${i <= d ? 'on' : ''}"></i>`).join('')}</span>`;
const stringLabel = (s) => `${strNum(s)} ${STRING_LABELS[s]}`;

export default {
  id: 'chords', title: 'Acordes', icon: 'chord', order: 30,
  mount(el, app, params = {}) {
    const { store, guitar, stage } = app;
    const S = {
      mode: ['library', 'listen', 'drills'].includes(params.mode) ? params.mode : 'library',
      symbol: parseSymbol(params.symbol) ? symbolOf(...Object.values(parseSymbol(params.symbol))) : (sessionStorage.getItem('corda.chord') || 'Em'),
      vi: +params.v || 0, root: null, cat: null, q: '', diff: null, tag: null, favOnly: false,
      queue: 'essentials', paused: false, drillKind: 'pair', drill: { bpm: 60, beatsPerChord: 4, rounds: 4, mode: 'timed', a: 'G', b: 'C', symbol: 'C', preset: 0, custom: ['G', 'D', 'Em', 'C'].map(toItem) },
    };
    const parsed = parseSymbol(S.symbol) || { root: 4, quality: 'min' };
    S.root = parsed.root;
    let timer = 0, handle = null, cleanups = [], session = { tries: 0, ok: 0, ms: 0, last: 0, diffSum: 0 };

    const favs = () => store.get('favorites.chords', []);
    const isFav = (sym) => favs().includes(sym);
    const stat = (sym) => store.get('chords.' + sym, { ok: 0, tries: 0, streak: 0 });
    const mastered = (sym) => (store.get(`chords.${sym}.streak`, 0)) >= 3;
    const offset = () => store.get('settings.pitchOffset', 0);
    const voicings = () => voicingsOf(S.symbol);
    const filtered = () => voicings().filter((v) => (!S.diff || v.difficulty === S.diff) && (!S.tag || v.tags.includes(S.tag)));
    const current = () => { const l = voicings(); return l[Math.min(S.vi, l.length - 1)] || l[0]; };

    el.innerHTML = `<div class="page chords">
      <div class="tabs" role="tablist" aria-label="Modo">
        <button role="tab" data-mode="library">Biblioteca</button>
        <button role="tab" data-mode="listen">Praticar acorde</button>
        <button role="tab" data-mode="drills">Troca de acordes</button>
      </div><div id="chBody"></div></div>`;
    const body = $('#chBody', el);

    // ---------- palco: posições esperadas ----------
    function showOnStage(v = current(), states = null) {
      if (!stage || !v) return;
      stage.setExpected(expectedPositions(v).map((e) => ({ ...e, state: states?.[e.string] || 'pending' })));
      stage.setAvoid(v.muted);
      app.demoChord = () => v.frets;
    }
    const clearStage = () => { stage?.clearExpected(); stage?.setAvoid([]); app.demoChord = null; };

    // ---------- biblioteca ----------
    function renderLibrary() {
      const roots = Array.from({ length: 12 }, (_, i) => `<button class="ch-root ${S.root === i ? 'on' : ''}" data-root="${i}" aria-pressed="${S.root === i}">${pcName(i)}</button>`).join('');
      const cats = ['Todas', ...CATEGORIES].map((c) => `<button class="chip ${((S.cat || 'Todas') === c) ? 'on' : ''}" data-cat="${c}">${c}</button>`).join('');
      const searching = S.q.trim().length > 0;
      let quals;
      if (searching) {
        const res = searchSymbols(S.q).slice(0, 48);
        quals = res.length ? `<div class="ch-grid">${res.map((s) => symChip(s)).join('')}</div>` : `<div class="empty">Nenhum acorde para “${esc(S.q)}”.<br><small>Tente Am7, Sol, sus4, C/E…</small></div>`;
      } else {
        const list = QUALITY_LIST.filter((q) => !S.cat || q.cat === S.cat);
        quals = CATEGORIES.filter((c) => list.some((q) => q.cat === c)).map((c) => `<div class="ch-group"><h4 class="h3">${c}</h4><div class="ch-grid">${list.filter((q) => q.cat === c).map((q) => symChip(symbolOf(S.root, q.id), q)).join('')}</div></div>`).join('');
      }
      const anyFilter = S.diff || S.tag || S.favOnly;
      let results = '';
      if (anyFilter) {
        const vs = findChords({ symbols: S.favOnly ? favs() : null, root: S.favOnly ? null : S.root, difficulty: S.diff, tag: S.tag, limit: 18 });
        results = `<div class="ch-results"><h4 class="h3">Resultados (${vs.length}${vs.length >= 18 ? '+' : ''})</h4>${vs.length ? `<div class="ch-cards">${vs.map((v) => `<button class="ch-card" data-pick="${esc(v.symbol)}" data-vid="${esc(v.id)}">${chordDiagram(v, { size: 'sm', showTitle: true })}</button>`).join('')}</div>` : '<div class="dim">Nada com esses filtros.</div>'}</div>`;
      }
      body.innerHTML = `<div class="ch-split">
        <aside class="ch-left">
          <label class="search">${icon('search')}<input id="chQ" type="search" placeholder="Buscar: Am7, Sol, sus4, C/E…" value="${esc(S.q)}" autocomplete="off" aria-label="Buscar acorde"></label>
          <div class="ch-rail" role="group" aria-label="Nota raiz">${roots}</div>
          <div class="ch-cats" role="group" aria-label="Categoria">${cats}</div>
          <div class="ch-quals">${quals}</div>
          <div class="ch-filters">
            <div class="seg" role="group" aria-label="Dificuldade"><button class="${!S.diff ? 'on' : ''}" data-diff="0">Todas</button>${[1, 2, 3].map((d) => `<button class="${S.diff === d ? 'on' : ''}" data-diff="${d}">${['Fácil', 'Médio', 'Difícil'][d - 1]}</button>`).join('')}</div>
            <div class="row wrap" style="gap:6px">${TAGS.map((t) => `<button class="chip ${S.tag === t ? 'on' : ''}" data-tag="${t}">${t}</button>`).join('')}<button class="chip ${S.favOnly ? 'on' : ''}" data-favonly>♥ favoritos</button></div>
          </div>${results}
        </aside>
        <section class="ch-detail panel" id="chDetail"></section></div>`;
      renderDetail();
    }

    function symChip(sym, q) {
      const p = parseSymbol(sym), on = sym === S.symbol;
      return `<button class="ch-q ${on ? 'on' : ''} ${mastered(sym) ? 'done' : ''}" data-sym="${esc(sym)}" title="${esc(QUALITIES_BY_ID[p.quality].name)}">${esc((q ? '' : '') + pcName(p.root) + QUALITIES_BY_ID[p.quality].sym + (p.bass != null ? '/' + pcName(p.bass) : ''))}</button>`;
    }

    function renderDetail() {
      const host = $('#chDetail', el); if (!host) return;
      const c = getChord(S.symbol);
      if (!c) { host.innerHTML = '<div class="empty">Escolha um acorde.</div>'; return; }
      const all = voicings(), list = filtered();
      const v = current();
      if (!v) { host.innerHTML = `<div class="empty"><b>${esc(c.name)}</b><span>Sem digitação prática gerada para este acorde.</span></div>`; clearStage(); return; }
      const cards = (list.length ? list : all).map((x) => {
        const i = all.indexOf(x), lab = x.tags.includes('curado') ? 'Clássica' : x.tags.includes('aberto') ? 'Aberta' : `${x.baseFret}ª casa`;
        return `<button class="ch-card ${x === v ? 'on' : ''}" data-vi="${i}" aria-pressed="${x === v}" aria-label="Digitação ${i + 1}: ${lab}">${chordDiagram(x, { size: 'sm' })}<span>${lab}${x.shape && !x.tags.includes('aberto') ? ' · forma ' + x.shape : ''}</span>${diffDots(x.difficulty)}</button>`;
      }).join('');
      const fretsTxt = v.frets.map((f, s) => (f > 0 ? `${strNum(s)}: casa ${f}${v.fingers[s] ? ` (dedo ${v.fingers[s]})` : ''}` : null)).filter(Boolean);
      const hint = !list.length ? `<p class="dim">Nenhuma digitação atende aos filtros — mostrando todas.</p>` : '';
      host.innerHTML = `
        <header class="ch-head"><div><div class="ch-name">${esc(v.name)} ${mastered(S.symbol) ? '<span class="ch-star" title="Dominado">★</span>' : ''}</div>
          <div class="muted">${esc(c.qualityName)} · fórmula <span class="mono">${c.formula.join(' ')}</span> · notas <b>${v.noteNames.join(' · ')}</b></div></div>
          <div class="row"><button class="btn" data-act="hear">${icon('volume')} Ouvir</button>
            <button class="btn ${isFav(S.symbol) ? 'on' : ''}" data-act="fav" aria-pressed="${isFav(S.symbol)}">${icon('heart')} ${isFav(S.symbol) ? 'Favorito' : 'Favoritar'}</button>
            <button class="btn primary" data-act="practice">Praticar</button></div></header>
        <div class="ch-main"><div class="ch-big">${chordDiagram(v, { size: 'lg', showNotes: true })}</div>
          <dl class="ch-info">
            <div><dt>Cordas tocadas</dt><dd>${v.used.map(strNum).join(' · ') || '—'}</dd></div>
            <div><dt>Cordas abafadas</dt><dd>${v.muted.length ? v.muted.map(strNum).join(' · ') + ' (não palhetar)' : 'nenhuma'}</dd></div>
            <div><dt>Casas</dt><dd>${fretsTxt.length ? fretsTxt.join('<br>') : 'só cordas soltas'}${v.barre ? `<br>pestana na casa ${v.barre.fret} (${strNum(v.barre.to)}–${strNum(v.barre.from)})` : ''}</dd></div>
            <div><dt>Notas por corda</dt><dd class="mono">${v.frets.map((f, s) => (f < 0 ? '×' : pcName((STANDARD[s] + f) % 12))).join(' ')}</dd></div>
            <div><dt>Dificuldade</dt><dd>${diffDots(v.difficulty)} ${['fácil', 'média', 'difícil'][v.difficulty - 1]}</dd></div>
            <div><dt>Características</dt><dd class="row wrap" style="gap:6px">${v.tags.filter((t) => t !== 'curado').map((t) => `<span class="chip">${t}</span>`).join('') || '—'}</dd></div>
          </dl></div>
        <div class="ch-voicings"><h4 class="h3">Digitações de ${esc(v.name)} (${all.length})</h4>${hint}<div class="ch-cards">${cards}</div></div>`;
      paintIcons(host);
      showOnStage(v);
    }

    // ---------- escuta livre ----------
    const queueList = () => (S.queue === 'favorites' && favs().length ? favs() : S.queue === 'voicings' ? null : ESSENTIALS);
    function renderListen() {
      const v = current(), c = getChord(S.symbol), st = stat(S.symbol);
      body.innerHTML = `<div class="ch-listen panel">
        <div class="ch-lhead"><div><div class="ch-name">${esc(v.name)}</div><div class="muted">${esc(c.qualityName)} · ${v.noteNames.join(' · ')} ${mastered(S.symbol) ? '<span class="ch-star">★ dominado</span>' : ''}</div></div>
          <div class="row"><button class="btn" data-act="hear">${icon('volume')} Ouvir</button>
            <button class="btn ${S.paused ? 'primary' : ''}" data-act="pause" aria-pressed="${S.paused}">${icon(S.paused ? 'play' : 'pause')} ${S.paused ? 'Continuar' : 'Pausar'}</button>
            <button class="btn" data-act="skip">Próximo ${icon('chev')}</button></div></div>
        <div class="ch-lbody"><div class="ch-big">${chordDiagram(v, { size: 'lg', showNotes: true })}</div>
          <div class="col grow">
            <div class="ch-fb" id="chFb" aria-live="polite"></div>
            <div class="ch-strs" id="chStrs" aria-label="Resultado por corda"></div>
            <div><div class="progress" title="Acertos seguidos"><i style="width:${Math.min(100, st.streak / 3 * 100)}%"></i></div>
              <small class="dim">${mastered(S.symbol) ? 'Dominado — continue para manter a prática' : `Acerte ${3 - st.streak} ${3 - st.streak === 1 ? 'vez' : 'vezes'} seguidas para dominar`}</small></div>
            <div class="row wrap" style="gap:8px"><span class="dim">Sequência:</span>
              <div class="seg" role="group">${[['essentials', 'Essenciais'], ['favorites', 'Favoritos'], ['voicings', 'Digitações deste acorde']].map(([k, n]) => `<button class="${S.queue === k ? 'on' : ''}" data-queue="${k}">${n}</button>`).join('')}</div></div>
          </div></div></div>`;
      idleMsg(); renderStrings(null);
      showOnStage(v);
    }
    function idleMsg() {
      const fb = $('#chFb', el); if (!fb) return;
      fb.className = 'ch-fb' + (S.paused ? ' paused' : '');
      fb.innerHTML = S.paused ? `<span>${icon('pause')} Pausado — nada é avaliado</span>`
        : guitar.status === 'idle' ? '<span>Conecte a guitarra, ou aperte <b>Espaço</b> para testar no modo demo</span>'
        : `<span class="ch-listening"></span><span>${guitar.status === 'demo' ? 'Demo: aperte Espaço para palhetar' : 'Ouvindo… toque o acorde'}</span>`;
    }
    function renderStrings(diff) {
      const host = $('#chStrs', el); if (!host) return;
      const v = current();
      host.innerHTML = STRING_LABELS.map((l, s) => {
        const d = diff?.[s], want = v.frets[s] >= 0;
        const state = d ? d.state : want ? 'pending' : 'avoid-ok';
        const label = d && d.got != null ? noteName(d.got + offset()) : want ? pcName((STANDARD[s] + v.frets[s]) % 12) : '×';
        return `<div class="ch-s ${state}" title="${stringLabel(s)}: ${{ ok: 'certa', wrong: 'nota diferente', octave: 'oitava diferente', missing: 'faltou tocar', 'avoid-hit': 'devia ficar abafada', 'avoid-ok': 'abafada', pending: 'esperada' }[state]}"><small>${strNum(s)}</small><b>${label}</b></div>`;
      }).join('');
    }

    // avaliação (suspensa de verdade quando pausado)
    let played = new Map();
    const onStart = () => { played = new Map(); };
    const onNote = (e) => { if (!S.paused) played.set(e.detail.string, e.detail.note - offset()); };
    const onStrum = (e) => {
      if (S.mode !== 'listen' || S.paused || e.detail.count < 2) return;
      const v = current(), s = e.detail, fb = $('#chFb', el);
      if (!fb) return;
      const notes = [...played.values()];
      const r = matchVoicing(notes, v, store.get('settings.rigor', 'normal'));
      const diff = diffByString(v, played);
      const st = { ...stat(S.symbol) }; st.tries++; session.tries++;
      const states = {};
      diff.forEach((d) => { if (d.want != null) states[d.string] = d.state === 'ok' ? 'hit' : 'miss'; });
      showOnStage(v, states);
      diff.forEach((d) => {
        const fret = d.got != null ? d.got - STANDARD[d.string] : null;
        if (d.state === 'ok') stage?.flash(d.string, v.frets[d.string], 'ok');
        else if ((d.state === 'wrong' || d.state === 'avoid-hit') && fret != null && fret >= 0 && fret <= 15) stage?.flash(d.string, fret, 'bad');
      });
      renderStrings(diff);
      clearTimeout(timer);
      if (r.ok) {
        st.ok++; st.streak++; session.ok++; store.set('chords.' + S.symbol, st);
        fb.className = 'ch-fb ok'; fb.innerHTML = `<span>✓ Isso! ${esc(v.name)}${st.streak >= 3 ? ' — dominado ★' : ''}</span>`;
        $('.progress i', el).style.width = Math.min(100, st.streak / 3 * 100) + '%';
        if (store.get('settings.auto', true)) timer = setTimeout(() => !S.paused && next(), 1700);
      } else {
        st.streak = 0; store.set('chords.' + S.symbol, st);
        const why = r.missing.length ? `faltou ${r.missing.join(', ')}` : `sobrou ${r.extra.join(', ')}`;
        fb.className = 'ch-fb bad'; fb.innerHTML = `<span>${s.chord ? `Ouvi <b>${esc(s.chord.name)}</b>` : 'Não reconheci o acorde'} — ${why}. Tente de novo.</span>`;
        $('.progress i', el).style.width = '0';
        timer = setTimeout(() => { idleMsg(); renderStrings(null); showOnStage(v); }, 3200);
      }
    };
    function tick() { const now = performance.now(); if (session.last && !S.paused && S.mode === 'listen') session.ms += now - session.last; session.last = now; }
    function flushSession() {
      tick();
      if (session.tries > 0 && app.learn?.record) app.learn.record({ kind: 'chords', refId: 'listen', title: 'Escuta livre de acordes', technique: 'chords', level: 1, bpm: 0, speed: 1,
        durationSec: Math.round(session.ms / 1000), accuracy: Math.round(session.ok / session.tries * 100), timingMeanMs: 0, hits: { perfect: session.ok, good: 0, ok: 0, miss: session.tries - session.ok, extra: 0 },
        stringsOk: 0, stringsTotal: 0, chordsOk: session.ok, chordsTotal: session.tries });
      session = { tries: 0, ok: 0, ms: 0, last: performance.now() };
    }
    function next() {
      clearTimeout(timer);
      const q = queueList();
      if (q === null) { const n = voicings().length; S.vi = (S.vi + 1) % Math.max(1, n); }
      else { const i = q.indexOf(S.symbol); S.symbol = q[(i + 1) % q.length]; S.vi = 0; }
      select(S.symbol, S.vi, true);
    }

    // ---------- troca de acordes ----------
    function currentDrill() {
      const d = S.drill, o = { bpm: d.bpm, beatsPerChord: d.beatsPerChord, rounds: d.rounds, mode: d.mode };
      try {
        if (S.drillKind === 'pair') return buildDrill('pair', { a: d.a, b: d.b, ...o });
        if (S.drillKind === 'progression') { const p = PROGRESSION_PRESETS[d.preset % PROGRESSION_PRESETS.length]; return buildDrill('progression', { symbols: p.symbols, title: `Progressão ${p.name}`, ...o, rounds: Math.max(1, Math.round(d.rounds / 2)) }); }
        if (S.drillKind === 'custom') return buildDrill('progression', { symbols: d.custom, title: `Minha sequência: ${d.custom.map(itemLabel).join(' – ')}`, ...o, rounds: Math.max(1, Math.round(d.rounds / 2)) });
        if (S.drillKind === 'positions') return buildDrill('positions', { symbol: d.symbol, ...o, rounds: Math.max(1, Math.round(d.rounds / 2)) });
        return buildDrill('voicings', { symbol: d.symbol, ...o });
      } catch (e) { return { error: e.message }; }
    }
    function renderDrills() {
      const d = S.drill, dr = currentDrill(), ready = !!app.practice?.ready;
      const kind = DRILL_KINDS.find((k) => k.id === S.drillKind);
      const picker = S.drillKind === 'pair' ? `<div class="row wrap">${PAIR_PRESETS.map(([a, b]) => `<button class="chip ${d.a === a && d.b === b ? 'on' : ''}" data-pair="${a}|${b}">${a} ↔ ${b}</button>`).join('')}</div>
          <div class="row"><label class="field grow"><span>Acorde A</span><input id="dA" type="text" value="${esc(d.a)}"></label><label class="field grow"><span>Acorde B</span><input id="dB" type="text" value="${esc(d.b)}"></label></div>`
        : S.drillKind === 'custom' ? `<div class="ch-mine"><div class="row wrap" style="gap:6px">${d.custom.map((c, i) => `<span class="chip ch-minechip"><small class="dim">${i + 1}</small> ${esc(itemLabel(c))}</span>`).join('<span class="dim">→</span>')}</div>
            <button class="btn primary" data-act="pickseq">${icon('plus') || ''} Escolher / editar acordes…</button><small class="dim">Qualquer acorde da biblioteca, com quantos você quiser.</small></div>`
        : S.drillKind === 'progression' ? `<div class="ch-cards" style="grid-template-columns:1fr">${PROGRESSION_PRESETS.map((p, i) => `<button class="ch-prog ${d.preset === i ? 'on' : ''}" data-preset="${i}"><b>${p.name}</b><small>${p.desc}</small></button>`).join('')}<button class="ch-prog" data-act="pickseq"><b>＋ Montar a minha</b><small>Escolha os acordes numa lista visual</small></button></div>`
        : `<div class="row wrap">${POSITION_PRESETS.map((s) => `<button class="chip ${d.symbol === s ? 'on' : ''}" data-dsym="${s}">${s}</button>`).join('')}</div>
          <label class="field"><span>Outro acorde</span><input id="dS" type="text" value="${esc(d.symbol)}"></label>`;
      const seq = dr.error ? `<div class="empty">${esc(dr.error)}</div>` : `<div class="ch-seq">${dr.sequence.map((v, i) => `<div class="ch-step"><small>${i + 1}</small>${chordDiagram(v, { size: dr.sequence.length <= 4 ? 'md' : 'sm', showTitle: true })}</div>`).join('<span class="ch-arrow">→</span>')}<span class="ch-arrow">↻</span></div>`;
      body.innerHTML = `<div class="ch-split"><aside class="ch-left">
          <div class="ch-kinds" role="group" aria-label="Tipo de exercício">${DRILL_KINDS.map((k) => `<button class="${S.drillKind === k.id ? 'on' : ''}" data-kind="${k.id}" aria-pressed="${S.drillKind === k.id}"><b>${k.name}</b><small>${k.hint}</small></button>`).join('')}</div>
          ${picker}</aside>
        <section class="ch-detail panel"><header class="ch-head"><div><div class="ch-name" style="font-size:26px">${esc(dr.score?.title || 'Exercício')}</div>
            <div class="muted">${dr.score ? `${dr.score.lengthBeats} batidas · nível ${dr.score.level} · ${d.mode === 'wait' ? 'acerte em qualquer momento do trecho' : 'no tempo'}` : ''}</div></div></header>
          ${seq}
          <div class="ch-cfg">
            <label class="field"><span class="row between">Andamento <output class="num">${d.bpm} BPM</output></span><input type="range" id="dBpm" min="40" max="140" step="5" value="${d.bpm}"></label>
            <div class="field"><span>Batidas por acorde</span><div class="seg">${[2, 4, 8].map((n) => `<button class="${d.beatsPerChord === n ? 'on' : ''}" data-bpc="${n}">${n}</button>`).join('')}</div></div>
            <div class="field"><span>Repetições</span><div class="seg">${[2, 4, 8].map((n) => `<button class="${d.rounds === n ? 'on' : ''}" data-rounds="${n}">${n}×</button>`).join('')}</div></div>
            <div class="field"><span>Modo</span><div class="seg"><button class="${d.mode === 'timed' ? 'on' : ''}" data-dmode="timed">No tempo</button><button class="${d.mode === 'wait' ? 'on' : ''}" data-dmode="wait">Sem exigir a batida</button></div></div>
          </div>
          <div id="drillHost" class="ch-drillhost"></div>
          <div class="row"><button class="btn primary lg" data-act="startdrill" ${ready && !dr.error ? '' : 'disabled'}>${icon('play')} Iniciar exercício</button>
            ${ready ? '' : '<span class="dim">O motor de exercícios (frente Prática) ainda não foi instalado: esta é a pré-visualização da sequência. O botão será liberado automaticamente.</span>'}</div>
        </section></div>`;
      paintIcons(body);
      clearStage();
    }
    async function pickSeq() {
      const seq = await pickChords({ title: 'Monte sua sequência de acordes', initial: S.drill.custom, min: 2, max: 16, presets: PROGRESSION_PRESETS.map((p) => ({ name: p.name, symbols: p.symbols })) });
      if (!seq) return;
      S.drill.custom = seq; S.drillKind = 'custom'; renderDrills();
    }
    function startDrill() {
      const dr = currentDrill(); if (dr.error || !app.practice?.ready) return;
      handle?.destroy?.();
      const host = $('#drillHost', el);
      const startRow = $('[data-act=startdrill]', el)?.closest('.row'); if (startRow) startRow.hidden = true;   // Iniciar/Pausar ficam juntos, na barra do exercício
      handle = app.practice.start(dr.score, { host, bpm: S.drill.bpm, repeat: 'loop', onFinish: () => { toast('Exercício concluído'); if (startRow) startRow.hidden = false; } });
      host.scrollIntoView?.({ block: 'nearest' });
    }

    // ---------- navegação / ações ----------
    function select(sym, vi = 0, keepMode = false) {
      S.symbol = sym; S.vi = vi; const p = parseSymbol(sym); if (p) S.root = p.root;
      sessionStorage.setItem('corda.chord', sym);
      if (!keepMode) { /* permanece no modo atual */ }
      render();
    }
    function render() {
      clearTimeout(timer);
      $$('.tabs button', el).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === S.mode)));
      if (S.mode === 'library') renderLibrary(); else if (S.mode === 'listen') renderListen(); else renderDrills();
    }
    el.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      const d = t.dataset;
      if (d.mode) { flushSession(); if (S.mode === 'drills') { handle?.destroy?.(); handle = null; } S.mode = d.mode; render(); }
      else if (d.root != null) { S.root = +d.root; select(symbolOf(S.root, parseSymbol(S.symbol)?.quality || 'maj')); }
      else if (d.cat != null) { S.cat = d.cat === 'Todas' ? null : d.cat; render(); }
      else if (d.sym) { S.q = ''; select(d.sym); }
      else if (d.pick) { select(d.pick, Math.max(0, voicingsOf(d.pick).findIndex((x) => x.id === d.vid))); }
      else if (d.vi != null) { S.vi = +d.vi; renderDetail(); }
      else if (d.diff != null) { S.diff = +d.diff || null; S.vi = 0; renderLibrary(); }
      else if (d.tag) { S.tag = S.tag === d.tag ? null : d.tag; S.vi = 0; renderLibrary(); }
      else if ('favonly' in d) { S.favOnly = !S.favOnly; renderLibrary(); }
      else if (d.queue) { S.queue = d.queue; renderListen(); }
      else if (d.kind) { S.drillKind = d.kind; renderDrills(); }
      else if (d.pair) { [S.drill.a, S.drill.b] = d.pair.split('|'); renderDrills(); }
      else if (d.preset != null) { S.drill.preset = +d.preset; renderDrills(); }
      else if (d.dsym) { S.drill.symbol = d.dsym; renderDrills(); }
      else if (d.bpc) { S.drill.beatsPerChord = +d.bpc; renderDrills(); }
      else if (d.rounds) { S.drill.rounds = +d.rounds; renderDrills(); }
      else if (d.dmode) { S.drill.mode = d.dmode; renderDrills(); }
      else if (d.act === 'hear') { const v = current(); app.audio.strum(v.notes.map((n) => n + 0)); }
      else if (d.act === 'fav') { const f = favs(); store.set('favorites.chords', f.includes(S.symbol) ? f.filter((x) => x !== S.symbol) : [...f, S.symbol]); renderDetail(); }
      else if (d.act === 'practice') { S.mode = 'listen'; render(); }
      else if (d.act === 'skip') next();
      else if (d.act === 'pause') { tick(); S.paused = !S.paused; session.last = performance.now(); if (S.paused) clearTimeout(timer); renderListen(); }
      else if (d.act === 'startdrill') startDrill();
      else if (d.act === 'pickseq') pickSeq();
    });
    el.addEventListener('input', (e) => {
      if (e.target.id === 'chQ') { S.q = e.target.value; const pos = e.target.selectionStart; renderLibrary(); const i = $('#chQ', el); i.focus(); i.setSelectionRange(pos, pos); }
      else if (e.target.id === 'dBpm') { S.drill.bpm = +e.target.value; e.target.closest('.field').querySelector('output').textContent = S.drill.bpm + ' BPM'; e.target.style.setProperty('--p', ((S.drill.bpm - 40) / 100) * 100 + '%'); }
    });
    el.addEventListener('change', (e) => {
      const set = (k, id) => { const p = parseSymbol(e.target.value); if (p) { S.drill[k] = symbolOf(p.root, p.quality, p.bass); renderDrills(); } else toast('Acorde não reconhecido: ' + e.target.value); };
      if (e.target.id === 'dA') set('a'); else if (e.target.id === 'dB') set('b'); else if (e.target.id === 'dS') set('symbol');
    });

    for (const [n, f] of [['strumstart', onStart], ['noteon', onNote], ['strum', onStrum]]) guitar.addEventListener(n, f);
    session.last = performance.now();
    render();
    return () => {
      flushSession(); clearTimeout(timer); handle?.destroy?.();
      for (const [n, f] of [['strumstart', onStart], ['noteon', onNote], ['strum', onStrum]]) guitar.removeEventListener(n, f);
      clearStage();
    };
  },
};
