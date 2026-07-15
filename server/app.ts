import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { friendlyDetail } from './errors.js';
import { normalizeChapterUrl, resolveAdjacentChapterUrls, type ResolvedChapterNavigation } from './chapter-navigation.js';
import { genericExtractor } from './extractors/generic.js';
import { ExtractorRegistry } from './extractors/registry.js';
import { ImagePipeline, type PageFetchFailure } from './image-pipeline.js';
import type { LibraryStore } from './storage/library-store.js';
import type { ExtractError, ExtractResult } from './types.js';
import type { Upscaler } from './upscaler.js';

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
interface AppOptions { store: LibraryStore; fetcher?: Fetcher; clientDir: string; imageCacheMaxBytes?: number; upscaler?: Upscaler }

const registry = new ExtractorRegistry([genericExtractor]);

export function createApp({ store, fetcher = fetch, clientDir, imageCacheMaxBytes, upscaler }: AppOptions) {
  const app = express();
  const imagePipeline = new ImagePipeline(fetcher, imageCacheMaxBytes);
  const pageHeaders = new Map<string, { referer?: string; userAgent?: string }>();
  interface ChapterExtraction {
    url: string;
    extracted: ExtractResult;
    seriesKey: string;
    seriesTitle: string;
    chapterTitle: string;
  }
  interface ResolvedChapter {
    chapter: ChapterExtraction;
    navigation: ResolvedChapterNavigation;
  }
  interface ChapterFailure { httpStatus: number; body: ExtractError }
  const extractionCache = new Map<string, Promise<ChapterExtraction>>();
  const extractionWindows = new Map<string, Set<string>>();
  const chapterPageUrls = new Map<string, string[]>();

  const parseChapterUrl = (value: unknown): URL | undefined =>
    normalizeChapterUrl(typeof value === 'string' ? value : '');

  const extractChapter = (chapterUrl: URL): Promise<ChapterExtraction> => {
    const cached = extractionCache.get(chapterUrl.href);
    if (cached) return cached;
    const pending = (async () => {
      let upstream: Response;
      try {
        upstream = await fetcher(chapterUrl.href, { headers: { Accept: 'text/html,application/xhtml+xml' } });
      } catch (error) {
        throw { httpStatus: 502, body: { error: 'FETCH_FAILED', detail: `Chapter fetch failed: ${friendlyDetail(error)}` } } satisfies ChapterFailure;
      }
      if (!upstream.ok) {
        throw { httpStatus: 502, body: { error: 'FETCH_FAILED', status: upstream.status, detail: `Chapter site returned HTTP ${upstream.status}.` } } satisfies ChapterFailure;
      }

      let extracted: ExtractResult | ExtractError;
      try {
        extracted = registry.extract(await upstream.text(), chapterUrl.href);
      } catch (error) {
        extracted = { error: 'NO_PAGE_RUN', detail: `The Chapter could not be parsed: ${friendlyDetail(error)}` };
      }
      if ('error' in extracted) throw { httpStatus: 422, body: extracted } satisfies ChapterFailure;

      const pageUrls = extracted.pages.map((page) => new URL(page.url).href);
      const policy = extracted.imageHeaders ?? { referer: chapterUrl.href };
      chapterPageUrls.set(chapterUrl.href, pageUrls);
      for (const pageUrl of pageUrls) pageHeaders.set(pageUrl, policy);
      return {
        url: chapterUrl.href,
        extracted,
        seriesKey: extracted.seriesKey ?? chapterUrl.hostname.toLowerCase(),
        chapterTitle: extracted.chapterTitle ?? decodeURIComponent(chapterUrl.pathname.split('/').filter(Boolean).at(-1) ?? 'Untitled Chapter'),
        seriesTitle: extracted.seriesTitle ?? chapterUrl.hostname
      };
    })();
    extractionCache.set(chapterUrl.href, pending);
    void pending.catch(() => { if (extractionCache.get(chapterUrl.href) === pending) extractionCache.delete(chapterUrl.href); });
    return pending;
  };

  const navigationSource = (chapter: ChapterExtraction) => ({
    url: chapter.url,
    chapterTitle: chapter.chapterTitle,
    nextUrl: chapter.extracted.nextUrl,
    prevUrl: chapter.extracted.prevUrl
  });
  const resolveChapter = async (chapter: ChapterExtraction, skipLettered: boolean): Promise<ResolvedChapter> => ({
    chapter,
    navigation: await resolveAdjacentChapterUrls(
      navigationSource(chapter),
      async (url) => navigationSource(await extractChapter(url)),
      skipLettered
    )
  });

  const retainedExtractionUrls = () => new Set([...extractionWindows.values()].flatMap((window) => [...window]));
  const evictExtractions = (chapterUrls: string[]) => {
    const evictedPages: string[] = [];
    for (const chapterUrl of chapterUrls) {
      extractionCache.delete(chapterUrl);
      evictedPages.push(...(chapterPageUrls.get(chapterUrl) ?? []));
      chapterPageUrls.delete(chapterUrl);
    }
    const pagesStillRetained = new Set([...chapterPageUrls.values()].flat());
    for (const pageUrl of evictedPages) {
      if (!pagesStillRetained.has(pageUrl)) pageHeaders.delete(pageUrl);
    }
  };
  const evictUnretainedExtractions = () => {
    const retained = retainedExtractionUrls();
    evictExtractions([...extractionCache.keys()].filter((chapterUrl) => !retained.has(chapterUrl)));
  };
  const retainExtractionWindow = ({ chapter, navigation }: ResolvedChapter) => {
    const retained = new Set<string>([chapter.url]);
    for (const adjacent of [navigation.prevUrl, navigation.nextUrl]) {
      const parsed = parseChapterUrl(adjacent);
      if (parsed) retained.add(parsed.href);
    }
    extractionWindows.set(chapter.seriesKey, retained);
    const retainedByAnySeries = retainedExtractionUrls();
    evictExtractions([...extractionCache.keys()].filter((cachedUrl) => !retainedByAnySeries.has(cachedUrl)));
  };

  const upscalerStatus: 'ready' | 'unconfigured' = upscaler ? 'ready' : 'unconfigured';
  const chapterPayload = ({ chapter, navigation }: ResolvedChapter) => ({
    url: chapter.url,
    title: chapter.chapterTitle,
    pages: chapter.extracted.pages,
    ...(navigation.nextUrl ? { nextUrl: navigation.nextUrl } : {}),
    ...(navigation.prevUrl ? { prevUrl: navigation.prevUrl } : {})
  });

  const sendChapterFailure = (response: express.Response, error: unknown) => {
    const failure = error as Partial<ChapterFailure>;
    if (failure.httpStatus && failure.body) response.status(failure.httpStatus).json(failure.body);
    else response.status(500).json({ error: 'FETCH_FAILED', detail: `Chapter extraction failed: ${friendlyDetail(error)}` });
  };

  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/library', (_request, response) => {
    response.json(store.library());
  });

  app.patch('/api/series/:key', async (request, response) => {
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

  app.delete('/api/series/:key', async (request, response) => {
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

  app.post('/api/chapter/open', async (request, response) => {
    const chapterUrl = parseChapterUrl(request.body?.url);
    if (!chapterUrl) {
      response.status(400).json({ error: 'FETCH_FAILED', detail: 'A valid HTTP or HTTPS Chapter URL is required.' });
      return;
    }
    const skipLettered = request.body?.skipLettered === true;
    try {
      const chapter = await extractChapter(chapterUrl);
      const resolved = await resolveChapter(chapter, skipLettered);
      const recorded = await store.recordOpen(
        { key: chapter.seriesKey, title: chapter.seriesTitle },
        { url: chapter.url, title: chapter.chapterTitle, pageCount: chapter.extracted.pages.length }
      );
      retainExtractionWindow(resolved);
      response.json({
        chapter: chapterPayload(resolved),
        series: { key: recorded.series.key, title: recorded.series.title, resumeChapterUrl: recorded.series.resumeChapterUrl },
        reread: recorded.reread,
        upscaler: upscalerStatus
      });
      if (resolved.navigation.nextUrl) {
        const nextUrl = parseChapterUrl(resolved.navigation.nextUrl);
        if (nextUrl) void extractChapter(nextUrl).catch(() => undefined);
      }
    } catch (error) {
      evictUnretainedExtractions();
      const failure = error as Partial<ChapterFailure>;
      if (failure.httpStatus) sendChapterFailure(response, error);
      else response.status(500).json({ error: 'FETCH_FAILED', detail: `Library update failed: ${friendlyDetail(error)}` });
    }
  });

  app.get('/api/chapter/peek', async (request, response) => {
    const chapterUrl = parseChapterUrl(request.query.url);
    if (!chapterUrl) {
      response.status(400).json({ error: 'FETCH_FAILED', detail: 'A valid HTTP or HTTPS Chapter URL is required.' });
      return;
    }
    const skipLettered = request.query.skipLettered === '1';
    const retainAsCurrent = request.query.current === '1';
    try {
      const chapter = await extractChapter(chapterUrl);
      const resolved = await resolveChapter(chapter, skipLettered);
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
      });
      if (retainAsCurrent) retainExtractionWindow(resolved);
      else evictUnretainedExtractions();
    } catch (error) {
      evictUnretainedExtractions();
      sendChapterFailure(response, error);
    }
  });

  app.post('/api/chapter/complete', async (request, response) => {
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

  app.get('/api/image', async (request, response) => {
    let source: URL;
    try {
      source = new URL(String(request.query.url ?? ''));
      if (!['http:', 'https:'].includes(source.protocol)) throw new Error('Unsupported protocol');
    } catch {
      response.status(400).json({ error: 'FETCH_FAILED', detail: 'A valid HTTP or HTTPS Page URL is required.' });
      return;
    }
    const policy = pageHeaders.get(source.href) ?? {};
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
    app.use(express.static(clientDir));
    app.use((request, response, next) => {
      if (request.method !== 'GET' || request.path.startsWith('/api/')) return next();
      response.sendFile(join(clientDir, 'index.html'));
    });
  }
  return app;
}
