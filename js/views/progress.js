// Progresso: visão geral, técnicas, acordes, histórico, metas, rotinas e trilhas. Só mostra dados reais.
import { esc } from '../core/dom.js';
import { barChart, lineChart, hBars } from '../learn/charts.js';
import { minutesByDay, accuracySeries, bpmSeries, techniqueLabel, TECHNIQUES, dayKey } from '../learn/stats.js';
import { makeRoutine, routineMinutes } from '../learn/routines.js';
import { resolveStep } from '../content/paths.js';

const TABS = [['geral', 'Visão geral'], ['tecnicas', 'Técnicas'], ['acordes', 'Acordes'], ['historico', 'Histórico'], ['metas', 'Metas'], ['rotinas', 'Rotinas'], ['trilhas', 'Trilhas']];
const fmtDate = (ts) => new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
const fmtDur = (s) => (s >= 60 ? `${Math.round(s / 60)} min` : s ? `${Math.round(s)} s` : '—');
const empty = (msg, btn) => `<div class="empty"><b>Ainda não há dados</b><span>${msg}</span>${btn ? `<button class="btn primary" data-go="train">${btn}</button>` : ''}</div>`;
const stat = (label, val, sub = '') => `<div class="pg-stat"><span class="h3">${label}</span><b class="big-num num">${val}</b><span class="muted">${sub}</span></div>`;

export default {
  id: 'progress', title: 'Progresso', icon: 'chart', order: 70,
  mount(el, app, params) {
    const L = app.learn, store = app.store;
    let tab = TABS.some(([k]) => k === params.tab) ? params.tab : 'geral';
    let bpmTech = '', routineHandle = null, builder = [];
    const cleanups = [];

    const views = {
      geral() {
        const ss = L.sessions(), o = L.overview();
        if (!ss.length) return empty('Faça um exercício e seus números aparecem aqui: tempo, precisão, timing e BPM.', 'Começar a treinar');
        const days = minutesByDay(ss, { days: 14 });
        const acc = accuracySeries(ss), timing = acc.filter((p) => p.timing != null);
        const techs = [...new Set(ss.filter((s) => s.bpm).map((s) => s.technique).filter(Boolean))];
        if (bpmTech && !techs.includes(bpmTech)) bpmTech = '';
        const bpm = bpmSeries(ss, { technique: bpmTech || undefined });
        const tr = o.trend == null ? '' : `${o.trend >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(o.trend))} pts`;
        return `<div class="pg-stats">${stat('Tempo total', `${Math.round(o.totalMinutes)}<small> min</small>`, `${Math.round(o.weekMinutes)} min nesta semana`)}${stat('Sessões', o.sessions, `${o.weekSessions} nesta semana`)}
          ${stat('Precisão média', o.avgAccuracy == null ? '—' : Math.round(o.avgAccuracy) + '%', tr ? `tendência ${tr}` : 'tendência após 6 sessões')}${stat('Sequência', L.streak(), `recorde ${L.bestStreak()} dias`)}</div>
          <section class="pg-sec"><h3 class="h3">Tempo de prática · 14 dias</h3>${barChart(days.map((d) => ({ label: d.day.slice(8) + '/' + d.day.slice(5, 7), value: Math.round(d.minutes * 10) / 10, emphasis: d.day === dayKey(Date.now()) })), { unit: ' min' })}</section>
          <section class="pg-sec"><h3 class="h3">Precisão por sessão</h3>${acc.length > 1 ? lineChart([{ name: 'Precisão', cls: 'a', points: acc.map((p) => ({ x: p.ts, y: p.accuracy })) }], { yMin: 0, yMax: 100, unit: '%', fmtX: fmtDate }) : '<p class="muted">Precisa de pelo menos 2 sessões com precisão.</p>'}</section>
          <section class="pg-sec"><h3 class="h3">Timing médio (ms; negativo = adiantado)</h3>${timing.length > 1 ? lineChart([{ name: 'Timing', cls: 'b', points: timing.map((p) => ({ x: p.ts, y: p.timing })) }], { unit: ' ms', fmtX: fmtDate }) : '<p class="muted">O timing aparece quando houver 2 ou mais sessões rítmicas.</p>'}</section>
          <section class="pg-sec"><div class="row between"><h3 class="h3">Evolução de BPM (efetivo)</h3><select id="bpmTech" aria-label="Técnica"><option value="">Todas</option>${techs.map((t) => `<option value="${t}" ${t === bpmTech ? 'selected' : ''}>${techniqueLabel(t)}</option>`).join('')}</select></div>
            ${bpm.length > 1 ? lineChart([{ name: 'BPM', cls: 'a', points: bpm.map((p) => ({ x: p.ts, y: p.bpm, note: p.accuracy != null ? Math.round(p.accuracy) + '%' : '' })) }], { unit: '', fmtX: fmtDate }) : '<p class="muted">Registre 2 sessões com BPM para ver a evolução.</p>'}</section>`;
      },
      tecnicas() {
        const t = L.byTechnique(); if (!t.length) return empty('Pratique para ver o desempenho por técnica.', 'Começar a treinar');
        const weak = L.weak(), weakSet = new Set(weak.map((w) => w.technique));
        return `<section class="pg-sec"><h3 class="h3">Precisão média por técnica</h3>${hBars(t.filter((x) => x.avgAccuracy != null).map((x) => ({ label: x.label, value: x.avgAccuracy, weak: weakSet.has(x.technique), note: `${Math.round(x.avgAccuracy)}% · ${x.sessions}×` })))}</section>
          <section class="pg-sec"><h3 class="h3">Precisam de reforço</h3>${weak.length ? `<ul class="pg-list">${weak.map((w) => `<li><div><b>${esc(w.label)}</b><span class="muted">média ${w.avgAccuracy}% nas últimas ${w.sessions} sessões${w.missRatio >= 0.25 ? ` · ${Math.round(w.missRatio * 100)}% de batidas perdidas` : ''}</span></div><button class="btn sm" data-train="${w.technique}">Reforçar</button></li>`).join('')}</ul>` : '<p class="muted">Nenhuma técnica abaixo de 80% nas sessões recentes. (Só avaliamos técnicas com 2 ou mais sessões.)</p>'}</section>`;
      },
      acordes() {
        const ch = store.get('chords', {}), ids = Object.keys(ch).filter((k) => ch[k].tries > 0);
        if (!ids.length) return empty('Os acordes que você praticar em Acordes aparecem aqui.', null);
        const done = new Set(L.masteredChords());
        return `<p class="pg-lead"><b class="num">${done.size}</b> dominados de <b class="num">${ids.length}</b> praticados <span class="muted">· dominado = 3 acertos seguidos</span></p>
          <div class="pg-chords">${ids.sort((a, b) => (done.has(b) - done.has(a)) || a.localeCompare(b)).map((id) => { const c = ch[id], p = Math.round((c.ok / Math.max(1, c.tries)) * 100); return `<div class="pg-chord ${done.has(id) ? 'done' : ''}" title="${c.ok} acertos em ${c.tries} tentativas"><b>${esc(id)}</b><span>${done.has(id) ? '★' : p + '%'}</span></div>`; }).join('')}</div>`;
      },
      historico() {
        const ss = L.sessions().slice(-100).reverse(); if (!ss.length) return empty('Cada exercício concluído é registrado aqui.', 'Começar a treinar');
        return `<table class="pg-table"><thead><tr><th>Data</th><th>Exercício</th><th>Técnica</th><th class="r">BPM</th><th class="r">Duração</th><th class="r">Precisão</th></tr></thead><tbody>${ss.map((s) => `<tr><td>${fmtDate(s.ts)}</td><td>${esc(s.title)}</td><td class="muted">${esc(techniqueLabel(s.technique))}</td><td class="r num">${s.bpm ? Math.round(s.bpm * (s.speed || 1)) : '—'}</td><td class="r num">${fmtDur(s.durationSec)}</td><td class="r num">${s.accuracy == null ? '—' : Math.round(s.accuracy) + '%'}</td></tr>`).join('')}</tbody></table>`;
      },
      metas() {
        const g = L.goals(), d = L.today(), w = L.week();
        const bar = (r) => `<div class="progress ${r >= 1 ? 'ok' : ''}"><i style="width:${Math.round(r * 100)}%"></i></div>`;
        return `<div class="pg-goals"><section class="col"><h3 class="h3">Meta diária</h3><label class="field">Minutos por dia<input type="number" id="gDaily" min="1" max="240" value="${g.dailyMinutes}"></label>${bar(d.ratio)}<span class="muted num">${Math.floor(d.minutes)} de ${d.target} min hoje${d.done ? ' · concluída ✓' : ''}</span></section>
          <section class="col"><h3 class="h3">Meta semanal</h3><label class="field">Sessões por semana<input type="number" id="gWeekly" min="1" max="50" value="${g.weeklySessions}"></label>${bar(w.ratio)}<span class="muted num">${w.sessions} de ${w.target} sessões${w.done ? ' · concluída ✓' : ''}</span></section></div>`;
      },
      rotinas() {
        const custom = L.routines();
        return `<section class="pg-sec"><h3 class="h3">Rotina do dia</h3><div id="daily" class="muted">Calculando…</div></section>
          <div id="routineRun" class="pg-run" hidden><div class="row between"><b id="runTitle"></b><span class="row"><button class="btn sm" id="runSkip">Pular</button><button class="btn sm danger" id="runStop">Encerrar</button></span></div><div id="runHost"></div></div>
          <section class="pg-sec"><h3 class="h3">Minhas rotinas</h3>${custom.length ? `<ul class="pg-list">${custom.map((r) => `<li><div><b>${esc(r.name)}</b><span class="muted">${r.steps.length} exercícios · ${routineMinutes(r)} min</span></div><span class="row"><button class="btn sm primary" data-run="${r.id}">Iniciar</button><button class="btn sm ghost" data-del="${r.id}">Excluir</button></span></li>`).join('')}</ul>` : '<p class="muted">Você ainda não criou rotinas.</p>'}</section>
          <section class="pg-sec"><h3 class="h3">Criar rotina</h3><div id="builder" class="muted">Carregando exercícios…</div></section>`;
      },
      trilhas() {
        return L.progress().map((p) => `<section class="pg-sec"><div class="row between"><div><h3 class="h2">${p.name}</h3><span class="muted">${p.desc}</span></div><span class="chip ${p.done ? 'on' : ''}">${p.doneCount}/${p.total}</span></div><div class="progress"><i style="width:${(p.doneCount / p.total) * 100}%"></i></div>
          <ul class="pg-steps">${p.steps.map((s) => `<li class="${s.done ? 'done' : ''}" data-step="${s.id}"><span class="pg-mark">${s.done ? '✓' : ''}</span><div class="grow"><b>${s.title}</b><span class="muted">${s.hint}</span><span class="dim pg-crit">${s.done ? 'Concluído' : `${s.qualifying}/${s.needed} sessões com ≥${s.criteria.minAccuracy}%`} · <span class="pg-avail">verificando exercícios…</span></span></div><button class="btn sm" data-train="${s.technique}" data-level="${s.levels[0]}" data-step-id="${s.id}">Praticar</button></li>`).join('')}</ul></section>`).join('');
      },
    };

    const draw = async () => {
      el.innerHTML = `<div class="page pg"><div class="tabs" role="tablist">${TABS.map(([k, n]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${n}</button>`).join('')}</div><div id="pgBody">${views[tab]()}</div></div>`;
      if (tab === 'trilhas') fillPaths(); if (tab === 'rotinas') fillRoutines();
    };

    async function fillPaths() {
      const cat = await L.loadCatalog();
      L.progress().forEach((p) => p.steps.forEach((s) => {
        const row = el.querySelector(`[data-step="${s.id}"] .pg-avail`); if (!row) return;
        const r = resolveStep(s, cat);
        row.textContent = !cat ? 'exercícios aguardando a biblioteca' : r.available ? `${r.exercises.length} exercício(s)` : 'sem exercícios neste nível ainda';
      }));
    }

    async function fillRoutines() {
      const cat = await L.loadCatalog(), daily = el.querySelector('#daily'), bld = el.querySelector('#builder'); if (!daily) return;
      const ready = !!cat?.all?.length;
      if (!ready) { daily.textContent = 'A biblioteca de exercícios ainda não está disponível, então não dá para montar rotinas. Assim que ela existir, a sugestão aparece aqui.'; bld.textContent = 'Indisponível até a biblioteca de exercícios existir.'; return; }
      const r = await L.dailyRoutine();
      daily.innerHTML = r ? `<ul class="pg-list"><li><div><b>${r.steps.length} exercícios · ${routineMinutes(r)} min</b><span class="muted">${esc(r.reason)}</span><span class="dim">${r.steps.map((s) => esc(s.title)).join(' → ')}</span></div><button class="btn primary" id="runDaily">Iniciar</button></li></ul>` : 'Sem exercícios suficientes para sugerir hoje.';
      if (r) daily.querySelector('#runDaily').onclick = () => run(r);
      bld.innerHTML = `<div class="row wrap"><input type="text" id="bName" placeholder="Nome da rotina" maxlength="40"><select id="bEx">${cat.all.map((e) => `<option value="${esc(e.id)}">${esc(e.title)} · ${esc(techniqueLabel(e.technique))}</option>`).join('')}</select><input type="number" id="bMin" value="3" min="1" max="30" style="width:80px" aria-label="Minutos"><button class="btn" id="bAdd">Adicionar</button></div><ul class="pg-list" id="bList"></ul><button class="btn primary" id="bSave" disabled>Salvar rotina</button>`;
      const list = () => { bld.querySelector('#bList').innerHTML = builder.map((s, i) => `<li><span>${esc(s.title)} <span class="muted">· ${s.minutes} min</span></span><button class="btn sm ghost" data-rm="${i}">Remover</button></li>`).join(''); bld.querySelector('#bSave').disabled = !builder.length; };
      bld.querySelector('#bAdd').onclick = () => { const e = cat.all.find((x) => x.id === bld.querySelector('#bEx').value); builder.push({ exerciseId: e.id, title: e.title, technique: e.technique, minutes: +bld.querySelector('#bMin').value || 3 }); list(); };
      bld.addEventListener('click', (ev) => { const i = ev.target.dataset.rm; if (i != null) { builder.splice(+i, 1); list(); } });
      bld.querySelector('#bSave').onclick = () => { L.saveRoutine(makeRoutine(bld.querySelector('#bName').value, builder)); builder = []; app.toast('Rotina salva'); draw(); };
      list();
    }

    async function run(routine) {
      const box = el.querySelector('#routineRun'); box.hidden = false;
      try {
        routineHandle?.stop();
        routineHandle = await L.runRoutine(routine, el.querySelector('#runHost'), {
          onStep: (i, s) => { el.querySelector('#runTitle').textContent = `${routine.name} · ${i + 1}/${routine.steps.length}: ${s.title}`; },
          onFinish: () => { box.hidden = true; app.toast('Rotina concluída!'); routineHandle = null; },
        });
        el.querySelector('#runStop').onclick = () => { routineHandle?.stop(); routineHandle = null; box.hidden = true; };
        el.querySelector('#runSkip').onclick = () => routineHandle?.skip();
      } catch (e) { box.hidden = true; app.toast(e.message); }
    }

    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; draw(); return; }
      const g = e.target.closest('[data-go]'); if (g) return app.navigate(g.dataset.go);
      const tr = e.target.closest('[data-train]'); if (tr) return app.navigate('train', { technique: tr.dataset.train, ...(tr.dataset.level ? { level: tr.dataset.level } : {}), ...(tr.dataset.stepId ? { step: tr.dataset.stepId } : {}) });
      const r = e.target.closest('[data-run]'); if (r) return run(L.routines().find((x) => x.id === r.dataset.run));
      const d = e.target.closest('[data-del]'); if (d) { L.deleteRoutine(d.dataset.del); draw(); }
    });
    el.addEventListener('change', (e) => {
      if (e.target.id === 'bpmTech') { bpmTech = e.target.value; el.querySelector('#pgBody').innerHTML = views.geral(); }
      if (e.target.id === 'gDaily') { L.setGoals({ dailyMinutes: +e.target.value }); draw(); }
      if (e.target.id === 'gWeekly') { L.setGoals({ weeklySessions: +e.target.value }); draw(); }
    });
    draw();
    return () => { routineHandle?.stop(); cleanups.forEach((f) => f()); };
  },
};
