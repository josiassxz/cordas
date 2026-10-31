# 03 · Practice engine (Train / "Treinar")

> Part of the Corda documentation set for the AeroBand team. See also: [01-ag01-integration.md](01-ag01-integration.md) · [05-chords.md](05-chords.md) · [04-rhythm.md](04-rhythm.md) · [08-insights-for-native-app.md](08-insights-for-native-app.md).
>
> **About the screenshots.** The UI is in Brazilian Portuguese (labels are quoted with an English translation). Screenshots were produced by `tools/capture-docs.mjs` with **simulated** guitar input and seeded demo data, not a live AG01 session. The behaviour described below was implemented against what was verified on a real AG01 (see [01-ag01-integration.md](01-ag01-integration.md)); items not verified on hardware are flagged **[inferred]** or **[simulated]**.

## 1. Purpose

The practice engine is the heart of the app. It takes a *score* (a list of timed events: strums, single notes, chord changes), plays a metronome, scrolls the score towards a "now" bar, listens to the guitar, and grades every event on **timing** and, optionally, on **what was played** (fret assembly, sound, strum direction). Everything else (Train library, rhythm patterns, chord drills, saved sequences, paths) is just a different way to generate a score and hand it to this engine.

Design goals:

1. Feedback in **milliseconds** (early / late), not just "right / wrong".
2. The instrument is **read-only**: the app only listens (BLE MIDI notifications). It never writes anything to the guitar.
3. Use the extra data the AG01 gives (fret sensors, per-string channels, strum arrival order) to validate things an ordinary microphone-based app cannot.
4. Be honest about what cannot be verified (hammer-ons, bends, slides, etc. are *guide-only*).

## 2. Train library

![Train library](images/04-train-library.png)

**What you see.** Left column: 10 technique categories with exercise counts (plus "Todas / All" = 88). Top bar: search box ("Buscar exercício, técnica ou acorde" / search exercise, technique or chord), level filter (Todos, 1–5) and a "Favoritos" toggle. Each row shows title, a 5-dot level indicator, level name, BPM, length in bars, the best score so far (%) and a heart to favourite.

**Catalogue (88 exercises, 56–96 BPM, levels 1–4 populated of 5):**

| Technique (PT label) | Count | Notes |
|---|---|---|
| Palhetada em acordes (strumming) | 12 | Down-only, up-only, alternating, common progressions |
| Palhetada em cordas (picking) | 6 | Single-string alternate picking |
| Troca de acordes (chord change) | 18 | Two-chord drills, progressions; uses the chord strip |
| Arpejos (arpeggio) | 9 | Patterns asc/desc/up-down/pima/alt/pinch/travis/pmi |
| Fingerpicking | 10 | Thumb-bass + fingers |
| Escalas (scales) | 12 | Major / pentatonic, several positions |
| Melodias e sequências | 5 | Melodic phrases, scale sequences |
| Velocidade (speed) | 3 | BPM ramps (the only exercises with an automatic BPM ramp) |
| Precisão rítmica (rhythm) | 5 | Sync with the metronome |
| Técnicas expressivas (technique) | 8 | Hammer-on, pull-off, slide, bend, vibrato, palm mute, muted strums |

Counts by level: L1 = 11, L2 = 32, L3 = 37, L4 = 8. 22 exercises are *guide-only* (see §9) and 8 use **wait mode** (§7).

**Opening an exercise** shows a brief ("description" + "Dica / tip") and the practice player. For timed exercises the score loops automatically up to 6 passes (`ceil(48 beats / length)`), shown as "Volta 1/3" (lap 1 of 3).

**Ideas for the native app.** Library with per-technique counts and *best result per exercise* is cheap and very motivating; favourites + level filter make a 88-item catalogue navigable.

## 3. The player

![Exercise running with timeline](images/05-train-exercise-timeline.png)

Elements (all visible in the screenshot above):

- **Header:** Back, title, level chip, time-signature chip (e.g. "4/4 · no tempo" = on the beat; "4/4 · acerte dentro do trecho" = hit anywhere inside the segment), status text ("Pronto — aperte Iniciar (ou P)").
- **Transport bar:** Play/Pause, Restart, Stop, BPM −/+ with a slider, progress bar, lap counter ("Volta 1/3"), gear (settings).
- **Timeline** (§4) or **Note highway** (§5).
- **Timing meter:** a red→green→red horizontal bar labelled "cedo / tarde" (early / late); a marker shows where each hit fell relative to the exact time.
- **Counters:** Acerto (accuracy %), Perfeitas, Boas, No limite, Perdidas, Extras (perfect / good / borderline / missed / extra strums).
- **Live fretboard dock** at the bottom (see [02-live-fretboard.md](02-live-fretboard.md)): expected frets are drawn as numbered bubbles (finger numbers) on the neck while you play.

**Keyboard shortcuts:** `P` start/pause, `R` restart, `F` fullscreen timeline, `Esc` leave fullscreen/close popover. In **demo mode** (no guitar) Space = ↓ strum and ↑ = ↑ strum.

**States:** `idle → countin → running ⇄ paused → finished`. A count-in of one bar (negative beat positions, so the "now" bar travels through the count-in too) precedes the first event.

**BPM can change live** (± buttons, slider, hold-to-repeat). The engine cancels already-scheduled future clicks and re-schedules them, so there is no audible glitch and no drift.

## 4. Slider-tab timeline ("Lane")

Used when an exercise has at least as many strums as single notes.

![Timeline with settings popover](images/06-train-settings-popover.png)

**Layout.**
- Six string lines numbered 1–6 (1 = thinnest, top). Wound strings are drawn slightly heavier.
- Time scrolls **right → left** into a white vertical "now" bar. ~7.4 beats are visible in total; how much is "behind" the bar is configurable (§6).
- Header strip: bar / beat numbers, with subdivision labels (`&`; or `e & a`; or `tri let`) depending on subdivision.
- Each strum is a **gold gradient block**. Its width equals the *"ok" tolerance window* in time (so "hit while the bar is inside the block"). A white double chevron shows the strum direction (↓ / ↑); in chord-assembly exercises the block reads "MONTAR" instead. Exercises that are mostly single notes use the note highway of §5.
- A **chord strip** above the lane shows the current chord in an orange bar and the next as "→ C". 2 beats before a change it pulses and reads **"TROQUE →"** ("CHANGE →"); in assembly exercises it reads **"LEVANTE A MÃO →"** (lift your hand) and the block says **"MONTAR / segure 0,3 s"** (assemble / hold 0.3 s).
- After judgement each block gets a ✓ with the signed error in ms (e.g. `−23`, early; `+41`, late) or a red ✕ and the text "Perdeu essa" (missed that one).
- Inside each block, a thin centre line marks the exact beat and two lighter bands mark the *good* and *perfect* windows around it.

![Chord-change timeline, missed event](images/08-train-chord-change-timeline.png)

(In this capture the first strum was missed — red block with ✕ and "Perdeu essa" (missed that one) — and the fretboard marks the expected "G" shape with red dashed bubbles, the *miss* state of the expected-position markers.)

**Fullscreen** (button at the right edge of the timeline, or `F`): the lane fills the screen, keeping the transport bar and the counters.

**Audio-latency compensation:** the *visual* position is shifted by the AudioContext `outputLatency` so what you see lines up with what you hear.

**Ideas for the native app.**
- A horizontal timeline with block width = tolerance is self-explanatory: players immediately see "how forgiving is this?".
- Putting the signed ms error next to every note is the single most appreciated piece of feedback in practice.
- The "TROQUE →" pre-warning two beats before a change is simple and measurably reduces dropped changes.

## 5. Note highway (Highway)

Used for arpeggios, fingerpicking, scales and melodies (more notes than strums).

![Note highway, arpeggio](images/07-train-note-highway-arpeggio.png)

- Six string lines, *string name* (E B G D A E) plus number at left, bars/beats grid.
- Each note is a rounded pill containing the **fret number** (open strings show 0), coloured by the **finger** assigned to it in the exercise. Dashed outline = guide only. A red ✕ marks a string to avoid.
- Notes already played fade out; the result caption appears under the now bar, e.g. **"Bom · adiantado 84 ms"** (Good · 84 ms early). Chord names appear above each bar ("Am").
- The same timing meter and counters apply.

## 6. Settings popover (gear)

![Settings popover](images/06-train-settings-popover.png)

| Section (PT label) | Options | Meaning |
|---|---|---|
| Velocidade (speed) | 25 / 50 / 75 / **100** / 125 % | Scales the tempo of this run without changing the exercise BPM |
| Repetir (repeat) | 1× / 3× / ∞ | Number of laps |
| Compasso e batidas por tempo | Time signature (2/4, 3/4, 4/4, 5/4, 6/8, 12/8) and subdivision (1–4 per beat) | **Live**: the score is re-laid-out (`relayoutScore`) and restarted; strum patterns keep their shape |
| Som (sound) | Metrônomo, Subdivisões, Guia sonoro | Click on beats; click on subdivisions (quieter, 988 Hz); synthesised guide plays the expected strums/notes |
| Validação (validation) | *"o tempo sempre conta"* = timing always counts. Checkboxes/selects below | See §8 |
| Direção ↓/↑ da palhetada | off / soft / strict | See §8 |
| Tolerância (timing) | strict / normal / wide | Scales the windows ×0.6 / ×1 / ×1.6 |
| Espaço atrás (space behind) | Pouco / Médio / Muito | 15 % / 30 % / 45 % of the lane behind the now bar |

All of these persist in local storage (`settings.*`).

## 7. Modes

- **Timed (default):** events must be hit near their scheduled time.
- **Wait mode** (8 exercises): the score *waits* for the correct action ("sem exigir a batida" – does not require the beat). It still runs on the shared clock, so the metronome keeps ticking, but the grade is not timing-based. Good for first contact with a new chord shape.
- **Demo mode:** if no guitar is connected the app shows a blue "Modo demo" badge; keyboard strums stand in for the guitar so the whole flow can be explored (and was used to produce these screenshots). There are no fret sensors in demo mode, so *neck-assembly* checks are skipped, and the chord-assembly exercise is resolved as "ok" with a note that the shape was not verified.

## 8. Evaluation rules (exact numbers)

### 8.1 Timing windows

For tempo `bpm` and subdivision `sub`, one *slot* lasts `slot = 60000 / bpm / sub` ms. Three nested windows (each ± around the exact time):

| Grade | Window (ms) | Weight in accuracy |
|---|---|---|
| Perfeita (perfect) | `min(55, slot × 0.15)` | 1.00 |
| Boa (good) | `min(110, slot × 0.30)` | 0.75 |
| No limite (borderline, "ok") | `min(200, slot × 0.45, slot × 0.50)` | 0.45 |
| Perdida (miss) | outside | 0 |

Multiplied by the tolerance setting (strict ×0.6 / normal ×1 / wide ×1.6). Computed examples (normal tolerance):

| BPM | Sub | Slot | Perfect | Good | Ok |
|---|---|---|---|---|---|
| 80 | 2 | 375 | ±55 | ±110 | ±169 |
| 100 | 2 | 300 | ±45 | ±90 | ±135 |
| 120 | 2 | 250 | ±38 | ±75 | ±113 |
| 120 | 4 | 125 | ±19 | ±38 | ±56 |
| 160 | 4 | 94 | ±14 | ±28 | ±42 |

At 80 BPM / sub 2, strict gives 33/66/101 ms; wide gives 88/176/188 ms (the ok window is capped at half a slot so neighbouring events can never overlap).

**Why scale with the slot?** A fixed ±100 ms is generous at 60 BPM but meaningless at 160 BPM in sixteenths. Scaling keeps the exercise honest at any speed.

### 8.2 Latency calibration

`settings.latency` (0–400 ms) is subtracted from every guitar timestamp. A calibration wizard (see [07-settings-calibration-lab.md](07-settings-calibration-lab.md)) measures it. It affects **timing only**: it never moves frets or notes.

### 8.3 Grading a strum as a time interval

An AG01 delivers a strum string by string: the six notes arrive within **0.33–0.66 s** in our captures, with up to ~0.21 s between neighbouring strings (verified). The grader therefore treats a strum as an *interval*:

1. The **first string's** arrival is the strum's time and decides the timing grade (perfect / good / borderline).
2. The remaining strings are **gathered into the same strum** for as long as it continues: up to the next expected strum, clamped to **330–900 ms** from the first note. Strings that arrive after the first are absorbed (they never count as "extra" notes).
3. **The same string sounding again starts a new strum**, which is what separates two fast strums whose arrivals overlap in time.
4. The strum already in progress has priority for the strings it is still missing.
5. Verdicts that need the whole strum (direction, chord by sound) are produced when the strum has finished arriving; the timing grade does not wait.

On the live fretboard and in the Laboratory, a strum cluster is closed after **260 ms of silence** between strings. This is covered by an automated test that replays the measured string spacings (fast, medium and slow strums, 60–120 BPM, in every validation mode) and checks that all six strings are recognised and no note is counted as extra.

### 8.4 Optional validations

| Option | Values | What is checked |
|---|---|---|
| `neckOn` ("Montagem no braço") | on by default | Using the fret sensors (CC49/CC50, see [01](01-ag01-integration.md)) the chord assembled on the neck is compared with the expected shape. Wrong or missing fingers lower the result. |
| `sound` | off (default) / `chord` / `strings` | `chord`: the set of notes played is matched to the expected chord *tolerantly* (variations such as Cadd9 or C/E count as C). `strings`: every expected string must sound. |
| `dirMode` | off / **soft** (default) / strict | Direction ↓/↑ is inferred from the order in which strings arrive (≥3 distinct strings; ascending order ≥2× descending → D, the reverse → U, otherwise unknown). `soft`: wrong direction lowers *perfect → good*. `strict`: wrong direction = miss. |

When direction or chord is checked, the verdict is **deferred** until the strum has finished arriving.

> **Honest caveat:** only *down* strums were seen in real AG01 captures (ascending string order). Up-strum detection is implemented but **not verified on hardware** **[inferred]**. Fret-sensor reporting of a barre/pestana is also unknown.

### 8.5 Assembly mode (exercise "Montagem de acorde")

`score.assemble = { hold: 0.3 s, strum: optional }`. Sequence: (1) player lifts the hand (no fret pressed), (2) assembles exactly the expected frets, (3) holds the shape for 0.3 s, (4) optionally strums. See [05-chords.md](05-chords.md) for the UI. Without a fret sensor (demo) this is resolved as "ok".

### 8.6 Accuracy %

`accuracy = Σ(weight of each event) / number of events`. "Extras" are shown but do not (yet) reduce accuracy. Sessions are saved with technique, level, accuracy, BPM and duration and feed the Progress screens ([06-home-and-progress.md](06-home-and-progress.md)).

## 9. Exercise types in detail

| Type | Generator | Notes |
|---|---|---|
| Strumming | `strumScore` — pattern string like `D-DU-UDU` (D, U, `-` rest) over chords/bars | ↓/↑ direction per slot |
| Picking | `noteSeq` | Single-string alternate picking, tests string identity + time |
| Chord change | `changeScore` | Chord strip + "TROQUE →"; one strum per chord; the timing check is *inside the segment* in some exercises |
| Arpeggio / Fingerpicking | `arpScore` / `arpSequence`: asc, desc, updown, **pima**, alt, pinch, travis, pmi | Notes per string; Highway view |
| Scale | `scaleNotes` / `SCALES` | Position-based, fret numbers on pills |
| Melody | note sequences | |
| Speed | BPM ramp (3 exercises) | The only automatic ramp |
| Rhythm | metronome sync | |
| **Expressive techniques** | `techniqueScore`, `mutedScore` | hammer-on, pull-off, slide, bend, vibrato, palm mute, muted strum |

**Guide-only exercises (22).** The AG01 sends no bend/vibrato/slide data, so such gestures **cannot be graded**. The app says so on screen (a "limitations" text) and draws the blocks with a dashed outline; the player is rewarded for timing the *note* only. This honest labelling was a deliberate decision.

## 10. Clock rules (reliability)

All practice and metronome audio use one `Transport` (beats-based pausable clock):

- Look-ahead scheduling of 0.2 s; clicks per run go to their own audio bus, which is **dropped on pause**, silencing anything already scheduled.
- Tempo/meter changes call `cancelFuture()` and re-schedule; `continuation()` keeps the metronome pulse in phase when you restart.
- **Single-clock rule:** only one clock may sound at a time. Pause → pauses all; start/resume/restart → pauses the others; leaving the route or finishing a run → stops all. (Calibration is exempt.)
- Accent click = triangle 1568 Hz (peak 0.9, 90 ms); normal beat = sine 1047 Hz (0.3, 45 ms); sub-click = 988 Hz (0.12, 30 ms).
- `Runner.healClock()` recreates a stopped clock at the last known position, so a stray stop never leaves a run without sound.


## 11. Edge cases and limitations

- Strum timing is read from the **first string's** arrival; any systematic offset is absorbed by the timing calibration ([07](07-settings-calibration-lab.md)) or by the tolerance setting.
- Palm-mute arrives as CC 123 (all-notes-off) per string. The app uses it to clear the sustained note on the fretboard; it is not used to grade muted strums.
- Some captures show all notes shifted −1 semitone (unknown cause; maybe tuning or sensor state). The app never moves displayed frets because of it; `pitchOffset` affects *validation only*.
- There is no note-off for plucked notes on release; "sustain" in the live fretboard is an *estimate* (default 2.5 s, configurable).
- Demo mode accuracy numbers are not representative.

## 12. Ideas for the native AeroBand app

1. **Per-event ms feedback** and the early/late meter.
2. **Windows scaled to the slot length** (not a fixed number) — fair at any tempo.
3. **Strum as a time interval:** gather the string arrivals of one strum over 0.33–0.9 s, take the timing from the first string, and let the same string sounding again mark a new strum.
4. **Fret-assembly validation** (the AG01's biggest differentiator — a microphone app cannot do it).
5. **"TROQUE →" pre-warning**, chord strip, and slower speed multiplier (25–125 %) without editing BPM.
6. **Live meter/subdivision relayout** so the same exercise can be practised in 3/4 or 6/8.
7. **Honest "guide-only" labelling** for techniques the hardware cannot sense; asking AeroBand: *could firmware report bend/slide/hammer?*
8. Share the **single-clock rule** and look-ahead scheduler as an architectural recommendation.
