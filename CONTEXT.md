# Manga Reader

A local, single-user web app: paste a manga chapter URL, read it as right-to-left two-page spreads, flow into the next chapter, and keep a library of series with resume positions. Glossary for the whole app (single context).

## Language

### Extraction

**Extractor**:
A module that turns a chapter page's HTML into an ExtractResult. Extractors live in an ordered registry; the Generic Extractor is always last and matches every URL.
_Avoid_: Scraper, parser, adapter

**ExtractResult**:
The outcome of extracting one Chapter URL: ordered Pages, optional chapter/series titles, optional adjacent-chapter URLs, optional image-request headers.

**Page**:
One image in a chapter, in reading order, with optional intrinsic dimensions. A doubled-width Page is a pre-joined Spread.
_Avoid_: Image, scan

**Spread**:
What the reader displays at once: two Pages side by side read right-to-left, or one doubled-width Page.
_Avoid_: View, screen

### Library

**Series**:
A library entry identified by its seriesKey; carries a renamable display title, a Visited Log, and a Resume Chapter.
_Avoid_: Manga, comic, book

**seriesKey**:
The identity of a Series: the chapter URL's hostname by default; a per-site Extractor may override it on multi-series hosts.

**Chapter**:
One readable installment, identified by its URL. Known to the app only once extracted.
_Avoid_: Episode, post

**Visited Log**:
The per-Series record of every Chapter opened in the reader: url, title, pageCount, firstOpenedAt, completed flag. Membership in the log is what marks a Chapter as a Re-read.
_Avoid_: History, read list

**Resume Chapter**:
The Chapter URL a Series reopens at — chapter-level only, always from its first Spread. Written when a Chapter opens (including auto-flow); a Re-read never moves it.
_Avoid_: Bookmark, position, progress

**Re-read**:
Opening a Chapter already present in the Visited Log. Re-reads do not move the Resume Chapter.

**Library**:
The home screen: a paste box plus all Series ordered by lastReadAt, newest first.
