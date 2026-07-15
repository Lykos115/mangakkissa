# Define the reader ↔ upscaler contract

`wayfinder:grilling` · HITL · parent: [map](../map.md) · assignee: nemiru · status: closed

## Question

What crosses the wire, and where does the seam sit?

- **What does the reader send?** The source URL (service fetches it itself — but it would need the per-Page request headers the extractor returns) or the bytes it already holds (`PageResource.body`, `server/image-pipeline.ts:8`)?
- **What comes back?** Upscaled bytes, or a URL to them? What content type — re-encode as PNG, WebP, JPEG?
- **How is the target expressed?** Target width in pixels, or a scale factor? The reader knows `baseWidth`; the service doesn't.
- **How does the service say "not ready yet"?** Poll, 202-and-retry, streaming, or synchronous-and-slow.
- **Which side does the downscale?** Service returns 2x and the reader downscales, or the service returns exactly the requested width.
- **Where does the reader call from** — the server (which has the bytes and a cache) or the client (which knows the stage size and therefore the real target)?

Answer with the contract, concretely enough to implement against.

## Resolution

**There is no service. The upscaler is a subprocess the reader spawns.**

The HTTP service this ticket assumed existed for one reason: the reader's VM is compute-dead and the GPUs lived on other boxes, so inference had to run *elsewhere*. [Choose the upscaler runtime and host GPU](002-choose-upscaler-runtime-and-gpu.md) removed that reason — no GPU is needed — and the service went with it. Nothing is left to justify a network boundary, a wire format, a second listening process, or a project to package: `waifu2x-ncnn-vulkan` is already a standalone portable binary maintained upstream.

### The contract

**The client decides, the server executes, the upscaler stays dumb.**

1. **Trigger — client.** The client already measures `naturalWidth`/`naturalHeight` per image (`client/src/App.tsx:75`) and computes `baseWidth` chapter-wide (`client/src/spreads.ts:5`). It alone knows a Spread is landscape **and** `width < 2 × baseWidth`. The server cannot know this: it has no image library to read dimensions with (the no-native-deps promise), and `baseWidth` needs every Page's size, which the server only fetches lazily.
2. **Request.** `GET /api/image?url=<source>&upscale=2` — one query param on the existing route (`server/app.ts:251`).
3. **Execute — server.** Cache hit → return. Otherwise fetch the original through the existing `ImagePipeline` (which already holds the per-Page Referer/User-Agent policy), spawn `waifu2x-ncnn-vulkan -s 2 -g -1`, cache, return bytes.
4. **The upscaler never learns what a Spread is.** It receives an image and a scale factor. Layout logic stays in the reader, where it already lives.
5. **Delivery — the `<img>` tag is the async protocol.** Render the original immediately; load `?upscale=2` in a background image; swap on `onLoad`; keep the original on `onError`. No polling, no `202`, no status endpoint — the server simply takes its few seconds. `PageMedia` already has the `onLoad`/`onError` hooks (`client/src/App.tsx:73-75`), and the pipeline's `pending` map (`server/image-pipeline.ts:92`) dedupes concurrent requests for free.
6. **Configuration.** One env var pointing at the binary. Unset → the code path never lights up → `npm ci && npm start` is byte-for-byte today's app.
7. **Output format.** Emit WebP (`-f webp`) to match the sources and keep the cache small; PNG would be several times larger for the same B&W art. Revisit in [Decide cache location, key, and lifetime for upscaled Spreads](006-decide-cache-location-key-lifetime.md) if budget says otherwise.

### Accepted trade-off

The trigger living client-side means the *decision* re-evaluates on every mount and every device — a phone will independently ask for an upscale a desktop already requested. The server cache absorbs the *work* (second asker gets a hit), so only the decision duplicates, not the compute. Accepted as provisional ("for now"); moving the rule server-side would require parsing image headers in pure TypeScript and holding chapter-wide dimension state the server has no other reason to keep.

### Amended by [Decide reader behavior when the upscaler is absent, slow, or failing](007-decide-degradation-behavior.md)

Two additions, one of them correcting an omission in the contract above:

1. **`?upscale=2` returns an error status on failure, never the original bytes.** Returning the original would make the background `<img>` fire `onLoad` and swap in bytes identical to what's already displayed, having downloaded them twice; an error status lets `onError` keep the original with no second fetch.
2. **The Chapter-open response carries `upscaler: 'ready' | 'unconfigured'`** (`server/app.ts:188`). **The `<img>`-as-protocol design above is insufficient on its own**: `onError` fires identically for 404, 500, a dead socket, or garbage bytes and exposes neither status nor body, so the client cannot tell *unconfigured* (stay silent) from *broken* (warn). The capability flag restores that distinction without giving up the `<img>` — and when `unconfigured`, the client issues no request at all, which is a stronger form of "absent changes nothing" than this contract originally offered.

## Blocked by

- [Confirm parity at real Spread ratios](003-confirm-parity-at-real-ratios.md) **(closed: GO)** — don't design the plug before knowing it's worth plugging in.
