# Long-strip (webtoon) content: reject or second reading mode?

Type: grilling
Status: closed
Assignee: javierherrera52@gmail.com (session a910411f)

## Question

The extractor does not classify content; it returns pages with dimensions when the HTML provides them (see [Extraction architecture](02-extraction-architecture.md)). Webtoon-style chapters show up as a run of very tall images (height ≫ width), which make no sense as right-to-left two-page spreads. Decide: does the app detect tall-page chapters (what threshold?) and (a) reject them with a clear "not supported" error, or (b) offer a vertical-scroll reading mode alongside spreads? If (b), that mode's UX needs its own specification; if (a), it becomes one more structured rejection the failure UX covers.

## Resolution

Decided via grilling on 2026-07-13: **reject clearly; no second reading mode.**

- Detection at extraction time, from the dimensions already in hand: if most of the winning run's pages have height > 2× width, the chapter is long-strip.
- Fails with a fourth structured reason, `LONG_STRIP_UNSUPPORTED` — *extends the error set in [Extraction architecture](02-extraction-architecture.md)* (`FETCH_FAILED`, `NO_IMAGES`, `NO_PAGE_RUN`, `LONG_STRIP_UNSUPPORTED`).
- Surfaced like every extraction error, inline on the library ([Failure UX](07-failure-ux.md)); copy: "This looks like a vertical-scroll comic — this reader only does page spreads." plus the reason-code detail line.
- Sites without usable dimensions slip through undetected and simply read badly as spreads — accepted.
- A vertical-scroll reader, if ever wanted, is a fresh effort with its own navigation/resume semantics — ruled out of this map's scope.
