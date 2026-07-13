# Extraction architecture: generic heuristic + per-site fallback

Type: grilling
Status: closed
Assignee: javierherrera52@gmail.com (session a910411f)
Blocked by: 01

## Question

Decide how the server turns a pasted chapter URL into an ordered list of page-image URLs. What is the generic heuristic (e.g. "largest run of same-sized images in the main content area"), what signals does it use, when does it declare failure, and what is the interface a per-site extractor implements so new sites can be added later without touching the core? Also decide whether a headless browser is ever invoked or JS-heavy sites are simply unsupported. Grounded in the findings from the Witch Hat site research.

## Resolution

Decided via grilling on 2026-07-12, grounded in [assets/01-witch-hat-site-research.md](../assets/01-witch-hat-site-research.md).

**No headless browser.** Extraction is plain HTTP fetch + HTML parsing only. Sites whose images are JS-injected are unsupported and fail with a clear error. The fetcher is a narrow seam so a headless fetcher could be slotted in later without redesign.

**Generic heuristic: dominant size-run.**
1. Parse the HTML, collect every `<img>`.
2. Resolve each image's real URL as `data-src` ?? `data-lazy-src` ?? `data-original` ?? `src`; skip `data:` URIs; never use `og:image`.
3. Scope to the first match of `<article>`, `<main>`, `.entry-content`; else the whole `<body>`.
4. Drop images narrower than 400px (by attribute); images with unknown size are kept provisionally.
5. Group consecutive images into runs where width is ~equal or ~double the run's mode width (doubled width = pre-joined two-page spread).
6. Winner is the longest run, which must have ≥ 3 images; return page URLs in DOM order.

**No size probing.** Extraction is a single page fetch; it never fetches candidate images to measure them. Unknown-size images are grouped by DOM adjacency and URL shape. Sites this misgroups earn a per-site extractor.

**Failure: hard, structured errors — never a partial result.** Reasons: `FETCH_FAILED` (HTTP/network error, carries status), `NO_IMAGES` (page parsed, no images at all), `NO_PAGE_RUN` (images exist but no qualifying run). A wrong page list is worse than a clear error.

**Per-site seam: uniform Extractor interface; generic is just the last extractor in the registry.**

```ts
interface Extractor {
  id: string;                 // "witch-hat", "generic"
  matches(url): boolean;      // generic: always true
  extract(html, url): ExtractResult | ExtractError;
}

interface ExtractResult {
  pages: { url: string; width?: number; height?: number }[];
  chapterTitle?: string;
  seriesTitle?: string;
  nextUrl?: string;           // detection heuristic: ticket 05
  prevUrl?: string;
  imageHeaders?: { referer?: string; userAgent?: string };  // for sites that check Referer/UA
}
```

Registry is an ordered array with generic last; first `matches(url)` wins. Adding a site = dropping one module file in `server/extractors/`.

**V1 ships the generic extractor only.** Witch Hat Atelier is the acceptance test for the generic path; a site gets a dedicated module only when it demonstrably misbehaves.
