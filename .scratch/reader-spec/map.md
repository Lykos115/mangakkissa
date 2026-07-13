# Map: Manga Reader Spec

Label: wayfinder:map

## Destination

A complete, buildable spec (`spec.md` in this directory) for a **local personal manga reader web app**: paste a manga chapter URL, the app extracts the page images and presents them as **two-page spreads read right-to-left**, flows automatically into the next chapter, and keeps a **library** of series with resume positions. Node/Express-style backend + React/Vite frontend, single process, single start command. The spec is done when implementation could begin with no open decisions.

## Notes

- Planning only: this map produces the spec; building the app is a separate follow-up effort.
- Reference site the user actually reads on: https://w18.witchhatatelier.com/ (single-series WordPress-style aggregator). The generic extractor must work here.
- Extraction strategy: generic "find the chapter images" heuristic first, designed so per-site extractors can be added when a site misbehaves.
- Skills to use per ticket type: `/research` for research tickets, `/prototype` for prototype tickets, `/grilling` + `/domain-modeling` for grilling tickets.
- Settled during charting: two-page spreads (not single pages, not panel segmentation); local tool only (no hosting); auto next-chapter; full library with resume; Node + React + SQLite-or-JSON storage.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [How does the Witch Hat Atelier site serve chapters?](issues/01-witch-hat-site-research.md) — plain WordPress blog theme; images in raw HTML behind LiteSpeed lazy-load (`data-src`), DOM order = reading order, no hotlink protection; next-chapter links present but `rel` is inverted vs reading order; titles in `h1.entry-title` / `og:site_name`. Full findings in [assets/01-witch-hat-site-research.md](assets/01-witch-hat-site-research.md).
- [Extraction architecture: generic heuristic + per-site fallback](issues/02-extraction-architecture.md) — plain fetch + parsing, no headless browser; generic "dominant size-run" heuristic (lazy-attr aware, main-content scoped, ≥3 large similar-width images, tolerates doubled-width spreads); hard structured errors (`FETCH_FAILED`/`NO_IMAGES`/`NO_PAGE_RUN`); uniform `Extractor` interface in an ordered registry with generic last; v1 ships generic only.
- [Library domain model: series, chapters, resume positions](issues/03-library-domain-model.md) — seriesKey = hostname (extractor-overridable), renamable display title; per-series visited-chapter log; resume = chapter URL only (re-reads, detected by log membership, never move it); library screen = recency list; storage = single atomic-write `library.json`. Language recorded in [/CONTEXT.md](../../CONTEXT.md).
- [Reader UX prototype: spreads, navigation, fit](issues/04-reader-ux-prototype.md) — filmstrip reader (variant C) with a toggle into chrome-free immersive mode (variant A); RTL spreads with cover-solo default pairing + shift-by-one control; `←`/Space advances; fit-height default of three fit modes; seamless chapter flow with toast; "caught up" card at series end. Prototype: [assets/04-reader-prototype.html](assets/04-reader-prototype.html).
- [Next-chapter detection and end-of-chapter flow](issues/05-next-chapter-flow.md) — candidates from rel/nav/link-text, but direction only ever from comparing parsed chapter designations (number + letter suffix); next chapter extracted in the background on chapter open; one honest "no next chapter found" card (paste box + source-site link + retry) covering caught-up, detection-miss, and failed-extraction alike — supersedes the prototype's "caught up" card.
- [Failure UX: what the user sees for each extraction error](issues/07-failure-ux.md) — extraction errors land inline on the library (under the paste box / inside the series entry) with Retry; the reader never opens broken; a failed page image becomes a tap-to-retry placeholder after one auto-retry, never blocking reading; copy = friendly sentence + always-visible reason-code detail line.
- [Long-strip (webtoon) content: reject or second reading mode?](issues/08-long-strip-content.md) — reject: mostly-taller-than-2×-width runs fail extraction with a fourth reason, `LONG_STRIP_UNSUPPORTED`, surfaced inline like other errors; dimensionless sites slip through and just read badly; no vertical reader in this effort.
- [API surface: routes and payloads between frontend and server](issues/09-api-surface.md) — six JSON routes: bundled `POST /api/chapter/open` (server owns visited-log/resume/lastReadAt rules atomically, kicks off next-chapter prefetch), side-effect-free `GET /api/chapter/peek` for the filmstrip, opaque `GET /api/image` proxy, explicit `POST /api/chapter/complete`, library list with inline logs, series rename/remove.
- [Image pipeline: proxy, prefetch, and in-memory caching](issues/10-image-pipeline.md) — all images via the proxy; no server-side downscaling (strip thumbs = same URLs, `loading=lazy`, browser HTTP cache is layer 1); eager-load current + next 2 spreads; server image LRU ≈ 200MB + current/prev/next extraction cache; ≤ 4 concurrent upstream fetches per host, 1 retry.
- [Assemble the spec](issues/06-assemble-spec.md) — **destination reached**: [spec.md](spec.md) consolidates every decision above; implementation can start with no open decisions.

## Not yet specified

(nothing — all remaining work is ticketed)

## Out of scope

- Offline reading / downloading chapters to disk — ruled out during charting; streaming with at most in-memory caching.
- A vertical-scroll (webtoon) reading mode — long-strip content is rejected instead ([Long-strip decision](issues/08-long-strip-content.md)); if ever wanted, it's a fresh effort.
- Public or multi-user deployment, accounts, auth — this is a single-user local tool.
- Panel-level segmentation (showing individual panels via image analysis) — user chose page spreads.
- Building the app itself — happens after this map delivers the spec.
