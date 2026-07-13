# 02 — Add the complete Spread-reading controls

**What to build:** Give the Reader the complete interaction model established by the validated prototype so the user can comfortably navigate and inspect an entire Chapter without returning to the Library.

**Blocked by:** 01 — Paste a Chapter and open a basic Reader.

**Status:** closed

- [x] The Reader pairs Pages cover-solo by default and supports a per-session one-Page pairing shift without incorrectly pairing doubled-width Pages.
- [x] Left Arrow and Space advance, Right Arrow goes back, and the left/right click zones follow the same reading direction.
- [x] The center zone toggles immersive mode, hiding or restoring all chrome.
- [x] Fit-height, fit-width, and original-size modes work and cycle from the keyboard.
- [x] The title line shows Series, Chapter, and current Spread count.
- [x] The filmstrip represents Spreads, highlights the current Spread, keeps it visible, supports direct jumps, and shows reading progress.
- [x] The current Spread and next two Spreads are prepared eagerly while the rest remain lazy.
- [x] Automated interaction tests cover pairing, navigation, fit modes, immersive mode, and filmstrip jumps.
