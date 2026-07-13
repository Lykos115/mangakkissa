import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startServer } from '../server/index.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('production startup', () => {
  it('fails clearly when the production client has not been built', async () => {
    const root = await mkdtemp(join(tmpdir(), 'reader-start-'));
    await expect(startServer({ root, port: 0 })).rejects.toThrow('npm run build');
  });

  it('serves the built client and APIs from one LAN-accessible process', async () => {
    const root = await mkdtemp(join(tmpdir(), 'reader-start-'));
    const clientDir = join(root, 'dist/client');
    await mkdir(clientDir, { recursive: true });
    await writeFile(join(clientDir, 'index.html'), '<!doctype html><title>Manga Reader production</title>');

    const server = await startServer({ root, port: 0 });
    servers.push(server);
    const address = server.address() as AddressInfo;
    expect(address.address).toBe('0.0.0.0');

    const base = `http://127.0.0.1:${address.port}`;
    expect(await (await fetch(`${base}/api/library`)).json()).toEqual({ series: [] });
    expect(await (await fetch(`${base}/reader/route`)).text()).toContain('Manga Reader production');
  });
});
