# Manga Reader

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
Manga Reader local: http://127.0.0.1:4173
Manga Reader LAN:   http://192.168.1.50:4173
```

Open the LAN URL from another device connected to the same network. If it cannot connect, allow TCP port `4173` through the computer's firewall. To use another port:

```sh
PORT=4180 npm start
```

To restrict the app to this computer again, set `HOST=127.0.0.1`:

```sh
HOST=127.0.0.1 npm start
```

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
