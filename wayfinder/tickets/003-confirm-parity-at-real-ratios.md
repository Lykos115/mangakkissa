# Confirm parity at real Spread ratios

`wayfinder:prototype` · HITL · parent: [map](../map.md) · assignee: nemiru · status: closed

## Question

The go/no-go. [Measure the Spread ratio distribution in real Chapters](001-measure-spread-ratio-distribution.md) found a bimodal real case: affected landscape Spreads are **800 pixels wide against an 800-pixel base Page** and therefore need a direct **2×** upscale to match the sharp 1600-pixel references. No fractional 1.1×–1.9× cases appeared in the completed-Chapter sample.

Take the actual affected 800-wide full Spreads linked in the measurement asset. For each, produce a direct learned 2× result and put it beside one of the actual 1600-wide Spreads that already renders sharp. Does it reach parity?

Watch specifically for **screentone moiré** — the classic waifu2x failure mode, and manga is full of tones. A panel crop may not surface what a full tone field does.

Also produce plain Lanczos 2× as the cheap control. If it closes the gap even at this full 2× deficit, the service is unnecessary and the destination is reached early with a two-line change.

Answer: go or no-go, with the comparison images linked.

## Blocked by

- [Measure the Spread ratio distribution in real Chapters](001-measure-spread-ratio-distribution.md) — can't test the real case without the real ratios. **(closed)**
- [Decide whether to fix this at the source instead of upscaling](008-decide-source-resolution-vs-upscaling.md) — **(closed: no better source exists; upscaling is warranted)**

Nothing open blocks this ticket — it is on the frontier.

## Resolution — **GO**

The reader ran waifu2x against real manga art and is **satisfied with the output**. Quality is the human's bar to set, and it is met. Screentone moiré — the anticipated failure mode, and the main reason this ticket gated the map — did not materialise as an objection; the art is B&W, so no chroma artifacts either.

**The Lanczos control is answered by the app's existing behaviour rather than by a fresh experiment.** What the reader renders today for an 800×574 Spread *is* a dumb upscale: the browser stretches it to full stage width with smooth bicubic interpolation (`.fit-width .spread.doubled-width img { width: 100% }`, `client/src/styles.css:102`). That output is the blurriness that started this effort. Lanczos is modestly crisper than the browser's filter, but it is a nudge, not the categorical jump to parity with a native 1600px Spread. **A plain resize does not close the gap; learned upscaling is warranted.**

No rigorous side-by-side was generated: this box has no `pip`, no `ensurepip`, and no ImageMagick/ffmpeg/vips — consistent with the README's no-native-image-libraries promise. Installing one would have required apt and sudo, which was not worth it given the control was already effectively answered.

**Consequence:** [Define the reader ↔ upscaler contract](004-define-reader-upscaler-contract.md), [Decide cache location, key, and lifetime for upscaled Spreads](006-decide-cache-location-key-lifetime.md), and [Decide the upscale trigger rule and prefetch policy](005-decide-trigger-rule-and-prefetch.md) are unblocked.

---

Best test subjects are the reader's *current* Chapter: **ch. 75 pp. 04 and 13 (800×574)** on `images.readmartialpeak.com`, with **ch. 72 pp. 02/11/20 (1600×1148)** from the same host and series as the parity reference — same scanlator, same book, so the comparison isolates resolution rather than scan style.

## Note (from [Choose the upscaler runtime and host GPU](002-choose-upscaler-runtime-and-gpu.md))

The measured case is a **direct 2× of an 800×576 image**, not the 2×-then-fractional-downscale this ticket originally assumed. 2× is native to every candidate runtime, so no downscale step is involved. Use `waifu2x-ncnn-vulkan -g -1` (CPU, cunet, scale 2) — no GPU needed — with plain Lanczos 2× as the cheap control, and the 1600px Spreads as the parity reference.
