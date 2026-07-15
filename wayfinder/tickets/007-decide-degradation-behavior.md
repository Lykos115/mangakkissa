# Decide reader behavior when the upscaler is absent, slow, or failing

`wayfinder:grilling` · HITL · parent: [map](../map.md) · assignee: nemiru · status: closed

## Question

The destination's core promise: **absent the service, the reader behaves exactly as it does today.** That promise needs teeth, because "absent" has several shapes:

- **Not configured at all** — the default. No code path lights up, no latency, no errors. What proves this?
- **Configured but unreachable** — box asleep, Tailscale down, service crashed. Silent fallback to the original, or a visible signal?
- **Reachable but slow** — the upscale is still running when you turn the page. Presumably just never swaps in. Is there a deadline after which the reader stops waiting?
- **Returns garbage or an error** — how is a bad response distinguished from a slow one?
- **Dies mid-Chapter** — some Spreads already upscaled, the rest not. Does the reader keep asking, or give up for the session?

The reader has an existing vocabulary for degraded Pages worth reusing rather than reinventing — `PageMedia`'s failure and recovery states, the `broken-marker` (`client/src/styles.css:130`), and the retry path.

Note the asymmetry: a failed *Page* fetch is a hole in the Chapter and must be visible. A failed *upscale* is invisible by design — you get today's app. That argues for a very different treatment, and it should be decided rather than defaulted into.

## Resolution

**Absent is silent. Broken warns in the UI. Neither ever blocks reading.**

### This amends the contract — `<img>` cannot carry the distinction

[Define the reader ↔ upscaler contract](004-define-reader-upscaler-contract.md) made the `<img>` tag the async protocol. It cannot support this ticket unaided: `onError` fires identically for 404, 500, a dead socket, or garbage bytes, and exposes **neither the status code nor the response body**. The client therefore cannot distinguish *unconfigured* (must stay silent) from *broken* (must warn), and cannot read a failure reason.

**The server must declare the capability up front.** The Chapter-open response (`server/app.ts:188`) gains a field — `upscaler: 'ready' | 'unconfigured'`. That single flag restores the distinction without abandoning the `<img>`:

- `unconfigured` → **the client never fires a request.** Zero requests, zero UI, zero code path. Byte-for-byte today's app, which is the promise the whole map rests on.
- `ready` → the client fires on learning deficiency. An `onError` now *means something*: it was configured, so it is broken. Warn.

### The warning

Reuse the existing quiet-notice vocabulary, not the failure vocabulary:

- **Shape**: a `role="alert"` notice in the header chrome, modelled on `navigation-refresh-error` (`client/src/App.tsx:444`, `client/src/styles.css:83`) — a background operation that failed, surfaced without interrupting.
- **Not** `broken-marker` or `page-failure` (`client/src/styles.css:130`). Those exist because a missing Page is *a hole in the Chapter you must know about*. A missing upscale is not a hole; it is the app as it shipped.
- **Once, in the chrome — never per-Spread.** The chrome is already toggleable, so the notice appears when the reader looks up rather than while reading. That is the intended moment: *"oh right, that's broken — let me look."*
- **No Retry button**, unlike its sibling. Retrying a misconfigured binary cannot help; the fix is operator-side.
- **Wording is generic** — the `<img>` can't read a reason. The UI says *something is wrong*; the server log says *what*.

### Division of labour: UI reminds, log diagnoses

The server `console.warn`s the actual failure (spawn error, non-zero exit, bad output). The reader only ever says "upscaling isn't working." This is deliberate: the UI's job is to stop the failure being invisible for months; the log's job is to explain it. Single-user, operator-runs-the-process — the log is right there once you know to look.

### The remaining failure modes

- **Reachable but slow** — the upscale is still running when you turn the page. Nothing happens; the original stays. Not a failure, and no deadline: the work completes and warms the cache for a re-view. `pending` (`server/image-pipeline.ts:92`) already dedupes.
- **Garbage output / non-zero exit** — indistinguishable from any other `onError` client-side, so it takes the same path: original stays, warning shows, log explains.
- **Dies mid-Chapter** — some Spreads upscaled, the rest not. The client **keeps trying** subsequent Spreads rather than disabling for the session: a per-image failure shouldn't kill the feature, and at ~1 affected Spread per 4 Chapters a doomed request costs nothing. The warning is already up; reading is unaffected.

### What proves "absent changes nothing"

With the env var unset, the flag is `unconfigured` and **no upscale request is ever issued** — assertable in a test rather than argued. That is the strongest available form of the map's central promise.

## Blocked by

- [Define the reader ↔ upscaler contract](004-define-reader-upscaler-contract.md) **(closed: subprocess, not a service)**
