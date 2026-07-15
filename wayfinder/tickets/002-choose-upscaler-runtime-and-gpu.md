# Choose the upscaler runtime and host GPU

`wayfinder:research` · AFK · parent: [map](../map.md) · assignee: nemiru · status: closed

## Question

Which runtime, model, and box should the upscaling service run on?

Candidates:

- **nunif / waifu2x (PyTorch)** — ROCm on the RX 6800 (gfx1030, decent support) or CUDA on the GTX 1050 Ti.
- **waifu2x-ncnn-vulkan** — Vulkan, so it runs on *any* of the three GPUs including the 780M, which ROCm serves poorly.
- **onnxruntime** with an exported waifu2x model.

Cross-cut with model choice: `swin_unet` > `cunet` > `upconv_7` in quality, inverted in speed. That ranking is hardware-independent — hardware buys time, not fidelity.

Answer with: what installs cleanly, measured throughput per real Spread (~2000×1400, 2x), and a recommended runtime + model + box. Note the reader server is **not** a candidate — no AVX, no GPU.

## Blocked by

_(nothing — frontier)_

## Resolution

**No GPU is needed, and the GPU comparison this ticket asked for is unnecessary.** The measured workload is three Spreads of 800×576, 800×569, 800×569 — under half a megapixel each, upscaled once and cached. Every option in the inventory, including this VM's no-AVX CPU, clears the entire backlog in minutes. Throughput is not a meaningful axis at this volume, so the RX 6800, 780M, and 1050 Ti are all irrelevant.

**If upscaling happens: `waifu2x-ncnn-vulkan`, `-g -1` (CPU), cunet, scale 2.** A single portable binary with models bundled — no Python, no PyTorch, no native library — so it cannot contaminate the reader's four-dependency story, and it runs anywhere. 2× is native in every candidate, so the 2×-then-downscale scheme assumed while charting is unnecessary. Escalate to nunif/`swin_unet` only if cunet misses the parity bar; because time is free here, the quality-first model costs nothing but install pain.

**However — the premise may not survive.** The three affected Spreads are the same series read from a worse source. `pic.readkakegurui.com` stores Spreads at 800px (the same width as a single Page, so each half carries 400px of detail); `images.readmartialpeak.com` serves the *same chapter 40* with its Spread at a native **1600×1142**, verified by fetching the bytes. The pixels waifu2x would synthesize already exist, one HTTP request away. Real pixels beat synthesized pixels unconditionally.

That is a scope question for the destination, not something this ticket can settle — raised as [Decide whether to fix this at the source instead of upscaling](008-decide-source-resolution-vs-upscaling.md).

Full comparison, the source-resolution evidence, caveats, and method: [Upscaler runtime options — and why the choice barely matters](../assets/002-upscaler-runtime-options.md).
