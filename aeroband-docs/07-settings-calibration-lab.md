# 07 · Settings, timing calibration, laboratory and instrument menu

Everything that tunes the app to a particular player, guitar and computer, plus the diagnostic screen that shows the raw data.

> **Navigation:** [README](README.md) · [01 AG01 integration](01-ag01-integration.md) · [02 Live fretboard](02-live-fretboard.md) · [03 Practice engine](03-practice-engine.md) · **07** · [08 Insights](08-insights-for-native-app.md) · [09 Limitations](09-limitations-and-method.md)

Source: `index.html` (settings dialog), `js/shell.js` (wiring), `js/engine/sync.js` and `js/engine/calibrate.js` (timing calibration), `js/views/lab.js` (laboratory), `js/core/store.js` (defaults, persistence).

All values are saved locally in the browser (`localStorage`, key `corda.v2`). Nothing is uploaded and nothing is ever written to the guitar.

---

## 1. Settings dialog ("Ajustes")

![Settings dialog, top half](images/32-settings-dialog.png)

*Screenshot 32 (**simulated** state; latency 85 ms and board size 130 % are demo values). The dialog opens from "Ajustes" at the bottom of the sidebar. It scrolls; the lower half is described in the table below.*

| Setting (Portuguese → English) | Range / options | Default | What it does |
|---|---|---|---|
| *Compensação de latência* (Latency compensation) | 0–400 ms | **80 ms** | Subtracted from the arrival time of every guitar event before it is compared with the beat. Bluetooth plus processing delays the signal; this puts it back. The app suggests a value after a calibration run |
| *Desvio de afinação (semitons)* (Tuning offset) | −3 … +3 | 0 | Only used when **checking notes** in exercises (for a guitar tuned a semitone down, as seen once). **Never changes the frets drawn on the board** |
| *Calibrar o timing* → *Medir meu atraso…* (Measure my delay) | button | — | Opens the timing calibration ([§2](#2-timing-calibration-sincronizar-com-a-guitarra)) |
| *Tamanho do braço* (Fretboard size) | 100–300 % | **150 %** | Size of the live fretboard; same as the **A− / A+** buttons next to it |
| *Casas no braço* (Frets on the board) | 12–24 | **22** | The AG01 reports frets 1–22 |
| *Duração da vibração da corda* (String ring time) | 0.5–8 s, step 0.25 | **2.5 s** | After this time the app considers a plucked string finished, because the guitar sends no "string stopped" message (only palm mute). 0 would mean "only palm mute ends it" |
| *Rigor do acorde* (Chord strictness) | Leve / Normal / Estrito | Normal | Used when the sound is checked by **chord**: *Leve* = root note is enough; *Normal* = root and third correct; *Estrito* = only the chord's notes |
| *Notação* (Notation) | Sustenidos (C#, F#) / Bemóis (Db, Gb) | Sharps | How note names are written everywhere |
| *Direção da palhetada (↓ / ↑)* (Strum direction) | Não conferir / Conferir / Exigir | Conferir | *Don't check*; *Check — wrong direction lowers the grade* (default); *Require — wrong direction is a miss*. Direction is **inferred** from string order and needs ≥ 3 strings |
| *Tolerância de tempo* (Timing tolerance — width of the block on the timeline) | Rigorosa / Normal / Ampla | Normal | Scales every hit window ×0.6 / ×1 / ×1.6. Faster tempos always give narrower blocks |
| *Montagem no braço* (Neck assembly) | on/off | **on** | Judge a chord by **which frets are pressed** (sensor data), ignoring extra open strings that ring |
| Sound check | *Não conferir o som* / *Pelo acorde* / *Corda a corda* | Don't check | On top of the neck check: validate the *sound* as a chord, or string-by-string with exact notes. A hint advises turning this on as the player improves |
| *Tocar som no navegador quando a guitarra soar* (Play sound in the browser) | on/off | off | Browser synth sounds each plucked note (Karplus-Strong), velocity-scaled |
| *Avançar sozinho após acertar um acorde* (Auto-advance) | on/off | on | In chord-practice mode, move to the next chord after a correct one |
| *Zerar progresso* (Reset progress) | button | — | Erases the local practice history, goals and statistics after confirmation. Settings are kept |

Timing windows behind the "tolerance" setting are listed in [03](03-practice-engine.md).

### Design notes
- **Every setting has a plain-language explanation under it** in the dialog, and the ones that change grading say *what* they change ("o tempo da batida sempre conta" — the beat timing always counts).
- Defaults favour **beginners**: no sound check, direction only lowers the grade, neck assembly on.
- **Nothing in the dialog can change what the guitar does**; there are no device settings at all.

---

## 2. Timing calibration ("Sincronizar com a guitarra")

![Timing calibration dialog with a countdown and the strum timeline](images/33-calibration-timing.png)

*Screenshot 33 (**simulated**). The dialog opens from "Medir meu atraso…". A click track plays, the timeline scrolls toward the "now" line, and the player strums on every click. Counters show how many hits were measured, the average delay and the spread.*

### Purpose
The total delay between "the click" and "the app receives the strum" is the sum of the Bluetooth link, the browser, the audio output (speakers, Bluetooth headphones) and the player's own habit. The calibration measures that **total** and suggests a latency compensation.

> It adjusts **timing only**. An earlier version also calibrated notes and frets; this was removed on purpose — the frets shown on the board are never altered.

### How it works (`js/engine/sync.js`)
1. The player chooses a tempo: **60, 80 or 100 BPM** (default 80).
2. **Começar** (Start) plays a **4-beat count-in**, then 4/4 clicks. The timeline shows the same arrows as in exercises.
3. The player strums **together with each click**, looking at the beat rather than the screen. The app measures **12 beats**.
4. Each strum's start is converted to a beat position using the browser's audio clock, minus the audio output latency reported by the browser. The nearest click gives the signed delay in ms (positive = late).
5. Rules: a strum farther than **45 % of a beat** from any click is ignored; only **one measurement per click** is kept; strums during the count-in are ignored.
6. Live read-outs: *Acertos medidos* (hits measured, `n/12`), *Atraso médio* (mean delay — the **median**, robust to one bad strum) and *Variação* (the median absolute deviation).
7. After the 12th hit (or when time runs out) the result is shown in words:
   - **Fewer than 4 hits:** "try again".
   - **Early by more than 15 ms:** "the compensation only fixes lateness — wait for the click" (nothing to apply).
   - **Within ±15 ms:** "very well synchronised, nothing to adjust"; the date is saved so the "calibrate" reminder disappears.
   - **Late by more than 15 ms:** "you arrive on average X ms after the click (Bluetooth + your hand). Current compensation N ms → suggested M ms" with an **Aplicar** (Apply) button. Suggested = current + median, clamped 0–400 ms.
8. Applying writes only the local setting `settings.latency` and `settings.calibratedAt`.

The calibration clock is marked as *exempt* from the global "one sound at a time" rule, so it works even while an exercise is paused behind it ([03 §single clock](03-practice-engine.md)).

### Calibration nudge
Before the first calibration, an exercise screen shows a small banner offering to calibrate (only when a guitar is connected and nothing was calibrated yet); it can be dismissed for the session.

### Limitations
- 12 hits per run is quick but noisy; a second run often shifts the result by 10–20 ms.
- The measurement mixes **device latency and human habit**. A professional player who "plays ahead of the beat" gets a negative number; the app then just tells them to wait for the click.
- There is no way to separate Bluetooth delay from audio-output delay; the browser's reported output latency is subtracted, which is only an approximation (Bluetooth headphones often under-report).

---

## 3. Laboratory ("Laboratório")

![Laboratory: live event log, tuning map and sound monitor](images/31-lab-raw-monitor.png)

*Screenshot 31 (**simulated** events, so the "RAW" lines are absent). Top left: the live event log. Top right: the tuning-calibration map. Below: the sound monitor and the table "what the AG01 reports".*

The lab is the transparency screen: it lets any owner *see* what their guitar sends and verify the claims in [01](01-ag01-integration.md) in seconds. It is strictly read-only.

### 3.1 Live events ("Eventos ao vivo")
One line per event, newest on top, kept to the last 120 lines on screen (2000 in memory):

| Line | Meaning |
|---|---|
| `RAW 80 80 94 3b 28` | The notification exactly as received (hex) |
| `corda 5 (B) ON  B3 (59) vel 40  traste≈0` | Note-on: string number, note name, MIDI number, velocity, and the **derived fret** |
| `corda 5 OFF B3` | Note-off from the guitar |
| `CC 49 = 3  (canal 5)` | A control change with its value and channel (49 = pressed fret 3, 50 = released, 123 = all notes off) |
| `PALHETADA ↓ (para baixo) — ordem das cordas: 1 2 3 4 5 6 — 6 cordas` | End of a strum, direction (↓ / ↑ / "direção não detectada") and the order the strings arrived in |

Buttons: **Limpar** (Clear) and **Exportar captura** (Export capture, downloads the log as a local JSON file when the user clicks it; nothing is sent anywhere).

### 3.2 Tuning calibration ("Calibração de afinação")
The player strums the six **open** strings. The lab compares each pitch to E-A-D-G-B-E and shows the difference in semitones per string (the *Δ* column). **Medir última palhetada** reads the last strum; **Aplicar desvio** (enabled when all strings agree) stores a single global offset used **only** for note validation. It was added after the one-semitone-low observation; frets drawn are never offset.

### 3.3 Sound monitor ("Monitor de som")
Added to inspect the audio-clock state live. It shows, every 100 ms:
- an output level bar read from an audio analyser on the app's **master output** — "SOM SAINDO" (sound playing) or "silêncio";
- the audio context state, **how many metronome clocks are alive** and their state/BPM, the exercise state, and the output latency reported by the browser.

If the user hears a click but the bar says *silêncio*, the sound is **not coming from this app** (another browser tab, the official app, a song). This turned a hard-to-reproduce complaint into something checkable.

### 3.4 "What the AG01 reports" table
A table, maintained next to the code, with a badge per capability — *sim* (reported), *inferida* (inferred by the app) or empty (not available): plucked notes, velocity, pressed frets (CC 49/50), strum direction, palm mute, finger/PIMA, hammer-ons/slides/bends/vibrato. It mirrors [01 §4](01-ag01-integration.md#4-what-the-guitar-does-not-send).

---

## 4. Instrument menu

![Instrument menu open from the sidebar](images/34-instrument-menu.png)

*Screenshot 34. The "Instrumento — Guitarra" button at the bottom of the sidebar opens a menu: **Guitarra** (checked), then **Violão** (acoustic guitar), **Baixo** (bass), **Ukulele**, **Piano** — each marked "em breve" (coming soon) and disabled.*

The app was structured for more than one instrument from the start: an instrument defines its strings, open notes and fret count, and every screen asks the active instrument rather than assuming six guitar strings. Only the guitar (AG01) is implemented today; the menu is a placeholder for future instruments and a hint of where the product could go (a bass or ukulele version of the same hardware idea).

---

## 5. Shell: status chip and dock controls

- **Connection chip** (top right): connect / connecting / connected with the device name / demo ([01 §2](01-ag01-integration.md#2-connection)).
- **Dock** (bottom): live badge, chord readout, **Casas −/+**, **A−/A+**, **Recolher** ([02](02-live-fretboard.md)).
- **Route change** stops all sound (`Transport.stopAll()`), so the metronome from one screen never leaks into another.
- **Keyboard:** Space/↓ down-strum, ↑ up-strum, X wrong strum (demo mode only); in exercises **P** start/pause, **F** fullscreen timeline.

---

## 6. Ideas for the native AeroBand app

1. **A one-minute timing calibration in onboarding** (same idea: strum along 12 clicks, show the median, apply). *Why:* total delay varies per phone/headphone; one measurement makes every score fairer. *Feasibility:* app-only.
2. **Use the median and ignore outliers.** *Why:* one mistimed strum should not skew the result; also report the spread so the player knows if they were consistent.
3. **Never "calibrate" what is displayed.** *Why:* fixing timing is safe; shifting frets or notes hides real mistakes and confuses learners.
4. **A visible diagnostics screen** (live event log, raw hex, strum direction, a sound-level monitor). *Why:* shortens support conversations ("what does your guitar send?") and lets enthusiasts help with testing. *Feasibility:* app-only, an afternoon of work.
5. **Explain every setting in one sentence under it**, including what it does *not* change. *Why:* fewer support questions, safer experimentation.
6. **Default to beginner-friendly validation, expose the strict options as a progression** ("turn the sound check on as you improve"). *Why:* a beginner who strums six strings should not be told the chord is wrong.
7. **Export a capture file** from the diagnostics screen. *Why:* owners can attach a real capture when sharing feedback.
8. **Instrument switcher placeholder** — showing the roadmap (acoustic, bass, ukulele, piano) in the UI makes the platform story visible early.
