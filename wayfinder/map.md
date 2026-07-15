# Map: Sharpen sub-2x Spreads with learned upscaling

`wayfinder:map`

## Destination

A go/no-go decision, plus a plug contract, for a **standalone upscaling service** that brings blurry sub-2x Spreads to parity with the Spreads that already look sharp — such that the Manga Reader behaves **exactly as it does today** when the service is absent.

## Notes

**Domain**: `CONTEXT.md` is the glossary for the reader (Page, Spread, seriesKey, Chapter). The thing being upscaled is a **Spread** — specifically a pre-joined landscape Page, the `spread.length === 1 && doubled-width` case at `client/src/App.tsx:416`.

**Skills**: `/grilling` and `/domain-modeling` for the decision tickets; `/research` for runtime questions; `/prototype` for anything where output has to be looked at.

**Planning, not doing** — this map produces decisions. Building the service is downstream of the map being complete.

### Established while charting (not decisions on the route — constraints the route runs inside)

- **`main` stays plug-and-play.** The MVP's promise (README): no database, no browser automation, no native image libraries, no second server, four production dependencies. This is why the upscaler is a *separate project*, not a feature. The reader gains at most an optional client.
- **Progressive enhancement is settled.** The original Spread renders immediately; an upscaled one swaps in when ready; nothing ever blocks. This takes inference off the critical path and is what makes even slow hardware viable.
- **Quality bar is parity, not perfection** — match the Spreads that already look fine. Confirmed achievable: waifu2x.net output on a real manga panel satisfied the reader. Manga here is B&W, so no chroma artifacts.
- **waifu2x models are fixed-2x.** If a future corpus contains a fractional target, the candidate route is upscale 2x, then Lanczos-downscale; the measured corpus did not require that path.
- **Only deficient Spreads are ever upscaled.** An image is touched only if it is short of parity with its own neighbours — landscape **and** `width < 2 × baseWidth`. Already-doubled Spreads (1600px) and single Pages are never processed, even when the stage renders them above native size. The measured distribution is bimodal (1.0× and 2.0×, nothing between), so this separates cleanly and needs no threshold judgment. Note `isLandscape` (`client/src/spreads.ts:3`) is **not** this predicate — it matches both blurry and sharp Spreads, which is right for layout and wrong for upscaling.
- **The workload is a handful of 800×~574 images** across 12 Chapters — roughly one affected Spread per four Chapters read. Throughput is therefore a non-axis, and **no GPU is needed**; the hardware table below is retained as history, not as a live decision.

### Hardware (measured, 2026-07-14 — now moot; no GPU is required)

| Box | Compute | Reachable from |
|---|---|---|
| Reader server (this VM) | 8 QEMU vCPUs, **no AVX/AVX2**, virtual Bochs VGA — no usable GPU | — |
| Reading PC | **AMD RX 6800** (RDNA2, 16GB) | Browser; Tailscale MagicDNS |
| Host machine | AMD Radeon 780M (RDNA3/gfx1103 — Vulkan yes, ROCm poor) | Not from the VM |
| Spare | GTX 1050 Ti (Pascal, CUDA, 4GB) | — |

The reader server is compute-dead and cannot see any GPU. This is the fact that makes a **separate service** (runnable where the silicon is) the chosen seam.

## Decisions so far

<!-- one line per closed ticket -->

- [Measure the Spread ratio distribution in real Chapters](tickets/001-measure-spread-ratio-distribution.md) — The completed-Chapter sample is bimodal: three affected Spreads are 1× and need direct 2× upscaling, while four are already 2×; affected Spreads are 1.8% of rendered Spreads.
- [Choose the upscaler runtime and host GPU](tickets/002-choose-upscaler-runtime-and-gpu.md) — No GPU needed: the workload is a handful of 800×~574 images, so throughput is a non-axis and all three GPUs are irrelevant. If upscaling happens, `waifu2x-ncnn-vulkan -g -1` (CPU, cunet, native 2×) — a single portable binary, no Python, no native deps.
- [Confirm parity at real Spread ratios](tickets/003-confirm-parity-at-real-ratios.md) — **GO.** waifu2x output on real manga art satisfies the reader's bar; screentone moiré did not materialise as an objection. The Lanczos control is answered by the app's own current rendering — today's blurry Spread *is* a plain browser upscale, and it's the complaint that started this effort — so a dumb resize does not close the gap.
- [Decide whether to fix this at the source instead of upscaling](tickets/008-decide-source-resolution-vs-upscaling.md) — **No.** The same host serves both doubled and undoubled Spreads (ch. 68/72 at 1600px, ch. 75 at 800×574); the blur is per-chapter scan quality, not per-host, so there is no better source to switch to. **Upscaling is warranted and the destination stands.** Also exposes a sampling bias in 001: it measured only *completed* Chapters, excluding the resume Chapter where the reader actually sees the problem — so its affected-Spread rate is a floor, not a count.

## Not yet specified

- **How the reader learns where the service lives** — env var, config file, discovery. Hangs on the contract.
- **Whether the service needs auth or hardening** on the tailnet. The reader has no auth today by design; a second listening process may change that calculus.
- **Packaging and repo layout** — separate repo vs sibling directory; how the two are developed, versioned, and released against each other.
- **Whether any of this ever lands on `main`**, and what it would cost the four-dependency story. Currently assumed: it does not.
- **Whether the filmstrip or next-Chapter prefetch participate** at all. Thumbnails are 62px (`client/src/styles.css:128`) so probably not, but the boundary isn't drawn.

## Out of scope

- **Browser-side WebGPU inference.** Ruled out in favour of a service: the off-the-shelf browser path is `onnxruntime-web`/WASM, which nunif's own README calls *"very slow, like 90's dial-up internet access"*, and a WebGPU port isn't a given. Returns only if the service seam proves wrong.
- **HTTPS / `tailscale serve`.** Was a hard prerequisite *only* to expose `navigator.gpu` (WebGPU requires a secure context; the app is plain HTTP at `server/index.ts:29`). Moot once inference is server-side.
- **Color and chroma handling.** The manga read here is B&W.
- **Changing `main`'s reading behavior or dependency footprint.** The destination explicitly preserves it.
- **Upscaling single (non-Spread) Pages.** They render at 50% stage width and are not the complaint — though note they are mildly upscaled too on a wide stage.
