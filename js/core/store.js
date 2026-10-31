// Persistência local versionada (localStorage). Caminhos com ponto: store.get('settings.latency').
const KEY = 'corda.v2', OLD_KEY = 'corda.v1';

const DEFAULTS = {
  settings: { latency: 80, rigor: 'normal', flats: false, synth: false, auto: true, pitchOffset: 0, stageScale: 150, stageFrets: 22, pressMs: 1500, sustainMs: 2500, capo: 0, instrument: 'guitar', volume: 0.8 },
  chords: {},        // id -> { ok, tries, streak }
  sessions: [],      // histórico de exercícios (ver docs/ARCHITECTURE.md)
  days: [],          // dias com prática (YYYY-MM-DD)
  goals: { dailyMinutes: 15, weeklySessions: 5 },
  favorites: { exercises: [], chords: [], songs: [], tones: [] },
  tones: { presets: [], current: null },
  songs: {},         // metadados leves; arquivos de áudio ficam no IndexedDB
  paths: {},         // progresso nas trilhas
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const merge = (base, over) => {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over ?? base;
  const out = { ...base };
  for (const k of Object.keys(over || {})) out[k] = k in base ? merge(base[k], over[k]) : over[k];
  return out;
};

export class Store extends EventTarget {
  constructor(storage = globalThis.localStorage) {
    super();
    this.storage = storage;
    this.data = clone(DEFAULTS);
    this.timer = null;
    this.load();
  }

  load() {
    try {
      const raw = this.storage?.getItem(KEY);
      if (raw) this.data = merge(clone(DEFAULTS), JSON.parse(raw));
      else if (this.storage?.getItem(OLD_KEY)) this.migrateV1(JSON.parse(this.storage.getItem(OLD_KEY)));
    } catch { this.data = clone(DEFAULTS); }
  }

  migrateV1(v1) {
    this.data = merge(clone(DEFAULTS), { settings: v1.settings, chords: v1.chords, sessions: v1.sessions, days: v1.days });
    this.flush();
  }

  get(path, fallback) {
    let cur = this.data;
    for (const k of path.split('.')) { if (cur == null) return fallback; cur = cur[k]; }
    return cur === undefined ? fallback : cur;
  }

  set(path, value) {
    const keys = path.split('.'), last = keys.pop();
    let cur = this.data;
    for (const k of keys) cur = cur[k] ??= {};
    cur[last] = value;
    this.changed(path);
  }

  update(path, fn, fallback) { this.set(path, fn(this.get(path, fallback))); }

  changed(path) {
    this.dispatchEvent(new CustomEvent('change', { detail: { path } }));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 250);
  }

  flush() { try { this.storage?.setItem(KEY, JSON.stringify(this.data)); } catch { /* cota cheia */ } }
  reset(keep = ['settings']) { const k = Object.fromEntries(keep.map((x) => [x, this.data[x]])); this.data = merge(clone(DEFAULTS), k); this.flush(); this.changed('*'); }

  // ---- helpers de uso comum ----
  dayKey(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  today() { return this.dayKey(); }
  markDay() { if (!this.data.days.includes(this.today())) { this.data.days.push(this.today()); this.changed('days'); } }
  streak() {
    let n = 0; const d = new Date();
    for (;;) {
      const k = this.dayKey(d);
      if (this.data.days.includes(k)) { n++; d.setDate(d.getDate() - 1); }
      else if (n === 0 && k === this.today()) d.setDate(d.getDate() - 1);
      else break;
    }
    return n;
  }
}
