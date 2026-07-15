# Define the reader ↔ upscaler contract

`wayfinder:grilling` · HITL · parent: [map](../map.md)

## Question

What crosses the wire, and where does the seam sit?

- **What does the reader send?** The source URL (service fetches it itself — but it would need the per-Page request headers the extractor returns) or the bytes it already holds (`PageResource.body`, `server/image-pipeline.ts:8`)?
- **What comes back?** Upscaled bytes, or a URL to them? What content type — re-encode as PNG, WebP, JPEG?
- **How is the target expressed?** Target width in pixels, or a scale factor? The reader knows `baseWidth`; the service doesn't.
- **How does the service say "not ready yet"?** Poll, 202-and-retry, streaming, or synchronous-and-slow.
- **Which side does the downscale?** Service returns 2x and the reader downscales, or the service returns exactly the requested width.
- **Where does the reader call from** — the server (which has the bytes and a cache) or the client (which knows the stage size and therefore the real target)?

Answer with the contract, concretely enough to implement against.

## Blocked by

- [Confirm parity at real Spread ratios](003-confirm-parity-at-real-ratios.md) **(closed: GO)** — don't design the plug before knowing it's worth plugging in.
