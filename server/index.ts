import { once } from 'node:events';
import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { LibraryStore } from './storage/library-store.js';

const sourcePath = fileURLToPath(import.meta.url);
const here = dirname(sourcePath);
const defaultRoot = here.endsWith(join('dist', 'server')) ? resolve(here, '../..') : resolve(here, '..');

interface StartOptions {
  root?: string;
  port?: number;
  host?: string;
}

export async function startServer({
  root = defaultRoot,
  port = Number(process.env.PORT ?? 4173),
  host = process.env.HOST ?? '0.0.0.0'
}: StartOptions = {}): Promise<Server> {
  const clientDir = join(root, 'dist/client');
  if (!existsSync(join(clientDir, 'index.html'))) throw new Error('Built client not found. Run npm run build before npm start.');
  const store = await LibraryStore.open(join(root, 'library.json'));
  const app = createApp({ store, clientDir });
  const server = app.listen(port, host);
  await once(server, 'listening');
  const address = server.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;
  console.log(`Manga Reader local: http://127.0.0.1:${boundPort}`);
  if (host === '0.0.0.0' || host === '::') {
    const lanAddresses = Object.values(networkInterfaces()).flatMap((entries) => entries ?? [])
      .filter((entry) => entry.family === 'IPv4' && !entry.internal)
      .map((entry) => entry.address);
    for (const lanAddress of [...new Set(lanAddresses)]) {
      console.log(`Manga Reader LAN:   http://${lanAddress}:${boundPort}`);
    }
  } else if (host !== '127.0.0.1' && host !== 'localhost') {
    console.log(`Manga Reader host:  http://${host}:${boundPort}`);
  }
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === sourcePath) {
  await startServer();
}
