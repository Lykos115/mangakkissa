# Decide reader behavior when the upscaler is absent, slow, or failing

`wayfinder:grilling` · HITL · parent: [map](../map.md)

## Question

The destination's core promise: **absent the service, the reader behaves exactly as it does today.** That promise needs teeth, because "absent" has several shapes:

- **Not configured at all** — the default. No code path lights up, no latency, no errors. What proves this?
- **Configured but unreachable** — box asleep, Tailscale down, service crashed. Silent fallback to the original, or a visible signal?
- **Reachable but slow** — the upscale is still running when you turn the page. Presumably just never swaps in. Is there a deadline after which the reader stops waiting?
- **Returns garbage or an error** — how is a bad response distinguished from a slow one?
- **Dies mid-Chapter** — some Spreads already upscaled, the rest not. Does the reader keep asking, or give up for the session?

The reader has an existing vocabulary for degraded Pages worth reusing rather than reinventing — `PageMedia`'s failure and recovery states, the `broken-marker` (`client/src/styles.css:130`), and the retry path.

Note the asymmetry: a failed *Page* fetch is a hole in the Chapter and must be visible. A failed *upscale* is invisible by design — you get today's app. That argues for a very different treatment, and it should be decided rather than defaulted into.

## Blocked by

- [Define the reader ↔ upscaler contract](004-define-reader-upscaler-contract.md)
