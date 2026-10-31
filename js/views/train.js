// Treinar: biblioteca de exercícios por técnica/nível, busca, favoritos, e execução no runner.
import { esc, icon, paintIcons } from '../core/dom.js';
import { EXERCISES, TECHNIQUES, LEVELS, exerciseById, getExercises } from '../content/exercises.js';
import { upgradeShapes } from '../content/patterns.js';

export default {
  id: 'train', title: 'Treinar', icon: 'train', order: 20,
  mount(el, app, params) {
    const f = { technique: params.technique || '', level: 0, q: '', fav: false };
    let run = null;
    const favs = () => app.store.get('favorites.exercises', []);
    const best = (id) => app.store.get('practice.best', {})[id];
    upgradeShapes();

    const dots = (l) => `<span class="lvl" title="${LEVELS[l - 1]}" aria-label="Nível ${l} de 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= l ? 'on' : ''}"></i>`).join('')}</span>`;
    function list() {
      const tech = TECHNIQUES.find((t) => t.id === f.technique);
      let items = getExercises({ technique: f.technique || undefined, level: f.level || undefined, q: f.q });
      if (f.fav) items = items.filter((e) => favs().includes(e.id));
      el.innerHTML = `<div class="page train">
        <div class="tr-bar">
          <label class="search grow">${icon('search')}<input type="search" placeholder="Buscar exercício, técnica ou acorde" value="${esc(f.q)}" aria-label="Buscar"></label>
          <div class="seg" role="group" aria-label="Nível"><button data-level="0" aria-pressed="${!f.level}">Todos</button>${LEVELS.map((n, i) => `<button data-level="${i + 1}" aria-pressed="${f.level === i + 1}" title="${n}">${i + 1}</button>`).join('')}</div>
          <button class="btn ${f.fav ? 'on' : ''}" data-fav aria-pressed="${f.fav}">${icon('heart')} Favoritos</button>
        </div>
        <div class="tr-layout">
          <nav class="tr-techs" aria-label="Técnicas">
            <button data-tech="" aria-pressed="${!f.technique}"><span>Todas</span><small>${EXERCISES.length}</small></button>
            ${TECHNIQUES.map((t) => `<button data-tech="${t.id}" aria-pressed="${f.technique === t.id}"><span>${t.name}</span><small>${EXERCISES.filter((e) => e.technique === t.id).length}</small></button>`).join('')}
          </nav>
          <section class="tr-list">
            ${tech ? `<p class="muted tr-blurb">${tech.blurb}</p>` : ''}
            ${items.length ? items.map((e) => `<div class="tr-row" role="button" tabindex="0" data-ex="${e.id}" aria-label="${esc(e.title)}">
              <div class="grow"><b>${esc(e.title)}</b><div class="tr-meta">${dots(e.level)}<span class="dim">${LEVELS[e.level - 1]}</span><span class="dim">· ${e.bpm} BPM · ${e.bars} comp.</span>${e.mode === 'wait' ? '<span class="chip">espera você</span>' : ''}${e.guide ? '<span class="badge guide">guia</span>' : ''}</div></div>
              ${best(e.id) != null ? `<span class="best num" title="Melhor resultado">${best(e.id)}%</span>` : ''}
              <button class="btn ghost icon fav ${favs().includes(e.id) ? 'on' : ''}" data-favbtn="${e.id}" aria-label="Favoritar ${esc(e.title)}" aria-pressed="${favs().includes(e.id)}">${icon('heart')}</button>
            </div>`).join('') : '<div class="empty">Nenhum exercício com esses filtros.</div>'}
          </section>
        </div></div>`;
      paintIcons(el);
    }

    function open(id) {
      const ex = exerciseById(id); if (!ex) return list();
      const passes = ex.mode === 'wait' ? 1 : Math.min(6, Math.max(1, Math.ceil(48 / ex.score.lengthBeats)));
      el.innerHTML = `<div class="page train"><section class="tr-brief panel flat"><p>${esc(ex.description)}</p>${ex.tip ? `<p class="muted"><b>Dica:</b> ${esc(ex.tip)}</p>` : ''}</section><div id="practice"></div></div>`;
      run?.destroy();
      run = app.practice.start(ex.score, { host: el.querySelector('#practice'), meta: { guide: ex.guide, limitations: ex.limitations }, repeat: passes > 1 ? passes : 'once', autostart: false, onClose: () => { run?.destroy(); run = null; history.replaceState(null, '', '#/train'); list(); } });
      paintIcons(el);
    }

    el.addEventListener('click', (e) => {
      const t = e.target;
      const fb = t.closest('[data-favbtn]');
      if (fb) { e.stopPropagation(); app.store.update('favorites.exercises', (a) => (a.includes(fb.dataset.favbtn) ? a.filter((x) => x !== fb.dataset.favbtn) : [...a, fb.dataset.favbtn]), []); return list(); }
      const row = t.closest('[data-ex]'); if (row && !run) return open(row.dataset.ex);
      if (t.closest('[data-fav]')) { f.fav = !f.fav; return list(); }
      const lv = t.closest('[data-level]'); if (lv) { f.level = +lv.dataset.level; return list(); }
      const te = t.closest('[data-tech]'); if (te) { f.technique = te.dataset.tech; return list(); }
    });
    el.addEventListener('keydown', (e) => { const row = e.target.closest?.('[data-ex]'); if (row && (e.key === 'Enter' || e.key === ' ') && !run) { e.preventDefault(); open(row.dataset.ex); } });
    el.addEventListener('input', (e) => { if (e.target.type === 'search') { f.q = e.target.value; const pos = e.target.selectionStart; list(); const i = el.querySelector('input[type=search]'); i.focus(); i.setSelectionRange(pos, pos); } });

    if (params.ex) open(params.ex); else list();
    return () => { run?.destroy(); run = null; };
  },
};
