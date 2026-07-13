# Image pipeline: proxy, prefetch, and in-memory caching

Type: grilling
Status: closed
Assignee: javierherrera52@gmail.com (session a910411f)

## Question

Decide the path a page image takes from the source CDN to the screen, and what is prefetched when. Inputs are fixed: extraction may supply per-site `imageHeaders` (Referer/UA), so a server-side proxy endpoint is presumed ([Extraction architecture](02-extraction-architecture.md)); offline storage is out of scope — in-memory caching at most; and the chosen reader ([Reader UX prototype](04-reader-ux-prototype.md)) needs not just the current spread but **thumbnails of every spread in the current chapter plus the next chapter's strip segment**. Decide: does every image go through the proxy or only ones needing headers; thumbnail strategy (downscale server-side vs load full images into small `<img>`s); prefetch depth for full-size spreads (next N spreads? whole chapter?); cache shape and eviction (per-chapter in-memory cache, when is the previous chapter's cache dropped); and concurrency/politeness limits against the source CDN.

## Resolution

Decided via grilling on 2026-07-13.

**Everything goes through the proxy.** Every `<img>` src points at `GET /api/image?url=…` — per-site headers, retry-then-placeholder, caching, and politeness live in one place; no CORS or referrer leakage; the frontend never sees per-site quirks. The extra local hop is negligible.

**No server-side downscaling.** Filmstrip thumbnails are the same `/api/image` URLs in small `<img loading="lazy">` tags — the browser downloads each page once and its HTTP cache serves both strip and spread. No sharp/native image dependency, no second cache keyspace. The strip fills as it scrolls into view.

**Loading & caching policy — browser cache is layer 1:**
- Client, per chapter: eagerly load the current spread plus the next 2 spreads full-size; everything else arrives lazily via the strip (which organically warms the whole chapter). The next chapter's images load only through its strip segment.
- Server: in-memory image LRU capped ≈ 200MB; extraction cache holds current + previous + next chapter per series, evicted as the reader moves. Proxied responses carry `Cache-Control: max-age=1d, immutable` so the browser rarely re-asks.
- Upstream politeness, per source host: at most 4 concurrent fetches, exactly 1 retry per image (the reader's auto-retry then manual tap-to-retry takes over), failures surface as structured 502s to the `<img>`.
