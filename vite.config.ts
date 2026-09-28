import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { appBaseUrl } from './shared/app-base.js';

const base = appBaseUrl(process.env.APP_BASE_PATH);

export default defineConfig({
  root: 'client',
  base,
  plugins: [react()],
  // Dev server shared at https://nemiru.tail2e41a3.ts.net:5173/preview/ — API
  // calls forward to the already-running app instance (default /manga-reader base).
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: ['nemiru.tail2e41a3.ts.net'],
    proxy: {
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
