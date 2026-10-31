# Tones — o que é real, o que é limitação

## Resumo honesto
- A AeroBand AG01 envia **apenas notas MIDI** (corda = canal, nota, velocidade). **Não expõe parâmetros de timbre**
  (instrumento, ganho, efeitos) por MIDI/BLE. O app só LÊ; nada é escrito no aparelho.
- O timbre do Corda é gerado e processado **no navegador** (Web Audio). Ele vale para: (1) o som que o app toca quando
  *Ouvir ao vivo* está ativo (`settings.synth`), (2) os exemplos "Ouvir"/"Acorde"/"Notas" e o guia sonoro dos exercícios.
  **Não muda o som físico da guitarra** nem o que o app oficial da Aeroband toca.
- Só existem controles com efeito real na cadeia. Nada decorativo.

## O que a captura real mostrou (leitura passiva)
Eventos vistos: noteon/noteoff por canal 0–5, CC 123 (all notes off) por corda, **CC 54** no canal 0 com valores 4→5→6→7 a cada
palhetada (um contador/estado; **não** parece timbre), e uma mensagem `F3 06 B5 26 00 02 01` vista uma vez (desconhecida). A troca
de instrumento do app oficial não foi observada em tráfego, então **não há evidência de parâmetro de timbre no MIDI**. O
Laboratório (aba do app) registra tudo e exporta JSON para análise futura. Se algum dia aparecer um CC ligado a timbre,
será tratado **somente leitura**.

## Arquitetura de áudio (js/audio/)
```
vozes Karplus-Strong → instrumentBus → [corpo/captador → compressor → drive+cabine → EQ → chorus → delay → reverb] → master(volume) → limitador → saída
clique do metrônomo / Transport ─────────────────────────────────────────────────────────────→ master   (fora dos efeitos)
```
- `dsp.js` DSP puro: curvas de distorção, Karplus-Strong com afinação fracionária (erro < 0,4 cent), IR de reverb, YIN.
- `presets.js` esquema v1, validação, 9 presets de fábrica, mapeamento preset→nós, CRUD em `store.tones.presets`, favoritos, A/B.
- `chain.js` aplica o preset aos nós (AudioContext ou OfflineAudioContext). `engine.js` é a API usada pelo app.
- `tuner.js` afinações + análise de cents + `MicTuner` (microfone). `transpose.js` capo, transposição, tonalidade.

### API do `app.audio` (estável)
`context, master, volume, click(time,accent,soft), pluck(midi,time,gain), strum(notes,time,dir,gain,spread)` + novos:
`preset, setPreset(p), usePresetId(id), tempo (BPM; sincroniza o delay), level() (pico 0..1), setAB(a,b)/toggleAB(), bindStore(store)`.
Todo som deve passar por `pluck/strum` para respeitar o timbre. Não use `audio.context.createOscillator` direto para notas.

### Controles e o que cada um faz
Voz (aço/nylon/elétrica, brilho, sustentação, corpo | captador) · Compressor · Drive (overdrive/distorção, ganho, tom, nível, cabine) ·
EQ 4 bandas · Chorus · Delay (livre ou sincronizado ao BPM) · Reverb · nível do preset. Cada um tem teste automatizado que prova o efeito
no valor do nó (`tests/audio-presets.test.mjs`) e no áudio renderizado (`tests/audio-browser.test.mjs`).

## Afinador
Por **microfone** (YIN, pede permissão). A AG01 só envia notas quantizadas, portanto não existe "cents" no MIDI; medir afinação fina
exige ouvir o som da corda. Se a guitarra não produz som próprio, o afinador não tem o que medir. Afinações: padrão, Drop D, meio tom
abaixo, DADGAD, Open D, Open G. Tolerância de "afinado": ±5 cents.

## Transposição / capo / tonalidade
Cifras em letras (`G`, `F#m7`, `Bb/D`). Capo n: forma = acorde − n semitons. Sugestão de capo = menor dificuldade somada das formas
(abertas = 0, barras = 2–3). Tonalidade = estimativa por campo harmônico (mostra "boa confiança" ou "confira de ouvido"). O "ouvir"
usa um voicing genérico, **não** o diagrama oficial (isso é da frente Acordes).

## Limitações conhecidas
- Karplus-Strong é uma síntese de corda, não amostra de instrumento real: soa convincente, não idêntico a uma gravação.
- Distorção/overdrive sem sobreamostragem além do `oversample 4x` do WaveShaper; cabine é aproximada por filtros, não IR real.
- Latência de áudio do navegador + BLE: use a compensação de latência dos Ajustes.
- Sem microfone/permissão o afinador fica inativo (estado explicado na tela).
