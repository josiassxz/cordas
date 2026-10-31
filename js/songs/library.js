// Biblioteca de músicas: metadados no Store (songs.<id>), áudio no IndexedDB, favoritos em favorites.songs.
export const EXTENSIONS = ['mp3', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac', 'webm'];
const DRM = ['m4p', 'aax', 'drm'];
export const ACCEPT = EXTENSIONS.map((e) => '.' + e).join(',') + ',audio/*';

export const extOf = (name = '') => (name.split('.').pop() || '').toLowerCase();
export function checkFile(file) {
  const ext = extOf(file.name);
  if (DRM.includes(ext)) return { ok: false, reason: 'Este arquivo parece protegido por DRM (.' + ext + '). O Corda não contorna proteções: use uma versão sem DRM que você tenha adquirido legalmente.' };
  if (!EXTENSIONS.includes(ext) && !(file.type || '').startsWith('audio/')) return { ok: false, reason: `Formato .${ext || '?'} não é de áudio suportado. Use ${EXTENSIONS.slice(0, 6).join(', ')}…` };
  return { ok: true };
}
export function parseTitle(filename) {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(base);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: base };
}
export const DECODE_ERROR = 'Não consegui decodificar este áudio. Pode estar corrompido, em formato que o navegador não lê, ou protegido por DRM (que o Corda não contorna).';

export class Library {
  constructor(store, audioDb) { this.store = store; this.db = audioDb; }
  get all() { return Object.values(this.store.get('songs', {})).filter((s) => s && s.id); }
  get(id) { return this.store.get('songs.' + id, null); }
  isFav(id) { return this.store.get('favorites.songs', []).includes(id); }
  toggleFav(id) { this.store.update('favorites.songs', (a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]), []); return this.isFav(id); }
  allTags() { return [...new Set(this.all.flatMap((s) => s.tags || []))].sort(); }

  list({ query = '', sort = 'recent', tag = '', favOnly = false } = {}) {
    const q = query.trim().toLowerCase();
    let l = this.all.filter((s) => (!q || `${s.title} ${s.artist} ${(s.tags || []).join(' ')}`.toLowerCase().includes(q)) && (!tag || (s.tags || []).includes(tag)) && (!favOnly || this.isFav(s.id)));
    const by = { recent: (a, b) => b.added - a.added, title: (a, b) => a.title.localeCompare(b.title, 'pt'), artist: (a, b) => (a.artist || '~').localeCompare(b.artist || '~', 'pt'), bpm: (a, b) => (a.bpm?.value || 0) - (b.bpm?.value || 0), played: (a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) };
    return l.sort(by[sort] || by.recent);
  }

  async add({ blob, name, type, duration, peaks, title, artist }) {
    const id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const t = parseTitle(name);
    await this.db.put({ id, blob, type, name, peaks: Array.from(peaks || []) });
    const meta = { id, title: title || t.title, artist: artist ?? t.artist, tags: [], duration, size: blob.size, added: Date.now(), bpm: null, key: null, chords: [], markers: [], loop: null, analyzed: false };
    this.store.set('songs.' + id, meta);
    return meta;
  }
  update(id, patch) { const m = this.get(id); if (!m) throw new Error('Música não encontrada.'); const n = { ...m, ...patch }; this.store.set('songs.' + id, n); return n; }
  setTags(id, tags) { return this.update(id, { tags: [...new Set(tags.map((t) => t.trim()).filter(Boolean))] }); }
  async audio(id) { return this.db.get(id); }
  async remove(id) {
    await this.db.del(id);
    const all = { ...this.store.get('songs', {}) }; delete all[id]; this.store.set('songs', all);
    this.store.update('favorites.songs', (a) => a.filter((x) => x !== id), []);
  }
}
