import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { appBaseUrl } from './shared/app-base.js';

export default defineConfig({
  root: 'client',
  base: appBaseUrl(process.env.APP_BASE_PATH),
  plugins: [react()],
  build: { outDir: '../dist/client', emptyOutDir: true },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}']
  }
});
