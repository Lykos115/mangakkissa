# 04 — Flow seamlessly between adjacent Chapters

**What to build:** Let reading continue naturally across Chapter boundaries: discover adjacent Chapters without trusting inverted link relations, preview the next Chapter in the filmstrip, and apply Library side effects only when the user actually crosses the boundary.

**Blocked by:** 02 — Add the complete Spread-reading controls; 03 — Resume and manage Series from the Library.

**Status:** closed

- [x] Extraction gathers adjacent-Chapter candidates and assigns direction by parsed Chapter designation rather than `rel` labels.
- [x] Opening a Chapter starts background extraction of its detected next Chapter.
- [x] Peeking returns the normal Chapter payload without any Library side effects and uses a warm extraction result when available.
- [x] The filmstrip continues across a labelled divider into the next Chapter and supports jumping directly to its Spreads.
- [x] Advancing beyond the last Spread opens the next Chapter, applies normal open and Re-read rules, and displays a Chapter-change toast.
- [x] Going back before the first Spread re-enters the previous Chapter at its last Spread when one is available.
- [x] Reaching a Chapter's last Spread explicitly records completion, including when no next Chapter exists.
- [x] Automated tests cover designation ordering, side-effect-free peeks, cached boundary opens, forward flow, backward flow, and completion.
