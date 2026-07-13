# How does the Witch Hat Atelier site serve chapters?

Type: research
Status: closed
Assignee: javierherrera52@gmail.com (session a910411f)

## Question

Investigate https://w18.witchhatatelier.com/ as the concrete target for the generic extractor. For a real chapter page, determine: how page images appear in the HTML (direct `<img>` tags vs lazy-load attributes vs JS-injected), whether images are hotlink-protected (Referer checks) or otherwise blocked when fetched server-side, how image order is expressed, how the "next chapter" link is marked up, and how chapter/series titles can be read from the page. Produce a markdown summary as a linked asset — it feeds the extraction-architecture and next-chapter tickets.

## Resolution

Full findings (observed 2026-07-12): [assets/01-witch-hat-site-research.md](../assets/01-witch-hat-site-research.md)

- **Platform**: WordPress 7.0 with a generic blog theme (toivo-lite) + LiteSpeed Cache — no manga plugin. Chapters are a `comic` custom post type at `/manga/witch-hat-atelier-chapter-<N>/`; the homepage lists all 112 chapters as plain links. Each chapter is one long page (no in-chapter pagination).
- **Image markup**: all page images are present in the raw HTML (no JS injection needed, no headless browser required for this site), but LiteSpeed lazy-loads them — the real URL is in `data-src`, `src` holds a placeholder SVG. The extractor must prefer `data-src` over `src`. Real `width`/`height` attributes are present.
- **Order**: DOM order equals reading order; filenames are zero-padded (`01.jpg`…`26.jpg`) in a single CDN directory.
- **Hosting**: images live on a third-party CDN (`images.readmartialpeak.com` — shared aggregator infra), not wp-content.
- **Hotlink protection: none.** Bare curl, browser UA, and correct/wrong/no Referer all return 200 `image/jpeg` with identical bytes. Server-side proxying is trivial here.
- **Gotcha**: `og:image` uses a different path prefix that 404s — never source page images from it.
- **Next-chapter markup**: in-body `rel="prev"`/`rel="next"` links exist but are **inverted** relative to reading order (site publishes newest-first): `rel="prev"` points at the next chapter to read. No `<link rel>` in head, no chapter dropdown. Detection must compare parsed chapter identifiers and handle lettered extras (5e, 23e, 40f).
- **Titles**: `<h1 class="entry-title">` is the clean chapter title; `og:site_name` / `<title>` suffix gives the series name; schema.org breadcrumbs are a fallback; image `alt` repeats the chapter title.
- **Spread bonus**: pre-joined double-page spreads appear as one doubled-width image (e.g. 1600×1142 among 800-wide pages) — detectable from HTML width/height alone; the "run of similarly-sized images" heuristic must tolerate one doubled-width image mid-run.
- **Noise**: only small logo images and ad `<script>` blocks; "largest run of similarly-sized large images inside `.entry-content`" cleanly isolates the pages.
