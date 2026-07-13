# Library domain model: series, chapters, resume positions

Type: grilling
Status: closed
Assignee: javierherrera52@gmail.com (session a910411f)

## Question

Pin down the domain model behind the library home screen. What is a Series and a Chapter, and how does a pasted URL map to series identity (same series across chapter URLs; what happens when the user pastes a chapter of an already-known series)? What exactly is a resume position (chapter + spread index?), and when is it written? What does the library screen list and in what order, and how are entries added/removed? Choose the storage shape (SQLite vs JSON file) as part of this. Run with /grilling and /domain-modeling.

## Resolution

Decided via grilling on 2026-07-13. Ubiquitous language recorded in [/CONTEXT.md](../../../CONTEXT.md).

**Series identity: hostname, overridable.** `seriesKey` = chapter-URL hostname by default; `ExtractResult` gains an optional `seriesKey` so a per-site extractor can split multi-series hosts later. `seriesTitle` is display-only, never identity, and the user can rename it (extracted titles carry site cruft).

**Chapter storage: visited-chapter log.** Each Series keeps a small record per chapter opened in the reader: `{ url, title, pageCount, firstOpenedAt, completed? }`. Extraction results (page URL lists) are NOT persisted — re-extracted on open, cached in memory at most.

**Resume position: chapter URL only.** Reopening a series starts its resume chapter from the first spread; no page/spread index is stored. Written when a chapter opens, including auto-flow into the next chapter.

**Known-series paste: open, keep bookmark if backward.** "Backward" is decided by visited-log membership — no chapter-identifier parsing: a pasted chapter already in the log is a re-read and does not move the resume chapter; a new chapter does. (Consequence: flowing from a re-read into another already-visited chapter also leaves the bookmark alone.)

**Library screen: recency list.** Paste box + one list of series ordered by `lastReadAt` desc. Entry shows series title, resume-chapter title, last-read date; click = resume; expandable visited-chapter list for re-reads; actions: rename, remove (series + log, with confirm). No folders, tags, or unread counts.

**Storage: single JSON file.** `library.json`, loaded at start, written atomically (temp file + rename) on change. Write rate is a few per session now that resume is chapter-level. No SQLite, no native deps.

```jsonc
// library.json shape
{
  "series": [
    {
      "key": "w18.witchhatatelier.com",
      "title": "Witch Hat Atelier",          // renamable
      "resumeChapterUrl": "https://…/manga/witch-hat-atelier-chapter-40/",
      "addedAt": "…", "lastReadAt": "…",
      "chapters": [                            // visited log, append-order
        { "url": "…", "title": "…, Chapter 40", "pageCount": 26,
          "firstOpenedAt": "…", "completed": true }
      ]
    }
  ]
}
```
