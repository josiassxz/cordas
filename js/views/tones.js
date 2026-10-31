// Tones: timbres, efeitos, presets, afinador e transposição. Todo controle aqui altera a cadeia real de áudio.
import { esc, icon, paintIcons, toast } from '../core/dom.js';
import { BUILTIN_BY_ID, validatePreset, getPreset, allPresets, saveCustom, updateCustom, renamePreset, deletePreset, duplicatePreset, toggleFavorite, isFavorite } from '../audio/presets.js';
import { TUNINGS, MicTuner, analyzePitch, hzOf, inTune, noteLabel } from '../audio/tuner.js';
import { parseProgression, suggestCapo, capoShape, transposeChord, detectKey, diatonic, chordMidi } from '../audio/transpose.js';

const TABS = [['timbres', 'Timbres'], ['efeitos', 'Efeitos'], ['presets', 'Presets'], ['afinador', 'Afinador'], ['transpor', 'Transpor']];
const clone = (o) => JSON.parse(JSON.stringify(o));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const TEST_CHORD = [40, 47, 52, 55, 59, 64];   // Em aberto

// ---------- ilustrações próprias dos instrumentos (SVG simples) ----------
const neck = '<rect x="36" y="6" width="8" height="84" rx="2" fill="#5a4636"/><rect x="34" y="0" width="12" height="12" rx="3" fill="#6b5442"/><path d="M40 6v84" stroke="#2b2118" stroke-width="1"/>';
const IMG = {
  steel: (c) => `<svg viewBox="0 0 80 200">${neck}<path d="M40 88c-22 0-30 14-26 28-8 8-8 28 8 38 8 6 28 6 36 0 16-10 16-30 8-38 4-14-4-28-26-28z" fill="${c}"/><circle cx="40" cy="122" r="9" fill="#14100c"/><rect x="28" y="152" width="24" height="4" rx="2" fill="#14100c"/></svg>`,
  nylon: (c) => `<svg viewBox="0 0 80 200">${neck}<path d="M40 90c-20 0-28 12-24 26-7 8-9 26 6 36 8 5 30 5 38 0 15-10 13-28 6-36 4-14-6-26-26-26z" fill="${c}"/><circle cx="40" cy="122" r="8" fill="#14100c"/><rect x="30" y="150" width="20" height="3" rx="1.5" fill="#d8c9a8"/></svg>`,
  tele: (c) => `<svg viewBox="0 0 80 200">${neck}<path d="M30 92h20c10 2 18 10 16 22-2 8 6 14 4 28-2 12-14 18-30 18s-28-6-30-18c-2-14 6-20 4-28-2-12 6-20 16-22z" fill="${c}"/><rect x="31" y="110" width="18" height="5" rx="2" fill="#cfd3da"/><rect x="31" y="132" width="18" height="5" rx="2" fill="#cfd3da"/><rect x="30" y="152" width="20" height="4" rx="2" fill="#bfc4cc"/></svg>`,
  strat: (c) => `<svg viewBox="0 0 80 200">${neck}<path d="M26 90c-8 4-10 14-6 22-8 8-10 22-2 32 6 8 18 12 22 10 4 2 16-2 22-10 8-10 6-24-2-32 4-8 2-18-6-22-6-4-22-4-28 0z" fill="${c}"/><rect x="31" y="108" width="18" height="5" rx="2" fill="#e9e6df"/><rect x="31" y="122" width="18" height="5" rx="2" fill="#e9e6df"/><rect x="31" y="136" width="18" height="5" rx="2" fill="#e9e6df"/></svg>`,
  hollow: (c) => `<svg viewBox="0 0 80 200">${neck}<path d="M40 86c-18 0-26 10-22 22-8 6-10 22 2 32 6 8 12 14 20 14s14-6 20-14c12-10 10-26 2-32 4-12-4-22-22-22z" fill="${c}"/><path d="M28 116c4-4 8-4 8 2v18c0 6-6 6-8 0zM52 116c-4-4-8-4-8 2v18c0 6 6 6 8 0z" fill="#14100c"/><rect x="32" y="118" width="16" height="4" fill="#cfd3da"/><rect x="32" y="136" width="16" height="4" fill="#cfd3da"/></svg>`,
  metal: (c) => `<svg viewBox="0 0 80 200">${neck}<path d="M40 92l-16 6-8 20 10 6-14 28 14 18 14-8 0 8h0l0-8 14 8 14-18-14-28 10-6-8-20z" fill="${c}"/><rect x="31" y="116" width="18" height="5" rx="2" fill="#8d939e"/><rect x="31" y="134" width="18" height="5" rx="2" fill="#8d939e"/></svg>`,
};
const CAROUSEL = [
  { id: 'b:steel', label: 'Violão de aço', img: IMG.steel('#b9783c') }, { id: 'b:nylon', label: 'Violão nylon', img: IMG.nylon('#cf8f49') },
  { id: 'b:clean', label: 'Guitarra limpa', img: IMG.tele('#7fb8a8') }, { id: 'b:overdrive', label: 'Overdrive', img: IMG.strat('#c0562f') },
  { id: 'b:jazz', label: 'Jazz', img: IMG.hollow('#8a3a22') }, { id: 'b:metal', label: 'Distorção / Metal', img: IMG.metal('#3b3f4a') },
];
const STYLES = ['b:blues', 'b:rock', 'b:metal', 'b:jazz'];

export default {
  id: 'tones', title: 'Tones', icon: 'sliders', order: 60,
  mount(el, app, params = {}) {
    const { store, audio, guitar } = app;
    if (!audio.store) audio.bindStore(store);
    let tab = TABS.some(([id]) => id === params.tab) ? params.tab : sessionStorage.getItem('corda.tonesTab') || 'timbres', filter = 'all', query = '', renaming = null, confirmDel = null, savingAs = false;
    let work = clone(audio.preset), tuner = null, tuning = TUNINGS[0], reading = null, tunerState = 'idle', raf = 0, peak = 0;
    const baseOf = () => getPreset(store, work.id);
    const dirty = () => { const b = baseOf(); return !b || !same(validatePreset(b).preset, validatePreset(work).preset); };
    const apply = (p) => { work = clone(validatePreset(p).preset); audio.setPreset(work); };
    const abIds = () => store.get('tones.ab', { a: null, b: null });

    el.innerHTML = `<div class="page tn">
      <div class="tn-bar panel" id="tnBar"></div>
      <div class="tabs" role="tablist" id="tnTabs">${TABS.map(([id, t]) => `<button role="tab" data-tab="${id}" aria-selected="${id === tab}">${t}</button>`).join('')}</div>
      <div id="tnBody"></div></div>`;
    const $ = (s) => el.querySelector(s), body = $('#tnBody');

    // ---------- barra superior: timbre atual, A/B, volume, nível, testes ----------
    function bar() {
      const ab = abIds(), a = ab.a && getPreset(store, ab.a), b = ab.b && getPreset(store, ab.b), live = guitar.status === 'connected', synth = store.get('settings.synth');
      $('#tnBar').innerHTML = `
        <div class="tn-now"><span class="h3">Timbre atual</span><b class="h2">${esc(work.name)}</b>${dirty() ? '<span class="badge">modificado</span>' : ''}</div>
        <div class="tn-ab" role="group" aria-label="Comparar A/B">
          <button class="btn sm ${audio.ab.active === 'a' && a ? 'on' : ''}" data-ab="a" ${a ? '' : 'disabled'} title="${a ? esc(a.name) : 'Defina o preset A na aba Presets'}">A${a ? ' · ' + esc(a.name) : ''}</button>
          <button class="btn sm ${audio.ab.active === 'b' && b ? 'on' : ''}" data-ab="b" ${b ? '' : 'disabled'} title="${b ? esc(b.name) : 'Defina o preset B na aba Presets'}">B${b ? ' · ' + esc(b.name) : ''}</button>
        </div>
        <div class="tn-meter" aria-label="Nível de saída"><i id="tnLvl"></i></div>
        <label class="tn-vol" title="Volume geral"><i data-icon="volume"></i><input type="range" id="tnVol" min="0" max="1" step="0.01" value="${store.get('settings.volume', 0.8)}"></label>
        <button class="btn" data-test="chord">${icon('play')} Acorde</button>
        <button class="btn" data-test="arp">Notas</button>
        <label class="tn-live ${live ? '' : 'idle'}" title="${live ? '' : 'Conecte a guitarra (ou use o modo demo) para ouvir ao vivo'}"><input type="checkbox" id="tnSynth" ${synth ? 'checked' : ''}><span>Ouvir ao vivo${live ? '' : ' <small class="dim">(sem guitarra)</small>'}</span></label>`;
      $('#tnVol').style.setProperty('--p', $('#tnVol').value * 100 + '%'); paintIcons($('#tnBar'));
    }
    const playChord = () => { const t = audio.context.currentTime + 0.02; audio.strum(TEST_CHORD, t, 'D', 0.34); };
    const playArp = () => { const t = audio.context.currentTime + 0.02; TEST_CHORD.forEach((n, i) => audio.pluck(n, t + i * 0.2, 0.4)); };
    const meterLoop = () => {
      const lv = audio.level(); peak = Math.max(lv, peak - 0.012);
      const lvl = $('#tnLvl'); if (lvl) { lvl.style.width = Math.min(100, lv * 140) + '%'; lvl.className = lv > 0.9 ? 'hot' : ''; lvl.style.setProperty('--pk', Math.min(100, peak * 140) + '%'); }
      raf = requestAnimationFrame(meterLoop);
    };

    // ---------- helpers de controle ----------
    const getp = (o, path) => path.split('.').reduce((a, k) => a?.[k], o);
    const setp = (o, path, v) => { const ks = path.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
    const fmt = { x: (v) => v.toFixed(2), pct: (v) => Math.round(v * 100) + '%', db: (v) => (v > 0 ? '+' : '') + v.toFixed(0) + ' dB', ms: (v) => Math.round(v) + ' ms', hz: (v) => v.toFixed(1) + ' Hz', s: (v) => v.toFixed(1) + ' s' };
    const slider = (label, path, min, max, step, f = fmt.pct, off = false) => { const v = getp(work, path); return `<label class="tn-ctl ${off ? 'off' : ''}"><span>${label}<output>${f(v)}</output></span><input type="range" data-p="${path}" data-f="${Object.keys(fmt).find((k) => fmt[k] === f)}" min="${min}" max="${max}" step="${step}" value="${v}" style="--p:${((v - min) / (max - min)) * 100}%" ${off ? 'disabled' : ''}></label>`; };
    const toggle = (label, path) => `<label class="tn-tog"><input type="checkbox" data-p="${path}" ${getp(work, path) ? 'checked' : ''}><span>${label}</span></label>`;
    const seg = (path, opts) => `<div class="seg" role="group">${opts.map(([v, t]) => `<button data-sp="${path}" data-v="${v}" aria-pressed="${getp(work, path) === v}">${t}</button>`).join('')}</div>`;
    const sec = (title, on, inner) => `<section class="panel tn-sec ${on === false ? 'is-off' : ''}"><div class="row between"><h3 class="h3">${title}</h3></div>${inner}</section>`;

    // ---------- abas ----------
    function tabTimbres() {
      const cur = CAROUSEL.findIndex((c) => c.id === work.id);
      body.innerHTML = `
        <section class="panel tn-hero"><button class="btn icon ghost" data-car="-1" aria-label="Anterior">${icon('chev', 'flip')}</button>
          <div class="tn-car" id="tnCar" tabindex="0" role="listbox" aria-label="Instrumentos">${CAROUSEL.map((c, i) => `<button class="tn-inst ${i === cur ? 'sel' : ''}" role="option" aria-selected="${i === cur}" data-inst="${c.id}">${c.img}<span>${c.label}</span></button>`).join('')}</div>
          <button class="btn icon ghost" data-car="1" aria-label="Próximo">${icon('chev')}</button></section>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">${STYLES.map((id) => { const p = BUILTIN_BY_ID[id]; return `<button class="panel tn-style ${work.id === id ? 'sel' : ''}" data-preset="${id}"><b>${esc(p.name)}</b><span class="muted">${esc(p.desc)}</span><span class="chip">${p.drive.mode === 'off' ? 'limpo' : p.drive.mode === 'overdrive' ? 'overdrive' : 'distorção'}</span></button>`; }).join('')}</div>
        <section class="panel tn-note"><h3 class="h3">Como o timbre funciona aqui</h3>
          <p>A AeroBand envia só <b>notas MIDI</b> (qual corda, qual nota, quão forte). Ela não expõe nenhum parâmetro de timbre, e nada é escrito no aparelho. O timbre é gerado e processado <b>neste navegador</b>: vale para o som tocado pelo app (ativando <i>Ouvir ao vivo</i>) e para os exemplos "Ouvir". <b>Não altera o som físico da guitarra.</b></p></section>`;
      $('#tnCar')?.querySelector('.sel')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }

    function tabEfeitos() {
      const v = work.voice, el_ = v.type === 'electric', d = work.drive, off = d.mode === 'off';
      body.innerHTML = `<div class="tn-grid">
        ${sec('Voz', true, `${seg('voice.type', [['steel', 'Aço'], ['nylon', 'Nylon'], ['electric', 'Elétrica']])}${slider('Brilho', 'voice.brightness', 0, 1, 0.01)}${slider('Sustentação', 'voice.sustain', 0, 1, 0.01)}${el_ ? slider('Captador', 'voice.pickup', 0, 1, 0.01) : slider('Corpo da caixa', 'voice.body', 0, 1, 0.01)}`)}
        ${sec('Compressor', work.comp.on, `${toggle('Ativo', 'comp.on')}${slider('Quantidade', 'comp.amount', 0, 1, 0.01, fmt.pct, !work.comp.on)}`)}
        ${sec('Drive', !off, `${seg('drive.mode', [['off', 'Desligado'], ['overdrive', 'Overdrive'], ['distortion', 'Distorção']])}${slider('Ganho', 'drive.amount', 0, 1, 0.01, fmt.pct, off)}${slider('Tom', 'drive.tone', 0, 1, 0.01, fmt.pct, off)}${slider('Nível', 'drive.level', 0, 1, 0.01, fmt.pct, off)}${toggle('Simular caixa (cabine)', 'drive.cab')}`)}
        ${sec('Equalizador', true, `${slider('Graves', 'eq.low', -12, 12, 0.5, fmt.db)}${slider('Médios', 'eq.mid', -12, 12, 0.5, fmt.db)}${slider('Agudos', 'eq.high', -12, 12, 0.5, fmt.db)}${slider('Presença', 'eq.presence', -12, 12, 0.5, fmt.db)}`)}
        ${sec('Chorus', work.chorus.on, `${toggle('Ativo', 'chorus.on')}${slider('Velocidade', 'chorus.rate', 0.1, 5, 0.1, fmt.hz, !work.chorus.on)}${slider('Profundidade', 'chorus.depth', 0, 1, 0.01, fmt.pct, !work.chorus.on)}${slider('Mistura', 'chorus.mix', 0, 1, 0.01, fmt.pct, !work.chorus.on)}`)}
        ${sec('Delay', work.delay.on, `${toggle('Ativo', 'delay.on')}${toggle('Sincronizar com o BPM', 'delay.sync')}${work.delay.sync ? `${seg('delay.division', [['1/4', '1/4'], ['1/8', '1/8'], ['1/8d', '1/8 pont.'], ['1/8t', '1/8 trinca'], ['1/16', '1/16']])}<label class="tn-ctl"><span>BPM de referência<output id="tnBpm">${audio.tempo}</output></span><input type="range" id="tnTempo" min="40" max="200" step="1" value="${audio.tempo}"></label>` : slider('Tempo', 'delay.time', 40, 1000, 5, fmt.ms, !work.delay.on)}${slider('Repetições', 'delay.feedback', 0, 0.9, 0.01, fmt.pct, !work.delay.on)}${slider('Mistura', 'delay.mix', 0, 1, 0.01, fmt.pct, !work.delay.on)}`)}
        ${sec('Reverb', work.reverb.on, `${toggle('Ativo', 'reverb.on')}${slider('Tamanho', 'reverb.size', 0.3, 3.5, 0.1, fmt.s, !work.reverb.on)}${slider('Abafamento', 'reverb.damp', 0, 1, 0.01, fmt.pct, !work.reverb.on)}${slider('Mistura', 'reverb.mix', 0, 1, 0.01, fmt.pct, !work.reverb.on)}`)}
        ${sec('Saída', true, slider('Nível do preset', 'volume', 0, 1, 0.01))}
      </div>
      <div class="row tn-foot">${savingAs ? `<input type="text" id="tnSaveName" placeholder="Nome do preset" value="${esc(work.name)}" maxlength="40" aria-label="Nome do novo preset"><button class="btn primary" data-act="saveAs">Salvar</button><button class="btn ghost" data-act="cancelSave">Cancelar</button>`
        : `<button class="btn" data-act="revert" ${dirty() ? '' : 'disabled'}>Desfazer alterações</button><span class="grow"></span>${work.kind === 'custom' && getPreset(store, work.id) ? `<button class="btn" data-act="saveCur" ${dirty() ? '' : 'disabled'}>Salvar alterações</button>` : ''}<button class="btn primary" data-act="saveNew">Salvar como novo preset…</button>`}</div>`;
    }

    function tabPresets() {
      const ab = abIds(), q = query.trim().toLowerCase();
      const list = allPresets(store).filter((p) => (filter === 'fav' ? isFavorite(store, p.id) : filter === 'mine' ? p.kind === 'custom' : true) && (!q || (p.name + p.desc).toLowerCase().includes(q)));
      body.innerHTML = `<div class="row wrap tn-tools"><div class="search grow">${icon('search')}<input type="search" id="tnQ" placeholder="Buscar timbre" value="${esc(query)}" aria-label="Buscar timbre"></div>
        <div class="seg" role="group">${[['all', 'Todos'], ['fav', 'Favoritos'], ['mine', 'Meus']].map(([v, t]) => `<button data-filter="${v}" aria-pressed="${filter === v}">${t}</button>`).join('')}</div></div>
        <div class="panel tn-list">${list.length ? list.map((p) => {
          const cur = work.id === p.id, ren = renaming === p.id, del = confirmDel === p.id;
          return `<div class="tn-row ${cur ? 'cur' : ''}" data-id="${p.id}">
            <button class="tn-pick" data-preset="${p.id}" aria-label="Aplicar ${esc(p.name)}">${ren ? '' : `<b>${esc(p.name)}</b><small class="dim">${esc(p.desc || (p.kind === 'custom' ? 'Preset seu' : ''))}</small>`}</button>
            ${ren ? `<input type="text" class="tn-ren" data-ren="${p.id}" value="${esc(p.name)}" maxlength="40" aria-label="Novo nome">` : ''}
            <span class="chip">${p.kind === 'custom' ? 'meu' : p.drive.mode === 'off' ? 'limpo' : p.drive.mode === 'overdrive' ? 'overdrive' : 'distorção'}</span>
            <button class="btn sm ${ab.a === p.id ? 'on' : ''}" data-setab="a:${p.id}" title="Usar como A (comparação)">A</button><button class="btn sm ${ab.b === p.id ? 'on' : ''}" data-setab="b:${p.id}" title="Usar como B (comparação)">B</button>
            <button class="btn icon sm ghost ${isFavorite(store, p.id) ? 'fav' : ''}" data-fav="${p.id}" aria-label="Favorito" aria-pressed="${isFavorite(store, p.id)}">${icon('heart')}</button>
            <button class="btn sm ghost" data-dup="${p.id}">Duplicar</button>
            ${p.kind === 'custom' ? `<button class="btn sm ghost" data-rename="${p.id}">${ren ? 'OK' : 'Renomear'}</button><button class="btn sm ghost danger" data-del="${p.id}">${del ? 'Confirmar?' : 'Excluir'}</button>` : ''}</div>`; }).join('')
          : `<div class="empty">${icon('heart')}<b>${filter === 'fav' ? 'Nenhum favorito ainda' : filter === 'mine' ? 'Você ainda não salvou presets' : 'Nada encontrado'}</b><span>${filter === 'mine' ? 'Ajuste os efeitos e use "Salvar como novo preset".' : 'Toque no coração de um timbre para fixá-lo aqui.'}</span></div>`}</div>`;
      $('#tnQ')?.addEventListener('input', (e) => { query = e.target.value; const pos = e.target.selectionStart; tabPresets(); const n = $('#tnQ'); n.focus(); n.setSelectionRange(pos, pos); });
      el.querySelector('.tn-ren')?.focus();
    }

    // ----- afinador -----
    const strings = () => tuning.midi.map((m, i) => ({ i, m, hz: hzOf(m), name: noteLabel(m) }));
    function tabAfinador() {
      const r = reading, a = r?.freq ? analyzePitch(r.freq, tuning.midi) : null, c = a ? Math.max(-50, Math.min(50, a.cents)) : 0, ok = a && inTune(a.cents);
      body.innerHTML = `<div class="grid" style="grid-template-columns:minmax(300px,1.3fr) minmax(260px,1fr)">
        <section class="panel tn-tuner ${ok ? 'ok' : ''}"><div class="row between"><h3 class="h3">Afinador por microfone</h3><span class="badge ${tunerState === 'on' ? 'live' : ''}">${{ idle: 'desligado', asking: 'pedindo permissão…', on: 'ouvindo', denied: 'microfone negado', error: 'erro' }[tunerState]}</span></div>
          <div class="tn-note-big ${a ? '' : 'idle'}" aria-live="polite">${a ? a.note : '♪'}</div>
          <div class="tn-cents" role="meter" aria-valuemin="-50" aria-valuemax="50" aria-valuenow="${a ? Math.round(a.cents) : 0}"><i class="mid"></i>${[-50, -25, 0, 25, 50].map((t) => `<em style="left:${50 + t}%">${t === 0 ? '0' : t}</em>`).join('')}<b style="left:${50 + c}%" class="${a ? (ok ? 'ok' : Math.abs(a.cents) < 15 ? 'near' : 'far') : 'none'}"></b></div>
          <p class="tn-read num">${a ? `${a.cents > 0 ? '+' : ''}${a.cents.toFixed(1)} cents da ${a.string + 1}ª corda (${noteLabel(a.targetMidi)}) · ${a.freq.toFixed(1)} Hz` : tunerState === 'on' ? (r?.rms > 0.008 ? 'Sinal sem nota clara. Toque uma corda solta.' : 'Toque uma corda solta…') : 'Ligue o microfone e toque uma corda solta.'}</p>
          <div class="row"><button class="btn primary" data-act="tunerToggle">${tunerState === 'on' ? 'Desligar microfone' : 'Ligar microfone'}</button>
            <select id="tnTuning" aria-label="Afinação">${TUNINGS.map((t) => `<option value="${t.id}" ${t.id === tuning.id ? 'selected' : ''}>${t.name}</option>`).join('')}</select></div>
          ${tunerState === 'denied' ? '<p class="muted">O navegador bloqueou o microfone. Libere em Ajustes do site (ícone à esquerda do endereço) e tente de novo.</p>' : ''}</section>
        <section class="panel col"><h3 class="h3">Cordas · referência</h3><p class="muted">Toque para ouvir a nota-alvo (com o timbre atual) e afinar de ouvido.</p>
          <div class="tn-strs">${strings().reverse().map((s) => `<button class="btn tn-str ${a && a.string === s.i ? 'on' : ''}" data-ref="${s.m}"><small>${s.i + 1}ª</small><b>${s.name}</b><small class="num">${s.hz.toFixed(1)} Hz</small></button>`).join('')}</div>
          <div class="divider"></div><p class="muted tn-why"><b>Por que o microfone?</b> A AG01 envia notas MIDI já "quantizadas": cada evento diz <i>qual nota</i>, nunca <i>quantos cents</i> ela está fora. A afinação fina só pode ser medida ouvindo o som da corda. Se a guitarra produz o som por conta própria, aproxime o microfone do alto-falante dela.</p></section></div>`;
    }
    async function toggleTuner() {
      if (tuner) { tuner.stop(); tuner = null; tunerState = 'idle'; reading = null; return tabAfinador(); }
      tunerState = 'asking'; tabAfinador();
      try {
        tuner = new MicTuner((x) => { reading = x; if (tab === 'afinador') tabAfinador(); });
        await tuner.start(); tunerState = 'on';
      } catch (e) { tuner = null; tunerState = e.name === 'NotAllowedError' ? 'denied' : 'error'; if (tunerState === 'error') toast(e.message); }
      tabAfinador();
    }

    // ----- transpor / capo -----
    let prog = store.get('tones.progression', 'G D Em C'), shift = 0;
    const flats = () => !!store.get('settings.flats');
    function tabTranspor() {
      const { chords, invalid } = parseProgression(prog), capo = store.get('settings.capo', 0), fl = flats();
      const key = chords.length ? detectKey(chords) : null, sugg = chords.length ? suggestCapo(chords, 9, fl) : [];
      const shifted = chords.map((c) => transposeChord(c, shift, fl)), shapes = chords.map((c) => capoShape(c, capo, fl));
      const chip = (c, play) => `<button class="tn-chord" data-play="${esc(play)}">${esc(c)}</button>`;
      body.innerHTML = `<section class="panel col"><div class="row wrap"><label class="field grow"><span>Progressão (como ela SOA)</span><input type="text" id="tnProg" value="${esc(prog)}" placeholder="Ex.: Am F C G" spellcheck="false"></label>
          <button class="btn" data-act="playProg" ${chords.length ? '' : 'disabled'}>${icon('play')} Ouvir progressão</button></div>
        ${invalid.length ? `<p class="tn-warn">Não reconheci: ${invalid.map(esc).join(', ')}</p>` : ''}
        ${key ? `<div class="row wrap"><span class="chip on">Tom provável: ${key.name}</span><span class="muted">${key.confidence > 0.7 ? 'boa confiança' : 'estimativa: confira de ouvido'}</span></div>
        <div class="row wrap tn-dia">${diatonic(key.tonic, key.mode, fl).map((d) => `<button class="tn-chord soft" data-play="${esc(d.chord)}"><small>${d.roman}</small>${d.chord}</button>`).join('')}</div>` : ''}</section>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
        <section class="panel col"><h3 class="h3">Capo</h3><div class="row"><div class="seg" role="group" aria-label="Casa do capo">${Array.from({ length: 10 }, (_, i) => `<button data-capo="${i}" aria-pressed="${i === capo}">${i}</button>`).join('')}</div></div>
          <div class="tn-pair"><div><small class="dim">Soa</small><div class="row wrap">${chords.map((c) => chip(c, c)).join('') || '<span class="dim">—</span>'}</div></div>
          <div><small class="dim">Formas a tocar${capo ? ` (capo na ${capo}ª casa)` : ' (sem capo)'}</small><div class="row wrap">${shapes.map((c, i) => chip(c, chords[i])).join('') || '<span class="dim">—</span>'}</div></div></div>
          ${sugg[0] ? `<div class="tn-sugg"><b>Sugestão:</b> ${sugg[0].capo === 0 ? 'sem capo já é a opção mais fácil.' : `capo na <b>${sugg[0].capo}ª casa</b> deixa as formas assim: ${sugg[0].shapes.join(' · ')}`}${sugg[0].capo !== capo ? ` <button class="btn sm" data-capo="${sugg[0].capo}">Usar</button>` : ''}</div>` : ''}</section>
        <section class="panel col"><h3 class="h3">Transpor tom</h3><div class="row"><button class="btn icon" data-shift="-1" aria-label="Meio tom abaixo">−</button><b class="big-num num">${shift > 0 ? '+' : ''}${shift}</b><button class="btn icon" data-shift="1" aria-label="Meio tom acima">+</button><span class="muted">semitons</span><button class="btn sm ghost" data-shift="0">Zerar</button></div>
          <small class="dim">Resultado</small><div class="row wrap">${shifted.map((c) => chip(c, c)).join('') || '<span class="dim">—</span>'}</div>
          ${chords.length && shift ? `<small class="dim">Com capo ${capo || 0}, as formas ficam: ${shifted.map((c) => capoShape(c, capo, fl)).join(' · ')}</small>` : ''}</section></div>`;
      const inp = $('#tnProg'); if (inp && document.activeElement?.id === 'tnProg') inp.setSelectionRange(prog.length, prog.length);
    }

    const render = () => {
      el.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
      ({ timbres: tabTimbres, efeitos: tabEfeitos, presets: tabPresets, afinador: tabAfinador, transpor: tabTranspor })[tab]();
      paintIcons(body);
    };
    const afterEdit = () => { audio.setPreset(work); bar(); };
    const selectPreset = (id, test = true) => { const p = getPreset(store, id); if (!p) return; apply(p); bar(); render(); if (test) { try { playChord(); } catch { /* áudio bloqueado até o 1º clique */ } } };

    // ---------- eventos ----------
    const onClick = (e) => {
      const t = e.target.closest('button'); if (!t) return;
      const d = t.dataset;
      if (d.tab) { if (tuner && d.tab !== 'afinador') { tuner.stop(); tuner = null; tunerState = 'idle'; } tab = d.tab; sessionStorage.setItem('corda.tonesTab', tab); return render(); }
      if (d.preset) return selectPreset(d.preset);
      if (d.inst) return selectPreset(d.inst);
      if (d.car) { const i = Math.max(0, Math.min(CAROUSEL.length - 1, (CAROUSEL.findIndex((c) => c.id === work.id) + +d.car))); return selectPreset(CAROUSEL[i].id); }
      if (d.ab) { const ids = abIds(); if (!ids[d.ab]) return; audio.ab = { a: getPreset(store, ids.a), b: getPreset(store, ids.b), active: audio.ab.active }; audio.ab.active = d.ab; apply(audio.ab[d.ab]); bar(); if (tab === 'efeitos' || tab === 'timbres') render(); try { playChord(); } catch { /* sem áudio ainda */ } return; }
      if (d.test) return d.test === 'chord' ? playChord() : playArp();
      if (d.filter) { filter = d.filter; return tabPresets(); }
      if (d.setab) { /* ids têm ':' (ex.: b:jazz): separa só no primeiro */ const cut = d.setab.indexOf(':'), slot = d.setab.slice(0, cut), id = d.setab.slice(cut + 1); store.update('tones.ab', (o) => ({ ...o, [slot]: o[slot] === id ? null : id }), { a: null, b: null }); bar(); return tabPresets(); }
      if (d.fav) { toggleFavorite(store, d.fav); return tabPresets(); }
      if (d.dup) { const p = duplicatePreset(store, d.dup); toast(`Criado "${p.name}"`); return tabPresets(); }
      if (d.rename) { if (renaming === d.rename) { const v = el.querySelector(`[data-ren="${d.rename}"]`)?.value; renamePreset(store, d.rename, v); if (work.id === d.rename) { work.name = getPreset(store, d.rename).name; audio.setPreset(work); } renaming = null; bar(); } else renaming = d.rename; return tabPresets(); }
      if (d.del) { if (confirmDel !== d.del) { confirmDel = d.del; return tabPresets(); } deletePreset(store, d.del); confirmDel = null; if (work.id === d.del) apply(BUILTIN_BY_ID['b:steel']); bar(); toast('Preset excluído'); return tabPresets(); }
      if (d.sp) { setp(work, d.sp, d.v); afterEdit(); return render(); }
      if (d.ref) { try { audio.pluck(+d.ref, audio.context.currentTime + 0.02, 0.5); } catch { /* sem áudio */ } return; }
      if (d.capo !== undefined) { store.set('settings.capo', +d.capo); return tabTranspor(); }
      if (d.shift !== undefined) { shift = d.shift === '0' ? 0 : Math.max(-11, Math.min(11, shift + +d.shift)); return tabTranspor(); }
      if (d.play) { try { audio.strum(chordMidi(d.play), audio.context.currentTime + 0.02, 'D', 0.34); } catch { /* sem áudio */ } return; }
      switch (d.act) {
        case 'revert': { const b = baseOf(); if (b) { apply(b); bar(); render(); } break; }
        case 'saveNew': savingAs = true; render(); $('#tnSaveName')?.select(); break;
        case 'cancelSave': savingAs = false; render(); break;
        case 'saveAs': { const p = saveCustom(store, work, $('#tnSaveName').value.trim() || 'Meu preset'); savingAs = false; apply(p); bar(); render(); toast(`Salvo: ${p.name}`); break; }
        case 'saveCur': { const p = updateCustom(store, work.id, work); apply(p); bar(); render(); toast('Alterações salvas'); break; }
        case 'tunerToggle': toggleTuner(); break;
        case 'playProg': { const { chords } = parseProgression(prog), t0 = audio.context.currentTime + 0.05, beat = 60 / 80 * 2; chords.forEach((c, i) => audio.strum(chordMidi(c), t0 + i * beat, 'D', 0.34)); break; }
        default:
      }
    };
    const onInput = (e) => {
      const t = e.target;
      if (t.id === 'tnVol') { store.set('settings.volume', +t.value); audio.volume = +t.value; t.style.setProperty('--p', t.value * 100 + '%'); return; }
      if (t.id === 'tnTempo') { audio.tempo = +t.value; $('#tnBpm').textContent = t.value; t.style.setProperty('--p', ((t.value - 40) / 160) * 100 + '%'); return; }
      if (t.id === 'tnProg') { prog = t.value; store.set('tones.progression', prog); tabTranspor(); $('#tnProg').focus(); return; }
      if (t.dataset.p && t.type === 'range') {
        const v = +t.value; setp(work, t.dataset.p, v); t.closest('.tn-ctl').querySelector('output').textContent = fmt[t.dataset.f](v);
        t.style.setProperty('--p', ((v - t.min) / (t.max - t.min)) * 100 + '%'); audio.setPreset(work); bar();
      }
    };
    const onChange = (e) => {
      const t = e.target;
      if (t.id === 'tnSynth') { store.set('settings.synth', t.checked); return; }
      if (t.id === 'tnTuning') { tuning = TUNINGS.find((x) => x.id === t.value); return tabAfinador(); }
      if (t.dataset.p && t.type === 'checkbox') { setp(work, t.dataset.p, t.checked); afterEdit(); render(); }
    };
    const onKey = (e) => {
      if (e.key === 'Enter' && e.target.dataset.ren) { e.preventDefault(); el.querySelector(`[data-rename="${e.target.dataset.ren}"]`)?.click(); }
      if (e.key === 'Escape' && renaming) { renaming = null; tabPresets(); }
      if (e.key === 'Enter' && e.target.id === 'tnSaveName') { e.preventDefault(); el.querySelector('[data-act="saveAs"]')?.click(); }
      if (e.target.id === 'tnCar' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); el.querySelector(`[data-car="${e.key === 'ArrowLeft' ? -1 : 1}"]`)?.click(); }
    };
    el.addEventListener('click', onClick); el.addEventListener('input', onInput); el.addEventListener('change', onChange); el.addEventListener('keydown', onKey);
    const onStatus = () => bar();
    guitar.addEventListener('status', onStatus);
    bar(); render(); meterLoop();
    return () => { cancelAnimationFrame(raf); tuner?.stop(); guitar.removeEventListener('status', onStatus); };
  },
};
