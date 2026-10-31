// Tela provisória até a frente de trabalho correspondente entregar a versão real.
import { icon } from '../core/dom.js';
export const stub = (id, title, ic, order, text) => ({
  id, title, icon: ic, order,
  mount(el) { el.innerHTML = `<div class="page"><div class="empty">${icon(ic)}<b>${title}</b><span>${text}</span></div></div>`; },
});
