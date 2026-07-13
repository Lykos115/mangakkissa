# 06 — Harden caching, politeness, and release verification

**What to build:** Make sustained reading fast and considerate of source sites, then verify that the finished app can be installed, started, and exercised as a single local process.

**Blocked by:** 04 — Flow seamlessly between adjacent Chapters; 05 — Handle extraction, Page, and end-of-Chapter failures.

**Status:** closed

- [x] The image proxy uses an approximately 200 MB bounded in-memory LRU and sends the specified immutable browser-cache policy.
- [x] Upstream Page requests are limited to four concurrent requests per source host and perform exactly one server-side retry.
- [x] Extraction caching retains the current, previous, and next Chapter per Series and evicts stale movement history.
- [x] Filmstrip thumbnails reuse the proxied full Page resources without server-side downscaling or eager loading of an entire future Chapter.
- [x] Production startup serves the built client and all APIs from one localhost-only process with no native runtime dependencies.
- [x] Fresh-install, build, test, and start instructions are documented and reproducible.
- [x] End-to-end verification covers paste, reading controls, Library resume and Re-read behavior, seamless Chapter flow, completion, failures, and restart persistence.
- [x] The Generic Extractor is rechecked against the reference site or any site drift is recorded with an appropriate deterministic regression fixture.

## Closure evidence — 2026-07-13

- Clean release sequence passed: remove `node_modules` and `dist`, `npm ci`, 53 deterministic tests, production build, and `npm audit --omit=dev` with zero vulnerabilities.
- Production `npm start` served the built client and APIs from one process bound to `127.0.0.1`; restart reloaded the persisted Resume Chapter and completion state.
- A deterministic source fixture observed one cached upstream Page fetch, exactly two attempts for both recovered and exhausted Page cycles, a maximum of four concurrent Page requests, and stale extraction eviction while moving Chapters.
- Client coverage exercises paste, all reading controls, Library resume and Re-read, adjacent Chapter flow and divider, completion, extraction/Page/end-card failures, placeholder recovery, and lazy future-Chapter thumbnails. No Chromium executable was available, so the UI portion used deterministic jsdom interaction tests while the built release was verified over its real localhost HTTP surface.
- Live reference recheck of `https://w18.witchhatatelier.com/manga/witch-hat-atelier-chapter-40/` returned HTTP 200 and extracted 26 Pages, the expected title, Chapter 39/40f adjacency, and a fetchable JPEG first Page. No reference-site drift was observed.
