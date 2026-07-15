# Spread ratio distribution in completed Chapters

Measured 2026-07-14 from the Chapters recorded as completed in `library.json`.

## Result

The observed distribution is **bimodal, not fractional**:

| `spreadNaturalWidth / baseWidth` | Landscape Spreads | Implied upscale to `2 × baseWidth` | Affected? |
|---:|---:|---:|---|
| 1.0 | 3 | 2.0× | Yes |
| 2.0 | 4 | 1.0× | No |

All 12 sampled Chapters had `baseWidth = 800`. The three blurry Spreads are 800 pixels wide; the four sharp Spreads are 1600 pixels wide. There were no observed Spreads in the expected 1.1–1.9 ratio range.

### Impact by denominator

- **3 of 7 landscape Spreads (42.9%)** are below 2× and need upscaling.
- **7 of 167 rendered Spreads (4.2%)** are landscape/pre-joined Spreads.
- **3 of 167 rendered Spreads (1.8%)** are affected landscape Spreads.
- Affected Spreads occur in **2 of 12 completed Chapters (16.7%)**.

## Interpretation

- The affected case needs a full **2× upscale**, not the anticipated modest 1.1×–1.6× enlargement. Plain Lanczos is therefore less likely to recover parity, although the visual prototype should still test it as the cheap control.
- A fixed-2× waifu2x model produces the observed target width directly. The previously assumed 2×-then-Lanczos-downscale path is unnecessary for every affected Spread in this sample.
- The service would touch a small fraction of normal reading traffic: 1.8% of rendered Spreads in this sample. Its quality matters, but raw throughput and queue depth are less demanding than expected.
- The next visual comparison should use one or more of the actual 800-wide landscape Spreads below, compare direct learned 2× against plain Lanczos 2×, and use the 1600-wide Spreads as the parity reference.

## Affected Spreads

| Chapter | Page | Natural dimensions | Ratio | Required upscale | Source |
|---|---:|---:|---:|---:|---|
| Witch Hat Atelier chapter 41 | 9 | 800×576 | 1.0 | 2.0× | [image](https://pic.readkakegurui.com/file/sancdn/witch-hat-atelier/chapter-41/9.webp) |
| Witch Hat Atelier chapter 40 | 22 | 800×569 | 1.0 | 2.0× | [image](https://pic.readkakegurui.com/file/sancdn/witch-hat-atelier/chapter-40/22.webp) |
| Witch Hat Atelier chapter 40 | 27 | 800×569 | 1.0 | 2.0× | [image](https://pic.readkakegurui.com/file/sancdn/witch-hat-atelier/chapter-40/27.webp) |

## Sharp landscape references

| Chapter | Page | Natural dimensions | Ratio | Source |
|---|---:|---:|---:|---|
| Witch Hat Atelier, Chapter 68 | 4 | 1600×1138 | 2.0 | [image](https://images.readmartialpeak.com/witchhatatelier.com/Chapter%2068/04.jpg) |
| Witch Hat Atelier, Chapter 72 | 2 | 1600×1148 | 2.0 | [image](https://images.readmartialpeak.com/witchhatatelier.com/Chapter%2072/02.jpg) |
| Witch Hat Atelier, Chapter 72 | 11 | 1600×1148 | 2.0 | [image](https://images.readmartialpeak.com/witchhatatelier.com/Chapter%2072/11.jpg) |
| Witch Hat Atelier, Chapter 72 | 20 | 1600×1148 | 2.0 | [image](https://images.readmartialpeak.com/witchhatatelier.com/Chapter%2072/20.jpg) |

## Chapter coverage

| Chapter | Pages | Base width | Landscape Spreads | Affected | Rendered Spreads |
|---|---:|---:|---:|---:|---:|
| Witch Hat Atelier chapter 41 | 28 | 800 | 1 | 1 | 16 |
| Witch Hat Atelier chapter 40 | 28 | 800 | 2 | 2 | 16 |
| Witch Hat Atelier chapter 39 | 34 | 800 | 0 | 0 | 18 |
| Witch Hat Atelier, Chapter 67 | 24 | 800 | 0 | 0 | 13 |
| Witch Hat Atelier, Chapter 66 | 20 | 800 | 0 | 0 | 11 |
| Witch Hat Atelier, Chapter 68 | 31 | 800 | 1 | 0 | 17 |
| Witch Hat Atelier, Chapter 69 | 30 | 800 | 0 | 0 | 16 |
| Witch Hat Atelier, Chapter 70 | 30 | 800 | 0 | 0 | 16 |
| Witch Hat Atelier, Chapter 71 | 18 | 800 | 0 | 0 | 10 |
| Witch Hat Atelier, Chapter 72 | 23 | 800 | 3 | 0 | 14 |
| Witch Hat Atelier, Chapter 73 | 24 | 800 | 0 | 0 | 13 |
| Witch Hat Atelier, Chapter 74 | 12 | 800 | 0 | 0 | 7 |
| **Total** | **302** | — | **7** | **3** | **167** |

## Method

1. Selected the 12 `library.json` Chapter records with `completed: true` (302 source Pages). A completed record means the reader activated the final Spread; it is the best persisted proxy for “actually read,” but not a page-by-page audit.
2. Loaded each Chapter through the read-only `GET /api/chapter/peek?current=1` endpoint so the extractor's image-header policy remained available.
3. Fetched each Page through `GET /api/image` and decoded dimensions from the returned image bytes rather than trusting HTML width/height attributes.
4. Reproduced the reader's `baseWidth` calculation exactly: the most frequent non-landscape natural width, with the smaller width winning ties.
5. Counted natural-width landscape Pages and calculated `ratio = spreadNaturalWidth / baseWidth` and `impliedUpscale = (2 × baseWidth) / spreadNaturalWidth`.
6. Reproduced `buildSpreads` to obtain the 167 rendered-Spread denominator.

The process used GET requests only. `library.json` remained byte-for-byte unchanged (SHA-256 `051243f0863f5717c3c06567b65d1d701cd654e60121e9a32ad55c7034173e61`).

## Scope caveat

This is a real reading sample but a narrow corpus: one manga title, two source hosts, and 12 completed Chapters. It is enough to choose the real visual-prototype ratios for this effort, but not to claim a universal distribution across manga sites.
