# Failure UX: what the user sees for each extraction error

Type: grilling
Status: closed
Blocked by: 04
Assignee: javierherrera52@gmail.com (session a910411f)

## Question

Extraction now fails hard with structured reasons (`FETCH_FAILED`, `NO_IMAGES`, `NO_PAGE_RUN` — see [Extraction architecture](02-extraction-architecture.md)). Decide what the user sees for each: at paste time on the library screen (inline error? retry affordance? guidance that the site may need a per-site extractor?), and mid-reading when individual page images fail to load (404/timeout on a page the extractor listed — placeholder, retry, skip?). Also decide whether errors surface the technical reason code or a friendly message, and what "the source site is down" looks like when resuming a library entry. (End-of-chapter next-detection failure is covered by the next-chapter ticket, not here.)

## Resolution

Decided via grilling on 2026-07-13.

**Library-screen failures (paste and resume are one flow): inline, never leave the library.** Paste failure renders under the paste box; resume failure renders inside that series' entry. Both carry reason-specific guidance and a Retry. The reader only ever opens with a successfully extracted chapter — no empty-reader error states. This is also what "source site is down" looks like when resuming: a FETCH_FAILED error inline on the series entry.

**Mid-reading page failure: placeholder + tap-to-retry, reading never blocks.** One automatic retry first; then the failed page renders as a page-shaped placeholder in its slot ("page N didn't load — tap to retry") at the size the spread expects, the spread's other page displays normally, navigation keeps working, and the filmstrip thumbnail gets a broken mark.

**Copy: friendly sentence first, one always-visible technical detail line (no expander).** Per-reason mapping:
- `FETCH_FAILED` → "Couldn't reach the site (HTTP <status>)." — retry-flavored guidance.
- `NO_IMAGES` / `NO_PAGE_RUN` → "Couldn't find chapter pages on this page — this site may need its own extractor." — signals the per-site-extractor seam rather than hiding it.
- Detail line shows the raw reason code + HTTP status verbatim.

(End-of-chapter failures are out of this ticket: the unified "no next chapter found" card from the next-chapter flow covers them.)
