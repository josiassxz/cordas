# Executive summary

## What Corda is

Corda is a browser-based practice studio for the AeroBand AG01. It connects over Web Bluetooth, reads the same BLE MIDI stream the guitar already sends, and turns it into **practice feedback**: it shows what you play on a live fretboard, scrolls a timeline of what you *should* play, grades each strum against the beat, and tracks your progress over days.

It is deliberately a *practice* tool, not a song player. The guiding question was: **given only the data the AG01 already sends, how much real teaching can software do?** The answer turned out to be "a lot more than we expected", mostly because of one detail: the guitar reports **pressed frets before the string is plucked**, and reports **when a finger is lifted**.

## The AG01 data we rely on (all verified on a real unit)

| Signal | What it gives us |
|---|---|
| One MIDI channel per string, note-on with velocity | Which string was plucked, the pitch, how hard |
| CC 49 / CC 50 per string (value = fret 1–22) | Fret **pressed** / fret **released**, independent of plucking |
| CC 123 per string | "All notes off" — the palm-mute gesture |
| Arrival order of the six notes of a strum | Strum direction (inferred) and a strum duration of ~0.33–0.66 s |

The full list, including what is *not* available, is in [01](01-ag01-integration.md).

## What we built on top of it

- **A live fretboard** that shows plucked notes, pressed frets (before any sound), and colours the expected chord shape green or red while you are still placing your fingers — [02](02-live-fretboard.md).
- **A scrolling strum timeline** where each block's width is *exactly* the hit window, so "inside the block = correct" is literally what you see, with a ✓ and the early/late error in ms — [03](03-practice-engine.md).
- **Four independent validation modes** (strings, chord, neck assembly, timing only) and a configurable strum-direction check, so a beginner who strums all six strings is not punished for ringing open strings — [03](03-practice-engine.md).
- **A chord-assembly exercise** that requires lifting the hand, placing the exact fret pattern, and holding it for 0.3 s — only possible because of CC 49/50 — [05](05-chords.md).
- **A rhythm section** with a metronome, patterns, progressions and a drag-and-drop builder with bulk ↓/↑ editing — [04](04-rhythm.md).
- **A 312-chord library** with ~2,900 voicings, slash chords, a visual picker, and saved sequences — [05](05-chords.md).
- **Progress tracking** (goals, streaks, weak techniques, learning paths), all stored locally — [06](06-home-and-progress.md).
- **A laboratory** that shows the raw data, a live sound monitor, and exports captures — [07](07-settings-calibration-lab.md).

## The ten ideas we would prioritise for the native app

1. **Make "pressed" a first-class state, not just "plucked".** CC 49/50 already exist; surfacing them in the fretboard (even before the strum) changes how chord learning feels. *(Evidence: [01](01-ag01-integration.md), [02](02-live-fretboard.md).)*
2. **Judge the chord by the fingers, not by the sound,** at least for beginners. Real beginners ring open strings; sound-based chord detection then names the wrong chord (a clean D played on six strings is heard as *Dadd9/E*). *(Evidence: [03](03-practice-engine.md), [05](05-chords.md).)*
3. **Show the timing tolerance as geometry.** Draw each target as a block whose width equals the hit window, with the exact centre marked, and show the signed error in ms after every hit. Players understand it instantly. *(Evidence: [03](03-practice-engine.md).)*
4. **Give the player room to see the past.** Keeping the "now" line about 30 % from the left, and keeping judged blocks visible (green ✓ / red ✕), makes progress legible in real time. *(Evidence: [03](03-practice-engine.md).)*
5. **Grade a strum as a time interval.** On the AG01 the six strings of a strum arrive over 0.33–0.66 s (verified). Corda takes the timing from the first string and gathers the rest into the same strum for 330–900 ms, with "the same string again = a new strum" as the separator. *(Evidence: [03](03-practice-engine.md), [08](08-insights-for-native-app.md).)*
6. **Timestamp BLE MIDI packets in the firmware.** All packets we captured carry an all-zero BLE-MIDI timestamp; real timestamps would remove Bluetooth jitter from timing judgement. *(Evidence: [01](01-ag01-integration.md).)*
7. **Add an explicit strum-direction flag** (or a per-strum summary message). Today direction can only be *inferred* from string order, and we have only ever observed down-strokes. *(Evidence: [01](01-ag01-integration.md), [03](03-practice-engine.md).)*
8. **Include a one-minute timing calibration** in onboarding. Total delay (Bluetooth + audio output + the player) varies a lot per setup; measuring it once makes every later score fairer. *(Evidence: [07](07-settings-calibration-lab.md).)*
9. **Use one global clock for all sound** (pause = silence everywhere; start pauses everything else), so audio behaviour is predictable on every screen. *(Evidence: [03](03-practice-engine.md).)*
10. **Let people build their own drills visually.** Dragging chords onto a timeline and bulk-editing ↓/↑ turned out to be the most natural way to author a practice pattern. *(Evidence: [04](04-rhythm.md), [05](05-chords.md).)*

Each idea is expanded, with effort/impact notes, in [08](08-insights-for-native-app.md).

## Honest scope

Corda was built and tested against **one** AG01 and a handful of captured sessions. Many behaviours are verified by automated tests with emulated events (149 tests) rather than by hours of hands-on play. [09](09-limitations-and-method.md) lists precisely what was and was not verified, so that nothing here is over-claimed.
