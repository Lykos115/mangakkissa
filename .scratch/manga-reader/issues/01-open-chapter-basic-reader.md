# 01 — Paste a Chapter and open a basic Reader

**What to build:** Let the user start the local app, paste a Chapter URL, and enter a basic Reader showing the extracted Pages as right-to-left Spreads. A successful open records the Chapter in the Library and loads every Page through the server proxy; an extraction failure stays on the Library screen with a useful inline explanation.

**Blocked by:** None — can start immediately.

**Status:** closed

- [x] One start command runs a localhost-only server that serves both the JSON API and the built client.
- [x] Pasting a valid Chapter URL uses the ordered Extractor registry and Generic Extractor to find a dominant run of at least three Pages in DOM order.
- [x] The Generic Extractor resolves lazy-image attributes, scopes likely content, recognizes doubled-width Pages, extracts display titles, and rejects unsupported or ambiguous content with the specified structured error codes.
- [x] A successful open atomically creates or updates the Series and Visited Log in `library.json`, applies the Re-read rule, and returns the specified Chapter and Series payload.
- [x] The basic Reader displays all extracted Pages as right-to-left Spreads, including solo cover and doubled-width Pages.
- [x] Every Page is requested through the image proxy with source-specific headers rather than directly from the browser.
- [x] Paste and extraction failures render inline and never open a partial Reader.
- [x] Automated tests cover representative extraction, storage, API, and basic client behavior using deterministic fixtures.

## Resolution

Implemented 2026-07-13 as a TypeScript Express server and React/Vite client. `npm run build && npm start` serves the production client and API on `127.0.0.1:4173`; `npm test` runs deterministic Extractor, atomic storage, API/proxy, Spread, and client-state tests. Runtime verification used a local fixture Chapter and Page source, including persisted Re-read behavior and Referer forwarding through the image proxy.
