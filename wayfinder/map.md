# Map: Sharpen sub-2x Spreads with learned upscaling

`wayfinder:map`

## Destination

A go/no-go decision, plus a plug contract, for an **optional local upscaler** that brings blurry sub-2x Spreads to parity with the Spreads that already look sharp — such that the Manga Reader behaves **exactly as it does today** when the upscaler is absent.

> Originally worded as a *standalone upscaling service*. Retired by [Define the reader ↔ upscaler contract](tickets/004-define-reader-upscaler-contract.md): the service existed only to run inference where the GPUs were, and [Choose the upscaler runtime and host GPU](tickets/002-choose-upscaler-runtime-and-gpu.md) established that no GPU is needed. It collapsed to a **subprocess the reader spawns** — an upstream binary, not a project to build.

## Notes

**Domain**: `CONTEXT.md` is the glossary for the reader (Page, Spread, seriesKey, Chapter). The thing being upscaled is a **Spread** — specifically a pre-joined landscape Page, the `spread.length === 1 && doubled-width` case at `client/src/App.tsx:416`.

**Skills**: `/grilling` and `/domain-modeling` for the decision tickets; `/research` for runtime questions; `/prototype` for anything where output has to be looked at.

**Planning, not doing** — this map produces decisions. Building the service is downstream of the map being complete.

### Established while charting (not decisions on the route — constraints the route runs inside)

- **`main` stays plug-and-play.** The MVP's promise (README): no database, no browser automation, no native image libraries, no second server, four production dependencies. The upscaler is an **upstream binary** (`waifu2x-ncnn-vulkan`) the reader optionally spawns — not a new dependency and not a project to build. One env var; unset means the code path never lights up and `npm ci && npm start` is byte-for-byte today's app.
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
- [Decide the upscale trigger rule and prefetch policy](tickets/005-decide-trigger-rule-and-prefetch.md) — **Fire on learning deficiency.** The moment a Spread's dimensions resolve, request its upscale if it qualifies. Not prefetch: no depth, no queue, no scheduler — the filmstrip's existing eager window (`activeSpreadIndex..+2`) already measures ahead of the reader, so upscales finish before arrival. Dissolves filmstrip jumps (unready → original → swaps) and cancellation (speculative work warms the cache). **Rate-independent**, so 001's undercounted rate never bites.
- [Define the reader ↔ upscaler contract](tickets/004-define-reader-upscaler-contract.md) — **There is no service.** It collapsed to a subprocess: the client decides (it alone knows `baseWidth`), the server executes (`GET /api/image?url=…&upscale=2` → spawn `waifu2x-ncnn-vulkan -s 2 -g -1` → cache → bytes), and the upscaler never learns what a Spread is. The `<img>` tag is the async protocol — render the original, load the upscale in the background, swap on `onLoad`, keep the original on `onError`. One env var; unset means the path never lights up.
- [Confirm parity at real Spread ratios](tickets/003-confirm-parity-at-real-ratios.md) — **GO.** waifu2x output on real manga art satisfies the reader's bar; screentone moiré did not materialise as an objection. The Lanczos control is answered by the app's own current rendering — today's blurry Spread *is* a plain browser upscale, and it's the complaint that started this effort — so a dumb resize does not close the gap.
- [Decide whether to fix this at the source instead of upscaling](tickets/008-decide-source-resolution-vs-upscaling.md) — **No.** The same host serves both doubled and undoubled Spreads (ch. 68/72 at 1600px, ch. 75 at 800×574); the blur is per-chapter scan quality, not per-host, so there is no better source to switch to. **Upscaling is warranted and the destination stands.** Also exposes a sampling bias in 001: it measured only *completed* Chapters, excluding the resume Chapter where the reader actually sees the problem — so its affected-Spread rate is a floor, not a count.

## Not yet specified

- **Whether any of this ever lands on `main`**, and what it would cost the four-dependency story. Now cheaper than assumed while charting — the cost is one env var and an inert code path, not a dependency.
<!-- Cleared by [Decide the upscale trigger rule and prefetch policy]: the filmstrip participates as the *measurement* source that drives the trigger (its eager window is the prefetch), but never as a *consumer* — 62px thumbnails are never upscaled. Next-Chapter Spreads fire uniformly under the same rule. -->

<!-- Cleared by [Define the reader ↔ upscaler contract]: "how the reader learns where the service lives" (an env var pointing at the binary), "whether the service needs auth or hardening on the tailnet" (moot — no service, no listening port), and "packaging and repo layout" (moot — nothing to package; the upscaler is an upstream binary). -->

## Out of scope

- **Browser-side WebGPU inference.** Ruled out: the off-the-shelf browser path is `onnxruntime-web`/WASM, which nunif's own README calls *"very slow, like 90's dial-up internet access"*, and a WebGPU port isn't a given. Doubly moot now that inference runs as a local subprocess on CPU.
- **HTTPS / `tailscale serve`.** Was a hard prerequisite *only* to expose `navigator.gpu` (WebGPU requires a secure context; the app is plain HTTP at `server/index.ts:29`). Moot once inference is server-side.
- **Color and chroma handling.** The manga read here is B&W.
- **Changing `main`'s reading behavior or dependency footprint.** The destination explicitly preserves it.
- **Upscaling single (non-Spread) Pages.** They render at 50% stage width and are not the complaint — though note they are mildly upscaled too on a wide stage.
