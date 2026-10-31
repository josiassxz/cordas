// Utilitários de DOM, ícones e notificações usados por todas as telas.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat().filter((x) => x != null && x !== false));
  return el;
}

// Ícones de traço (24x24). Para novos ícones, acrescente aqui.
const P = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  train: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 12m-2.5 0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M12 12m-8 0a8 8 0 1016 0a8 8 0 10-16 0',
  chord: 'M4 5h16v14H4zM4 10h16M4 15h16M9 5v14M14 5v14',
  wave: 'M3 12h2l2-6 3 12 3-9 2 5 2-2h4',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z',
  sliders: 'M5 21v-7M5 10V3M12 21v-9M12 8V3M19 21v-5M19 12V3M2 14h6M9 8h6M16 16h6',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.3l2-1.5-2-3.4-2.3 1a7 7 0 00-2.3-1.3L14 3h-4l-.3 2.5a7 7 0 00-2.3 1.3l-2.3-1-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .9.1 1.3l-2 1.5 2 3.4 2.3-1a7 7 0 002.3 1.3L10 21h4l.3-2.5a7 7 0 002.3-1.3l2.3 1 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z',
  guitar: 'M14 4l6 6-2 2-2-1-4 4a4 4 0 11-5-5l4-4-1-2 2-2z',
  chev: 'M9 6l6 6-6 6', play: 'M7 4l13 8-13 8z', pause: 'M7 4h3v16H7zM14 4h3v16h-3z', stop: 'M6 6h12v12H6z',
  restart: 'M4 4v6h6M4.5 15a8 8 0 101.9-8.3L4 10', repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3',
  heart: 'M12 21s-8-5.2-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.8-8 11-8 11z', search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.3-4.3',
  bluetooth: 'M7 7l10 10-5 4V3l5 4L7 17', plus: 'M12 5v14M5 12h14', check: 'M5 12l5 5L20 7', x: 'M6 6l12 12M18 6L6 18',
  up: 'M12 19V5M5 12l7-7 7 7', down: 'M12 5v14M5 12l7 7 7-7', metronome: 'M8 21h8l-2-17h-4zM12 14l5-7M7 21h10',
  upload: 'M12 16V4M6 10l6-6 6 6M4 20h16', volume: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6', tune: 'M12 3v18M7 8l5-5 5 5M7 16l5 5 5-5', star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z',
  target: 'M12 12m-9 0a9 9 0 1018 0a9 9 0 10-18 0M12 12m-5 0a5 5 0 1010 0a5 5 0 10-10 0M12 12m-1 0a1 1 0 102 0a1 1 0 10-2 0',
  clock: 'M12 12m-9 0a9 9 0 1018 0a9 9 0 10-18 0M12 7v5l3 2', flag: 'M5 21V4h12l-2 4 2 4H5',
};
export const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[n] || P.chev}"/></svg>`;
export const paintIcons = (root = document) => $$('i[data-icon]', root).forEach((el) => { el.innerHTML = icon(el.dataset.icon); });

export function toast(msg, ms = 3600) {
  const box = $('#toasts'); if (!box) return;
  const el = h('div', { class: 'toast', role: 'status' }, msg);
  box.append(el); setTimeout(() => el.remove(), ms);
}

export const fmtTime = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
