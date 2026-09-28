import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { appBaseUrl } from './shared/app-base.js';

const base = appBaseUrl(process.env.APP_BASE_PATH);

// Other dev servers (e.g. other branches' worktrees) mounted under this one,
// so every preview is reachable through the single port Caddy forwards.
// PREVIEW_UPSTREAMS="booth=5175" serves <base>booth/ from a Vite on :5175
// that was started with APP_BASE_PATH=<base>booth. Includes its HMR socket.
const upstreamEntries = (process.env.PREVIEW_UPSTREAMS ?? '')
  .split(',').filter(Boolean).map((entry) => entry.split('=').map((part) => part.trim()));
const previewUpstreams = Object.fromEntries(upstreamEntries.map(([name, port]) =>
  [`${base}${name}/`, { target: `http://localhost:${port}`, ws: true }]));

// Without the trailing slash the proxy wouldn't match and the SPA fallback
// would quietly serve this server's own app instead, so redirect first.
const upstreamSlashRedirect: Plugin = {
  name: 'preview-upstream-slash-redirect',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const [path, query] = (request.url ?? '').split(/\?(.*)/s, 2);
      if (!upstreamEntries.some(([name]) => path === `${base}${name}`)) return next();
      response.statusCode = 302;
      response.setHeader('Location', `${path}/${query ? `?${query}` : ''}`);
      response.end();
    });
  }
};

export default defineConfig({
  root: 'client',
  base,
  plugins: [react(), upstreamSlashRedirect],
  // Dev server shared at https://nemiru.tail2e41a3.ts.net:5173/preview/ — API
  // calls forward to the already-running app instance (default /manga-reader base).
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: ['nemiru.tail2e41a3.ts.net'],
    proxy: {
      ...previewUpstreams,
      [`${base}api`]: {
        target: `http://localhost:${process.env.API_PORT ?? 4173}`,
        rewrite: (path: string) => path.replace(`${base}api`, `${appBaseUrl(process.env.API_BASE_PATH)}api`)
      }
    }
  },
  build: { outDir: '../dist/client', emptyOutDir: true },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}']
  }
});
