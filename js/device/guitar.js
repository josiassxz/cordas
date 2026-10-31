// Conexão BLE MIDI com a Aeroband, parser de pacotes e detecção de palhetadas.
// SEGURANÇA: este módulo é SOMENTE LEITURA. Nunca chama writeValue*/SysEx. A única escrita é o
// startNotifications() padrão do navegador (habilita notificações). Há um teste que garante isso.
import { detectChord } from '../music/theory.js';

export const MIDI_SERVICE = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
export const MIDI_CHAR = '7772e5db-3868-4112-a1a9-f2669d106bf3';
const STRUM_GAP_MS = 140; // silêncio que encerra uma palhetada

// Pacote BLE MIDI: [header, (timestamp, status, dados...)*]. Timestamps e status têm o bit 7 ligado;
// um byte >=0x80 seguido de outro >=0x80 é timestamp.
export function parseBleMidi(bytes) {
  const out = [];
  let status = 0, data = [];
  const flush = () => {
    if (!status) return;
    const type = status & 0xf0, ch = status & 0x0f;
    if (type === 0x90 && data.length >= 2) out.push({ type: data[1] ? 'noteon' : 'noteoff', ch, a: data[0], b: data[1] });
    else if (type === 0x80 && data.length >= 2) out.push({ type: 'noteoff', ch, a: data[0], b: data[1] });
    else if (type === 0xb0 && data.length >= 2) out.push({ type: 'cc', ch, a: data[0], b: data[1] });
    status = 0; data = [];
  };
  for (let i = 1; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 0x80) {
      if (i + 1 < bytes.length && bytes[i + 1] >= 0x80) continue; // timestamp
      flush();
      status = b;
    } else if (status) {
      data.push(b);
      const need = (status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0 || status === 0xf3 ? 1 : 2;
      if (data.length === need) { const s = status; flush(); status = (s & 0xf0) < 0xf0 ? s : 0; } // running status
    }
  }
  flush();
  return out;
}

export class Guitar extends EventTarget {
  constructor() {
    super();
    this.status = 'idle'; // idle | connecting | connected | demo
    this.deviceName = '';
    this.active = new Map(); // corda -> nota
    this.cluster = null;
    this.timer = null;
    this.device = null;
    this.sustainMs = 2500;   // a AG01 não manda note-off; a vibração é estimada por este tempo
    this.decay = new Map();  // corda -> timeout do fim estimado da vibração
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  setStatus(s, name = this.deviceName) { this.status = s; this.deviceName = name; this.emit('status', { status: s, name }); }
  get supported() { return !!navigator.bluetooth; }

  async connect() {
    if (!this.supported) throw new Error('Este navegador não suporta Web Bluetooth. Abra no Google Chrome.');
    this.setStatus('connecting');
    try {
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [MIDI_SERVICE] }] });
      this.device = device;
      device.addEventListener('gattserverdisconnected', () => { if (this.status !== 'idle') this.onDrop(); });
      await this.openChannel();
      this.setStatus('connected', device.name || 'Aeroband');
    } catch (e) {
      this.setStatus('idle', '');
      throw e;
    }
  }

  async openChannel() {
    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService(MIDI_SERVICE);
    const chr = await service.getCharacteristic(MIDI_CHAR);
    chr.addEventListener('characteristicvaluechanged', (ev) => {
      const dv = ev.target.value;
      const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      const t = performance.now();
      this.emit('raw', { t, hex: [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ') });
      for (const m of parseBleMidi(bytes)) this.handle(m, t);
    });
    await chr.startNotifications();
  }

  async onDrop() {
    this.releaseAll();
    this.setStatus('connecting');
    for (let i = 0; i < 3 && this.device; i++) {
      try { await this.openChannel(); this.setStatus('connected', this.device.name); return; } catch { await new Promise((r) => setTimeout(r, 1200)); }
    }
    this.setStatus('idle', '');
  }

  disconnect() {
    const d = this.device; this.device = null;
    this.releaseAll();
    this.setStatus('idle', '');
    if (d?.gatt?.connected) d.gatt.disconnect();
  }

  releaseAll() { this.decay.forEach(clearTimeout); this.decay.clear(); this.active.clear(); this.emit('notes', { active: new Map(this.active) }); }

  handle(m, t) {
    if (m.ch > 5 && m.type !== 'cc') return;
    if (m.type === 'noteon') {
      this.active.set(m.ch, m.a);
      this.armDecay(m.ch, m.a);
      this.addToCluster(m.ch, m.a, m.b, t);
      this.emit('noteon', { string: m.ch, note: m.a, vel: m.b, t });
    } else if (m.type === 'noteoff') {
      if (this.active.get(m.ch) === m.a || (m.a === 0 && this.active.has(m.ch))) { this.active.delete(m.ch); this.clearDecay(m.ch); }
      this.emit('noteoff', { string: m.ch, note: m.a, t });
    } else if (m.type === 'cc' && m.a === 123) {
      this.active.delete(m.ch); this.clearDecay(m.ch);
    }
    if (m.type === 'cc') this.emit('cc', { string: m.ch, controller: m.a, value: m.b, t });
    this.emit('notes', { active: new Map(this.active) });
  }

  clearDecay(ch) { clearTimeout(this.decay.get(ch)); this.decay.delete(ch); }
  // Sem note-off do aparelho, a corda é dada como parada após sustainMs (estimativa; 0 = só palm mute).
  armDecay(ch, note) {
    this.clearDecay(ch);
    if (!this.sustainMs) return;
    this.decay.set(ch, setTimeout(() => {
      this.decay.delete(ch);
      if (this.active.get(ch) !== note) return;
      this.active.delete(ch);
      this.emit('noteoff', { string: ch, note, t: performance.now(), estimated: true });
      this.emit('notes', { active: new Map(this.active) });
    }, this.sustainMs));
  }

  addToCluster(string, note, vel, t) {
    if (!this.cluster) {
      this.cluster = { t, notes: [], firstString: string };
      this.emit('strumstart', { t });
    }
    this.cluster.notes.push({ string, note, vel });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.endCluster(), STRUM_GAP_MS);
  }

  endCluster() {
    const c = this.cluster; this.cluster = null;
    if (!c) return;
    const notes = c.notes.map((n) => n.note);
    const dir = c.notes.length < 2 ? 'S' : (c.notes[0].string <= c.notes[c.notes.length - 1].string ? 'D' : 'U');
    this.emit('strum', { t: c.t, notes, dir, count: notes.length, chord: detectChord(notes) });
  }

  // ---- Demo: simula palhetadas sem guitarra ----
  startDemo() { this.setStatus('demo', 'Modo demo'); }
  // notesByString: array de 6 posições (nota MIDI ou null)
  simulateStrum(notesByString, dir = 'D', spread = 24) {
    const order = notesByString.map((n, s) => [s, n]).filter(([, n]) => n != null);
    if (dir === 'U') order.reverse();
    order.forEach(([s, n], i) => {
      setTimeout(() => this.handle({ type: 'noteon', ch: s, a: n, b: 40 }, performance.now()), i * spread);
      setTimeout(() => this.handle({ type: 'noteoff', ch: s, a: n, b: 1 }, performance.now()), 900 + i * spread);
    });
  }
}
