# Reader UX prototype: spreads, navigation, fit

Type: prototype
Status: closed
Assignee: javierherrera52@gmail.com (session a910411f)

## Question

Prototype the reading screen (via /prototype) so its behavior can be decided by reacting to something concrete: two-page spread layout read right-to-left; navigation controls (arrow keys — which direction advances? — click/tap zones, spacebar); fit modes (fit-height vs fit-width vs original); how a single wide image that is already a two-page spread is displayed; how odd page counts and cover pages offset the pairing (and whether the user can shift the pairing by one); and what the end-of-chapter transition looks like. Link the prototype as an asset and record the decisions it settles.

## Assets

- Prototype (3 variants, self-contained HTML): [assets/04-reader-prototype.html](../assets/04-reader-prototype.html), published at https://claude.ai/code/artifact/35a22145-e6c7-4541-8c3a-d23e68d46f1e — awaiting user reactions.

## Resolution

Settled by reaction to the prototype (3 variants) on 2026-07-13. Verdict: **variant C (Scrubber), with a toggle into variant A (Immersive)** — the filmstrip reader is the default chrome; one control/key hides all chrome (strip, progress bar, title) for a chrome-free immersive mode and brings it back (center click/tap toggles).

Decisions the prototype settles (defaults accepted after hands-on use):

- **Layout**: two-page spreads read right-to-left — later page on the left. A pre-joined doubled-width page renders alone as a full spread (both in the reader and as a single filmstrip thumbnail).
- **Chrome (default, from C)**: title line (series — chapter) on top; bottom filmstrip of spread thumbnails with a gold progress bar; the strip continues past a labelled divider into the next chapter's thumbnails; clicking a thumbnail jumps (across chapters too). Current spread highlighted and kept scrolled into view.
- **Immersive toggle (from A)**: hides all chrome; overlay reappears on center click/tap.
- **Navigation**: `←` or `Space` advances, `→` goes back; left click-zone advances, right zone goes back, center toggles chrome. Backing past a chapter's first spread re-enters the previous chapter at its last spread.
- **Fit modes**: fit-height (default), fit-width, original 1:1; cycled via `f`/control. Fit-width shows the spread at full viewport width with vertical scroll; wide spreads span the full width.
- **Pairing**: default shift = cover solo (page 1 alone, then 2+3, 4+5 …); `p`/control shifts pairing by one. Pairing never persists anything — the resume position is chapter-level (see Library domain model).
- **End of chapter**: **seamless** — advancing past the last spread flows straight into the next chapter with a small toast naming it (no interstitial). When there is no next chapter: a "You're caught up" card (chapter is the latest; back-to-library action).

## Assets (capture)

Repo is not under git yet, so the prototype is captured as the linked asset itself: [assets/04-reader-prototype.html](../assets/04-reader-prototype.html) (all three variants + switcher, self-contained), published at https://claude.ai/code/artifact/35a22145-e6c7-4541-8c3a-d23e68d46f1e. The spread-pairing function `buildSpreads(pages, shift)` in the asset is the validated pairing logic the spec should carry over.

Discovered requirement for the image pipeline: the filmstrip needs every page of the current (and adjacent) chapter as a thumbnail, so image loading is not just "current spread + next" — feeds the image proxy/prefetch ticket.
