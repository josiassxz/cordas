# Pedidos ao núcleo (apenas anexar)

## [APRENDIZADO] pedidos
1. **Datas locais no Store**: `store.today()/markDay()/streak()` usam UTC (`toISOString`). À noite no Brasil (UTC−3) o dia vira cedo. A frente Aprendizado calcula tudo em data local (`learn/stats.js dayKey`) e une `store.days` com os dias das sessões; recomenda-se trocar `today()` por data local.
2. **Parâmetros de rota que Início/Progresso enviam** (para a frente PRÁTICA tratar em `views/train.js`): `#/train?technique=<id>&level=<n>&step=<stepId>` e `#/train?exercise=<exerciseId>`; também `#/chords?chord=<id>` (ACORDES) e `#/songs?song=<id>` (MÚSICAS).
3. **Contrato esperado de `js/content/exercises.js`**: exporta `EXERCISES` (array), `getExercises({technique,level})` e `exerciseById(id)`; cada item é um Score com `id,title,technique,level,bpm,lengthBeats`. `app.practice.start(score,{host,repeat:n,onFinish})` deve chamar `onFinish(summary)` ao fim (usado pelas rotinas) e `app.practice.ready=true`.
4. Quem registrar sessão deve chamar `app.learn.record({kind,refId,title,technique,level,bpm,speed,durationSec,accuracy,timingMeanMs,hits,...})`; `technique` precisa ser um id de `learn/stats.js TECHNIQUES` (chords, chord-change, strumming, picking, rhythm, arpeggio, fingerpicking, scale, melody, legato) para entrar nas trilhas.

## [ACORDES] pedidos ao núcleo
1. `npm test` (glob `tests/*.test.mjs`) pode ficar pendurado se algum teste de outra frente deixar timer/handle aberto; sugiro `node --test --test-force-exit` no script `test` do package.json.
2. `js/music/legacy.js` já está 100% coberto por `js/music/chords.js` (teste `biblioteca v1 ... coberta`). Quando Prática/Aprendizado deixarem de importar `legacy.js`, ele pode ser removido; `tests/theory.test.mjs` ainda o importa.
3. A tela Acordes feature-detecta `app.practice.ready === true` para liberar "Iniciar exercício" nas trocas de acordes (chama `app.practice.start(score,{host,bpm,repeat:'loop',onFinish})`). Se a Prática usar outro nome de flag, avisar.

## [TONES] pedidos ao núcleo
1. `js/core/ctx.js`: depois de criar `app.audio`, chamar `app.audio.bindStore(store)` (liga o timbre salvo e o volume ao Store desde o início;
   hoje a tela Tones faz isso ao abrir, e sem isso o motor só lê o localStorage de forma passiva na primeira nota).
   Substituir a linha `app.audio.volume = store.get('settings.volume', 0.8);` por `app.audio.bindStore(store);`.
2. Sempre que o BPM de um exercício mudar (evento `tempo` do Transport), fazer `app.audio.tempo = bpm`
   (o delay sincronizado ao andamento depende disso). Frente PRÁTICA pode fazê-lo no runner.
3. `js/shell.js`: o som ao vivo usa ganho fixo 0.35; usar `e.detail.vel/127` seria mais expressivo (opcional).

## [PRÁTICA] Extensões do Score e pontos de integração (para documentar em ARCHITECTURE.md §6)
- **Campos novos de Score**: `ramp:{step,max,everyPasses}` (rampa de BPM por passada); em eventos: `guide:true` + `check` todo falso = evento só-guia (exibido tracejado, nunca pontuado), `pick:'D'|'U'` (seta de palheta em nota única, só guia), `notes[].digit` (p/i/m/a, só guia), `strum.frets[6]` e `strum.fingers[6]` (traste/dedo por corda; frets habilitam checagem de nota no rigor "estrito"), `chords[].root` e `.q` (habilita o acerto de acorde por trecho via matchChord, igual à v1).
- **Pontuação honesta**: palhetada checa cordas+tempo (+direção inferida); nota só é conferida em nota única ou rigor "estrito". Técnicas sem evento no aparelho viram evento-guia.
- **Runner** (`js/engine/runner.js`) é puro (sem DOM) e testável; `app.practice.start(score,{host, meta:{guide,limitations}, repeat:'once'|N|'loop', bpm, speed, guide, autostart, onClose, onFinish})` devolve o Runner (`pause/resume/restart/stop/setSpeed/setBpm/setRepeat/on`) com `destroy()`.
- **Modo demo**: `app.demoChord` passa a devolver `runner.demoFrets()` (traste por corda do próximo evento), então Espaço/↑/X tocam o evento certo em qualquer exercício.
- **Store**: `practice.best` = { idDoExercício: melhor % } e `rhythm.{bpm,sig,custom[]}`. Frente APRENDIZADO pode ler `practice.best`.
- **Link direto** para um exercício: `#/train?ex=<id>` (e `#/train?technique=<id>`; `#/rhythm?tab=metro|patterns|chords|builder|path`). `getExercises({technique,level,tag,q,ids})` serve para trilhas.
- **Pedido ao núcleo (baixa prioridade)**: `AudioEngine.click(time, accent, soft)` precisa continuar existindo (subdivisões do metrônomo); o guia sonoro usa `audio.strum/pluck`. Pausa silencia o clique do Transport, mas sons do guia já agendados (≤80 ms) tocam até o fim.
- **Observação**: `js/views/tones.js` estava com erro de sintaxe durante meu teste (outra frente em edição); um erro em qualquer view quebra todo `views/index.js`. Sugestão: o shell importar cada view com `import()` dinâmico e `try/catch`, para uma tela quebrada não derrubar o app.
