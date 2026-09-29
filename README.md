# Mangakkissa

A local, single-user manga reader. Paste a Chapter URL, read right-to-left Page Spreads, continue into adjacent Chapters, and resume Series from a persistent local Library.

## Requirements

- Node.js 20.19 or newer
- npm (included with Node.js)

The production app has no database, browser automation, native image libraries, or other native runtime dependencies.

## Fresh install

From the project directory:

```sh
npm ci
```

`npm ci` installs the exact dependency versions recorded in `package-lock.json`.

## Test

```sh
npm test
```

## Build

```sh
npm run build
```

This creates the production client and server in `dist/`.

## Start

Build first, then start the single production process:

```sh
npm start
```

The process binds to all local network interfaces and prints both the local URL and each detected LAN URL, for example:

```text
Mangakkissa local: http://127.0.0.1:4173/mangakkissa/
Mangakkissa LAN:   http://192.168.1.50:4173/mangakkissa/
```

Open the LAN URL from another device connected to the same network. If it cannot connect, allow TCP port `4173` through the computer's firewall. To use another port:

```sh
PORT=4180 npm start
```

To restrict the app to this computer again, set `HOST=127.0.0.1`:

```sh
HOST=127.0.0.1 npm start
```

## Reverse proxy under `/mangakkissa`

The production build and server default to `/mangakkissa/`, so a reverse proxy can preserve that prefix instead of rewriting it. Build and run the backend on loopback:

```sh
npm run build
HOST=127.0.0.1 npm start
```

For Nginx, proxy the prefix without a URI suffix so the upstream receives the original `/mangakkissa/...` path:

```nginx
location = /mangakkissa {
    return 308 /mangakkissa/;
}

location /mangakkissa/ {
    proxy_pass http://127.0.0.1:4173;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
}
```

For Caddy, `handle` (not `handle_path`) keeps the prefix. The optional last block sends old `/manga-reader/` links to the new path:

```caddy
redir /mangakkissa /mangakkissa/ 308
handle /mangakkissa/* {
    reverse_proxy 127.0.0.1:4173
}
handle_path /manga-reader/* {
    redir * /mangakkissa{uri} 308
}
```

This exposes the reader at `https://example.com/mangakkissa/`. Query strings must be preserved because Chapter navigation and image requests carry their source URLs in query parameters. No WebSocket forwarding is required.

To use a different mount, provide the same `APP_BASE_PATH` while building and starting because Vite embeds it in the browser bundle:

```sh
APP_BASE_PATH=/reader npm run build
APP_BASE_PATH=/reader HOST=127.0.0.1 npm start
```

Set `APP_BASE_PATH=/` at both stages for a root deployment. The app has no authentication; if the proxy is reachable outside a trusted network, protect this location at the proxy.

## Optional Spread upscaling

Some Chapters ship pre-joined landscape Spreads at half the width of their neighbouring Pages, which the browser can only render blurry. If you install [waifu2x-ncnn-vulkan](https://github.com/nihui/waifu2x-ncnn-vulkan) (a standalone binary — not an npm dependency), point the reader at it:

```sh
UPSCALER_BIN=/path/to/waifu2x-ncnn-vulkan npm start
```

Deficient Spreads then render immediately as-is and swap to a sharpened 2x version once the binary finishes (a few CPU seconds, off the reading path).

On a machine without a GPU, use the **20220728** release with `-g -1` CPU mode (the 20250915 release segfaults in CPU mode), and install a Vulkan driver so the binary can start — on Debian/Ubuntu: `sudo apt-get install mesa-vulkan-drivers`. Upscaled bytes are cached in memory for the life of the process; nothing is written next to `library.json`. With `UPSCALER_BIN` unset, no upscale code path runs and the app behaves exactly as described above.

The app has no authentication. Anyone who can reach the LAN URL can read and modify its Library, so only run it on a trusted local network. The Library is persisted in `library.json` at the project root. Stop the process with `Ctrl-C`; restarting it reloads the same Library.

## Reproducible release check

Starting from a clean dependency install:

```sh
rm -rf node_modules dist
npm ci
npm test
npm run build
npm audit --omit=dev
npm start
```

Then open either the printed local URL or a printed LAN URL and exercise a Chapter URL. The production process must serve the Library, reader, image proxy, and built client without a second server.
