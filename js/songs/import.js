// Fluxo de importação: valida -> decodifica -> picos -> grava. `decode` é injetado (Web Audio no navegador; decodeWav nos testes).
import { checkFile, DECODE_ERROR } from './library.js';
import { toMono, peaks } from './dsp.js';

export async function importSong(file, { library, decode }) {
  const chk = checkFile(file);
  if (!chk.ok) throw new Error(chk.reason);
  let dec;
  try { dec = await decode(await file.arrayBuffer()); } catch { throw new Error(DECODE_ERROR); }
  if (!dec || !dec.channels?.length || !dec.duration) throw new Error(DECODE_ERROR);
  const mono = toMono(dec.channels);
  const meta = await library.add({ blob: file, name: file.name, type: file.type, duration: dec.duration, peaks: peaks(mono, 900) });
  return { meta, mono, sampleRate: dec.sampleRate };
}

// Navegador: decodifica via Web Audio e devolve canais Float32 (o AudioBuffer em si não é transferível).
export async function decodeWithWebAudio(ctx, arrayBuffer) {
  const buf = await ctx.decodeAudioData(arrayBuffer.slice(0));
  return { channels: Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i)), sampleRate: buf.sampleRate, duration: buf.duration };
}
