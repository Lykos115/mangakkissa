# Decide whether to fix this at the source instead of upscaling

`wayfinder:grilling` · HITL · parent: [map](../map.md) · assignee: nemiru · status: closed — **premise falsified**

## Question

Every affected Spread is the same series read from a worse source — and the real pixels exist on a source already in the Library.

| | Host | Single Page | Spread |
|---|---|---|---|
| Blurry — Witch Hat Atelier ch. 40, 41 | `pic.readkakegurui.com` | 800px | **800px** (not doubled) |
| Sharp — Witch Hat Atelier ch. 68, 72 | `images.readmartialpeak.com` | 800px | **1600px** (correctly doubled) |

Chapter 40's Spread is a native **1600×1142** on readmartialpeak — verified. waifu2x would be synthesizing detail that is one HTTP request away. Real pixels beat synthesized pixels unconditionally, so this question gates the entire map.

**Does re-reading those Chapters from the better source solve the problem outright?** If yes, the destination collapses to nothing — no service, no GPU, no dependency, no contract. Points to settle:

- **Is the coverage there?** Only Witch Hat Atelier ch. 40 was checked. Does readmartialpeak carry the full run at 1600px? Was readkakegurui used *because* the better host lacked those chapters?
- **What does switching cost in the Library?** `seriesKey` is the hostname (`CONTEXT.md`), so the same series from two hosts is already **two Series** — which is why Witch Hat Atelier appears twice today. Switching starts a new Series with its own Visited Log and Resume Chapter rather than moving the old one. Is that acceptable, annoying, or the thing to actually fix?
- **Is this general or a Witch Hat Atelier accident?** One host serving undoubled Spreads may be a quirk of one site, or a pattern worth detecting. 3 Spreads across 12 Chapters is a thin sample.
- **Is the real problem "prefer better sources" rather than "sharpen bad ones"?** That's a different — and possibly more valuable — destination: source quality as a first-class Library concern. It might also be no code at all: just read that series elsewhere.
- **Do the releases even match?** Page numbering differs (readkakegurui ch. 40 has Spreads at pp. 22 and 27; readmartialpeak's is at p. 23). These are different scan releases, not the same file re-hosted.

**If the answer is "yes, switch sources," this map's destination should be redrawn or retired** — that call belongs to the human, not to a resolving session.

Evidence and caveats: [Upscaler runtime options — and why the choice barely matters](../assets/002-upscaler-runtime-options.md).

## Blocked by

_(nothing — frontier)_

## Resolution — **no. The premise was wrong.**

**Switching sources does not fix this.** `images.readmartialpeak.com` — the "sharp" host this ticket was built on — serves **both** doubled and undoubled Spreads:

| Chapter | Page | Size | |
|---|---|---|---|
| 68 | 04 | 1600×1138 | sharp |
| 72 | 02, 11, 20 | 1600×1148 | sharp |
| **75** | **04, 13** | **800×574** | **blurry** |

Scanned every landscape image in chapters 66–75 on that host via HTTP Range requests: six landscape Spreads, width histogram `{1600: 4, 800: 2}`. The blur is **per-chapter scan quality, not per-host**. Both hosts exhibit it. There is no better source to switch to.

### How the wrong premise arose — a sampling bias worth remembering

[Measure the Spread ratio distribution in real Chapters](001-measure-spread-ratio-distribution.md) sampled only **completed** Chapters. Chapter 75 is the Series' `resumeChapterUrl` — the Chapter being actively read, therefore incomplete, therefore excluded. That exclusion removed the only readmartialpeak counter-examples from the sample, leaving a clean but spurious host correlation across n=7. The reader spotted the 800×574 Spread from direct experience of the Chapter the measurement had skipped.

**Consequence for 001's numbers:** its structural finding is *confirmed and strengthened* — the distribution really is bimodal at 1.0× and 2.0×, and ch. 75's 800×574 against `baseWidth = 800` is another exact 1.0× needing a direct 2×. But its **rate is undercounted**: at least 5 affected Spreads, not 3, and "~1 per 4 Chapters" is a floor. Any policy keyed to that rate — notably [Decide the upscale trigger rule and prefetch policy](005-decide-trigger-rule-and-prefetch.md) — should re-measure across *all* Chapters, not just completed ones.

**The map's destination stands.** Learned upscaling is warranted: the pixels genuinely do not exist anywhere, and a direct 2× of an 800×574 Spread is exactly the case waifu2x is built for.

Evidence: [Upscaler runtime options — and why the choice barely matters](../assets/002-upscaler-runtime-options.md) (§ *Correction*).
