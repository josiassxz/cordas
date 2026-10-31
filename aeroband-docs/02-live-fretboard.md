# 02 · The live fretboard

The always-visible fretboard at the bottom of every screen. It is the one component that makes the guitar's data *visible*: which string you plucked, which frets your fingers are on **before** you pluck, and whether that matches what an exercise asks for.

> **Navigation:** [README](README.md) · [01 AG01 integration](01-ag01-integration.md) · **02** · [03 Practice engine](03-practice-engine.md) · [05 Chords](05-chords.md) · [07 Settings, calibration & lab](07-settings-calibration-lab.md) · [08 Insights](08-insights-for-native-app.md) · [09 Limitations](09-limitations-and-method.md)

Source: `js/ui/fretboard.js` (component), `css/fretboard.css` (look), `js/shell.js` (the dock, its controls and the header readout), `js/ui/chord-diagram.js` (live press on chord diagrams).

---

## 1. Purpose

1. **Mirror the instrument.** Anything the guitar sends appears immediately: a plucked string, a pressed fret, a palm-muted string going quiet.
2. **Show the target next to the reality.** When an exercise or the chord library is active, the *expected* finger positions are drawn on the same board, so the player can see the gap between what they are doing and what is asked.
3. **Give instant, finger-level feedback** — a placed finger turns green when it is on the right fret and red when the string is on the wrong fret — *before* any sound is produced.

It deliberately shows only what the instrument really reported (or what is derived from it), never what the app wishes were true. See [§8](#8-edge-cases-and-honest-limitations).

---

## 2. What you see

![Chord library with the live fretboard docked at the bottom, showing sounding notes and two pressed frets](images/02-fretboard-live-strum.png)

*Screenshot 02 (**simulated** strum plus two pressed frets while the **Acordes → Biblioteca** screen shows Em). **Header of the dock:** the green "AO VIEW"-style badge (**"ao vivo"**, live), the chord name guessed from what is sounding **right now** ("G6") and the list of those notes ("G3 B3 E4"). **Board:** the three highest strings still show orange dots with the note name (open G, B and E — they are still ringing); the low strings have already faded; the **E** on the D string and the **B** on the A string at fret 2 are the **pressed-fret marks** (orange, note name inside) coming from CC 49. The readout names a G6 because only three strings are still counted as sounding at the moment of capture.*

### 2.1 Anatomy of the dock

| Element | Label (Portuguese → English) | What it does |
|---|---|---|
| Badge | *ao vivo* (live) | Marks the live view |
| Chord readout | (large text) | Chord name guessed from the notes currently sounding; one note → its name; none → "—" |
| Note readout | (small mono text) | The sounding notes, low string to high string, with octave (e.g. *E2 B2 E3 G3 B3 E4*) |
| Fret count | *Casas −* / *Casas +* | Draw 12 to 24 frets (default 22) |
| Size | *A−* / *A+* | Make the board smaller/bigger (100–300 %, default 150 %, steps of 20) |
| Collapse | *Recolher* / *Mostrar braço* (Collapse / Show fretboard) | Hide the board to free space |
| Board | (SVG, role "img", label *Braço da guitarra em tempo real*) | The fretboard itself |

All of these controls are also in the settings dialog ([07](07-settings-calibration-lab.md)); values persist between sessions.

### 2.2 Board geometry (`js/ui/fretboard.js`)

- Drawn as one SVG, `viewBox 0 0 1200 236`, scaled to the width of the screen. Height is limited to `158 px × size-scale` (so ≈237 px at 150 %).
- **Highest string on top, lowest at the bottom**, the way tablature and most apps draw it. Left labels: *E A D G B E* from bottom to top order as shown (`STRING_LABELS = ['E','A','D','G','B','E']`, index 0 = lowest).
- The nut is on the left; **open strings are drawn just left of the nut**, so an open note is visible without a fret number.
- Fret spacing follows the usual logarithmic rule, rescaled so that whichever number of frets you choose fills the same width. Fret numbers run along the bottom.
- Position markers (inlay dots) at frets **3, 5, 7, 9, 12 (double), 15, 17**. String thickness grows toward the low strings.
- A fretted note is drawn at the centre of its fret cell.

---

## 3. The layers (what is drawn, and in what order)

From bottom to top (`js/ui/fretboard.js`, `build()`):

1. **Pressed-fret marks** (from CC 49) — *under* everything else, so they never hide a number or a note.
2. **Expected positions** (what the chord/exercise asks for).
3. **Live plucked notes** (from note-on).
4. **Result flashes** (a ring that expands for "right"/"wrong").
5. **Off-board notes** (notes that fall outside the drawn frets).

### 3.1 State table

| State | Looks like | Trigger | Disappears when |
|---|---|---|---|
| **Plucked note** | Orange filled dot with a glow, note name in dark text (no octave), plus an expanding ring for 0.5 s | Note-on | Note-off (fade 0.6 s), estimated end of ringing, or palm mute |
| **Vibrating string** | The string turns bright orange and trembles ±0.6 px every 0.09 s | Any string with a sounding note | Same as above |
| **Pressed fret** | Orange filled dot, note name inside (e.g. "B" at fret 2 of the A string) | CC 49 | CC 50 with the same fret, or a new fret on that string, or a 120 s failsafe |
| **Expected position** | Ring (blue by default), finger number inside; open string = smaller ring (no number) | Chord library selection, an exercise's next event | The target changes |
| **Expected, finger colours** | Ring colour by finger: **1 = orange, 2 = green, 3 = blue, 4 = purple** | Same | — |
| **Expected, right** (*hit*) | Ring filled green | The exercise judged that string right | After ~0.4 s (the next target is drawn) |
| **Expected, wrong** (*miss*) | Red dashed ring | The exercise judged it wrong | After ~0.4 s |
| **Expected & pressed correctly** | Green fill; **the finger number is replaced by the note name** | CC 49 on exactly that fret | CC 50 |
| **Expected & pressed wrongly** | Red dashed ring on the *expected* spot | CC 49 on a *different* fret of the same string | CC 50 |
| **String to avoid** | Line dimmed and dashed, its label becomes a red **×** | A target that mutes that string | The target changes |
| **Result flash** | A ring grows and fades (green ring = right, red ring = wrong), 0.7 s | The exercise judged a plucked string | automatic |
| **Note outside the board** | Dashed amber circle at the nut with a tooltip | A note whose derived fret is negative or beyond the drawn frets | After the note ends |

Colours come from the shared design tokens (`css/tokens.css`): accent `#f5a524`, expected `#6ea8fe`, ok `#3ddc97`, bad `#ff6370`, fingers `#ff9d5c / #3ddc97 / #6ea8fe / #c58bff`.

---

## 4. How each signal is handled

### 4.1 A plucked string
1. Note-on arrives with `string`, `note`, `velocity`.
2. The fret is **derived**: `fret = note − open-string note` (open notes 40, 45, 50, 55, 59, 64). **No offset or calibration is applied**; the app never moves the frets it draws.
3. If a dot already exists on that string it is replaced (re-plucks are instantaneous); the new dot appears with the attack ring.
4. The label inside the dot is the **pitch name without octave** and follows the sharps/flats setting.
5. **How long it stays:** the guitar sends no note-off when a note dies out, so the app removes the dot after the *Duração da vibração da corda* (String ring time) setting — default 2.5 s, 0.5–8 s — or immediately on palm mute (CC 123). The dot fades for 0.6 s (so "gone" is gradual, not a blink). Between plucks of the same string the guitar itself sends a note-off first, which the fretboard honours.

### 4.2 A pressed fret (no pluck needed)
1. `CC 49` with value *f* on channel *c* arrives. The app maps the channel to string `5 − c` (see [01](01-ag01-integration.md)).
2. A dot appears at fret *f* of that string with the note name `open note + f`. A tooltip reads *"Casa 5 pressionada (E3)"*.
3. When the player moves that finger the mark jumps to the new fret.
4. `CC 50` removes the mark **only if it carries the current fret** — a late release of an older fret cannot erase a newer press.

### 4.3 Expected positions and the green/red feedback
This is the part that works *while the fingers are still moving*:

1. The active screen publishes the target: a list of `{string, fret, finger}`.
2. Whenever a pressed mark and a target share the **same string and fret**, the target ring fills **green** and its finger number becomes the **note name** (so the player sees *"B"*, *"E"*, … rather than *"2"*, *"3"*). The pressed dot itself is drawn underneath, so nothing is covered.
3. If the string is pressed on a **different** fret, the target keeps its position but becomes a **red dashed ring**: "this string should be on *this* fret".
4. Lifting the finger removes the colour and restores the finger number.
5. Open strings (fret 0) have no sensor event; they are shown as a ring only.

![Em chord from the library: pressed frets coloured green where they match, orange where they do not](images/03-fretboard-pressed-frets.png)

*Screenshot 03 (**simulated**). Em is selected in the library, so the board shows its target: open-string rings (high E, B, G and low E) and the two fingered positions. The player has placed **A string fret 2** and **D string fret 2** — both turn **green with the note names B and E**. Two *extra* presses on **fret 3 of both E strings** do not belong to Em, so they stay **orange** (they are not "wrong", just not part of the target).*

![The same chord target before any press: finger-coloured rings and a green ring on the A string](images/34-instrument-menu.png)

*Screenshot 34 shows the target alone (the Em chord selected in the library): blue rings for the open strings, the finger-coloured rings at fret 2 of A (finger 2, green) and D (finger 3, blue). The instrument menu is open on the left; see [07](07-settings-calibration-lab.md).*

### 4.4 The chord readout
The big text in the dock header is a **guess from what is sounding right now**: the active notes are matched against known chord shapes; one note shows its pitch name; none shows "—". It reflects **sound, not the finger positions** — so a clean D played across six strings will be read as something like *Dadd9/E* because the open E and A strings ring. This is exactly why Corda's beginner validation looks at the **neck** instead of the sound ([03](03-practice-engine.md), [05](05-chords.md)).

### 4.5 Live feedback during a timed exercise

![An exercise with the strum timeline and the live fretboard showing the plucked chord and the target](images/05-train-exercise-timeline.png)

*Screenshot 05 (**simulated**, demo mode). The strum timeline is in [03](03-practice-engine.md); look at the dock: after the strum, all six strings show orange dots with note names (**G2 B2 D3 G3 B3 G4**), the readout says **G**, and the A-string/low-E positions (fret 2 and fret 3) are the chord's target positions.*

When a strum is judged, each expected string flashes green or red and the target rings colour for ~0.4 s before the next target appears (`js/engine/practice.js`).

### 4.6 Chord diagrams anywhere on screen (`bindDiagramPress`)
Every chord diagram in the app (library, drills, picker) listens to the same press events. When a pressed fret matches a dot in a diagram, that dot **turns orange, grows slightly, and its finger number becomes the note name**; it reverts on release. No extra wiring is needed per screen.

### 4.7 Optional sound
The setting *"Tocar som no navegador quando a guitarra soar"* (Play sound in the browser when the guitar sounds) synthesizes each plucked note in the browser with a velocity-scaled gain (`0.15 + 0.4 × min(1, velocity/100)`). Off by default; only active with a real guitar connected.

---

## 5. Exact rules and numbers

| Item | Value |
|---|---|
| Number of frets drawn | 12–24, default **22** (the AG01 reports frets 1–22) |
| Board size | 100–300 %, default **150 %**, buttons step 20 |
| Ring time of a plucked note (estimated) | 500–8000 ms, default **2500 ms**, step 250 |
| Fade-out of a released note | 0.6 s |
| Attack ring animation | 0.5 s |
| Result flash | 0.7 s |
| Right/wrong colouring held after a judged strum | ≈0.4 s |
| Press-mark failsafe (lost release) | 120 s |
| Pressed-mark label | `open-string note + fret`, pitch class only |
| Positions shifted by calibration? | **Never.** `setOffset()` is a no-op |

---

## 6. How it relates to the rest of the app

- The **chord library** puts the selected voicing on the board as the target ([05](05-chords.md)).
- **Exercises** publish the next event's positions and the strings to avoid ([03](03-practice-engine.md)).
- The **chord-assembly exercise** uses the *same* green/red logic as its rule: the assembled shape must be exactly the target ([05](05-chords.md)).
- The **laboratory** shows the same events as text ([07](07-settings-calibration-lab.md)).

---

## 7. Why it works well (observations)

- Because pressed frets appear **before** the strum, the player corrects a wrong finger *without making a wrong sound*. In the chord-learning exercises this turned "try, hear it is wrong, retry" into "see it is wrong, fix, then play".
- Replacing the finger number by the **note name** the moment a finger lands creates a free ear-training link: fret positions and note names are learned together.
- Drawing the pressed layer *under* the target ring was a deliberate fix: an earlier version covered the finger numbers with a white ball and users could not read them.

---

## 8. Edge cases and honest limitations

- **Plucked frets are derived from pitch.** If a string is sounding because a hammer-on, bend or slide happened, the derived fret may not be where the finger is. Pressed marks (sensor) and plucked dots (pitch) can therefore disagree — both are drawn.
- **Ring time is an estimate.** Without a real note-off, a note that decays naturally in 1 s still stays on screen for the configured time.
- **Barre chords:** whether every covered string produces a press event is unknown (see [01](01-ag01-integration.md)); if some do not, the green state for those strings will not appear.
- **Open strings** cannot be confirmed as "open and ready" before they are plucked.
- **Frets above the drawn range** (if the user lowers the fret count) are shown as dashed notes at the nut.
- The tooltip on an off-board note still mentions the old calibration option; it is cosmetic and will be rewritten.
- **Demo mode** produces pressed and plucked events from emulated data; no screenshot in this folder came from a physical guitar.
- Designed and tested for **standard tuning EADGBE** only; other tunings only change the note names, not the frets.

---

## 9. Ideas for the native AeroBand app

1. **Draw the pressed layer before the strum.** *Why:* the strongest teaching moment is the one before the sound; CC 49/50 already carry it. *Feasibility:* app-only.
2. **Colour the target by correctness live** (green = right fret, red = same string on the wrong fret). *Why:* fixes mistakes silently. *Feasibility:* app-only; the logic is ~40 lines.
3. **Swap finger numbers for note names on contact.** *Why:* teaches the fretboard by reinforcement. *Feasibility:* app-only.
4. **Never move the frets for calibration reasons.** *Why:* an early version applied a "pitch offset" to the displayed frets and users saw impossible positions; the sensor value is the ground truth. *Feasibility:* a design rule.
5. **Real note-off / string-quiet event from the guitar** would turn the ring-time estimate into an exact animation. *Feasibility:* firmware; see [01 §9](01-ag01-integration.md#9-ideas-for-the-native-aeroband-app).
6. **Let users resize the board and choose 12–24 frets.** *Why:* the same view works on a phone, a tablet and a monitor. *Feasibility:* app-only.
7. **Show the chord readout from the neck, not only from the sound** (e.g. "D — shape confirmed" even if open strings ring). *Why:* avoids confusing beginners with names like *Dadd9/E*. *Feasibility:* app-only.
