// Início: meta do dia, recomendação, continuar de onde parou, sequência e atalhos. Sem dados fictícios.
import { esc } from '../core/dom.js';
import { ring } from '../learn/charts.js';
import { minutesByDay, techniqueLabel, dayKey } from '../learn/stats.js';

const greeting = (h = new Date().getHours()) => (h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite');
const rel = (ts, now = Date.now()) => { const n = Math.round((new Date(dayKey(now) + 'T12:00').getTime() - new Date(dayKey(ts) + 'T12:00').getTime()) / 86400000); return n <= 0 ? 'hoje' : n === 1 ? 'ontem' : `há ${n} dias`; };
const fmtMin = (m) => (m < 1 ? `${Math.round(m * 60)} s` : `${Math.round(m)} min`);
const DEST = { exercise: (s) => ['train', { exercise: s.refId }], chords: (s) => ['chords', { chord: s.refId }], rhythm: () => ['rhythm'], song: (s) => ['songs', { song: s.refId }] };

export default {
  id: 'home', title: 'Início', icon: 'home', order: 10,
  mount(el, app) {
    const L = app.learn;
    const render = () => {
      const sessions = L.sessions(), today = L.today(), rec = L.recommend(), last = L.last(), streak = L.streak(), week = L.week();
      const bars = minutesByDay(sessions, { days: 7 }), maxM = Math.max(5, ...bars.map((b) => b.minutes));
      const gs = app.guitar.status, live = gs === 'connected' || gs === 'demo';
      const first = sessions.length === 0;
      const sub = first ? 'Vamos começar? Conecte a guitarra e faça o primeiro exercício.' : today.done ? 'Meta de hoje concluída. Dá para ir além.' : `Faltam ${fmtMin(today.remaining)} para a meta de hoje.`;
      const onboarding = live ? `<p class="hm-live"><span class="badge live">${gs === 'demo' ? 'modo demo' : 'guitarra conectada'}</span><span class="muted">${gs === 'demo' ? 'Espaço palheta para baixo, ↑ para cima, X erra de propósito.' : 'Toque uma corda para ver o braço reagir.'}</span></p>`
        : `<section class="hm-onboard"><div><h2 class="h2">Conecte a sua guitarra</h2><ol class="hm-steps"><li>Feche o app da Aeroband (só um app conecta por vez)</li><li>Ligue a guitarra</li><li>Clique em conectar e escolha “AeroBand Midi”</li></ol></div>
          <div class="col"><button class="btn primary lg" data-a="connect">Conectar guitarra</button><button class="btn ghost" data-a="demo">Experimentar sem guitarra</button></div></section>`;
      const lastHtml = last ? `<button class="hm-last" data-a="resume"><span class="h3">Continuar de onde parou</span><b>${esc(last.title)}</b><span class="muted">${esc(techniqueLabel(last.technique))} · ${rel(last.ts)}${last.accuracy != null ? ` · ${Math.round(last.accuracy)}%` : ''}</span></button>` : `<div class="hm-last static"><span class="h3">Continuar de onde parou</span><span class="muted">Seu último exercício aparece aqui.</span></div>`;
      el.innerHTML = `<div class="page home">
        <header class="hm-hello"><h2 class="h1">${greeting()}</h2><p class="muted">${esc(sub)}</p></header>
        ${onboarding}
        <section class="hm-today">
          <div class="hm-goal"><div class="hm-ring">${ring(today.ratio)}<div class="hm-ring-txt"><b class="num">${Math.floor(today.minutes)}</b><span>de ${today.target} min</span></div></div>
            <div class="col" style="gap:4px"><span class="h3">Meta do dia</span><span class="muted num">${week.sessions} de ${week.target} sessões na semana</span><button class="btn ghost sm" data-a="goals" style="align-self:flex-start;margin-left:-10px">Ajustar metas</button></div></div>
          <div class="hm-rec"><span class="h3">${rec.type === 'reinforce' ? 'Recomendado: reforço' : rec.type === 'free' ? 'Tudo em dia' : first ? 'Primeiro passo' : 'Próximo passo'}</span>
            <h2 class="h1 hm-rec-title">${esc(rec.title)}</h2><p class="muted">${esc(rec.reason)}</p>
            <div class="row wrap"><button class="btn primary lg" data-a="rec">${first ? 'Começar' : 'Praticar agora'}</button><button class="btn ghost" data-a="routine">Rotina do dia</button></div></div>
        </section>
        <section class="hm-row">${lastHtml}
          <div class="hm-stat"><span class="h3">Sequência</span><b class="big-num num">${streak}</b><span class="muted">${streak === 1 ? 'dia seguido' : 'dias seguidos'}</span></div>
          <div class="hm-stat"><span class="h3">Últimos 7 dias</span><div class="hm-week" role="img" aria-label="Minutos praticados nos últimos 7 dias">${bars.map((b, i) => `<i class="${i === 6 ? 'on' : ''}" style="height:${Math.max(4, (b.minutes / maxM) * 100)}%" title="${b.day}: ${Math.round(b.minutes)} min"></i>`).join('')}</div></div>
        </section>
        <nav class="hm-links" aria-label="Atalhos"><button data-go="chords">Acordes</button><button data-go="rhythm">Ritmo</button><button data-go="train">Treinar</button><button data-go="songs">Músicas</button><button data-go="tones">Tones</button><button data-go="progress">Progresso</button></nav>
      </div>`;
    };
    render();
    const click = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a, g = e.target.closest('[data-go]')?.dataset.go;
      if (g) return app.navigate(g);
      if (a === 'connect') app.connect(); else if (a === 'demo') app.startDemo();
      else if (a === 'goals') app.navigate('progress', { tab: 'metas' });
      else if (a === 'routine') app.navigate('progress', { tab: 'rotinas' });
      else if (a === 'rec') { const r = L.recommend(); app.navigate('train', { technique: r.technique || '', level: r.level, ...(r.step ? { step: r.step.id } : {}) }); }
      else if (a === 'resume') { const s = L.last(); const [v, p] = (DEST[s.kind] || DEST.exercise)(s); app.navigate(v, p); }
    };
    el.addEventListener('click', click);
    app.guitar.addEventListener('status', render);
    app.store.addEventListener('change', render);
    return () => { app.guitar.removeEventListener('status', render); app.store.removeEventListener('change', render); };
  },
};
