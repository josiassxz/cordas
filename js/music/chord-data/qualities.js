// Qualidades de acorde: fórmula (semitons a partir da raiz), notas obrigatórias e apelidos de escrita.
// `pcs` = todas as notas permitidas; `must` = notas sem as quais o acorde muda de identidade (a quinta quase sempre é opcional).
export const CATEGORIES = ['Tríades', 'Suspensos', 'Sétimas', 'Estendidos', 'Alterados', 'Power'];

export const QUALITY_LIST = [
  { id: 'maj', sym: '', name: 'Maior', cat: 'Tríades', pcs: [0, 4, 7], must: [0, 4], aliases: ['', 'M', 'maj', 'major', 'maior'] },
  { id: 'min', sym: 'm', name: 'Menor', cat: 'Tríades', pcs: [0, 3, 7], must: [0, 3], aliases: ['m', 'min', '-', 'minor', 'menor'] },
  { id: 'aug', sym: 'aug', name: 'Aumentado', cat: 'Tríades', pcs: [0, 4, 8], must: [0, 4, 8], aliases: ['aug', '+', 'aug5', '+5'] },
  { id: 'dim', sym: 'dim', name: 'Diminuto', cat: 'Tríades', pcs: [0, 3, 6], must: [0, 3, 6], aliases: ['dim', '°', 'o', 'dim5'] },
  { id: 'sus4', sym: 'sus4', name: 'Suspenso 4', cat: 'Suspensos', pcs: [0, 5, 7], must: [0, 5], aliases: ['sus4', 'sus'] },
  { id: 'sus2', sym: 'sus2', name: 'Suspenso 2', cat: 'Suspensos', pcs: [0, 2, 7], must: [0, 2], aliases: ['sus2'] },
  { id: '7sus4', sym: '7sus4', name: 'Sétima suspensa 4', cat: 'Suspensos', pcs: [0, 5, 7, 10], must: [0, 5, 10], aliases: ['7sus4', '7sus'] },
  { id: '7sus2', sym: '7sus2', name: 'Sétima suspensa 2', cat: 'Suspensos', pcs: [0, 2, 7, 10], must: [0, 2, 10], aliases: ['7sus2'] },
  { id: '6', sym: '6', name: 'Sexta', cat: 'Sétimas', pcs: [0, 4, 7, 9], must: [0, 4, 9], aliases: ['6', 'maj6', 'M6'] },
  { id: 'm6', sym: 'm6', name: 'Menor com sexta', cat: 'Sétimas', pcs: [0, 3, 7, 9], must: [0, 3, 9], aliases: ['m6', 'min6', '-6'] },
  { id: '7', sym: '7', name: 'Dominante (7)', cat: 'Sétimas', pcs: [0, 4, 7, 10], must: [0, 4, 10], aliases: ['7', 'dom7'] },
  { id: 'maj7', sym: 'maj7', name: 'Maior com sétima maior', cat: 'Sétimas', pcs: [0, 4, 7, 11], must: [0, 4, 11], aliases: ['maj7', 'M7', 'Δ', 'Δ7', 'ma7'] },
  { id: 'm7', sym: 'm7', name: 'Menor com sétima', cat: 'Sétimas', pcs: [0, 3, 7, 10], must: [0, 3, 10], aliases: ['m7', 'min7', '-7'] },
  { id: 'm7M', sym: 'm(maj7)', name: 'Menor com sétima maior', cat: 'Sétimas', pcs: [0, 3, 7, 11], must: [0, 3, 11], aliases: ['m7M', 'mM7', 'mmaj7', 'minmaj7', 'm(maj7)', 'mMaj7'] },
  { id: 'dim7', sym: 'dim7', name: 'Diminuto com sétima', cat: 'Sétimas', pcs: [0, 3, 6, 9], must: [0, 3, 6, 9], aliases: ['dim7', '°7', 'o7'] },
  { id: 'm7b5', sym: 'm7b5', name: 'Meio-diminuto', cat: 'Sétimas', pcs: [0, 3, 6, 10], must: [0, 3, 6, 10], aliases: ['m7b5', 'ø', 'ø7', 'm7(b5)', 'min7b5'] },
  { id: 'add9', sym: 'add9', name: 'Add9', cat: 'Estendidos', pcs: [0, 2, 4, 7], must: [0, 2, 4], aliases: ['add9', 'add2', '(add9)'] },
  { id: '9', sym: '9', name: 'Nona dominante', cat: 'Estendidos', pcs: [0, 2, 4, 7, 10], must: [0, 2, 4, 10], aliases: ['9', 'dom9'] },
  { id: 'maj9', sym: 'maj9', name: 'Maior com nona', cat: 'Estendidos', pcs: [0, 2, 4, 7, 11], must: [0, 2, 4, 11], aliases: ['maj9', 'M9', 'Δ9'] },
  { id: 'm9', sym: 'm9', name: 'Menor com nona', cat: 'Estendidos', pcs: [0, 2, 3, 7, 10], must: [0, 2, 3, 10], aliases: ['m9', 'min9', '-9'] },
  { id: '11', sym: '11', name: 'Décima primeira', cat: 'Estendidos', pcs: [0, 2, 4, 5, 7, 10], must: [0, 5, 10], aliases: ['11', 'dom11'] },
  { id: 'm11', sym: 'm11', name: 'Menor com 11ª', cat: 'Estendidos', pcs: [0, 2, 3, 5, 7, 10], must: [0, 3, 5, 10], aliases: ['m11', 'min11', '-11'] },
  { id: '13', sym: '13', name: 'Décima terceira', cat: 'Estendidos', pcs: [0, 2, 4, 7, 9, 10], must: [0, 4, 9, 10], aliases: ['13', 'dom13'] },
  { id: '7b9', sym: '7b9', name: 'Sétima com nona menor', cat: 'Alterados', pcs: [0, 1, 4, 7, 10], must: [0, 1, 4, 10], aliases: ['7b9', '7(b9)', '7-9'] },
  { id: '7#9', sym: '7#9', name: 'Sétima com nona aumentada', cat: 'Alterados', pcs: [0, 3, 4, 7, 10], must: [0, 3, 4, 10], aliases: ['7#9', '7(#9)', '7+9'] },
  { id: '5', sym: '5', name: 'Power chord (5)', cat: 'Power', pcs: [0, 7], must: [0, 7], aliases: ['5'] },
];

// As 16 qualidades oferecidas pelo app da Aeroband (para o seletor de referência).
export const AERO_QUALITIES = ['maj', 'min', 'aug', 'dim', 'sus4', 'sus2', '5', '6', 'm6', 'maj7', 'm7', '7', 'm7M', '7sus4', '7sus2', 'add9'];
