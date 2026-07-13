# Next-chapter detection and end-of-chapter flow

Type: grilling
Status: closed
Assignee: javierherrera52@gmail.com (session a910411f)
Blocked by: 01

## Question

Decide how the app finds the next chapter and what happens at a chapter's end. What heuristic locates the "next chapter" link (rel attributes, link text patterns, URL numbering), when does the app prefetch it, and what is the reading flow at the boundary (seamless continue vs an interstitial)? What is the graceful fallback when detection fails or the chapter is the latest one? Grounded in the Witch Hat site research findings.

## Resolution

Decided via grilling on 2026-07-13, grounded in [assets/01-witch-hat-site-research.md](../assets/01-witch-hat-site-research.md).

**Detection: compare parsed identifiers; never trust link direction.**
- Candidates: `a[rel=prev]`, `a[rel=next]`, anchors inside post-navigation blocks, and links whose text matches /next|prev(ious)? chapter/i. `rel` and text establish *candidacy only*, never direction (the reference site's rel attributes are inverted).
- Parse a chapter designation from each candidate's URL slug/title and from the current chapter: last number plus optional trailing letters — `…chapter-40f/` → (40, "f").
- Order ascending by (number, letters): (40,"") < (40,"f") < (41,"").
- `nextUrl` = the smallest candidate sorting after the current chapter; `prevUrl` = the largest sorting before. No parseable designation → no `nextUrl`.

**Prefetch: on chapter open.** As soon as a chapter opens and yields a `nextUrl`, the server extracts the next chapter in the background — the filmstrip's next segment appears when it completes, and the boundary transition is always instant. One extra page fetch per chapter open is accepted.

**Fallback: one honest end-of-chapter card for every "no next" case** (nothing detected / genuinely latest / next extraction failed — the app cannot distinguish the first two): "End of <chapter> — no next chapter found. If there is one, paste its URL:" with an inline paste box, a link opening the current chapter on the source site, and back-to-library. If a detected nextUrl failed extraction, the card shows that structured error plus a retry. Pasting continues the reading flow and logs the chapter normally.

*Refines the Reader UX prototype resolution:* the "You're caught up" card is replaced by this unified card — the copy stays honest because the app can't verify it's truly the latest chapter.
