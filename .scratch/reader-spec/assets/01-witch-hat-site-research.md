# Witch Hat Atelier site research (wayfinder ticket 01)

Target: https://w18.witchhatatelier.com/ — concrete reference site for the generic chapter-image extractor.
Observed: **2026-07-12** (scraped-site structure drifts; re-verify before implementation if much time has passed).
Method: raw HTML via `curl -s`, header/status probes via `curl -o /dev/null -w`. Pages examined: homepage, chapter pages 40, 20, 5.

## Site platform

- WordPress 7.0: `<meta name="generator" content="WordPress 7.0" />` (homepage).
- Theme **toivo-lite** (generic blog theme, *not* a manga plugin), plugin **litespeed-cache** — both visible in `wp-content/{themes,plugins}/…` asset paths.
- Chapters are a custom post type `comic`: chapter 40's `<body>` class is `wp-singular comic-template-default single single-comic postid-1467 …`.
- Chapter URL pattern: `https://w18.witchhatatelier.com/manga/witch-hat-atelier-chapter-<N>/` where `<N>` is `1`…`97` plus lettered extras (`23e`, `5e`, `40f`).
- The homepage lists **all** chapters (112 `/manga/…` links) as plain `<li><a href="…">Witch Hat Atelier, Chapter 97</a></li>` items.

## How page images appear in the HTML

All chapter images are present in the **raw HTML** (no JS injection), but as **LiteSpeed-Cache lazy-load** tags: real URL in `data-src`, placeholder SVG in `src`. Representative tag from chapter 40:

```html
<img data-lazyloaded="1"
     src="data:image/svg+xml;base64,PHN2Zy…"        <!-- grey placeholder, encodes width/height -->
     data-src='https://images.readmartialpeak.com/witchhatatelier.com/Chapter%2040/01.jpg'
     alt='Witch Hat Atelier, Chapter 40'
     width="800" height="1148" />
```

Extractor consequences:

- **Must read `data-src`, not `src`.** `src` is a data-URI SVG. A generic extractor should prefer `data-src` / `data-lazy-src` / `data-original` over `src` when present.
- `width`/`height` attributes are real intrinsic dimensions (typical page: 800×1149). Chapter 40 page 23 is **1600×1142** — an already-joined double-page spread, detectable by aspect ratio (width > height) from HTML attributes alone, before downloading anything.
- `alt` text repeats the chapter title on every page image ("Witch Hat Atelier, Chapter 40") — a strong grouping signal.
- No `<noscript>` fallbacks (0 on the page). No pagination: the whole chapter is one page (only one `nav-links` occurrence, which is the prev/next post nav).

## Image order

DOM order == reading order, and filenames are zero-padded sequence numbers in a single directory:

```
https://images.readmartialpeak.com/witchhatatelier.com/Chapter%2040/01.jpg
https://images.readmartialpeak.com/witchhatatelier.com/Chapter%2040/02.jpg
…
https://images.readmartialpeak.com/witchhatatelier.com/Chapter%2040/26.jpg
```

DOM order alone is sufficient; the filename numbering is corroboration, not something to rely on generically.

## Image hosting & server-side fetchability

- Images live on a **third-party CDN domain**, `images.readmartialpeak.com` (shared aggregator infrastructure — the path embeds the source-site name `witchhatatelier.com/Chapter%2040/…`). Not on the WordPress host, not under `wp-content/uploads` (only the site logo/favicon crops are).
- **No hotlink protection.** Probes on `…/Chapter%2040/03.jpg` and `…/23.jpg` (2026-07-12):

  | Request | Status | Content-Type |
  |---|---|---|
  | bare `curl` (no headers) | 200 | image/jpeg |
  | browser User-Agent | 200 | image/jpeg |
  | UA + Referer = chapter URL | 200 | image/jpeg |
  | UA + Referer = https://example.com/ | 200 | image/jpeg |

  Identical byte counts in all cases (299,726 / 594,874). No UA check, no Referer check. Server-side proxying is trivially possible *for this site*; the extractor design should still allow per-site header injection since other sites do check Referer.
- **Gotcha:** the `og:image` meta tag uses a *different* path prefix (`…/w18.witchhatatelier.com/Chapter%2040/01.jpg`) which returns **404**. Do not source image URLs from `og:image` here; trust the in-content `data-src` URLs.

## Next / previous chapter markup — inverted rel semantics

The theme emits standard WordPress adjacent-post navigation inside `<nav class="navigation post-navigation" aria-label="Posts">`:

```html
<a href="https://w18.witchhatatelier.com/manga/witch-hat-atelier-chapter-40f/" rel="prev">
  <span class="meta-nav" aria-hidden="true">Previous</span>
  <span class="screen-reader-text">Previous:</span>
  <span class="post-title">Witch Hat Atelier, Chapter 40f</span></a>
<a href="https://w18.witchhatatelier.com/manga/witch-hat-atelier-chapter-39/" rel="next">
  <span class="meta-nav" aria-hidden="true">Next</span>
  <span class="screen-reader-text">Next:</span>
  <span class="post-title">Witch Hat Atelier, Chapter 39</span></a>
```

**The rel attributes are inverted relative to reading order.** WordPress adjacent-post nav is by publish date, and this site published chapters newest-first, so:

- `rel="prev"` (labelled "Previous") → the **next** chapter to read (40 → 40f; 20 → 21; 5 → 5e — verified on all three pages).
- `rel="next"` (labelled "Next") → the **previous** chapter (40 → 39; 20 → 19; 5 → 4).

There is no `<link rel="next|prev">` in `<head>`, no chapter `<select>` dropdown (0 on the page). Consequence for the next-chapter heuristic: **`rel`/link-text cannot be trusted as-is**; a robust approach is to take both adjacent-post links, parse the chapter designation from URL/post-title, and pick the one that sorts *after* the current chapter (noting lettered extras: reading order here is `…39, 40, 40f, 41…`, `5, 5e, 6`). The homepage's full chapter list is an alternative source of global ordering.

## Chapter & series titles

- `<title>`: `Witch Hat Atelier, Chapter 40 - Witch Hat Atelier Manga Online` → `<chapter title> - <site/series name>`.
- `<h1 class="entry-title" itemprop="headline">Witch Hat Atelier, Chapter 40</h1>` — cleanest chapter title.
- `og:title` = same as `<title>`; `og:site_name` = `Witch Hat Atelier Manga Online` — usable as the series-ish name (site is single-series, so site name ≈ series name + "Manga Online" suffix).
- Schema.org breadcrumbs exist (`<nav class="breadcrumb-trail breadcrumbs">`, `BreadcrumbList` with items Home → Comics → Witch Hat Atelier, Chapter 40) — a structured fallback for both hierarchy and title.
- `alt` on every page image also carries the chapter title.

## Noise a "find the chapter images" heuristic must skip

- Non-chapter `<img>`s on the page are few and easily distinguishable: site logo/favicon variants under `w18.witchhatatelier.com/wp-content/uploads/…` (small, e.g. 180×180) vs. 22–26 large same-width CDN images.
- **Ad script blocks** (`<div class="code-block …">` with `profitablecpmratenetwork.com` / `highperformanceformat.com` scripts) sit inside `.entry-content` *after* the last page image; they are `<script>`s, not images, so an img-based heuristic ignores them — but they mean "everything in entry-content" is not clean HTML.
- The chapter images sit inside `.entry-content` in centered `<div>`/`<p>` wrappers; the largest run of similarly-sized `<img>`s in the main content area cleanly identifies them (uniform width=800, one 1600-wide spread mid-run — the heuristic must tolerate a doubled width within a run).
- Social-share buttons (`simplesocial`) precede the images inside the content area; a boilerplate `<p>You Are Reading …</p>` sits directly before the first image.

## Summary verdict for the generic extractor

Plain `curl` + HTML parsing fully suffices for this site: no JS rendering needed, no auth, no hotlink protection. The load-bearing generic rules it motivates: (1) prefer `data-src`-style lazy attributes over `src`; (2) pick the dominant run of large, similarly-sized images in the main content element, keeping DOM order; (3) treat width>height images as pre-joined spreads; (4) do not trust `rel=prev/next` direction — resolve reading order by comparing parsed chapter identifiers; (5) ignore `og:image`.
