# Decide cache location, key, and lifetime for upscaled Spreads

`wayfinder:grilling` · HITL · parent: [map](../map.md) · assignee: nemiru · status: closed

## Question

Upscaled bytes are far more expensive to regenerate than fetched bytes — seconds of GPU versus one HTTP request. Today's cache doesn't reflect that: `ByteLru` (`server/image-pipeline.ts:17`) is in-memory, 200MB, keyed by source URL, and dies with the process.

- **Which side caches?** The service (once, shared by every device) or the reader (already has an LRU)?
- **Disk or memory?** Restart-durability now matters in a way it didn't for source bytes.
- **What's the key?** Source URL alone is wrong — the same Page at a different target width is a different artifact. URL + target width? URL + model + width?
- **Eviction and budget.** 200MB of source bytes is one policy; upscaled Spreads at 2x are ~4x the pixels. What's the budget, and does the Library's persistence (`library.json`) suggest a home for it?
- **Invalidation.** If the model or target changes, what happens to what's cached?

## Resolution

**In memory, process lifetime, with mandatory temp-file cleanup.** The reader's server owns it — "which side caches" was moot once the service collapsed to a subprocess.

### Why memory, despite upscaled bytes being expensive

Because the cache barely earns its keep. Affected Spreads arrive ~1 per 4 Chapters, each upscale is 2–10s of one core on an 8-vCPU box, and [Decide the upscale trigger rule and prefetch policy](005-decide-trigger-rule-and-prefetch.md) fires it ~2 Spreads ahead, so the reader never waits. The cache only pays off on a *repeat view*: going back or jumping the filmstrip mid-session (memory covers this fully), or a Re-read after a restart (rare — and the app models Re-read as a distinct, uncommon path). Disk's entire advantage is surviving a restart that seldom happens to serve a Re-read that seldom happens. **Not worth a directory of image files the reader never wrote before.** The app's on-disk footprint stays `library.json` and nothing else.

### A separate cache instance, not the existing one

Upscaled bytes get their **own `ByteLru`**, not a shared budget with source bytes. An LRU evicts by recency and treats all bytes as equal — but source bytes cost one HTTP request to regenerate while upscaled bytes cost CPU-seconds, a difference of ~3 orders of magnitude. Sharing the 200MB budget would let ordinary page churn evict the expensive artifacts first, which is exactly backwards. A small dedicated budget (~32MB) is >10× headroom over the ~2–3MB the entire Library needs, so eviction is a safety net, never a policy.

### Key

`sha256(source URL | scale | model)`. Including the **model** makes invalidation automatic: swapping cunet for swin_unet yields new keys, so stale artifacts are unreachable by construction rather than by a purge someone has to remember. Source URL alone is wrong — the same Page at a different scale is a different artifact. Keys are distinct from `ImagePipeline`'s source-URL keys, so no collision even though both use the same class.

### Cleanup — required, not incidental

`waifu2x-ncnn-vulkan -i <in> -o <out>` is file-based, so temp files exist whether or not the cache does. They must not accumulate:

1. **Temps live in a dedicated subdirectory of `os.tmpdir()`** — never the project root. No footprint next to `library.json`, and the OS reaps anything missed.
2. **Per-job `finally` unlinks both input and output** — covers throw, timeout, non-zero exit, and spawn failure, not just the happy path.
3. **Startup sweep clears the temp directory** — covers orphans from `SIGKILL` or a crash, where no `finally` ever runs. Without this, hard kills leak silently and the reader is the only thing that knows the directory exists.

Point 3 is the one that actually prevents creep: per-job cleanup handles every failure the process survives, but only a boot-time sweep handles the failures it doesn't.

### Lifetime

Dies with the process. Accepted: the recompute is a few background CPU-seconds that the trigger policy hides anyway.

## Blocked by

- [Confirm parity at real Spread ratios](003-confirm-parity-at-real-ratios.md) **(closed: GO)**
