# Decide the upscale trigger rule and prefetch policy

`wayfinder:grilling` · HITL · parent: [map](../map.md) · assignee: nemiru · status: closed

## Question

Which Spreads get upscaled, and when?

- ~~**The trigger.**~~ **Largely settled** — see the map's standing constraint: only deficient Spreads are ever upscaled (landscape **and** `width < 2 × baseWidth`). The measured distribution is bimodal at 1.0× and 2.0× with nothing between, so any threshold in the gap works and no judgment is needed. `isLandscape` (`client/src/spreads.ts:3`) is not this predicate — it matches sharp Spreads too. What remains: where the predicate lives (the reader knows `baseWidth`; the upscaler doesn't), and whether a Spread below ~1.0× — too deficient for 2× to reach parity — should be skipped rather than half-fixed.
- **Prefetch depth.** A reader spends 20–60s per Spread. How many ahead is enough to stay invisible, given the measured throughput? The reader already prefetches the next Chapter (`nextSpreads`, `client/src/App.tsx:124`) — is that a precedent or a warning?
- **Filmstrip jumps.** The filmstrip lets you jump anywhere in the Chapter (`client/src/App.tsx:487`), instantly outrunning any queue. Does a jump reprioritise the queue, or just show the original and let it catch up?
- **Cancellation.** Leaving a Chapter mid-queue — abandon, or let it finish and warm the cache?

## Resolution

**Fire on learning deficiency.** The moment a Spread's dimensions resolve, request its upscale if it qualifies (landscape **and** `width < 2 × baseWidth`). That is the whole policy.

### Why this is not "prefetch"

There is no depth to tune, no queue to build, no scheduler, no new machinery. The rule unifies both dimension sources without caring which one fires it:

- Site HTML supplies `width`/`height` (`server/extractors/generic.ts:98`) → fires at Chapter open.
- Only measurement supplies them (`naturalWidth` on load, `client/src/App.tsx:75`, merged via `withMeasuredSizes`) → fires as knowledge arrives.

Knowledge already arrives ahead of the reader for free: the filmstrip loads full-resolution bytes for every Spread (`.thumbnail img` uses the source URL, CSS-scaled to 62px) with `loading="eager"` across `activeSpreadIndex..+2` (`client/src/App.tsx:496`). At 20–60s of reading per Spread, a 2-Spread lead means an ~2–10s upscale of an 800×574 image has long finished before arrival. **The existing eager window is the prefetch.**

### What this dissolves

- **Prefetch depth** — not a knob. Whatever the filmstrip's eager window already measures is the lead.
- **Filmstrip jumps** — no longer a problem. Jump anywhere and the eager window moves with you, firing what's newly visible. Anything not ready shows the original and swaps when it lands, which is the specified fallback behaviour, not a failure.
- **Cancellation** — stops existing. Navigating away from a fired upscale doesn't waste it; it warms the cache. The pipeline's `pending` map (`server/image-pipeline.ts:92`) already dedupes duplicate requests.

### Robust to the rate being wrong

[Decide whether to fix this at the source instead of upscaling](008-decide-source-resolution-vs-upscaling.md) established that 001's affected-Spread rate is a **floor, not a count** — it sampled only completed Chapters and missed the resume Chapter where the defect was actually visible. This policy is **rate-independent**: it reacts to each Spread on its own evidence and never consults a frequency. If the true rate is 3× the measured one, nothing here needs revisiting.

### Follows from the rule (flagged, not silently decided)

Applied uniformly, the rule also fires for the **next Chapter's** Spreads, since `nextSpreads` renders their thumbnails too (`client/src/App.tsx:504-511`) and those measure just like any other. That is consistent and cheap — the reader auto-flows into the next Chapter anyway, so the work is very likely used rather than wasted. Left uniform rather than special-cased.

### The floor — theoretical, no instances

A Spread so deficient that even 2× misses parity (e.g. 500px against `baseWidth` 800, needing 3.2×) would come back still blurry, having burned the compute. Nothing like this exists: the measured distribution is a clean bimodal 1.0×/2.0×. Not worth pre-solving.

### Accepted cost

Occasionally a few CPU-seconds on a Spread never viewed — jumped past, or the Chapter abandoned. At roughly one affected Spread per four Chapters this is a rounding error, and the result is cached rather than discarded.

## Blocked by

- [Confirm parity at real Spread ratios](003-confirm-parity-at-real-ratios.md) **(closed: GO)**
- [Choose the upscaler runtime and host GPU](002-choose-upscaler-runtime-and-gpu.md) **(closed: no GPU needed)** — prefetch depth is a function of measured throughput.
