# Corda — arquitetura e contratos

Aplicativo web (ES modules, **sem build, sem CDN, sem rede**) para aprender guitarra com a AeroBand AG01.
Roda no Chrome (Web Bluetooth). Servidor local: `./serve.sh` → http://localhost:8731. Testes: `npm test` (Node, sem navegador).
Interface em **português do Brasil**. Comentários de código em PT-BR, curtos, só onde o "porquê" não é óbvio.

## 1. Regras inegociáveis

1. **Segurança da AG01.** O app só LÊ. Proibido `writeValue*`, SysEx, comandos não documentados, firmware.
   `tests/safety.test.mjs` varre todo `js/` e falha se aparecer escrita. Nunca desative esse teste.
2. **Honestidade.** Nunca apresentar como "detectado" o que o dispositivo não informa (ver §3). Informação pedagógica
   usa `<span class="badge guide">guia</span>`; informação verificada pelo dispositivo usa `badge live`.
   Sem precisão fictícia: se algo é estimado (BPM/acordes de uma música), mostrar "estimado" e permitir correção manual.
3. **Pausa universal.** Todo exercício tem Iniciar, Pausar, Continuar, Reiniciar, velocidade, BPM (se couber), repetir, progresso.
   Pausar congela relógio, acompanhamento sonoro e avaliação.
4. **Qual corda foi tocada** deve ser identificável em todo contexto musical (acordes, escalas, arpejos, ritmo, dedilhado).
5. **Não regredir** a v1 (backup em `~/Desktop/corda-v1-backup`, código de referência em `js/legacy/`). Nunca apagar `inpiracao-cordas/`.
6. **Sem copiar** o app da Aeroband: as imagens são inspiração; o design é original.

## 2. Estrutura e donos

```
index.html            shell (dono: núcleo)         css/tokens.css base.css shell.css fretboard.css (núcleo)
js/main.js shell.js   inicialização, router, palco  js/core/{ctx,store,dom}.js (núcleo)
js/device/guitar.js   BLE MIDI somente-leitura (núcleo)
js/music/theory.js    notas, detectChord, matchChord, fretOf/noteAt (núcleo)   js/music/legacy.js (v1, será aposentado pela frente Acordes)
js/ui/fretboard.js    braço SVG (núcleo)
js/engine/transport.js  relógio pausável (núcleo)
--- frentes paralelas (cada uma só escreve nos seus arquivos) ---
ACORDES    js/music/chords.js, js/music/chord-data/*, js/ui/chord-diagram.js, js/content/chord-drills.js, js/views/chords.js, css/chords.css, tests/chords*.test.mjs
PRÁTICA    js/engine/{score,evaluator,runner,highway,transport-ui,practice}.js, js/content/{exercises,techniques,patterns}.js, js/views/{train,rhythm}.js, css/train.css css/rhythm.css, tests/engine*.test.mjs
MÚSICAS    js/songs/*, js/views/songs.js, css/songs.css, tests/songs*.test.mjs
TONES      js/audio/* (engine.js, fx, presets, tuner), js/views/tones.js, css/tones.css, tests/audio*.test.mjs
APRENDIZADO js/learn/*, js/content/paths.js, js/views/{home,progress}.js, css/home.css css/progress.css, tests/learn*.test.mjs
```
Precisa mudar arquivo do núcleo? **Não edite.** Acrescente um pedido em `docs/REQUESTS.md` (só anexar, no fim, com seu nome de frente).

## 3. O que a AG01 informa (verificado em captura real, ver Laboratório)

BLE MIDI. Uma corda = um canal MIDI (0 = E grave … 5 = E agudo). Eventos: nota ligada (com velocity), nota desligada,
CC 123 "all notes off" por corda, CC 54 proprietário (contador/modo, significado desconhecido).
Afinação lida: E2 A2 D3 G3 B3 E4 = notas 40 45 50 55 59 64 (com possível desvio uniforme, ex. −1; calibrável: `settings.pitchOffset`).

| Estado | Fonte | Observação |
|---|---|---|
| Corda **tocada** (ataque) | `noteon` | verificado |
| **Nota** que soou | número MIDI | verificado; traste = `fretOf(corda, nota, offset)` (derivado) |
| **Sustentada** | noteon sem noteoff | verificado |
| Direção da palhetada | ordem de chegada das cordas (grave→agudo = ↓) | **inferida** |
| Corda só **pressionada** | — | **não observável** (sem palhetar não há evento) |
| Dedo / mão direita (PIMA) | — | **não observável** → só "guia" |
| Hammer-on/pull-off/slide/bend/vibrato/palm mute | — | sem eventos próprios → "guia"; reconhecimento exigiria áudio |

## 4. `app` (contexto, `js/core/ctx.js`) — recebido por todas as telas

```js
app.store      // Store: get(path,def) set(path,v) update(path,fn,def) markDay() streak() flush()  (chave 'corda.v2')
app.guitar     // Guitar (EventTarget): status 'idle'|'connecting'|'connected'|'demo'; eventos abaixo
app.audio      // AudioEngine (frente TONES): pluck(midi,time,gain) strum(notes,time,dir,gain,spread) click(time,accent) context master
app.stage      // Fretboard do palco (sempre visível embaixo): use para mostrar posições esperadas
app.practice   // frente PRÁTICA: start(score, opts) -> RunnerHandle (§6)
app.learn      // frente APRENDIZADO: record(session) etc. (§8)
app.router     // go(id, params), render()
app.demoChord  // opcional: view define () => frets[6] para o modo demo (Espaço/↑/X) tocar o acorde certo
app.toast(msg) app.navigate(id, params) app.connect() app.startDemo() app.demoStrum(dir, wrong)
```
**Store**: `settings{latency,rigor,flats,synth,auto,pitchOffset,capo,instrument,volume}`, `chords{id:{ok,tries,streak}}`,
`sessions[]`, `days[]`, `goals`, `favorites{exercises,chords,songs,tones}`, `tones`, `songs`, `paths`. Chaves novas: use seu prefixo.
Arquivos grandes (áudio importado) vão em **IndexedDB**, nunca no localStorage.

**Eventos de `app.guitar`** (todos `CustomEvent`, dados em `e.detail`):
`noteon {string,note,vel,t}` · `noteoff {string,note,t}` · `notes {active:Map<string,note>}` · `cc {string,controller,value,t}` ·
`strumstart {t}` · `strum {t,notes[],dir:'D'|'U'|'S',count,chord}` · `status {status,name}` · `raw {t,hex}`.
`t` é `performance.now()`. `app.guitar.simulateStrum(notesPorCorda[6], dir)` simula MIDI real sem hardware (use em testes e no demo).

## 5. Módulos do núcleo (APIs estáveis)

**theory.js**: `pcName noteName midiToHz INSTRUMENTS STANDARD STRING_LABELS QUALITIES Q detectChord(notes) matchChord(notes,{root,q},rigor) fretOf(corda,nota,offset) noteAt(corda,traste,offset) setFlats`.
**Fretboard** (`js/ui/fretboard.js`): `new Fretboard(host,{frets,offset})` · `setExpected([{string,fret,finger?,state?}])` ·
`setAvoid([cordas])` · `noteOn/noteOff/releaseAll` (ao vivo) · `flash(corda,traste,'ok'|'bad')` · `resolve(corda,'hit'|'miss')` · `sustained()` · `bindGuitar(fb,guitar)`.
Convenção de cordas em todo o código: **índice 0 = mais grave, 5 = mais aguda**; na tela a aguda fica em cima.
**Transport** (`js/engine/transport.js`): `new Transport(audio,{bpm,speed,beatsPerBar,subdivision,click,latencyMs,clock,silent})` ·
`start({countInBeats}) pause() resume() toggle() stop() restart() setBpm() setSpeed()` · `position()` (batidas; negativa na contagem) ·
`beatAtPerf(performance.now)` (posição de um evento do dispositivo, compensando latência; `null` se pausado) · eventos `tick{beat,time,isBeat,isBar,countIn}` `state` `tempo`.
Um tick agendado e mudo na pausa é reemitido ao retomar (nunca um já passado). `silent:true` e `clock` injetável para testes.

## 6. Score e Runner (frente PRÁTICA; as outras frentes só PRODUZEM Scores)

Um **Score** descreve um exercício como linha do tempo em batidas:
```js
{ id, title, technique: 'chords'|'strumming'|'picking'|'arpeggio'|'fingerpicking'|'scale'|'melody'|'rhythm'|'legato'|'chord-change'|…,
  level: 1..5, bpm, beatsPerBar: 4, subdivision: 2, lengthBeats,            // uma passada
  mode: 'timed' | 'wait',      // wait = espera o aluno acertar (troca de acordes sem pressa)
  chords?: [{ beat, chordId, frets?:[6], fingers?:[6] }],                   // diagramas acima da pista
  events: [{ beat, dur?,
             kind: 'strum'|'note'|'rest',
             strum?: { dir:'D'|'U', strings:[corda…] },                     // quais cordas devem soar
             notes?: [{ string, fret, finger?:1..4, digit?:'p'|'i'|'m'|'a' }],
             tech?: 'hammer'|'pull'|'slide'|'bend'|'vibrato'|'mute'|'palm', // técnicas sem detecção são "guia"
             avoid?: [corda…],                                              // cordas que NÃO devem soar
             check: { strings:true, pitch:true, timing:true, dir:false },   // o que o app VERIFICA de fato
             label?, lyric? }],
  loop?: { fromBeat, toBeat } }
```
`app.practice.start(score, opts) → RunnerHandle` com `opts = { host:HTMLElement, bpm?, speed?, repeat:'once'|'loop'|n, countIn?, wait?, onFinish?(summary) }`.
O runner desenha a pista ("slider tab": 6 linhas de corda, barra de agora, blocos coloridos por dedo), a barra de transporte
(Iniciar/Pausar/Continuar/Reiniciar, velocidade, BPM, repetir, progresso) e o feedback; mostra posições esperadas no `app.stage`;
avalia `guitar.noteon/strum` com `transport.beatAtPerf`; ao fim chama `app.learn.record(summary)`.
`RunnerHandle`: `pause() resume() restart() stop() setSpeed(x) setBpm(x) on('state'|'result'|'finish', fn) state progress`.
Exercícios nomeados vivem em `js/content/exercises.js`: `EXERCISES`, `exerciseById(id)`, `getExercises({technique,level,tag})`.

## 7. Acordes (frente ACORDES) — `js/music/chords.js`

Modelo estruturado (gerado por fórmulas + formas CAGED/barre + tabelas curadas, não imagens):
`Voicing { id, symbol, root(pc), quality, name, frets[6] (-1=abafada), fingers[6], baseFret, barre?, difficulty 1..3, tags[], notes[midi], pcs[], bass?, inversion? }`.
API mínima: `QUALITY_LIST`, `findChords({q?, root?, quality?, difficulty?, tag?})`, `getChord(symbol)`, `voicingsOf(symbol)`, `chordScore(voicing,{beats,...})`,
e diagramas SVG reutilizáveis em `js/ui/chord-diagram.js` (`chordDiagram(voicing,{size,...}) → string SVG`).

## 8. Aprendizado (frente APRENDIZADO) — `app.learn`

Registro de sessão (todas as frentes chamam `app.learn.record(rec)` ao terminar algo praticável):
`{ kind:'exercise'|'chords'|'rhythm'|'song', refId, title, technique, level, bpm, speed, durationSec, accuracy(0..100),
   timingMeanMs, hits:{perfect,good,ok,miss,extra}, stringsOk, stringsTotal, chordsOk?, chordsTotal? }`.
Também: metas diária/semanal, trilhas (`js/content/paths.js` referenciando exercícios por critério), rotinas, favoritos, estatísticas por técnica, evolução de BPM, "precisa de reforço".

## 9. Áudio (frente TONES)

Todo som passa por `app.audio.pluck/strum/click` para que o Tone escolhido valha em todo o app. Controles só se tiverem efeito real.
Reverb/delay/chorus/EQ/overdrive/distorção são processados LOCALMENTE (Web Audio); o aparelho não expõe parâmetros de timbre por MIDI (documentar).

## 10. Convenções de UI

Use tokens de `css/tokens.css` (nunca cor/medida solta). Componentes: `.btn .btn.primary .btn.ghost .seg .chip .badge .panel .list .search .tabs .transport .progress .field`.
A tela **não repete o título** (a barra superior já mostra). Estados: hover, foco visível, selecionado, acerto (`--ok`), erro (`--bad`), esperado (`--expected`).
Cores dos dedos: `--f1..--f4`. Desktop primeiro, responsivo ≤900px. Respeite `prefers-reduced-motion`. Contraste AA.
Uma tela = `export default { id, title, icon, order, group?, mount(el, app, params) → cleanup }` registrada em `js/views/index.js`.
Lógica musical em módulos puros (sem DOM) → testável com `node --test`. Teste com MIDI simulado, nunca dependa do hardware.

## 11. Verificação visual

`SP=/private/tmp/claude-501/-Users-josiassiqueira-Desktop/0a73bc83-073b-4f7d-812b-905f46bbdb23/scratchpad; $SP/shot.sh <view> <saida.png> [largura] [altura]`
tira screenshot headless de `http://127.0.0.1:8731/#/<view>` (servidor já rodando; se não, `./serve.sh &`).
Interação em teste: iframe + `body.dispatchEvent(new KeyboardEvent(...))` (ver histórico) ou `app.guitar.simulateStrum` via `window.corda`.
