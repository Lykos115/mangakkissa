import express from 'express';
import { normalizeAppBasePath } from '../shared/app-base.js';
import type { OpenPayload } from '../shared/contract.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { friendlyDetail } from './errors.js';
import { normalizeChapterUrl } from './chapter-navigation.js';
import { ExtractionCache, ExtractionFailure, type ResolvedChapter } from './extraction-cache.js';
import { genericExtractor } from './extractors/generic.js';
import { ExtractorRegistry } from './extractors/registry.js';
import { ImagePipeline, type PageFetchFailure } from './image-pipeline.js';
import type { LibraryStore } from './storage/library-store.js';
import type { Fetcher } from './types.js';
import type { Upscaler } from './upscaler.js';

interface AppOptions { store: LibraryStore; fetcher?: Fetcher; clientDir: string; imageCacheMaxBytes?: number; upscaler?: Upscaler; basePath?: string }

const registry = new ExtractorRegistry([genericExtractor]);

export function createApp({ store, fetcher = fetch, clientDir, imageCacheMaxBytes, upscaler, basePath = '/' }: AppOptions) {
  const app = express();
  const router = express.Router();
  const imagePipeline = new ImagePipeline(fetcher, imageCacheMaxBytes);
  const extractions = new ExtractionCache(fetcher, registry);

  const parseChapterUrl = (value: unknown): URL | undefined =>
    normalizeChapterUrl(typeof value === 'string' ? value : '');

  const upscalerStatus: 'ready' | 'unconfigured' = upscaler ? 'ready' : 'unconfigured';
  const chapterPayload = ({ chapter, navigation }: ResolvedChapter): OpenPayload['chapter'] => ({
    url: chapter.url,
    title: chapter.chapterTitle,
    pages: chapter.extracted.pages,
    ...(navigation.nextUrl ? { nextUrl: navigation.nextUrl } : {}),
    ...(navigation.prevUrl ? { prevUrl: navigation.prevUrl } : {})
  });

  const sendChapterFailure = (response: express.Response, error: unknown) => {
    if (error instanceof ExtractionFailure) response.status(error.httpStatus).json(error.body);
    else response.status(500).json({ error: 'FETCH_FAILED', detail: `Chapter extraction failed: ${friendlyDetail(error)}` });
  };

  app.disable('x-powered-by');
  router.use(express.json({ limit: '32kb' }));

  router.get('/api/library', (_request, response) => {
    response.json(store.library());
  });

  router.patch('/api/series/:key', async (request, response) => {
    const title = typeof request.body?.title === 'string' ? request.body.title.trim() : '';
    if (!title) {
      response.status(400).json({ error: 'INVALID_TITLE', detail: 'A non-empty Series title is required.' });
      return;
    }
    try {
      const series = await store.renameSeries(request.params.key, title);
      if (!series) {
        response.status(404).json({ error: 'SERIES_NOT_FOUND', detail: 'Series not found.' });
        return;
      }
      response.json(series);
    } catch (error) {
      response.status(500).json({ error: 'FETCH_FAILED', detail: `Library update failed: ${friendlyDetail(error)}` });
    }
  });

  router.delete('/api/series/:key', async (request, response) => {
    try {
      if (!await store.removeSeries(request.params.key)) {
        response.status(404).json({ error: 'SERIES_NOT_FOUND', detail: 'Series not found.' });
        return;
      }
      response.status(204).end();
    } catch (error) {
      response.status(500).json({ error: 'FETCH_FAILED', detail: `Library update failed: ${friendlyDetail(error)}` });
    }
  });

  router.post('/api/chapter/open', async (request, response) => {
    const chapterUrl = parseChapterUrl(request.body?.url);
    if (!chapterUrl) {
      response.status(400).json({ error: 'FETCH_FAILED', detail: 'A valid HTTP or HTTPS Chapter URL is required.' });
      return;
    }
    const skipLettered = request.body?.skipLettered === true;
    try {
      const resolved = await extractions.resolve(chapterUrl, skipLettered);
      const { chapter } = resolved;
      const recorded = await store.recordOpen(
        { key: chapter.seriesKey, title: chapter.seriesTitle },
        { url: chapter.url, title: chapter.chapterTitle, pageCount: chapter.extracted.pages.length }
      );
      extractions.retainWindow(resolved);
      response.json({
        chapter: chapterPayload(resolved),
        series: { key: recorded.series.key, title: recorded.series.title, resumeChapterUrl: recorded.series.resumeChapterUrl },
        reread: recorded.reread,
        upscaler: upscalerStatus
      } satisfies OpenPayload);
      extractions.prefetch(resolved.navigation.nextUrl);
    } catch (error) {
      extractions.evictUnretained();
      if (error instanceof ExtractionFailure) sendChapterFailure(response, error);
      else response.status(500).json({ error: 'FETCH_FAILED', detail: `Library update failed: ${friendlyDetail(error)}` });
    }
  });

  router.get('/api/chapter/peek', async (request, response) => {
    const chapterUrl = parseChapterUrl(request.query.url);
    if (!chapterUrl) {
      response.status(400).json({ error: 'FETCH_FAILED', detail: 'A valid HTTP or HTTPS Chapter URL is required.' });
      return;
    }
    const skipLettered = request.query.skipLettered === '1';
    const retainAsCurrent = request.query.current === '1';
    try {
      const resolved = await extractions.resolve(chapterUrl, skipLettered);
      const { chapter } = resolved;
      const existing = store.findSeries(chapter.seriesKey);
      response.json({
        chapter: chapterPayload(resolved),
        series: {
          key: chapter.seriesKey,
          title: existing?.title ?? chapter.seriesTitle,
          resumeChapterUrl: existing?.resumeChapterUrl ?? chapter.url
        },
        reread: existing?.chapters.some((entry) => entry.url === chapter.url) ?? false,
        upscaler: upscalerStatus
      } satisfies OpenPayload);
      if (retainAsCurrent) extractions.retainWindow(resolved);
      else extractions.evictUnretained();
    } catch (error) {
      extractions.evictUnretained();
      sendChapterFailure(response, error);
    }
  });

  router.post('/api/chapter/complete', async (request, response) => {
    const chapterUrl = parseChapterUrl(request.body?.url);
    if (!chapterUrl) {
      response.status(400).json({ error: 'FETCH_FAILED', detail: 'A valid HTTP or HTTPS Chapter URL is required.' });
      return;
    }
    try {
      if (!await store.completeChapter(chapterUrl.href)) {
        response.status(404).json({ error: 'CHAPTER_NOT_FOUND', detail: 'Chapter not found in the Visited Log.' });
        return;
      }
      response.status(204).end();
    } catch (error) {
      response.status(500).json({ error: 'FETCH_FAILED', detail: `Library update failed: ${friendlyDetail(error)}` });
    }
  });

  router.get('/api/image', async (request, response) => {
    let source: URL;
    try {
      source = new URL(String(request.query.url ?? ''));
      if (!['http:', 'https:'].includes(source.protocol)) throw new Error('Unsupported protocol');
    } catch {
      response.status(400).json({ error: 'FETCH_FAILED', detail: 'A valid HTTP or HTTPS Page URL is required.' });
      return;
    }
    const policy = extractions.headersFor(source.href);
    const headers: Record<string, string> = { Accept: 'image/*' };
    if (policy.referer) headers.Referer = policy.referer;
    if (policy.userAgent) headers['User-Agent'] = policy.userAgent;
    if (request.query.upscale !== undefined) {
      if (request.query.upscale !== '2') {
        response.status(400).json({ error: 'UPSCALE_FAILED', detail: 'Only upscale=2 is supported.' });
        return;
      }
      if (!upscaler) {
        response.status(404).json({ error: 'UPSCALER_UNCONFIGURED', detail: 'No upscaler binary is configured.' });
        return;
      }
      try {
        const upscaled = await upscaler.upscale(source, () => imagePipeline.get(source, headers));
        response.set('Content-Type', upscaled.contentType);
        response.set('Cache-Control', 'max-age=86400, immutable');
        response.send(upscaled.body);
      } catch (error) {
        const failure = error as PageFetchFailure;
        response.status(502).json({ error: 'UPSCALE_FAILED', detail: failure.detail ?? `Upscale failed: ${friendlyDetail(error)}` });
      }
      return;
    }
    try {
      const page = await imagePipeline.get(source, headers, request.query.retry !== undefined);
      response.set('Content-Type', page.contentType);
      response.set('Cache-Control', 'max-age=86400, immutable');
      response.send(page.body);
    } catch (error) {
      const failure = error as PageFetchFailure;
      response.status(502).json({
        error: 'FETCH_FAILED',
        ...(failure.status ? { status: failure.status } : {}),
        detail: failure.detail ?? `Page fetch failed: ${friendlyDetail(error)}`
      });
    }
  });

  if (existsSync(clientDir)) {
    router.use(express.static(clientDir));
    router.use((request, response, next) => {
      if (request.method !== 'GET' || request.path === '/api' || request.path.startsWith('/api/')) return next();
      response.sendFile(join(clientDir, 'index.html'));
    });
  }
  app.use(normalizeAppBasePath(basePath, '/'), router);
  return app;
}
