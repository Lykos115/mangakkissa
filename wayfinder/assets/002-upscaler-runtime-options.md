# Upscaler runtime options — and why the choice barely matters

Asset for [Choose the upscaler runtime and host GPU](../tickets/002-choose-upscaler-runtime-and-gpu.md). Measured 2026-07-15.

## The workload, restated

From [Measure the Spread ratio distribution in real Chapters](../tickets/001-measure-spread-ratio-distribution.md): **three** affected Spreads across 12 completed Chapters. Their actual dimensions:

| Spread | Size | Target (2×) |
|---|---|---|
| Witch Hat Atelier ch. 41 p. 9 | 800×576 | 1600×1152 |
| Witch Hat Atelier ch. 40 p. 22 | 800×569 | 1600×1138 |
| Witch Hat Atelier ch. 40 p. 27 | 800×569 | 1600×1138 |

Three images, each under half a megapixel, upscaled once and cached forever. Incidence is ~1 affected Spread per 4 Chapters read.

**This makes throughput a non-axis.** The ticket asked for "measured throughput per real Spread" to choose between the RX 6800, the 780M, and the 1050 Ti. At three 800×576 images, every option in the inventory — including this VM's no-AVX CPU — completes the entire backlog in minutes, once. Any GPU work here is unjustifiable.

Because time is free, the only axis that survives is **quality** — which inverts the usual advice.

## Runtime comparison

| | waifu2x-ncnn-vulkan | nunif / waifu2x (PyTorch) | onnxruntime-web (browser) |
|---|---|---|---|
| Install | Single portable binary, models bundled. "No CUDA or Caffe runtime environment is needed." | PyTorch + ROCm/CUDA, model weights. Multi-GB. | npm package |
| CPU-only | **Yes** — `-g -1` | Yes | Yes (it's the only mode) |
| GPU | Vulkan: works on *all three* GPUs incl. the 780M | ROCm (RX 6800/gfx1030) or CUDA (1050 Ti) | WebGPU not integrated |
| Models | cunet, upconv_7 | cunet, upconv_7, **swin_unet** (best) | cunet, upconv_7, swin_unet |
| 2× native | Yes | Yes | Yes |
| Speed | Fast | Fast on GPU | nunif's own README: *"very slow, like 90's dial-up internet access"* |

**2× is native in every option** — matching the measured requirement exactly. The 2×-then-Lanczos-downscale scheme assumed while charting is unnecessary; no affected Spread needs a fractional factor.

## Recommendation (conditional — see below)

**If upscaling happens at all: `waifu2x-ncnn-vulkan`, `-g -1` (CPU), cunet, scale 2.** It's a single portable binary with no Python and no native library to install, so it can't contaminate the reader's four-dependency story; it runs on any box including this VM; and it needs no GPU for this workload.

Escalate to **nunif/swin_unet** only if cunet fails the parity bar in [Confirm parity at real Spread ratios](../tickets/003-confirm-parity-at-real-ratios.md). Since time is free at this volume, the higher-quality model costs nothing but install pain — which is the *only* reason not to start there.

**The GPU question is closed: none is needed.** The RX 6800, 780M, and 1050 Ti are all irrelevant to this effort.

## ⚠ Correction (2026-07-15) — the section below is FALSIFIED

**The host theory is wrong. Do not act on it.** `images.readmartialpeak.com` serves *both* doubled and undoubled Spreads — chapter 75 pages 04 and 13 are **800×574** on that host. Scanned chapters 66–75 via HTTP Range requests: six landscape Spreads, width histogram `{1600: 4, 800: 2}`.

The blur is **per-chapter scan quality, not per-host**. Switching sources fixes nothing; there is no better source.

The correlation below was an artifact of sampling: [Measure the Spread ratio distribution in real Chapters](001-spread-ratio-distribution.md) measured only *completed* Chapters, and ch. 75 is the Series' resume Chapter — actively being read, therefore incomplete, therefore excluded. That removed the only counter-examples, leaving a clean but spurious host correlation across n=7. Causation was inferred from seven data points. It shouldn't have been.

**The upscaling premise survives, and the runtime recommendation above is unaffected** — a direct 2× of an 800×574 Spread is exactly waifu2x's case. See [Decide whether to fix this at the source instead of upscaling](../tickets/008-decide-source-resolution-vs-upscaling.md) for the full resolution.

Retained below as a record of the reasoning error.

## ~~The finding that undercuts the premise~~ (FALSIFIED — see above)

The three affected Spreads are not merely low-resolution. They are **the same series, read from a worse source.**

| | Host | Single Page | Spread |
|---|---|---|---|
| Blurry — ch. 40, 41 | `pic.readkakegurui.com` | 800px | **800px** (not doubled) |
| Sharp — ch. 68, 72 | `images.readmartialpeak.com` | 800px | **1600px** (correctly doubled) |

`baseWidth = 800` on all 12 Chapters. readkakegurui serves pre-joined Spreads at the *same* width as a single Page — so each half carries 400px of horizontal detail where a single Page gets 800.

There is no higher-res original on readkakegurui: `pic.readkakegurui.com/file/sancdn/...` is a Backblaze B2 bucket path (`/file/<bucket>/<path>`) — a static object, no resize parameters, and 125KB for an 800×576 WebP is a reasonable bitrate rather than a squeezed thumbnail. **That host simply stores 800px.**

But the other host has the same chapter:

```
images.readmartialpeak.com/witchhatatelier.com/Chapter 40/23.jpg  →  1600×1142  (landscape spread)
images.readmartialpeak.com/witchhatatelier.com/Chapter 40/01.jpg  →   800×1148  (portrait page)
```

**Chapter 40's spread exists at a real, native 1600×1142 on readmartialpeak.** Verified by fetching the bytes and parsing the JPEG SOF marker.

Real pixels beat synthesized pixels, unconditionally. waifu2x would be inventing detail that is sitting on another server, one HTTP request away.

### Caveats — this is not a free swap

- **Page numbering differs.** readkakegurui ch. 40 has landscape Spreads at pages 22 and 27; readmartialpeak ch. 40 has its Spread at page 23. These are different scan releases, not the same file re-hosted. Page counts and splits may differ.
- **`seriesKey` is the hostname** (`CONTEXT.md`). The same series from two hosts is already **two Series** in the Library — which is exactly why Witch Hat Atelier appears under both. Switching sources doesn't move a Series; it starts a new one, with its own Visited Log and Resume Chapter.
- **Only Witch Hat Atelier was checked**, and only chapter 40. Whether readmartialpeak covers the full run at full resolution is unverified.
- **Coverage is not guaranteed.** The reason those chapters were read from readkakegurui may be that the better host lacked them at the time.

## Method

1. Read affected-Spread URLs and dimensions from [the ratio-distribution asset](001-spread-ratio-distribution.md).
2. `curl -sIL` on the readkakegurui image for headers; confirmed Cloudflare/B2 static object, no resize params.
3. Fetched the bytes; `file` confirmed `800x576` WebP.
4. Probed `images.readmartialpeak.com/witchhatatelier.com/Chapter%2040/NN.jpg` for existence (200 vs 404).
5. Downloaded candidates and parsed JPEG SOF markers for true dimensions — `file` reports the 72×72 DPI density field for these JPEGs, which is not the image size and is easy to misread.
