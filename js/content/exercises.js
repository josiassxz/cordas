// Biblioteca de exercícios nomeados. Cada um = metadados + Score. Gerada por fórmulas (techniques.js), não à mão.
import { strumScore, noteSeq, arpScore, arpSequence, scaleNotes, sequenceOf, changeScore, techniqueScore, mutedScore, SCALES } from './techniques.js';
import { STRUM_PATTERNS, patternById, PROGRESSIONS } from './patterns.js';
import { normalizeScore } from '../engine/score.js';

export const TECHNIQUES = [
  { id: 'strumming', name: 'Palhetada em acordes', icon: 'wave', blurb: 'Para baixo, para cima, alternada e padrões rítmicos com acordes.' },
  { id: 'picking', name: 'Palhetada em cordas', icon: 'target', blurb: 'Precisão e sincronização em cordas individuais.' },
  { id: 'chord-change', name: 'Troca de acordes', icon: 'chord', blurb: 'Mudar de posição sem perder o tempo.' },
  { id: 'arpeggio', name: 'Arpejos', icon: 'music', blurb: 'Cordas do acorde, uma a uma, na ordem certa.' },
  { id: 'fingerpicking', name: 'Fingerpicking', icon: 'guitar', blurb: 'PIMA, polegar alternado, acompanhamentos e melodias com baixo.' },
  { id: 'scale', name: 'Escalas', icon: 'chart', blurb: 'Pentatônicas, maior, menor e blues, em posições.' },
  { id: 'melody', name: 'Melodias e sequências', icon: 'music', blurb: 'Sequências melódicas e trechos de melodia.' },
  { id: 'speed', name: 'Velocidade', icon: 'up', blurb: 'O BPM sobe a cada volta, até o limite.' },
  { id: 'rhythm', name: 'Precisão rítmica', icon: 'metronome', blurb: 'Síncopes, pausas e contratempos.' },
  { id: 'technique', name: 'Técnicas expressivas', icon: 'sliders', blurb: 'Hammer-on, pull-off, slide, bend, vibrato, palm mute e abafados.' },
];
export const LEVELS = ['Iniciante', 'Básico', 'Intermediário', 'Avançado', 'Expert'];

const LIMIT = 'A AG01 não envia eventos próprios dessa técnica (só a nota tocada). O app avalia a corda, a nota e o tempo da palhetada; o gesto em si aparece como guia e não é pontuado. Reconhecê-lo exigiria análise de áudio.';
const DIGITS_NOTE = 'Os dedos da mão direita (p i m a) são só indicação pedagógica: o aparelho não detecta qual dedo tocou.';
const PICK_NOTE = 'A direção da palheta em notas únicas é só guia: o aparelho não a informa (em palhetadas de acorde ela é inferida pela ordem das cordas).';

export const EXERCISES = [];
function add(meta, score) {
  const s = normalizeScore({ ...score, id: meta.id, title: meta.title, level: meta.level });
  const usesDigits = s.events.some((e) => e.notes?.some((n) => n.digit));
  const usesPick = s.events.some((e) => e.pick);
  const hasGuide = s.events.some((e) => e.guide);
  const notes = [meta.limitation, usesDigits && DIGITS_NOTE, usesPick && PICK_NOTE, hasGuide && !meta.limitation && LIMIT].filter(Boolean);
  EXERCISES.push({ tags: [], tip: '', ...meta, mode: s.mode, bpm: s.bpm, guide: usesDigits || usesPick || hasGuide, limitations: notes, bars: s.lengthBeats / s.beatsPerBar, score: s });
}
const T = (t, l, extra = {}) => ({ technique: t, level: l, ...extra });

// ---------- palhetada em acordes ----------
add({ id: 'strum-down-em', title: 'Só para baixo: Em', ...T('strumming', 1), tags: ['iniciante', 'down'], description: 'Uma palhetada para baixo a cada duas colcheias, no acorde Em.', tip: 'Movimento solto do pulso; a palheta passa por todas as cordas.' }, strumScore({ chords: ['Em'], slots: 'D-D-D-D-', bars: 4, bpm: 70, level: 1 }));
add({ id: 'strum-up-em', title: 'Só para cima: contratempo', ...T('strumming', 2), tags: ['up', 'contratempo'], description: 'Palhetadas para cima nas "e" da contagem, com Em.', tip: 'Conte "1 e 2 e…" e toque só nos "e". A direção é inferida pela ordem das cordas.' }, strumScore({ chords: ['Em'], slots: '-U-U-U-U', bars: 4, bpm: 70, level: 2 }));
add({ id: 'strum-alt-em', title: 'Alternada contínua (↓↑)', ...T('strumming', 2), tags: ['alternada'], description: 'Baixo e cima sem parar, em colcheias.', tip: 'A mão nunca para: nas pausas ela só "erra" a corda. Comece devagar.' }, strumScore({ chords: ['Em'], slots: 'DUDUDUDU', bars: 4, bpm: 70, level: 2 }));
add({ id: 'strum-sync-quarters', title: 'Sincronização: no tempo do metrônomo', ...T('strumming', 1), tags: ['precisão'], description: 'Uma palhetada exata em cada batida. Veja o quanto você adianta ou atrasa.', tip: 'Ouça o clique e deixe a palhetada "cair" junto com ele.' }, strumScore({ chords: ['Am'], slots: 'D-D-D-D-', bars: 8, bpm: 60, level: 1, dirCheck: false }));
const STRUM_SETS = [['pop', 'gdem', 80, 2], ['ballad', 'amfcg', 72, 2], ['rock', 'ada', 96, 2], ['eighths', 'cgamf', 84, 3], ['reggae', 'emcgd', 76, 3], ['folk', 'gdem', 88, 3], ['gallop', 'dgad', 90, 3], ['pop', 'amg', 80, 3]];
for (const [pid, gid, bpm, lvl] of STRUM_SETS) {
  const pat = patternById(pid), pr = PROGRESSIONS.find((p) => p.id === gid);
  add({ id: `strum-${pid}-${gid}`, title: `${pat.name} · ${pr.name}`, ...T('strumming', lvl), tags: ['acordes', pid], description: `Padrão "${pat.name}" sobre ${pr.chords.join(' – ')}. ${pr.desc}.`, tip: 'Os acordes mudam a cada compasso: prepare a próxima forma na última colcheia.' },
    strumScore({ chords: pr.chords, slots: pat.slots, bars: 8, bpm, level: lvl }));
}

// ---------- palhetada em cordas ----------
const OPEN = (s) => ({ string: s, fret: 0 });
add({ id: 'pick-open-up', title: 'Cordas soltas: do grave ao agudo', ...T('picking', 1), tags: ['cordas', 'soltas'], description: 'Uma corda por batida, da 6ª à 1ª e de volta.', tip: 'Olhe o braço: a corda que acende é a próxima.' }, noteSeq({ technique: 'picking', notes: [0, 1, 2, 3, 4, 5, 4, 3, 2, 1].map(OPEN), step: 1, bpm: 60, level: 1 }));
for (const [name, s, l] of [['grave (6ª)', 0, 2], ['do meio (3ª)', 2, 2], ['aguda (1ª)', 5, 2]]) {
  const alt = Array.from({ length: 16 }, (_, i) => ({ string: s, fret: 0, pick: i % 2 ? 'U' : 'D' }));
  add({ id: `pick-alt-${s}`, title: `Alternada na corda ${name}`, ...T('picking', l), tags: ['alternada', 'corda única'], description: 'Colcheias alternando ↓↑ numa só corda solta.', tip: 'Pulso relaxado, movimento pequeno.' }, noteSeq({ technique: 'picking', notes: alt, step: 0.5, bpm: 70, level: l }));
}
add({ id: 'pick-skip', title: 'Pulando cordas', ...T('picking', 3), tags: ['precisão'], description: 'Saltos entre cordas não vizinhas: 6-4-5-3-4-2-3-1.', tip: 'Acerte a corda antes de acelerar.' }, noteSeq({ technique: 'picking', notes: [0, 2, 1, 3, 2, 4, 3, 5, 5, 3, 4, 2, 3, 1, 2, 0].map(OPEN), step: 0.5, bpm: 60, level: 3 }));
add({ id: 'pick-string-cross', title: 'Cruzando cordas: 2-3-2-3', ...T('picking', 2), tags: ['precisão'], description: 'Alterna entre a 3ª e a 4ª corda soltas.', tip: 'Mantenha a palheta curta: só o necessário para alcançar a outra corda.' }, noteSeq({ technique: 'picking', notes: Array.from({ length: 16 }, (_, i) => ({ string: i % 2 ? 3 : 2, fret: 0, pick: i % 2 ? 'U' : 'D' })), step: 0.5, bpm: 70, level: 2 }));

// ---------- troca de acordes ----------
const PAIRS = [['Em', 'Am', 1], ['G', 'C', 2], ['D', 'A', 2], ['E', 'A', 1], ['C', 'Am', 2], ['G', 'Em', 1], ['D', 'G', 2], ['Am', 'Dm', 2]];
for (const [a, b, l] of PAIRS) {
  add({ id: `chg-${a}-${b}-wait`, title: `${a} ⇄ ${b} · devagar`, ...T('chord-change', l), tags: ['esperar', a, b], description: `Monte ${a} e ${b} alternando, com a linha do tempo andando em BPM baixo: acerte o acorde em qualquer momento do trecho, sem exigir a batida exata.`, tip: 'Mova todos os dedos juntos e confira o diagrama antes de palhetar.' }, changeScore({ chords: [a, b], bpm: 60, level: l, mode: 'wait', cycles: 4 }));
  add({ id: `chg-${a}-${b}`, title: `${a} ⇄ ${b} · no tempo`, ...T('chord-change', l + 1 > 5 ? 5 : l + 1), tags: ['tempo', a, b], description: `Troca de ${a} para ${b} a cada compasso, no metrônomo.`, tip: 'Aumente o BPM só depois de 90% de acerto.' }, changeScore({ chords: [a, b], bpm: 70, level: l + 1, cycles: 4 }));
}
add({ id: 'chg-fast-pairs', title: 'Trocas rápidas: Em ⇄ Am a cada 2 batidas', ...T('chord-change', 3), tags: ['rápido'], description: 'Duas trocas por compasso.', tip: 'Dedos "âncora": o 2º dedo de Em e Am fica quase no mesmo lugar.' }, changeScore({ chords: ['Em', 'Am'], strumsPerBar: 2, bpm: 60, level: 3, cycles: 8 }));
add({ id: 'chg-four', title: 'Quatro acordes: G – D – Em – C', ...T('chord-change', 3), tags: ['progressão'], description: 'O ciclo mais usado do pop, uma troca por compasso.', tip: 'Olhe o braço, não a mão direita.' }, changeScore({ chords: ['G', 'D', 'Em', 'C'], bpm: 70, level: 3, cycles: 3 }));

// ---------- arpejos ----------
const ARPS = [['Am', 'asc', 'ascendente', 1], ['Am', 'desc', 'descendente', 1], ['C', 'updown', 'sobe e desce', 2], ['Em', 'pima', 'p-i-m-a', 2], ['G', 'alt', 'baixo alternado', 3], ['D', 'asc', 'ascendente', 1], ['E7', 'updown', 'sobe e desce', 3], ['Am', 'pinch', 'com beliscão', 3]];
for (const [c, p, nome, l] of ARPS) {
  if (c === 'E7') continue;
  add({ id: `arp-${c}-${p}`, title: `Arpejo ${nome} · ${c}`, ...T('arpeggio', l), tags: [c, p], description: `Toque as cordas de ${c} uma por vez, em colcheias, no padrão "${nome}".`, tip: 'O braço mostra a corda que vem a seguir; deixe as notas soarem juntas.' }, arpScore({ chords: [c], pattern: p, bars: 4, bpm: 70, level: l }));
}
add({ id: 'arp-progression', title: 'Arpejo sobre Am – C – G – Em', ...T('arpeggio', 3), tags: ['progressão'], description: 'Troca de acorde a cada compasso, mantendo o padrão.', tip: 'A nota mais grave marca o acorde: toque-a com firmeza.' }, arpScore({ chords: ['Am', 'C', 'G', 'Em'], pattern: 'alt', bars: 8, bpm: 72, level: 3 }));
add({ id: 'arp-pachelbel-ish', title: 'Arpejo sobre G – D – Em – C', ...T('arpeggio', 3), tags: ['progressão', 'pop'], description: 'Arpejo ascendente-descendente em quatro acordes.', tip: 'Segure os dedos do acorde enquanto arpeja.' }, arpScore({ chords: ['G', 'D', 'Em', 'C'], pattern: 'updown', bars: 8, bpm: 72, level: 3 }));

// ---------- fingerpicking / fingerstyle ----------
const FP = [['Am', 'pima', 'p-i-m-a', 2, 'Polegar nos graves, indicador/médio/anular nas três agudas.'], ['Em', 'pmi', 'p-m-i-m', 2, 'Alterna médio e indicador entre as notas agudas.'], ['C', 'travis', 'Travis (polegar alternado)', 3, 'O polegar alterna duas cordas graves sem parar; os dedos completam por cima.'], ['G', 'pinch', 'beliscão (pinch)', 3, 'Polegar e anular tocam juntos no início do compasso.']];
for (const [c, p, nome, l, tip] of FP) add({ id: `fp-${c}-${p}`, title: `${nome} · ${c}`, ...T('fingerpicking', l), tags: ['PIMA', c], description: `Padrão ${nome} sobre ${c}.`, tip }, arpScore({ technique: 'fingerpicking', chords: [c], pattern: p, bars: 4, bpm: 64, level: l, withDigits: true }));
add({ id: 'fp-thumb-alt', title: 'Polegar alternado: Am – C – G – Am', ...T('fingerpicking', 3), tags: ['polegar', 'progressão'], description: 'Travis simples trocando de acorde a cada compasso.', tip: 'O polegar nunca para: ele conduz o tempo.' }, arpScore({ technique: 'fingerpicking', chords: ['Am', 'C', 'G', 'Am'], pattern: 'travis', bars: 8, bpm: 64, level: 3, withDigits: true }));
add({ id: 'fp-accomp-folk', title: 'Acompanhamento folk: Em – Am – D – G', ...T('fingerpicking', 3), tags: ['acompanhamento'], description: 'Padrão p-i-m-a-m-i sobre uma progressão folk.', tip: 'Dedos relaxados, unhas ou polpa: o som deve ser uniforme.' }, arpScore({ technique: 'fingerpicking', chords: ['Em', 'Am', 'D', 'G'], pattern: 'pima', bars: 8, bpm: 68, level: 3, withDigits: true }));
// independência progressiva: polegar nas batidas (semínimas) + agudas nos contratempos, cada nível com mais notas
function independence(level, perBar) {
  const ev = [], bass = [{ string: 1, fret: 0 }, { string: 2, fret: 2, finger: 1 }, { string: 1, fret: 0 }, { string: 2, fret: 2, finger: 1 }];
  const treble = [{ string: 3, fret: 2, finger: 2, digit: 'i' }, { string: 4, fret: 1, finger: 1, digit: 'm' }, { string: 5, fret: 0, digit: 'a' }, { string: 4, fret: 1, finger: 1, digit: 'm' }];
  const slots = { 1: [1], 2: [1, 3], 4: [0, 1, 2, 3] }[perBar];
  for (let b = 0; b < 4; b++) {
    bass.forEach((n, k) => ev.push({ beat: b * 4 + k, dur: 1, notes: [{ ...n, digit: 'p' }] }));
    slots.forEach((j, idx) => ev.push({ beat: b * 4 + j + 0.5, dur: 0.5, notes: [{ ...treble[(idx + b) % treble.length] }] }));
  }
  return { technique: 'fingerpicking', level, bpm: 56, lengthBeats: 16, events: ev };
}
[['fp-indep-1', 'Independência 1: polegar + um dedo', 2, 1], ['fp-indep-2', 'Independência 2: polegar + dois dedos', 3, 2], ['fp-indep-3', 'Independência 3: polegar + três dedos', 4, 4]].forEach(([id, t, l, e]) => add({ id, title: t, ...T('fingerpicking', l), tags: ['independência', 'Am'], description: 'O polegar mantém as batidas enquanto os outros dedos entram por cima, cada vez mais.', tip: 'Se o polegar tropeçar, diminua a velocidade (50%).' }, independence(l, e)));
// melodia com baixo: "Ode à alegria" (Beethoven, domínio público) em Sol
const M = (string, fret, finger) => ({ string, fret, ...(finger ? { finger } : {}) });
const ODE = [M(4, 0), M(4, 0), M(4, 1, 1), M(4, 3, 3), M(4, 3, 3), M(4, 1, 1), M(4, 0), M(3, 2, 2), M(3, 0), M(3, 0), M(3, 2, 2), M(4, 0), M(4, 0), M(3, 2, 2), M(3, 2, 2)];
const odeEv = ODE.map((n, i) => ({ beat: i, dur: 1, notes: [n, ...(i % 4 === 0 ? [{ string: i % 8 === 0 ? 0 : 2, fret: i % 8 === 0 ? 3 : 0, digit: 'p' }] : [])] }));
add({ id: 'fp-melody-ode', title: 'Melodia com baixo: Ode à alegria', ...T('fingerpicking', 4), tags: ['melodia', 'domínio público'], description: 'A melodia na corda Si (e Sol) com o baixo do polegar nos tempos fortes.', tip: 'Dois sons no mesmo instante: ensaie o baixo e a melodia separados primeiro.' }, { technique: 'fingerpicking', level: 4, bpm: 60, lengthBeats: 16, events: odeEv });

// ---------- escalas ----------
const SC = [
  ['pent-minor', 9, 5, 'up', 'Pentatônica menor de Lá · posição 1', 1], ['pent-minor', 9, 5, 'down', 'Pentatônica menor de Lá · descendo', 2], ['pent-minor', 9, 5, 'updown', 'Pentatônica menor de Lá · sobe e desce', 2],
  ['pent-minor', 9, 7, 'updown', 'Pentatônica menor de Lá · posição 2', 3], ['pent-minor', 4, 0, 'updown', 'Pentatônica menor de Mi · posição aberta', 1],
  ['pent-major', 7, 2, 'updown', 'Pentatônica maior de Sol', 2], ['pent-major', 0, 7, 'updown', 'Pentatônica maior de Dó · casa 7', 3],
  ['blues', 9, 5, 'updown', 'Escala de blues de Lá', 3], ['major', 0, 0, 'updown', 'Dó maior · posição aberta', 2], ['minor', 9, 0, 'updown', 'Lá menor natural · posição aberta', 2],
  ['major', 7, 2, 'updown', 'Sol maior · posição 2', 3], ['minor', 4, 7, 'updown', 'Mi menor natural · posição 7', 4],
];
SC.forEach(([sc, root, lo, shape, title, l], i) => {
  const notes = sequenceOf(scaleNotes({ root, scale: sc, lo, span: 4 }), shape);
  add({ id: `scale-${i}-${sc}-${root}-${lo}-${shape}`, title, ...T('scale', l), tags: [SCALES[sc].name, `casa ${lo || 'aberta'}`], description: `${SCALES[sc].name} na região das casas ${lo === 0 ? '0–4' : `${lo}–${lo + 3}`}. Dedos: 1 na casa ${lo || 1}.`, tip: 'Um dedo por casa; mantenha-os perto do braço.' }, noteSeq({ technique: 'scale', notes, step: 0.5, bpm: 70, level: l }));
});

// ---------- melodias e sequências ----------
for (const [shape, nome, l] of [['thirds', 'em terças', 3], ['triplets', 'em grupos de 3', 3], ['fours', 'em grupos de 4', 4]]) {
  const sc = scaleNotes({ root: 9, scale: 'pent-minor', lo: 5, span: 4 });
  add({ id: `seq-${shape}`, title: `Sequência ${nome} · pentatônica de Lá`, ...T('melody', l), tags: ['sequência', nome], description: `A pentatônica de Lá menor tocada ${nome}.`, tip: 'Memorize o desenho, não as notas.' }, noteSeq({ technique: 'melody', notes: sequenceOf(sc, shape), step: 0.5, bpm: 70, level: l, repeat: 1 }));
}
add({ id: 'mel-ode-single', title: 'Melodia: Ode à alegria (só a melodia)', ...T('melody', 2), tags: ['melodia', 'domínio público'], description: 'A melodia, nota a nota, na corda Si e Sol.', tip: 'Cante mentalmente enquanto toca.' }, { technique: 'melody', level: 2, bpm: 64, lengthBeats: 16, events: ODE.map((n, i) => ({ beat: i, dur: 1, notes: [n] })) });
add({ id: 'mel-open-lick', title: 'Frase em blues de Lá', ...T('melody', 3), tags: ['blues', 'lick'], description: 'Uma frase curta da escala de blues, com ritmo de colcheias.', tip: 'Dê uma leve acentuação nas notas do tempo.' }, noteSeq({ technique: 'melody', notes: [M(2, 7, 1), M(2, 5, 1), M(3, 7, 3), M(3, 5, 1), M(4, 5, 1), M(4, 8, 4), M(5, 5, 1), M(4, 8, 4)], step: 0.5, bpm: 76, level: 3, repeat: 2 }));

// ---------- velocidade (rampa de BPM) ----------
add({ id: 'speed-pick', title: 'Rampa: alternada em corda solta', ...T('speed', 3), tags: ['rampa'], description: 'O BPM sobe 5 a cada volta, até 120. Pare quando errar demais.', tip: 'O relaxamento vem antes da velocidade.' }, { ...noteSeq({ technique: 'speed', notes: Array.from({ length: 16 }, (_, i) => ({ string: 3, fret: 0, pick: i % 2 ? 'U' : 'D' })), step: 0.5, bpm: 60, level: 3 }), ramp: { step: 5, max: 120, everyPasses: 1 } });
add({ id: 'speed-strum', title: 'Rampa: palhetada alternada em Em', ...T('speed', 3), tags: ['rampa', 'palhetada'], description: 'Colcheias ↓↑ em Em; +5 BPM a cada compasso, até 130.', tip: 'Se o ritmo desandar, volte ao BPM anterior.' }, { ...strumScore({ technique: 'speed', chords: ['Em'], slots: 'DUDUDUDU', bars: 1, bpm: 70, level: 3 }), ramp: { step: 5, max: 130, everyPasses: 1 } });
add({ id: 'speed-scale', title: 'Rampa: pentatônica de Lá', ...T('speed', 4), tags: ['rampa', 'escala'], description: 'Sobe e desce a escala acelerando 4 BPM por volta, até 140.', tip: 'Sem tensão no ombro.' }, { ...noteSeq({ technique: 'speed', notes: sequenceOf(scaleNotes({ root: 9, scale: 'pent-minor', lo: 5, span: 4 }), 'updown'), step: 0.5, bpm: 80, level: 4 }), ramp: { step: 4, max: 140, everyPasses: 1 } });

// ---------- precisão rítmica ----------
for (const [id, t, slots, l, tip] of [['rt-offbeat', 'Contratempo: só nos "e"', '-U-U-U-U', 2, 'Sinta o pulso nas batidas, toque entre elas.'], ['rt-sync', 'Síncopa: D--D--D-', 'D--D--D-', 3, 'A síncopa cai fora do tempo forte; conte em colcheias.'], ['rt-rests', 'Com pausas: D-D---D-', 'D-D---D-', 3, 'Pausa também é música: a mão continua o movimento.'], ['rt-3', 'Tercinas implícitas', 'D-DD-DD-', 4, 'Agrupe de 3 em 3 colcheias.'], ['rt-dense', 'Quase tudo: DDUUDDUU', 'DDUUDDUU', 4, 'Dois para baixo, dois para cima: cuidado com o cansaço.']])
  add({ id, title: t, ...T('rhythm', l), tags: ['precisão'], description: 'Padrão rítmico sobre Em; o resultado mostra o quanto você adianta ou atrasa.', tip }, strumScore({ technique: 'rhythm', chords: ['Em'], slots, bars: 8, bpm: 72, level: l, dirCheck: false }));

// ---------- técnicas expressivas (só a nota tocada é avaliada) ----------
const TECH = [['hammer', 'Hammer-on', 'Toque a corda solta e "martele" o dedo na casa 2 sem palhetar.'], ['pull', 'Pull-off', 'Toque a casa 2 e puxe o dedo para soltar a corda.'], ['slide', 'Slide', 'Toque a casa 5 e deslize até a casa 7 sem soltar a corda.'], ['bend', 'Bend (empurrar a corda)', 'Toque e empurre a corda para cima até a nota-alvo.'], ['vibrato', 'Vibrato', 'Mantenha a nota e balance o dedo para dar vida ao som.'], ['legato', 'Ligados (legato 1-2-3-4)', 'Uma palhetada e os dedos fazem o resto: martelos subindo, puxadas descendo.']];
TECH.forEach(([k, nome, desc], i) => add({ id: `tech-${k}`, title: nome, ...T('technique', k === 'legato' ? 4 : 2 + (i > 2 ? 1 : 0)), tags: ['expressiva', k], description: desc, tip: 'Pratique devagar (50%) até o gesto ficar limpo.', limitation: LIMIT }, techniqueScore({ kind: k, id: 'x', title: 'x', level: 2, bpm: 60, string: k === 'bend' ? 4 : 3 })));
add({ id: 'tech-palm', title: 'Palm mute em E5', ...T('technique', 3), tags: ['expressiva', 'palm mute'], description: 'Apoie a lateral da mão direita perto da ponte e palhete as duas cordas graves.', tip: 'Quanto mais perto da ponte, mais seco o som.', limitation: 'A AG01 não informa se a corda está abafada. O app avalia as cordas tocadas e o tempo; o abafamento é guia.' }, mutedScore({ id: 'x', title: 'x', level: 3, bpm: 80, chord: 'E5', kind: 'palm' }));
add({ id: 'tech-dead', title: 'Notas abafadas (chunk) em Am', ...T('technique', 3), tags: ['expressiva', 'abafadas'], description: 'Palhetadas soantes nos tempos e "chunks" abafados nos contratempos.', tip: 'Solte a pressão da mão esquerda sem tirar os dedos das cordas.', limitation: 'O abafado é guia e não é pontuado (o aparelho não distingue nota abafada). Só as palhetadas soantes valem.' }, mutedScore({ id: 'x', title: 'x', level: 3, bpm: 76, chord: 'Am', kind: 'mute' }));

// ---------- consulta ----------
export const exerciseById = (id) => EXERCISES.find((e) => e.id === id) || null;
export function getExercises({ technique, level, tag, q, ids } = {}) {
  const s = q?.trim().toLowerCase();
  return EXERCISES.filter((e) => (!technique || e.technique === technique) && (!level || e.level === level) && (!tag || e.tags.includes(tag))
    && (!ids || ids.includes(e.id)) && (!s || `${e.title} ${e.tags.join(' ')} ${e.description}`.toLowerCase().includes(s)));
}
export { arpSequence };
