// Cadeia de efeitos (Web Audio). Funciona em AudioContext e OfflineAudioContext.
// vozes -> input -> corpo -> captador -> compressor -> drive/cabine -> EQ -> chorus -> delay -> reverb -> output
import { driveCurve, reverbIR } from './dsp.js';
import { mapParams } from './presets.js';

export function createChain(ctx, preset, tempo = 100) {
  const bq = (type, f = 1000, g = 0, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.gain.value = g; n.Q.value = q; return n; };
  const gain = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const chainNodes = (...n) => { n.reduce((a, b) => (a.connect(b), b)); return n; };

  const input = gain(1), output = gain(1);
  // corpo (ressonância da caixa) e captador
  const bodyLow = bq('peaking', 110, 0, 4), bodyMid = bq('peaking', 220, 0, 3);
  const pickPeak = bq('peaking', 2800, 0, 1.2), pickLP = bq('lowpass', 9000, 0, 0.7);
  const comp = ctx.createDynamicsCompressor(); comp.knee.value = 12; comp.attack.value = 0.005; comp.release.value = 0.2;
  const makeup = gain(1);
  // drive
  const dSplit = gain(1), dDry = gain(1), dSum = gain(1);
  const preHP = bq('highpass', 120), preGain = gain(1), shaper = ctx.createWaveShaper(); shaper.oversample = '4x';
  const postLP = bq('lowpass', 5000), cabHP = bq('highpass', 20), cabLP = bq('lowpass', 20000), cabPeak = bq('peaking', 2200, 0, 0.9), dWet = gain(0);
  // EQ
  const eqLow = bq('lowshelf', 120), eqMid = bq('peaking', 800, 0, 0.9), eqHigh = bq('highshelf', 3500), eqPres = bq('peaking', 4800, 0, 1);
  // chorus
  const cSplit = gain(1), cDry = gain(1), cSum = gain(1), cDelay = ctx.createDelay(0.1), cWet = gain(0), lfo = ctx.createOscillator(), lfoDepth = gain(0);
  cDelay.delayTime.value = 0.018; lfo.type = 'sine'; lfo.frequency.value = 0.8; lfo.connect(lfoDepth).connect(cDelay.delayTime); lfo.start();
  // delay
  const yIn = gain(1), yDry = gain(1), ySum = gain(1), yNode = ctx.createDelay(2), yFb = gain(0.3), yLP = bq('lowpass', 3800), yWet = gain(0);
  // reverb
  const rIn = gain(1), rDry = gain(1), conv = ctx.createConvolver(), rWet = gain(0);
  let irKey = '';

  chainNodes(input, bodyLow, bodyMid, pickPeak, pickLP, comp, makeup, dSplit);
  dSplit.connect(dDry).connect(dSum);
  chainNodes(dSplit, preHP, preGain, shaper, postLP, cabHP, cabLP, cabPeak, dWet); dWet.connect(dSum);
  chainNodes(dSum, eqLow, eqMid, eqHigh, eqPres, cSplit);
  cSplit.connect(cDry).connect(cSum); cSplit.connect(cDelay); cDelay.connect(cWet).connect(cSum);
  cSum.connect(yIn); yIn.connect(yDry).connect(ySum); yIn.connect(yNode); yNode.connect(yLP).connect(yFb).connect(yNode); yNode.connect(yWet).connect(ySum);
  ySum.connect(rIn); rIn.connect(rDry).connect(output); rIn.connect(conv); conv.connect(rWet).connect(output);

  const set = (param, v, tc = 0.015) => { if (ctx.currentTime > 0) param.setTargetAtTime(v, ctx.currentTime, tc); else param.value = v; };
  let curveKey = '';

  function update(p, bpm = tempo) {
    tempo = bpm;
    const m = mapParams(p, bpm);
    set(bodyLow.frequency, m.body.lowHz); set(bodyLow.gain, m.body.lowGain); set(bodyMid.frequency, m.body.midHz); set(bodyMid.gain, m.body.midGain);
    set(pickPeak.gain, m.pickup.gain); set(pickLP.frequency, m.pickup.lowpassHz);
    set(comp.threshold, m.comp.threshold); set(comp.ratio, m.comp.ratio); set(makeup.gain, m.comp.makeup);
    const ck = `${p.drive.mode}:${p.drive.amount.toFixed(3)}`;
    if (ck !== curveKey) { curveKey = ck; shaper.curve = p.drive.mode === 'off' ? null : driveCurve(p.drive.amount, p.drive.mode); }
    set(dDry.gain, m.drive.dry, 0.01); set(dWet.gain, m.drive.wet * m.drive.level, 0.01);
    set(preHP.frequency, m.drive.preHz); set(preGain.gain, m.drive.preGain); set(postLP.frequency, m.drive.postHz);
    set(cabHP.frequency, m.drive.cab.hp); set(cabLP.frequency, m.drive.cab.lp); set(cabPeak.gain, m.drive.cab.peakGain);
    set(eqLow.gain, m.eq.low); set(eqMid.gain, m.eq.mid); set(eqHigh.gain, m.eq.high); set(eqPres.gain, m.eq.presence);
    set(cDry.gain, m.chorus.dry); set(cWet.gain, m.chorus.wet); set(lfo.frequency, m.chorus.rate); set(lfoDepth.gain, m.chorus.depth);
    set(yNode.delayTime, m.delay.time, 0.03); set(yFb.gain, m.delay.feedback); set(yWet.gain, m.delay.wet); set(yLP.frequency, m.delay.dampHz);
    set(rDry.gain, m.reverb.dry); set(rWet.gain, m.reverb.wet);
    const rk = `${m.reverb.seconds.toFixed(2)}:${m.reverb.damp.toFixed(2)}`;
    if (rk !== irKey) {
      irKey = rk;
      const [L, R] = reverbIR(ctx.sampleRate, m.reverb.seconds, m.reverb.damp);
      const b = ctx.createBuffer(2, L.length, ctx.sampleRate); b.getChannelData(0).set(L); b.getChannelData(1).set(R); conv.buffer = b;
    }
    set(output.gain, m.out);
  }
  update(preset, tempo);
  const dispose = () => { try { lfo.stop(); } catch { /* já parado */ } input.disconnect(); output.disconnect(); };
  return { input, output, update, dispose, nodes: { comp, shaper, conv, lfo } };
}
