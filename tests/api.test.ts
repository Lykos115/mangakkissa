import request from 'supertest';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app.js';
import { LibraryStore } from '../server/storage/library-store.js';
import { Upscaler, type UpscaleRunner } from '../server/upscaler.js';

async function harness(
  fetcher = vi.fn(),
  now: () => Date = () => new Date('2026-07-13T10:00:00.000Z'),
  options: { imageCacheMaxBytes?: number; upscaler?: Upscaler } = {}
) {
  const dir = await mkdtemp(join(tmpdir(), 'reader-api-'));
  const path = join(dir, 'library.json');
  const store = await LibraryStore.open(path, now);
  return { app: createApp({ store, fetcher, clientDir: join(dir, 'missing'), ...options }), store, path };
}

const html = `<html><head><meta property="og:site_name" content="Ink House"></head><body><main><h1>Chapter 1</h1>
  <img src="/001.jpg" width="800" height="1200"><img src="/002.jpg" width="800" height="1200"><img src="/003.jpg" width="1600" height="1200"></main></body></html>`;
const chapterHtml = (number: number, adjacent = '') => `<html><head><meta property="og:site_name" content="Ink House"></head><body><main><h1>Chapter ${number}</h1>
  <img src="/${number}-001.jpg" width="800" height="1200"><img src="/${number}-002.jpg" width="800" height="1200"><img src="/${number}-003.jpg" width="800" height="1200">${adjacent}</main></body></html>`;

describe('Chapter API', () => {
  it('opens a complete Chapter, persists it, and applies the Re-read rule', async () => {
    const fetcher = vi.fn(async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }));
    const { app, store } = await harness(fetcher);
    const first = await request(app).post('/api/chapter/open').send({ url: 'https://reader.test/chapter-1' }).expect(200);
    expect(first.body).toMatchObject({
      chapter: { url: 'https://reader.test/chapter-1', title: 'Chapter 1', pages: [{ url: 'https://reader.test/001.jpg' }, { url: 'https://reader.test/002.jpg' }, { url: 'https://reader.test/003.jpg' }] },
      series: { key: 'reader.test', title: 'Ink House', resumeChapterUrl: 'https://reader.test/chapter-1' }, reread: false
    });
    expect((await request(app).post('/api/chapter/open').send({ url: 'https://reader.test/chapter-1' }).expect(200)).body.reread).toBe(true);
    expect(store.snapshot().series[0].chapters).toHaveLength(1);
  });

  it('returns structured extraction and fetch errors without mutating the Library', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('<body/>', { status: 200 }))
      .mockResolvedValueOnce(new Response('down', { status: 503 }));
    const { app, store } = await harness(fetcher);
    expect((await request(app).post('/api/chapter/open').send({ url: 'https://reader.test/empty' }).expect(422)).body).toMatchObject({ error: 'NO_IMAGES' });
    expect((await request(app).post('/api/chapter/open').send({ url: 'https://reader.test/down' }).expect(502)).body).toMatchObject({ error: 'FETCH_FAILED', status: 503 });
    expect(store.snapshot()).toEqual({ series: [] });
  });

  it('peeks through the warm extraction cache without Library side effects and reuses it on boundary open', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === 'https://reader.test/chapter-1') return new Response(chapterHtml(1, '<a rel="prev" href="/chapter-2">Next Chapter</a>'), { status: 200 });
      if (url === 'https://reader.test/chapter-2') return new Response(chapterHtml(2, '<a rel="next" href="/chapter-1">Previous Chapter</a>'), { status: 200 });
      if (url === 'https://reader.test/2-001.jpg') return new Response(new Uint8Array([2]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const { app, store } = await harness(fetcher);

    const first = await request(app).post('/api/chapter/open').send({ url: 'https://reader.test/chapter-1' }).expect(200);
    expect(first.body.chapter.nextUrl).toBe('https://reader.test/chapter-2');
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledWith('https://reader.test/chapter-2', expect.anything()));
    const beforePeek = store.snapshot();

    const peeked = await request(app).get('/api/chapter/peek').query({ url: 'https://reader.test/chapter-2' }).expect(200);
    expect(peeked.body).toMatchObject({ chapter: { url: 'https://reader.test/chapter-2', title: 'Chapter 2', prevUrl: 'https://reader.test/chapter-1' }, reread: false });
    expect(store.snapshot()).toEqual(beforePeek);

    const opened = await request(app).post('/api/chapter/open').send({ url: 'https://reader.test/chapter-2' }).expect(200);
    expect(opened.body.series.resumeChapterUrl).toBe('https://reader.test/chapter-2');
    expect(fetcher.mock.calls.filter(([url]) => url === 'https://reader.test/chapter-2')).toHaveLength(1);

    await request(app).get('/api/image').query({ url: 'https://reader.test/1-001.jpg' }).expect(502);
    expect(fetcher).toHaveBeenLastCalledWith('https://reader.test/1-001.jpg', expect.objectContaining({ headers: expect.objectContaining({ Referer: 'https://reader.test/chapter-1' }) }));
    await request(app).get('/api/image').query({ url: 'https://reader.test/2-001.jpg' }).expect(200);
    expect(fetcher).toHaveBeenLastCalledWith('https://reader.test/2-001.jpg', expect.objectContaining({ headers: expect.objectContaining({ Referer: 'https://reader.test/chapter-2' }) }));
  });

  it('does not retain arbitrary peek-only extraction outside a Series movement window', async () => {
    const fetcher = vi.fn(async () => new Response(html, { status: 200 }));
    const { app } = await harness(fetcher);
    await request(app).get('/api/chapter/peek').query({ url: 'https://reader.test/chapter-9' }).expect(200);
    await request(app).get('/api/chapter/peek').query({ url: 'https://reader.test/chapter-9' }).expect(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('explicitly completes visited Chapters, including the latest Chapter, idempotently', async () => {
    const fetcher = vi.fn(async () => new Response(html, { status: 200 }));
    const { app, store } = await harness(fetcher);
    await request(app).post('/api/chapter/open').send({ url: 'https://reader.test/chapter-1' }).expect(200);
    await request(app).post('/api/chapter/complete').send({ url: 'https://reader.test/chapter-1' }).expect(204);
    await request(app).post('/api/chapter/complete').send({ url: 'https://reader.test/chapter-1' }).expect(204);
    expect(store.snapshot().series[0].chapters[0].completed).toBe(true);
    await request(app).post('/api/chapter/complete').send({ url: 'https://reader.test/missing' }).expect(404);
  });

  it('proxies Page bytes with remembered source headers and immutable browser caching', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(html, { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    const { app } = await harness(fetcher);
    await request(app).post('/api/chapter/open').send({ url: 'https://reader.test/chapter-1' }).expect(200);
    const response = await request(app).get('/api/image').query({ url: 'https://reader.test/001.jpg' }).expect(200);
    expect(response.headers['content-type']).toMatch('image/jpeg');
    expect(response.headers['cache-control']).toBe('max-age=86400, immutable');
    expect([...response.body]).toEqual([1, 2, 3]);
    expect(fetcher).toHaveBeenLastCalledWith('https://reader.test/001.jpg', expect.objectContaining({ headers: expect.objectContaining({ Referer: 'https://reader.test/chapter-1' }) }));
  });

  it('coalesces duplicate Page requests and evicts least-recently-used bytes at the configured bound', async () => {
    let release!: (response: Response) => void;
    const firstPending = new Promise<Response>((resolve) => { release = resolve; });
    const fetcher = vi.fn((url: string) => {
      if (url.endsWith('/one.jpg') && fetcher.mock.calls.length === 1) return firstPending;
      const byte = url.endsWith('/one.jpg') ? 1 : 2;
      return Promise.resolve(new Response(new Uint8Array([byte, byte, byte]), { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    });
    const { app } = await harness(fetcher, undefined, { imageCacheMaxBytes: 5 });

    const oneA = request(app).get('/api/image').query({ url: 'https://cdn.test/one.jpg' }).expect(200).then((response) => response);
    const oneB = request(app).get('/api/image').query({ url: 'https://cdn.test/one.jpg' }).expect(200).then((response) => response);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    release(new Response(new Uint8Array([1, 1, 1]), { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    await Promise.all([oneA, oneB]);
    expect(fetcher).toHaveBeenCalledTimes(1);

    await request(app).get('/api/image').query({ url: 'https://cdn.test/two.jpg' }).expect(200);
    await request(app).get('/api/image').query({ url: 'https://cdn.test/one.jpg' }).expect(200);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://cdn.test/one.jpg',
      'https://cdn.test/two.jpg',
      'https://cdn.test/one.jpg'
    ]);
  });

  it('starts a fresh upstream cycle when a manual Page retry cache-busts the proxy URL', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/jpeg' } }))
      .mockResolvedValueOnce(new Response(new Uint8Array([2]), { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    const { app } = await harness(fetcher);
    const url = 'https://cdn.test/page.jpg';

    expect([...(await request(app).get('/api/image').query({ url }).expect(200)).body]).toEqual([1]);
    expect([...(await request(app).get('/api/image').query({ url }).expect(200)).body]).toEqual([1]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect([...(await request(app).get('/api/image').query({ url, retry: 1 }).expect(200)).body]).toEqual([2]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('limits Page fetches to four concurrent requests per source host', async () => {
    let active = 0;
    let maximum = 0;
    const releases: Array<() => void> = [];
    const fetcher = vi.fn(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
    });
    const { app } = await harness(fetcher);
    const pending = Array.from({ length: 7 }, (_, index) => request(app).get('/api/image').query({ url: `https://cdn.test/${index}.jpg` }).expect(200).then((response) => response));

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
    expect(maximum).toBe(4);
    while (pending.length > releases.length || active > 0) {
      const batch = releases.splice(0);
      batch.forEach((resolve) => resolve());
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (fetcher.mock.calls.length === 7 && active === 0) break;
    }
    await Promise.all(pending);
    expect(maximum).toBe(4);
  });

  it('performs exactly one server-side retry per Page request cycle', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('temporary', { status: 503 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([9]), { status: 200, headers: { 'content-type': 'image/png' } }))
      .mockRejectedValueOnce(new Error('reset'))
      .mockResolvedValueOnce(new Response('still down', { status: 504 }))
      .mockResolvedValueOnce(new Response('temporary', { status: 503 }))
      .mockResolvedValueOnce(new Response('still down', { status: 502 }));
    const { app } = await harness(fetcher);

    await request(app).get('/api/image').query({ url: 'https://cdn.test/recovered.png' }).expect(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const failed = await request(app).get('/api/image').query({ url: 'https://cdn.test/failed.png' }).expect(502);
    expect(failed.body).toMatchObject({ error: 'FETCH_FAILED', status: 504 });
    expect(fetcher).toHaveBeenCalledTimes(4);
    await request(app).get('/api/image').query({ url: 'https://cdn.test/failed.png', retry: 1 }).expect(502);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it('retains only the current, previous, and next Chapter extraction per Series as reading moves', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const number = Number(url.match(/chapter-(\d+)/)?.[1]);
      if (!number) throw new Error(`Unexpected fetch: ${url}`);
      const adjacent = `${number > 1 ? `<a rel="next" href="/chapter-${number - 1}">Previous Chapter</a>` : ''}
        ${number < 4 ? `<a rel="prev" href="/chapter-${number + 1}">Next Chapter</a>` : ''}`;
      return new Response(chapterHtml(number, adjacent), { status: 200 });
    });
    const { app } = await harness(fetcher);

    for (const number of [1, 2, 3]) {
      await request(app).post('/api/chapter/open').send({ url: `https://reader.test/chapter-${number}` }).expect(200);
      if (number < 4) await vi.waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === `https://reader.test/chapter-${number + 1}`)).toBe(true));
    }
    expect(fetcher.mock.calls.filter(([url]) => url === 'https://reader.test/chapter-2')).toHaveLength(1);
    await request(app).post('/api/chapter/open').send({ url: 'https://reader.test/chapter-1' }).expect(200);
    expect(fetcher.mock.calls.filter(([url]) => url === 'https://reader.test/chapter-1')).toHaveLength(2);
  });
});

describe('Spread upscaling API', () => {
  const imageFetcher = () => vi.fn(async (url: string) => url.endsWith('.jpg')
    ? new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } })
    : new Response(html, { status: 200 }));
  const upscaleTempDir = async () => join(await mkdtemp(join(tmpdir(), 'reader-upscale-')), 'upscales');

  it('declares the upscaler capability on Chapter open and peek', async () => {
    const absent = await harness(imageFetcher());
    expect((await request(absent.app).post('/api/chapter/open').send({ url: 'https://reader.test/chapter-1' }).expect(200)).body.upscaler).toBe('unconfigured');
    expect((await request(absent.app).get('/api/chapter/peek').query({ url: 'https://reader.test/chapter-1' }).expect(200)).body.upscaler).toBe('unconfigured');

    const upscaler = new Upscaler('/opt/waifu2x-ncnn-vulkan', { tempDir: await upscaleTempDir(), run: async () => undefined });
    const configured = await harness(imageFetcher(), undefined, { upscaler });
    expect((await request(configured.app).post('/api/chapter/open').send({ url: 'https://reader.test/chapter-1' }).expect(200)).body.upscaler).toBe('ready');
  });

  it('returns an error status instead of original bytes when no upscaler is configured', async () => {
    const { app } = await harness(imageFetcher());
    await request(app).post('/api/chapter/open').send({ url: 'https://reader.test/chapter-1' }).expect(200);
    const response = await request(app).get('/api/image').query({ url: 'https://reader.test/001.jpg', upscale: 2 }).expect(404);
    expect(response.body).toMatchObject({ error: 'UPSCALER_UNCONFIGURED' });
  });

  it('upscales through the binary with source headers, caches the artifact, and cleans its temp files', async () => {
    const run = vi.fn<UpscaleRunner>(async (_binary, _inputPath, outputPath) => { await writeFile(outputPath, Buffer.from([9, 9])); });
    const tempDir = await upscaleTempDir();
    const fetcher = imageFetcher();
    const { app } = await harness(fetcher, undefined, { upscaler: new Upscaler('/opt/waifu2x-ncnn-vulkan', { tempDir, run }) });
    await request(app).post('/api/chapter/open').send({ url: 'https://reader.test/chapter-1' }).expect(200);

    const first = await request(app).get('/api/image').query({ url: 'https://reader.test/001.jpg', upscale: 2 }).expect(200);
    expect(first.headers['content-type']).toMatch('image/webp');
    expect(first.headers['cache-control']).toBe('max-age=86400, immutable');
    expect([...first.body]).toEqual([9, 9]);
    expect(run).toHaveBeenCalledWith('/opt/waifu2x-ncnn-vulkan', expect.stringContaining(tempDir), expect.stringContaining(tempDir));
    expect(fetcher).toHaveBeenLastCalledWith('https://reader.test/001.jpg', expect.objectContaining({ headers: expect.objectContaining({ Referer: 'https://reader.test/chapter-1' }) }));
    expect(await readdir(tempDir)).toEqual([]);

    expect([...(await request(app).get('/api/image').query({ url: 'https://reader.test/001.jpg', upscale: 2 }).expect(200)).body]).toEqual([9, 9]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.filter(([url]) => url === 'https://reader.test/001.jpg')).toHaveLength(1);
  });

  it('reports a failed upscale as an error, logs the reason, cleans up, and allows a later retry', async () => {
    const run = vi.fn<UpscaleRunner>()
      .mockRejectedValueOnce(new Error('bad model dir'))
      .mockImplementationOnce(async (_binary, _inputPath, outputPath) => { await writeFile(outputPath, Buffer.from([7])); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const tempDir = await upscaleTempDir();
    const { app } = await harness(imageFetcher(), undefined, { upscaler: new Upscaler('/opt/waifu2x-ncnn-vulkan', { tempDir, run }) });
    await request(app).post('/api/chapter/open').send({ url: 'https://reader.test/chapter-1' }).expect(200);

    const failed = await request(app).get('/api/image').query({ url: 'https://reader.test/001.jpg', upscale: 2 }).expect(502);
    expect(failed.body).toMatchObject({ error: 'UPSCALE_FAILED' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('bad model dir'));
    expect(await readdir(tempDir)).toEqual([]);

    expect([...(await request(app).get('/api/image').query({ url: 'https://reader.test/001.jpg', upscale: 2 }).expect(200)).body]).toEqual([7]);
  });

  it('sweeps orphaned temp files from a previous process at startup', async () => {
    const tempDir = await upscaleTempDir();
    await mkdir(tempDir, { recursive: true });
    await writeFile(join(tempDir, 'orphan-in'), Buffer.from([0]));
    const run = vi.fn<UpscaleRunner>(async (_binary, _inputPath, outputPath) => { await writeFile(outputPath, Buffer.from([9])); });
    const { app } = await harness(imageFetcher(), undefined, { upscaler: new Upscaler('/opt/waifu2x-ncnn-vulkan', { tempDir, run }) });
    await request(app).post('/api/chapter/open').send({ url: 'https://reader.test/chapter-1' }).expect(200);
    await request(app).get('/api/image').query({ url: 'https://reader.test/001.jpg', upscale: 2 }).expect(200);
    expect(await readdir(tempDir)).toEqual([]);
  });
});

describe('Library API', () => {
  it('lists Series in last-read order and exposes Resume Chapter titles', async () => {
    let timestamp = '2026-07-13T10:00:00.000Z';
    const { app, store } = await harness(vi.fn(), () => new Date(timestamp));
    await store.recordOpen({ key: 'older.test', title: 'Older' }, { url: 'https://older.test/c1', title: 'Older Chapter', pageCount: 3 });
    timestamp = '2026-07-13T11:00:00.000Z';
    await store.recordOpen({ key: 'newer.test', title: 'Newer' }, { url: 'https://newer.test/c2', title: 'Newer Chapter', pageCount: 4 });

    const response = await request(app).get('/api/library').expect(200);
    expect(response.body.series.map((series: { key: string }) => series.key)).toEqual(['newer.test', 'older.test']);
    expect(response.body.series[0].chapters[0].title).toBe('Newer Chapter');
  });

  it('renames a Series without changing identity and persists after restart', async () => {
    const { app, store, path } = await harness();
    await store.recordOpen({ key: 'reader.test', title: 'Ink House' }, { url: 'https://reader.test/c1', title: 'Chapter 1', pageCount: 3 });
    const before = store.snapshot().series[0];

    const response = await request(app).patch('/api/series/reader.test').send({ title: 'The Ink House' }).expect(200);
    expect(response.body).toEqual({ ...before, title: 'The Ink House' });
    expect((await LibraryStore.open(path)).snapshot().series[0]).toEqual(response.body);
    await request(app).patch('/api/series/missing.test').send({ title: 'Missing' }).expect(404);
    await request(app).patch('/api/series/reader.test').send({ title: '   ' }).expect(400);
  });

  it('seeds the Series cover from the first Page of an opened Chapter', async () => {
    const fetcher = vi.fn(async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }));
    const { app } = await harness(fetcher);
    await request(app).post('/api/chapter/open').send({ url: 'https://reader.test/chapter-1' }).expect(200);
    const library = (await request(app).get('/api/library').expect(200)).body;
    expect(library.series[0].coverPageUrl).toBe('https://reader.test/001.jpg');
  });

  it('updates a Series cover by Page URL and persists after restart', async () => {
    const { app, store, path } = await harness();
    await store.recordOpen({ key: 'reader.test', title: 'Ink House' }, { url: 'https://reader.test/c1', title: 'Chapter 1', pageCount: 3 });

    const response = await request(app).patch('/api/series/reader.test').send({ coverUrl: 'https://cdn.test/cover.jpg' }).expect(200);
    expect(response.body.coverPageUrl).toBe('https://cdn.test/cover.jpg');
    expect(response.body.title).toBe('Ink House');
    expect((await LibraryStore.open(path)).snapshot().series[0].coverPageUrl).toBe('https://cdn.test/cover.jpg');

    await request(app).patch('/api/series/reader.test').send({ coverUrl: 'not-a-url' }).expect(400);
    await request(app).patch('/api/series/reader.test').send({}).expect(400);
    await request(app).patch('/api/series/missing.test').send({ coverUrl: 'https://cdn.test/cover.jpg' }).expect(404);
  });

  it('removes a Series and its Visited Log and persists after restart', async () => {
    const { app, store, path } = await harness();
    await store.recordOpen({ key: 'reader.test', title: 'Ink House' }, { url: 'https://reader.test/c1', title: 'Chapter 1', pageCount: 3 });
    await request(app).delete('/api/series/reader.test').expect(204);
    expect((await LibraryStore.open(path)).snapshot()).toEqual({ series: [] });
    await request(app).delete('/api/series/reader.test').expect(404);
  });
});
