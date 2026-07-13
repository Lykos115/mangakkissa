# Manga Reader — Implementation Spec

A local, single-user web app: paste a manga chapter URL, read it as right-to-left two-page spreads, flow seamlessly into the next chapter, and keep a library of series with resume positions.

This spec consolidates every decision from the [reader-spec map](map.md); each section links the ticket holding the decision's rationale. Vocabulary is defined in [/CONTEXT.md](../../CONTEXT.md) — terms capitalized here (Series, Spread, Visited Log…) are used in its sense. Site facts were verified 2026-07-12 against the reference site ([research notes](assets/01-witch-hat-site-research.md)); re-verify selectors before implementation if much time has passed.

## 1. Architecture

- **One process, one start command.** Node/Express-style server serving both the JSON API and the built React/Vite frontend. Local use only — bind to localhost; no auth, no accounts.
- **Storage** is a single `library.json` next to the app (see §5). No database, no native modules.
- **No headless browser.** Extraction is plain HTTP fetch + HTML parsing. JS-injected sites are unsupported and fail with a structured error. Keep the page-fetcher behind a narrow seam so a headless fetcher could be added later without redesign.
- Suggested layout: `server/` (Express app, `server/extractors/` registry), `client/` (Vite React app), `library.json` at the root.

## 2. Extraction  ([decision](issues/02-extraction-architecture.md))

### 2.1 Extractor interface

```ts
interface Extractor {
  id: string;                 // "witch-hat", "generic"
  matches(url: string): boolean;      // generic: always true
  extract(html: string, url: string): ExtractResult | ExtractError;
}

interface ExtractResult {
  pages: { url: string; width?: number; height?: number }[];
  chapterTitle?: string;
  seriesTitle?: string;
  seriesKey?: string;         // override for multi-series hosts; default = hostname
  nextUrl?: string;
  prevUrl?: string;
  imageHeaders?: { referer?: string; userAgent?: string };
}
```

Ordered registry, generic extractor last; first `matches(url)` wins. Adding a site = one module file in `server/extractors/`. **V1 ships the generic extractor only** — the reference site is its acceptance test; a site earns a dedicated module only when it demonstrably misbehaves.

### 2.2 Generic heuristic — dominant size-run

1. Parse the HTML; collect every `<img>`.
2. Real URL per image: `data-src` ?? `data-lazy-src` ?? `data-original` ?? `src`; skip `data:` URIs; **never** use `og:image` (observed 404ing on the reference site).
3. Scope to the first match of `<article>`, `<main>`, `.entry-content`; else `<body>`.
4. Drop images with attribute width < 400px; images with unknown size are kept provisionally (grouped by DOM adjacency and URL shape — extraction never fetches images to measure them).
5. Group consecutive images into runs where width ≈ the run's mode width or ≈ double it (doubled width = pre-joined two-page Spread).
6. Winner = the longest run; require ≥ 3 images. Page order = DOM order.

Titles: `chapterTitle` from `h1`-like headline (reference: `h1.entry-title`); `seriesTitle` from `og:site_name` / `<title>` suffix — display-only, never identity.

### 2.3 Structured errors

Extraction fails hard — never a partial or guessy result:

| Code | Meaning | HTTP |
|---|---|---|
| `FETCH_FAILED` | network/HTTP error fetching the chapter page (carries upstream status) | 502 |
| `NO_IMAGES` | page parsed, no images at all | 422 |
| `NO_PAGE_RUN` | images exist, but no qualifying run of ≥ 3 large similar images | 422 |
| `LONG_STRIP_UNSUPPORTED` | winning run is mostly pages with height > 2× width ([decision](issues/08-long-strip-content.md)) | 422 |

Long-strip detection only works when dimensions are in the HTML; dimensionless webtoons slip through and simply read badly — accepted. A vertical-scroll mode is a non-goal (§10).

### 2.4 Next/prev-chapter detection  ([decision](issues/05-next-chapter-flow.md))

- **Candidates** (candidacy only, never direction): `a[rel=prev]`, `a[rel=next]`, anchors in post-navigation blocks, links whose text matches `/next|prev(ious)? chapter/i`. The reference site's `rel` attributes are inverted — direction is never trusted.
- **Ordering**: parse a chapter designation from each candidate's URL slug/title and from the current chapter — last number plus optional trailing letters (`…chapter-40f/` → `(40, "f")`); ascending order `(40,"") < (40,"f") < (41,"")`.
- `nextUrl` = smallest candidate after current; `prevUrl` = largest before. Nothing parseable → omit.

## 3. API surface  ([decision](issues/09-api-surface.md))

Six JSON routes; the §2.3 error codes are the API's error vocabulary.

```
POST   /api/chapter/open      { url }
  200 → { chapter: { url, title, pages[], nextUrl?, prevUrl? },
          series:  { key, title, resumeChapterUrl },
          reread:  boolean }
  422/502 → { error: <code>, status?, detail }
  Side effects on 200 only, atomic, server-side: Visited-Log upsert,
  re-read rule → resume (§5), lastReadAt = now, start background
  extraction of nextUrl. Paste and resume are the same call.

GET    /api/chapter/peek?url=…
  Same payload/errors as open, ZERO library side effects; served from
  the prefetch cache when warm. Used by the filmstrip's next segment.

GET    /api/image?url=<encoded>
  Image bytes via the proxy (§7); per-site Referer/UA resolved by
  source hostname; upstream failure → structured 502.

POST   /api/chapter/complete  { url }
  Sets completed on the Visited-Log entry. Fired when the reader
  reaches a chapter's last spread. Explicit, so finishing the latest
  chapter still marks it.

GET    /api/library
  → { series: [ { key, title, resumeChapterUrl, addedAt, lastReadAt,
       chapters: [ { url, title, pageCount, firstOpenedAt, completed } ] } ] }

PATCH  /api/series/:key       { title }      // rename
DELETE /api/series/:key                      // remove series + log (UI confirms)
```

Reading flow: `open(A)` → strip `peek(B)` when its segment scrolls in → boundary `open(B)` answered from cache, side effects applied then.

## 4. Library domain model  ([decision](issues/03-library-domain-model.md))

- **Series identity**: `seriesKey` = chapter-URL hostname, unless a per-site extractor overrides it. Display title is renamable; extracted titles are cruft-prone and never identity.
- **Visited Log**: per-Series record of every chapter opened: `{ url, title, pageCount, firstOpenedAt, completed? }`. Extraction results (page URLs) are never persisted.
- **Resume Chapter**: chapter URL only — reopening starts that chapter at its first spread. Written whenever a chapter opens, including auto-flow, **except** re-reads.
- **Re-read rule**: a pasted/opened chapter already in the Visited Log is a re-read — the bookmark does not move. No chapter-identifier parsing in the library; log membership is the whole test. (Flowing from a re-read into another already-visited chapter also leaves the bookmark alone.)

## 5. Storage  ([decision](issues/03-library-domain-model.md))

Single `library.json`, loaded at startup, held in memory, written atomically (write temp file, rename) on change. Writes happen a few times per session (chapter opens, completions, renames).

```jsonc
{
  "series": [
    {
      "key": "w18.witchhatatelier.com",
      "title": "Witch Hat Atelier",
      "resumeChapterUrl": "https://…/manga/witch-hat-atelier-chapter-40/",
      "addedAt": "2026-07-13T…", "lastReadAt": "2026-07-13T…",
      "chapters": [
        { "url": "…", "title": "Witch Hat Atelier, Chapter 40",
          "pageCount": 26, "firstOpenedAt": "…", "completed": true }
      ]
    }
  ]
}
```

## 6. Reader UX  ([decision](issues/04-reader-ux-prototype.md), [prototype](assets/04-reader-prototype.html))

The validated prototype is the visual reference; its `buildSpreads(pages, shift)` function is the pairing logic to carry over.

- **Spreads**: two pages side by side, read right-to-left (later page on the left). A pre-joined doubled-width page renders alone, and appears as a single filmstrip thumbnail.
- **Pairing**: default = cover solo (page 1 alone, then 2+3, 4+5 …). A control (`p`) shifts pairing by one. Pairing state is per-session, never persisted.
- **Chrome (default)**: top title line (series — chapter, spread counter); bottom filmstrip of spread thumbnails with progress bar. The strip continues past a labelled divider into the next chapter's thumbnails; clicking any thumbnail jumps, across chapters too. Current spread highlighted and kept scrolled into view.
- **Immersive toggle**: hides all chrome; center click/tap brings it back.
- **Navigation**: `←` or `Space` advances; `→` goes back; left click-zone advances, right goes back, center toggles chrome. Backing past the first spread re-enters the previous chapter at its last spread.
- **Fit modes** (`f` cycles): fit-height (default), fit-width (full viewport width, vertical scroll), original 1:1.
- **End of chapter**: seamless — advancing past the last spread flows straight into the next chapter with a toast naming it. Reaching the last spread fires `POST /api/chapter/complete`.

## 7. Image pipeline  ([decision](issues/10-image-pipeline.md))

- **Every image loads through `GET /api/image`** — headers, retries, caching, politeness in one place; no CORS or referrer leakage.
- **No server-side downscaling**: strip thumbnails are the same URLs in small `<img loading="lazy">` tags; the browser downloads each page once for both strip and spread.
- **Client loading**: eager full-size for the current spread + next 2 spreads; everything else lazily via the strip. Next chapter's images only via its strip segment.
- **Server caching**: in-memory image LRU ≈ 200MB cap; extraction cache holds current + previous + next chapter per series, evicted as the reader moves. Proxy responses: `Cache-Control: max-age=86400, immutable` — the browser cache is layer 1.
- **Politeness**, per source host: ≤ 4 concurrent upstream fetches; exactly 1 server-side retry per image.

## 8. Failure handling  ([decision](issues/07-failure-ux.md), [end-of-chapter](issues/05-next-chapter-flow.md))

- **Library screen (paste and resume alike)**: extraction errors render inline — under the paste box, or inside the failing series entry — with reason-specific guidance and Retry. The reader never opens without a successfully extracted chapter. "Site is down on resume" = inline `FETCH_FAILED` on the entry.
- **Copy**: friendly sentence first, one always-visible technical detail line (raw code + HTTP status). `FETCH_FAILED` → "Couldn't reach the site (HTTP <status>)." `NO_IMAGES`/`NO_PAGE_RUN` → "Couldn't find chapter pages on this page — this site may need its own extractor." `LONG_STRIP_UNSUPPORTED` → "This looks like a vertical-scroll comic — this reader only does page spreads."
- **Mid-reading page failure**: one automatic retry, then a page-shaped tap-to-retry placeholder in the slot; the spread's other page and all navigation keep working; the strip thumbnail gets a broken mark.
- **End of chapter with no next** (nothing detected / genuinely latest / next-extraction failed — the first two are indistinguishable): one honest card — "End of <chapter> — no next chapter found. If there is one, paste its URL:" with inline paste box, a link to the chapter on the source site, back-to-library, and Retry when a detected `nextUrl` failed with a concrete error. Pasting continues the flow and logs normally.

## 9. Library screen  ([decision](issues/03-library-domain-model.md))

Paste box + one list of Series ordered by `lastReadAt` descending. Entry: series title, resume-chapter title, last-read date; click = resume (`open` on the resume URL); expandable Visited-Log list for re-reads; actions: rename, remove (with confirm). No folders, tags, thumbnails, or unread counts.

## 10. Non-goals

- Offline reading / downloading chapters to disk — streaming with in-memory caching only.
- Public or multi-user deployment, accounts, auth — localhost, single user.
- Panel-level segmentation — page spreads only.
- Vertical-scroll (webtoon) reading mode — such content is rejected (§2.3); a vertical reader would be a fresh effort.
- Headless-browser extraction, per-site extractors beyond generic, page-level resume, unread-chapter polling — all deliberate v1 exclusions with seams noted where relevant.
