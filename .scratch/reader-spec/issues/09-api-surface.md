# API surface: routes and payloads between frontend and server

Type: grilling
Status: closed
Blocked by: 04, 05
Assignee: javierherrera52@gmail.com (session a910411f)

## Question

Define the HTTP API the React frontend uses. Inputs are now fixed: extraction returns `ExtractResult` with structured errors ([Extraction architecture](02-extraction-architecture.md)); the library is series + visited logs + chapter-level resume in `library.json` ([Library domain model](03-library-domain-model.md)). Decide the routes and payloads for: paste-a-URL (extract + library update in one call?), open/resume a chapter, the image path (proxy endpoint shape, how per-site `imageHeaders` are applied), library CRUD (list, rename, remove), and marking chapters completed / logging visits. Blocked on the reader prototype and next-chapter flow because prefetch and chapter-transition behavior shape the reading-session endpoints.

## Resolution

Decided via grilling on 2026-07-13. Six JSON routes; extraction's structured errors are the API's error vocabulary throughout.

**Open is one bundled endpoint; the server owns all library rules.**
```
POST /api/chapter/open { url }
200 → { chapter: { url, title, pages[], nextUrl?, prevUrl? },
        series:  { key, title, resumeChapterUrl },
        reread:  boolean }                    // bookmark not moved
422 → { error: NO_PAGE_RUN | NO_IMAGES | LONG_STRIP_UNSUPPORTED, detail }
502 → { error: FETCH_FAILED, status, detail }
```
Side effects on 200 only, applied atomically server-side: visited-log upsert, re-read rule → resume, `lastReadAt` bump, and kicking off background extraction of `nextUrl`. Paste and resume are the same call.

**Peek is the side-effect-free twin for the filmstrip.**
`GET /api/chapter/peek?url=…` returns the same chapter payload (or the same errors) with zero library writes, served from the prefetch cache when warm. Reader flow: `open(A)` starts prefetching B → strip `peek(B)` when the segment scrolls in → crossing the boundary calls `open(B)`, answered from cache instantly, side effects applied then.

**Remaining routes:**
```
GET    /api/image?url=<encoded>   → image bytes; server resolves per-site
                                    Referer/UA by source hostname
                                    (caching/policy: image-pipeline ticket)
POST   /api/chapter/complete { url }  → sets completed on the visited-log
                                        entry; fired on reaching last spread
GET    /api/library   → { series: [ { key, title, resumeChapterUrl,
                          lastReadAt, chapters[] } ] }  // full logs inline
PATCH  /api/series/:key { title }     // rename
DELETE /api/series/:key               // remove (UI confirms)
```
Completion is explicit (not inferred from opening the next chapter) so finishing the latest chapter still marks it. The library payload carries full visited logs — at personal-library scale one response beats a second route.
