// Armazenamento do ÁUDIO: IndexedDB (blobs grandes não cabem no localStorage). Interface mínima, com versão em memória p/ testes.
const DB = 'corda-songs', STORE = 'audio';

export function idbAudioDb() {
  let dbp;
  const open = () => dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(STORE, mode), q = fn(t.objectStore(STORE)); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
  return { put: (rec) => tx('readwrite', (s) => s.put(rec)), get: (id) => tx('readonly', (s) => s.get(id)), del: (id) => tx('readwrite', (s) => s.delete(id)) };
}
export function memoryAudioDb() {
  const m = new Map();
  return { put: async (r) => { m.set(r.id, r); }, get: async (id) => m.get(id), del: async (id) => { m.delete(id); }, size: () => m.size };
}
