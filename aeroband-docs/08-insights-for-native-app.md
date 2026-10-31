# Insights for the native AeroBand app

This page collects the ideas that came out of building Corda, ranked, each with **the evidence behind it**, **what it would take**, and **what to watch out for**. Effort labels: **S** = days, **M** = weeks, **L** = months or needs a firmware change.

> Everything here is an *opinion from the outside*. We only know the AG01 through its Bluetooth MIDI output and our own experiments. Where an idea needs firmware changes we say so, and where we are unsure the guitar can do it we say that too.

## Summary table

| # | Idea | Impact | Effort | Needs firmware? |
|---|---|---|---|---|
| 1 | Pressed frets as a first-class, live state | Very high | S | No (CC 49/50 already sent) |
| 2 | Judge chords by finger placement, not by sound | Very high | S–M | No |
| 3 | Show the hit window as block width + signed error | High | S | No |
| 4 | Keep judged notes visible behind the "now" line | High | S | No |
| 5 | Treat a strum as an interval (0.33–0.9 s grader) | Very high | S | No |
| 6 | Real BLE-MIDI timestamps from the guitar | High | M | **Yes** |
| 7 | Explicit strum-direction (and per-strum summary) | High | M | **Yes** |
| 8 | One-minute timing calibration in onboarding | High | S | No |
| 9 | One global audio clock (pause = silence) | Medium | S | No |
| 10 | Visual, drag-and-drop drill authoring | High | M | No |
| 11 | Chord-assembly drills (lift → place → hold) | High | M | Better with finger IDs |
| 12 | Explicit note-off / mute per string | Medium | M | **Yes** |
| 13 | Live tempo / meter / subdivision changes | Medium | S–M | No |
| 14 | Visual chord picker with variations & saved sequences | Medium | M | No |
| 15 | Local-first progress, goals and learning paths | Medium | M | No |
| 16 | Instrument switching with per-instrument tuning model | Medium | M | Hardware-dependent |

---

## 1. Pressed frets as a first-class, live state

**Observation (verified).** The AG01 sends, per string, **CC 49 with the fret number (1–22) when a finger presses**, and **CC 50 with that fret when it lifts**, independent of any plucking. It also sends no value 0 and keeps the state until the release message arrives.

**What it enables.** The fretboard can react *while the learner is still placing fingers* — green for a correct finger, red-dashed for the right string on the wrong fret — before a single note sounds. This is the single biggest teaching lever we found: most beginner errors are finger placement errors, not strumming errors. See [02](02-live-fretboard.md).

**How to do it.** Keep a per-string "pressed fret" map updated by CC 49/50; render it in the fretboard; treat the map as input to any exercise grader (see ideas 2 and 11).

**Watch out for.** The string order in CC 49/50 is the **reverse** of the order in note messages (MIDI channel 5 is the low E in the fret messages, channel 0 is the low E in note messages). Open strings cannot be reported (there is no finger), so a chord made only of open strings can be checked for *timing* but not for *shape*.

## 2. Judge chords by finger placement, not by sound

**Observation (verified by design and by tests).** Beginners strum all six strings. A clean D major played on six strings rings the open low E and A strings, so a sound-based detector reports **Dadd9/E** (and a C played the same way reports **Cadd9/E**). The player *did* make the chord correctly, yet most chord detectors would mark it wrong or name a different chord.

**What worked.** Four separate, combinable validation layers ([03](03-practice-engine.md)):

1. **Timing** — always on.
2. **Neck assembly** — compare the pressed frets with the chord's fret pattern (default for learners).
3. **Sound by chord** — the notes played contain the chord's root, third and (if present) seventh; extra notes, added ninths and other bass notes are tolerated.
4. **Sound string-by-string** — the strictest mode, for advanced players.

Learners start with 1+2; as they improve they turn on 3, then 4. The player (not the app) chooses the rigour.

**Watch out for.** Do not hide the *actual* detected name: we keep showing "Dadd9/E" live while scoring the exercise as "D ✓" — the learner learns something from seeing both.

## 3. Show the hit window as geometry

**What we did.** Each target on the timeline is a block whose **width equals the full hit window** (± the "limit" tolerance), centred on the exact moment, with a thin line at the centre and two brighter inner bands for "good" and "perfect". After a hit, the block turns green with a ✓ and the signed error ("−81 ms", early; "+34 ms", late).

**Why.** A word such as "good" does not tell the player which way to correct, or how far off they were. Geometry answers both without explanation: if the strum lands inside the block it counts, and the signed ms number says whether to play earlier or later.

**Numbers.** The window scales with tempo (e.g. ±169 ms at 80 BPM with two strums per beat, ±84 ms with four, ±42 ms at 160 BPM with four). Full table in [03](03-practice-engine.md#hit-windows).

**Watch out for.** Offer a tolerance control (we have strict / normal / wide = 0.6× / 1× / 1.6×); the block resizes with it so the rule stays visible.

## 4. Keep judged notes visible behind the "now" line

We put the "now" line about 30 % from the left (adjustable: little / medium / a lot) and keep judged blocks at ≥ 50 % opacity until they reach the left edge. Learners can see their last four or five strums, which is where patterns of "always late on the up-stroke" become obvious. Our first version put the line near the left edge and let judged blocks fade within a beat; the author found it hard to see which strums had been right, which is why the line moved and the fade was slowed.

## 5. Treat a strum as an interval

**Observation (verified).** On the AG01 the six notes of one strum arrive **one after another**, 20–210 ms apart, taking **0.33–0.66 s** in total in our captures. A grader that waits ≤ 0.45 s (or a fixed fraction of the beat) for all strings will drop the last strings of slow strums and report "wrong string" or a half-credit strum.

**What worked.**
- Group the strings of one strum in a window from the first note up to **100 % of the time until the next expected strum, clamped to 330–900 ms**.
- Close a strum cluster after **260 ms of silence** (not 140 ms).
- Give the strum already in progress priority for the strings it is still missing.
- **The same string sounding again means a new strum.**

Verified with a test that replays the measured string spacings at 60–120 BPM in all validation modes. If the native app already does something like this, great; if it currently assumes an instantaneous strum, it is worth checking.

## 6. Real BLE-MIDI timestamps (firmware)

**Observation (verified).** Every one of the 1,378 packets we captured has the two BLE-MIDI header/timestamp bytes `80 80` — i.e. a **timestamp of 0 ms**. Receivers therefore time events by *arrival*, which includes Bluetooth connection-interval jitter (typically several ms to tens of ms). If the guitar stamped each message with its real 13-bit millisecond timestamp, receivers could reconstruct the true inter-string spacing and the true strum start, which would tighten timing judgement noticeably.

**Effort/risk.** Firmware change; the BLE-MIDI spec already provides the fields. Receivers that ignore timestamps would be unaffected.

## 7. Explicit strum direction (firmware)

**Observation.** Direction is **inferred** by Corda from string arrival order (ascending string numbers ⇒ down, descending ⇒ up; needs ≥ 3 strings and a clear order). In all our captures we only ever recorded **down-strokes**; we have **not** verified what an up-stroke looks like on the wire. The official hardware almost certainly knows the direction from its own strum sensor.

**Ask.** A per-strum summary message (direction, string count, first/last timestamp) or a direction bit in the note messages, so apps do not have to guess. We provide a Laboratory screen that prints the inferred direction and the string order for every strum, which is how we suggest verifying it.

## 8. A one-minute timing calibration

The total delay between "I hear the click" and "the app receives my note" combines Bluetooth latency, the phone/computer's audio output latency (large with Bluetooth headphones), and the player's own habit. Corda measures it: it plays 12 clicks, asks the player to strum along, takes the **median** of the errors and offers it as a latency compensation (0–400 ms). It also shifts the *visual* timeline by the audio output latency the browser reports, so what you see matches what you hear.

Recommendation: do this once in onboarding and offer it again whenever the audio route changes (headphones plugged in).

## 9. One global audio clock

Early on, pausing an exercise left metronome clicks audible in some paths. The fix that held: a **single rule** for all clocks — *pause* pauses every clock; *start / resume / restart* pauses every other clock; *stop* ends them all — plus a guard that re-pauses any stray clock while the exercise is paused and self-heals the exercise if its clock is lost. Restart also **continues the metronome pulse** (the first new click lands one beat after the last old click), which removed the "two metronomes out of phase" sound. We think any app with more than one audio source benefits from the same discipline.

## 10. Visual drill authoring

Authoring a strumming drill by typing patterns is a barrier. Dragging chords from a palette onto a beat grid, selecting several strums (drag-select, shift, ⌘) and flipping them all to ↓ or ↑ in one click, then saving the result by name, is quick to do. The same editor changes subdivision (1–4 strums per beat) and time signature (2/4 … 12/8) and re-lays the pattern on the new grid. See [04](04-rhythm.md).

## 11. Chord-assembly drills

A drill that scores **lifting the whole hand and re-forming a chord** on a beat is directly useful for chord changes and is only possible because of CC 49/50. Rules we use: all fretted notes of the target pattern must be pressed (and no string that should ring open may be pressed), held for 0.2–0.8 s (default 0.3 s), after the hand was fully lifted since the previous chord; timing counts from the moment the shape became correct; a strum afterwards is optional. See [05](05-chords.md#chord-assembly).

**Ask.** Finger identity (which finger is on which string) would allow much better feedback ("your ring finger is one fret too high"), and barre chords may need a decision about how the guitar reports a barre — we have not verified that.

## 12. Explicit note-off / mute (firmware)

The guitar sends a note-off for a string only when the **same string is plucked again**, and "all notes off" (CC 123) when the string is muted. There is no message when a ringing note naturally dies or when a finger lifts after a hammer-off. Corda **estimates** sustain (default 2.5 s) so the fretboard does not show a vibrating string forever. A note-off or amplitude-decay message would make "sustained note" exercises and legato work reliable.

## 13. Live tempo / meter / subdivision

Players want to slow a drill *while playing it*. Changing BPM live keeps the position and simply re-times the future; cancelling already-scheduled clicks avoids a wrong-tempo click. Changing the time signature or "strums per beat" re-lays the whole pattern on the new grid (more strums per beat repeats the pattern to fill the bar; fewer truncates it) and restarts the drill from the same setup.

## 14. Visual chord picker

A modal with search (accepts Portuguese note names such as "sol", "lá"), filters by root and family, **all** voicings of each chord, slash chords ("with bass"), a "more chords of G" panel, drag-to-reorder, and named saved sequences. Clicking a chord already in the sequence opens its variations as a tab and replaces it in place. See [05](05-chords.md).

## 15. Local-first progress

Practice sessions (accuracy, mean timing error, duration, technique, level) are stored locally and drive: a daily-goal ring, streaks, weak-technique detection, recommended next step, routines and level-gated learning paths. No account is needed; everything stays on the device. See [06](06-home-and-progress.md).

## 16. Instrument switching

The instrument menu lists Guitar (active) and Acoustic guitar, Bass, Ukulele and Piano as "coming soon". The data model already carries the string tuning, so a different tuning only needs a different string-to-pitch table; the harder part is chord/voicing data per instrument. Whether the hardware can report fewer or more strings is a question for AeroBand.

---

## What we would *not* copy

- **Our estimated sustain** (idea 12) is a workaround, not a feature.
- **Direction by arrival order** (idea 7) is a workaround.
- **Penalising beginners for ringing open strings.** See idea 2.

Questions, captures and raw logs are welcome: the Laboratory page ([07](07-settings-calibration-lab.md)) exports a JSON capture of exactly what the guitar sent.
