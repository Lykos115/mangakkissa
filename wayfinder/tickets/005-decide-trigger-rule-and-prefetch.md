# Decide the upscale trigger rule and prefetch policy

`wayfinder:grilling` · HITL · parent: [map](../map.md)

## Question

Which Spreads get upscaled, and when?

- ~~**The trigger.**~~ **Largely settled** — see the map's standing constraint: only deficient Spreads are ever upscaled (landscape **and** `width < 2 × baseWidth`). The measured distribution is bimodal at 1.0× and 2.0× with nothing between, so any threshold in the gap works and no judgment is needed. `isLandscape` (`client/src/spreads.ts:3`) is not this predicate — it matches sharp Spreads too. What remains: where the predicate lives (the reader knows `baseWidth`; the upscaler doesn't), and whether a Spread below ~1.0× — too deficient for 2× to reach parity — should be skipped rather than half-fixed.
- **Prefetch depth.** A reader spends 20–60s per Spread. How many ahead is enough to stay invisible, given the measured throughput? The reader already prefetches the next Chapter (`nextSpreads`, `client/src/App.tsx:124`) — is that a precedent or a warning?
- **Filmstrip jumps.** The filmstrip lets you jump anywhere in the Chapter (`client/src/App.tsx:487`), instantly outrunning any queue. Does a jump reprioritise the queue, or just show the original and let it catch up?
- **Cancellation.** Leaving a Chapter mid-queue — abandon, or let it finish and warm the cache?

## Blocked by

- [Confirm parity at real Spread ratios](003-confirm-parity-at-real-ratios.md) **(closed: GO)**
- [Choose the upscaler runtime and host GPU](002-choose-upscaler-runtime-and-gpu.md) **(closed: no GPU needed)** — prefetch depth is a function of measured throughput.
