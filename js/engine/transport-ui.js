// Barra de transporte reutilizável: Iniciar/Pausar/Continuar, Reiniciar, Parar, BPM, velocidade, repetição, guia, progresso.
import { icon } from '../core/dom.js';

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25];
const REPEATS = [['once', '1×'], [3, '3×'], ['loop', '∞']];
const LABEL = { idle: 'Iniciar', countin: 'Pausar', running: 'Pausar', paused: 'Continuar', finished: 'Jogar de novo' };

export function mountTransport(host, run, { keys = true } = {}) {
  host.innerHTML = `<div class="transport pr-transport" role="group" aria-label="Controles do exercício">
    <button class="play" data-a="toggle" aria-label="Iniciar"></button>
    <button class="btn icon" data-a="restart" aria-label="Reiniciar" title="Reiniciar (R)">${icon('restart')}</button>
    <button class="btn icon" data-a="stop" aria-label="Parar" title="Parar e ver o resultado">${icon('stop')}</button>
    <div class="stepper" data-r="bpm"><button class="btn icon sm" data-a="bpm-" aria-label="Diminuir BPM">−</button><b class="num" data-r="bpmv"></b><small>BPM</small><button class="btn icon sm" data-a="bpm+" aria-label="Aumentar BPM">+</button></div>
    <input type="range" class="pr-bpmr" data-a="bpmr" min="30" max="240" step="1" aria-label="BPM (muda ao vivo)" title="BPM — muda ao vivo, sem parar a linha do tempo">
    <div class="pr-prog"><div class="progress" role="progressbar" aria-label="Progresso" aria-valuemin="0" aria-valuemax="100"><i></i></div><span class="num dim" data-r="lap"></span></div>
    <button class="btn icon pr-gear" data-a="gear" aria-label="Configurações do exercício" aria-expanded="false" title="Velocidade, repetição, metrônomo, sincronizar…">${icon('gear')}</button>
    <div class="pr-pop" hidden role="dialog" aria-label="Configurações do exercício">
      <div class="pr-pop-row"><span class="h3">Velocidade</span><div class="seg" role="group" aria-label="Velocidade">${SPEEDS.map((s) => `<button data-speed="${s}" aria-pressed="false">${s * 100}%</button>`).join('')}</div></div>
      <div class="pr-pop-row"><span class="h3">Repetir</span><div class="seg" role="group" aria-label="Repetir">${REPEATS.map(([v, l]) => `<button data-repeat="${v}" aria-pressed="false" title="Repetir">${l}</button>`).join('')}</div></div>
      <div class="pr-pop-row"><span class="h3">Som</span><div class="row wrap">
        <label class="chip pr-toggle"><input type="checkbox" data-a="click" checked> Metrônomo</label>
        <label class="chip pr-toggle" title="Clique suave também nas subdivisões (e, &, a)"><input type="checkbox" data-a="subclick"> Subdivisões</label>
        <label class="chip pr-toggle"><input type="checkbox" data-a="guide"> Guia sonoro</label></div></div>
      <div class="pr-pop-row"><span class="h3">Timing</span><button class="btn sm" data-a="sync" title="Medir o atraso entre você e o clique e ajustar a compensação">Sincronizar com a guitarra…</button></div>
    </div>
  </div>`;
  const $ = (s) => host.querySelector(s), play = $('.play');
  const paintPlay = () => { const st = run.state, ic = st === 'running' || st === 'countin' ? 'pause' : 'play'; play.innerHTML = icon(ic); play.setAttribute('aria-label', LABEL[st]); play.title = `${LABEL[st]} (P)`; };
  const paint = () => {
    paintPlay();
    $('[data-r=bpmv]').textContent = Math.round(run.bpm * run.speed) + (run.speed !== 1 ? '' : '');
    host.querySelectorAll('[data-speed]').forEach((b) => b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.speed - run.speed) < 1e-6)));
    host.querySelectorAll('[data-repeat]').forEach((b) => { const v = b.dataset.repeat, cur = run.passes === Infinity ? 'loop' : run.passes === 1 ? 'once' : String(run.passes); b.setAttribute('aria-pressed', String(v === cur)); });
    $('[data-a=guide]').checked = run.guide;
    const clk = $('[data-a=click]'); if (clk) clk.checked = run.click;
    const base = run.canBpm && run.speed !== 1 ? ` · base ${run.bpm}` : '';
    $('[data-r=bpm] small').textContent = 'BPM' + base;
    const br = $('[data-a=bpmr]'); if (br && document.activeElement !== br) { br.value = run.bpm; br.style.setProperty('--p', ((run.bpm - br.min) / (br.max - br.min)) * 100 + '%'); }
    const sc = $('[data-a=subclick]'); if (sc) sc.checked = !!run.subClick;
  };
  const prog = () => {
    const f = run.progress, bar = $('.progress'); bar.firstElementChild.style.width = `${Math.round(f * 100)}%`; bar.setAttribute('aria-valuenow', Math.round(f * 100));
    $('[data-r=lap]').textContent = run.passes === Infinity ? `Volta ${run.currentPass + 1}` : run.passes > 1 ? `Volta ${Math.min(run.currentPass + 1, run.passes)}/${run.passes}` : `${Math.round(f * 100)}%`;
  };
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.a === 'toggle') run.toggle();
    else if (b.dataset.a === 'restart') run.restart();
    else if (b.dataset.a === 'stop') run.stop();
    else if (b.dataset.a === 'sync') { $('.pr-pop').hidden = true; $('.pr-gear').setAttribute('aria-expanded', 'false'); host.dispatchEvent(new CustomEvent('corda:sync', { bubbles: true })); }
    else if (b.dataset.a === 'gear') { const pop = $('.pr-pop'); pop.hidden = !pop.hidden; b.setAttribute('aria-expanded', String(!pop.hidden)); }
    else if (b.dataset.a === 'bpm-') run.setBpm(run.bpm - 5);
    else if (b.dataset.a === 'bpm+') run.setBpm(run.bpm + 5);
    else if (b.dataset.speed) run.setSpeed(+b.dataset.speed);
    else if (b.dataset.repeat) run.setRepeat(b.dataset.repeat === 'loop' || b.dataset.repeat === 'once' ? b.dataset.repeat : +b.dataset.repeat);
    paint();
  });
  host.addEventListener('input', (e) => { if (e.target.dataset.a === 'bpmr') { run.setBpm(+e.target.value); paint(); } });
  // segurar − / + repete (ajuste rápido do andamento com a linha do tempo andando)
  let hold = null;
  host.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-a=bpm-],[data-a=bpm+]'); if (!b) return;
    const d = b.dataset.a === 'bpm+' ? 1 : -1;
    clearInterval(hold); const t0 = setTimeout(() => { hold = setInterval(() => { run.setBpm(run.bpm + d * 2); paint(); }, 90); }, 420);
    const end = () => { clearTimeout(t0); clearInterval(hold); window.removeEventListener('pointerup', end); };
    window.addEventListener('pointerup', end);
  });
  host.addEventListener('change', (e) => { if (e.target.dataset.a === 'subclick') run.setSubClick(e.target.checked); if (e.target.dataset.a === 'guide') run.setGuide(e.target.checked); if (e.target.dataset.a === 'click') run.setClick(e.target.checked); });
  const offs = [run.on('state', paint), run.on('tempo', paint), run.on('progress', prog), run.on('pass', prog)];
  const closePop = (e) => { const pop = $('.pr-pop'); if (pop && !pop.hidden && !e.target.closest?.('.pr-pop, .pr-gear')) { pop.hidden = true; $('.pr-gear')?.setAttribute('aria-expanded', 'false'); } };
  document.addEventListener('pointerdown', closePop);
  const key = (e) => {
    if (!host.isConnected || e.target.closest?.('input,select,textarea,dialog') || e.metaKey || e.ctrlKey) return;
    if (e.key === 'Escape') { const pop = $('.pr-pop'); if (pop) pop.hidden = true; return; }
    if (e.key === 'p' || e.key === 'P') { e.preventDefault(); run.toggle(); } else if (e.key === 'r' || e.key === 'R') run.restart();
  };
  if (keys) document.addEventListener('keydown', key);
  paint(); prog();
  return { update() { paint(); prog(); }, destroy() { offs.forEach((f) => f()); document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', closePop); host.innerHTML = ''; } };
}
