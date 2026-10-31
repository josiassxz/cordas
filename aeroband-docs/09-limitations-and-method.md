# Limitations and method

We would rather under-claim than over-claim. This page states exactly how the observations in this folder were obtained and what they do **not** prove.

## How the guitar data was obtained

- **Device:** one AeroBand AG01, advertised over Bluetooth as `AeroBand Midi 297b`.
- **Method:** *passive listening only.* A script (Python + `bleak`) and the app itself subscribed to the BLE MIDI characteristic's notifications and logged what arrived, while the author played. Nothing was written to the guitar. No SysEx, no firmware access, no memory access, no undocumented commands, no change to internal calibration.
- **Sessions:** a handful of short captures (tens of seconds each, about 1,400 packets in the ones analysed for this document), guided by a scripted sequence of spoken instructions (for example "press fret 3 on the A string and hold, then release").
- **Other services:** the guitar also exposes a Nordic-UART-style service. We subscribed to its notify characteristic (it sent a short ASCII text once, `char1serial_notify`) and did **not** explore or write to it.
- **Safety net:** `tests/safety.test.mjs` scans all non-legacy source for characteristic writes and SysEx and fails if any appears; it was mutation-tested (inserting a write makes it fail).

## Verified, inferred, simulated

| Claim | Status | Basis |
|---|---|---|
| One MIDI channel per string (channel 0 = low E … channel 5 = high E); open-string notes 40, 45, 50, 55, 59, 64 (E A D G B E) | **Verified** | Captures |
| Note-on velocity varies (12–73 in the analysed captures) | **Verified** | Captures |
| Note-off only when the same string is plucked again; CC 123 on mute | **Verified** (note-off), **Verified** (CC 123) | Captures |
| CC 49 = press (value = fret), CC 50 = release (value = fret); channel order reversed vs notes; fret range seen 1–22; value 0 never seen | **Verified** | Scripted press/hold/release capture |
| BLE-MIDI header/timestamp bytes are always `80 80` (timestamp 0) | **Verified** (all 1,378 packets analysed) | Captures |
| A strum's six notes arrive over 0.33–0.66 s, up to ~0.21 s between neighbours | **Verified** | Captures |
| All strings shifted by −1 semitone together at times | **Verified once** in an early capture; not seen later | Early capture |
| CC 54 increments per strum; a proprietary `F3` message | **Observed**, meaning unknown | Early capture |
| Strum **down** appears as ascending string order | **Inferred** | Only down-strokes were recorded |
| Strum **up** appears as descending string order | **Not verified** | Never captured |
| Barre chords produce press messages on every covered string | **Not verified** | Never captured |
| Which finger is on which string; right-hand fingers; hammer-on/pull-off/slide/bend/vibrato | **Not observable** | No message type |
| Screenshots of exercises with hits, ✓ and ms | **Simulated** | Emulated events, demo data |
| Timing numbers (windows, latency compensation) | **Computed** by the app; the *right values for a given player* depend on their setup | Code + tests |

## What is tested by automation (149 tests)

Pure logic is covered by `node --test` tests with emulated events: the BLE-MIDI parser against real captured packets; chord library validity; the exercise evaluator in every validation mode, with strum timing replayed from the measured string spacings; the single-clock rule; the chord-assembly rules; strum-direction inference; the drag-and-drop builder model; progress statistics.

## What is **not** covered by hardware testing

- **Long play sessions.** Most behaviour was verified with emulated events and short real-hardware checks, not by hours of practice. Subtle timing-feel issues need real play to find.
- **Another AG01 unit, another model, another firmware version.** Everything assumes the protocol observed on the author's unit. The app lists any BLE-MIDI device in the pairing dialog, but only the AG01 is known to work.
- **Up-strokes and barre chords** (see the table above).
- **The chord-assembly exercise on real hardware.** It is verified with emulated CC 49/50 sequences and the real captured message format, not yet with a full session on the guitar.
- **iOS / Safari.** Web Bluetooth is Chrome-only on desktop/Android; the app was not tried on a phone.
- **Accessibility and localisation.** The interface is Brazilian Portuguese only; keyboard shortcuts exist but there has been no screen-reader review.
- **Security review.** The app runs locally in the browser and has no server component; it stores data in `localStorage`/IndexedDB only.

## Known approximations in the app

- **Sustain is estimated** (default 2.5 s per string, adjustable 0.5–8 s) because the guitar sends no note-off when a string decays.
- **Strum direction is inferred**, needs at least three strings, and is ignored (not penalised) when it cannot be determined.
- **Chord-by-sound** uses a tolerant rule (root + third [or 2nd/4th for suspended] + seventh if requested; extras ignored). It is a teaching aid, not a music-theory-complete chord recogniser.
- **Chord shapes** come from a generated library validated against each chord formula, plus curated open shapes. Unusual voicings may be missing.
- **Open-string-only chords** cannot be shape-checked (no finger, no message).
- **Timing calibration** measures the player's average offset against a click; it cannot separate Bluetooth latency from the player's habit.

## Independence and content

- Corda is an independent hobby project and is not affiliated with, endorsed by, or supported by AeroBand.
- No AeroBand assets, code, firmware or trademarks are included; the AG01 is named only to describe what it was tested with.
- All musical content (exercises, patterns, chord shapes) was generated or written for this project.
