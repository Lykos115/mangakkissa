# Verify the manga reader

Verify through the production HTTP surface, not by importing source modules.

1. Run `npm run build` as setup.
2. Start a deterministic localhost fixture server that serves a Chapter HTML page with at least three large adjacent `<img>` elements and fixed Page bytes. Log incoming Page `Referer` headers.
3. Start the app with `PORT=4173 npm start`; wait for `Manga Reader listening`.
4. Request `/` and confirm the built client is served.
5. `POST /api/chapter/open` with the fixture Chapter URL. Confirm ordered Pages, titles, Series identity, persistence, and `reread: false`; repeat and confirm `reread: true` with one Visited Log entry.
6. Request `/api/image?url=...`; confirm exact bytes, content type, and the fixture-observed Referer.
7. Probe an empty Chapter and malformed URL; confirm structured errors and no partial open.
8. Restore `library.json` if verification used the project store, then stop both servers.

Use alternate ports if 4173 or the fixture port is occupied. Browser screenshots are preferred when a Chromium-compatible executable is available; otherwise capture real socket responses and note the limitation.
