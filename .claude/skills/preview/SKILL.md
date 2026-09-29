---
name: preview
description: Show UI work and design demos on the shared preview at 0.0.0.0:5173/preview. Use when the user asks to preview, demo, or share a UI/design change, or to show design ideas/concepts for the manga-reader client.
---

# Preview

The preview is the Vite dev server mounted under `/preview/`, reachable at
`http://0.0.0.0:5173/preview/` on the LAN and at `https://nemiru.tail2e41a3.ts.net:5173/preview/`.
It hot-reloads the client source and proxies `/preview/api/*` to the running app
on port 4173 (base `/manga-reader`), so demos show the user's real Library.

## Start it

1. Check whether it's already up: `ss -ltn | grep 5173`.
2. The API app must be running on 4173 (`ss -ltn | grep 4173`); if not, `npm run build && npm start` (or ask the user).
3. Start the preview in the background: `npm run dev:preview` (= `APP_BASE_PATH=/preview vite`).
4. Verify: `curl -s -o /dev/null -w '%{http_code}' localhost:5173/preview/` → `200`, and `/preview/api/library` returns JSON.

## Only port 5173 is reachable

Caddy (in an LXC container) forwards **only :5173**. Never hand the user another port.
To preview other branches side by side, run each in its own git worktree on a
local-only port with a nested base path, and mount it under the 5173 server:

```sh
# in each worktree (node_modules can be a symlink to the main checkout's)
APP_BASE_PATH=/preview/booth npx vite --port 5175
# the 5173 server, in the main checkout
APP_BASE_PATH=/preview PREVIEW_UPSTREAMS="booth=5175,morning=5176" npx vite
```

That serves `http://0.0.0.0:5173/preview/booth/`, including HMR and `/api` (the
worktree's own proxy forwards to :4173). `PREVIEW_UPSTREAMS` lives in `vite.config.ts`.
Restart the 5173 server whenever the upstream list changes.

## Routes

- `/preview/` — the real app, live from `client/src`.
- `/preview/<name>/` — another branch's worktree, mounted via `PREVIEW_UPSTREAMS`.
- `/preview/lab/` — the **design lab** (`client/lab/`): standalone, dev-only concept pages. Vite never builds it into `dist`. Each concept is a hash tab (`/preview/lab/#kissaten`).

## Adding a demo

- Design explorations go in `client/lab/` as a new concept component and a tab in the `concepts` list in `client/lab/main.tsx`. Reuse `useLabData()` for real Library data and Pages (it falls back to sample data when the API is down). Keep each concept's CSS scoped under its own prefix in `client/lab/lab.css`.
- Changes that are going into the app itself are made in `client/src` and viewed at `/preview/`.
- To check a page yourself, take a headless screenshot:
  `~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome --headless=new --no-sandbox --hide-scrollbars --virtual-time-budget=12000 --window-size=1280,4200 --screenshot=<scratchpad>/x.png 'http://localhost:5173/preview/lab/#<id>'`
- Give the user the `0.0.0.0:5173/preview/...` URL (plus the tailnet URL) when done.
