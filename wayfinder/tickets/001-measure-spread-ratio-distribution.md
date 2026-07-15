# Measure the Spread ratio distribution in real Chapters

`wayfinder:task` · AFK · parent: [map](../map.md) · assignee: nemiru · status: closed

## Question

How far from 2x are the blurry Spreads actually? For a sample of Chapters actually read (start from `library.json`), compute per landscape Spread:

`ratio = spreadNaturalWidth / baseWidth` — where `baseWidth` is the common single-Page width already derived at `client/src/spreads.ts:5`.

A Spread at `ratio` 1.9 needs a trivial 1.05x upscale; one at 1.25 needs 1.6x. Which end of that range the real corpus sits at determines whether learned upscaling is worth any of this, or whether plain Lanczos would do.

Answer with the actual distribution, the implied upscale factors, and what fraction of Spreads are affected at all.

## Blocked by

_(nothing — frontier)_

## Resolution

Measured all 12 completed Chapters in `library.json`: 302 source Pages forming 167 rendered Spreads. There are seven landscape Spreads, with a sharply bimodal ratio distribution: three at **1.0×** and four at **2.0×**. The three affected Spreads therefore require a full **2×** upscale; none fall in the anticipated 1.1×–1.9× range.

Affected Spreads are **3/7 landscape Spreads (42.9%)**, **3/167 rendered Spreads (1.8%)**, and occur in **2/12 completed Chapters (16.7%)**. This keeps learned upscaling worth testing—the deficit is too large to assume Lanczos will suffice—but changes the prototype to direct 2× output rather than 2× followed by fractional downscaling.

Full measurements, source-image links, method, and caveats: [Spread ratio distribution in completed Chapters](../assets/001-spread-ratio-distribution.md).
