// Registro de telas. Cada tela é carregada isoladamente: se uma falhar, o app continua e a tela mostra o erro.
// Para adicionar uma tela: crie js/views/<id>.js (export default {id,title,icon,order,mount}) e liste aqui.
const MANIFEST = [
  { id: 'home', title: 'Início', icon: 'home', order: 10 },
  { id: 'train', title: 'Treinar', icon: 'train', order: 20 },
  { id: 'chords', title: 'Acordes', icon: 'chord', order: 30 },
  { id: 'rhythm', title: 'Ritmo', icon: 'wave', order: 40 },
  { id: 'songs', title: 'Músicas', icon: 'music', order: 50 },
  { id: 'progress', title: 'Progresso', icon: 'chart', order: 70 },
  { id: 'lab', title: 'Laboratório', icon: 'flask', order: 90, group: 'foot' },
];

export async function loadViews() {
  return Promise.all(MANIFEST.map(async (m) => {
    try { return { ...m, ...(await import(`./${m.id}.js`)).default }; }
    catch (e) {
      console.error(`[corda] tela "${m.id}" falhou ao carregar`, e);
      return { ...m, mount(el) { el.innerHTML = `<div class="page"><div class="empty"><b>Não foi possível abrir "${m.title}"</b><span>${String(e.message).replace(/</g, '&lt;')}</span></div></div>`; } };
    }
  }));
}
