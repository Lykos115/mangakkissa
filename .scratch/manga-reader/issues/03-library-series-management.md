# 03 — Resume and manage Series from the Library

**What to build:** Turn the home screen into the persistent Library: users can resume recently read Series, inspect and reopen their Visited Logs, rename Series, and remove unwanted entries.

**Blocked by:** 01 — Paste a Chapter and open a basic Reader.

**Status:** closed

- [x] The Library lists Series by `lastReadAt` descending with title, Resume Chapter title, and last-read date.
- [x] Selecting a Series opens its Resume Chapter through the same successful-open path used by paste.
- [x] Each Series exposes an expandable Visited Log whose Chapters can be opened as Re-reads.
- [x] Opening an already visited Chapter updates recency but does not move the Resume Chapter.
- [x] A Series can be renamed without changing its identity.
- [x] Removing a Series requires confirmation and removes the Series and its Visited Log.
- [x] A failed resume stays on the Library and displays the reason and Retry action inside the affected Series entry.
- [x] Persistence survives a server restart, and automated tests cover ordering, resume, Re-read, rename, remove, and atomic writes.

## Resolution

Implemented 2026-07-13 with recency-ordered Library APIs and UI, shared Chapter-open behavior for paste/resume/Re-read, expandable Visited Logs, identity-preserving rename, confirmed removal, per-Series failure/Retry state, and queued temp-file-plus-rename persistence. Deterministic storage, API, and client interaction tests cover the ticket semantics; production runtime verification exercised open/Re-read recency, rename, removal, structured failure, valid atomic JSON, and restart persistence through the built localhost server.
