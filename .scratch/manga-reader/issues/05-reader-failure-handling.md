# 05 — Handle extraction, Page, and end-of-Chapter failures

**What to build:** Keep the app usable and honest when source pages or individual Page images fail, with recovery actions located where the failure occurs and no loss of navigation around unaffected content.

**Blocked by:** 04 — Flow seamlessly between adjacent Chapters.

**Status:** closed

- [x] Every structured extraction failure shows the specified friendly sentence plus an always-visible technical code and relevant HTTP status.
- [x] Paste and resume failures offer Retry without entering a broken Reader.
- [x] An individual Page request retries once automatically, then shows a Page-shaped tap-to-retry placeholder while the other Page and navigation remain usable.
- [x] A failed Page's filmstrip thumbnail carries a visible broken marker and recovers after a successful retry.
- [x] When no next Chapter is available, the Reader shows the specified end card with source link, Library action, and inline URL paste for manual continuation.
- [x] When a detected next Chapter fails extraction, the end card additionally explains the concrete failure and offers Retry.
- [x] Manually pasted continuation opens and logs through the normal Chapter flow.
- [x] Automated tests exercise each failure code, isolated Page failure, retry recovery, and both forms of the end card.
