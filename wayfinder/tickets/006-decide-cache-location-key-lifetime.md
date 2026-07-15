# Decide cache location, key, and lifetime for upscaled Spreads

`wayfinder:grilling` · HITL · parent: [map](../map.md)

## Question

Upscaled bytes are far more expensive to regenerate than fetched bytes — seconds of GPU versus one HTTP request. Today's cache doesn't reflect that: `ByteLru` (`server/image-pipeline.ts:17`) is in-memory, 200MB, keyed by source URL, and dies with the process.

- **Which side caches?** The service (once, shared by every device) or the reader (already has an LRU)?
- **Disk or memory?** Restart-durability now matters in a way it didn't for source bytes.
- **What's the key?** Source URL alone is wrong — the same Page at a different target width is a different artifact. URL + target width? URL + model + width?
- **Eviction and budget.** 200MB of source bytes is one policy; upscaled Spreads at 2x are ~4x the pixels. What's the budget, and does the Library's persistence (`library.json`) suggest a home for it?
- **Invalidation.** If the model or target changes, what happens to what's cached?

## Blocked by

- [Confirm parity at real Spread ratios](003-confirm-parity-at-real-ratios.md) **(closed: GO)**
