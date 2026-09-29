import { friendlyDetail } from './errors.js';
import { adjacentChapterUrls, normalizeChapterUrl, type ResolvedChapterNavigation } from './chapter-navigation.js';
import type { ExtractorRegistry } from './extractors/registry.js';
import type { ExtractError, ExtractResult, Fetcher } from './types.js';

export interface ChapterExtraction {
  url: string;
  extracted: ExtractResult;
  seriesKey: string;
  seriesTitle: string;
  chapterTitle: string;
}

export interface ResolvedChapter {
  chapter: ChapterExtraction;
  navigation: ResolvedChapterNavigation;
}

export interface ImageHeaderPolicy { referer?: string; userAgent?: string }

export class ExtractionFailure extends Error {
  constructor(readonly httpStatus: number, readonly body: ExtractError) {
    super(body.detail);
    this.name = 'ExtractionFailure';
  }
}

export class ExtractionCache {
  private readonly extractions = new Map<string, Promise<ChapterExtraction>>();
  private readonly retentionWindows = new Map<string, Set<string>>();
  private readonly chapterPageUrls = new Map<string, string[]>();
  private readonly pageHeaders = new Map<string, ImageHeaderPolicy>();

  constructor(private readonly fetcher: Fetcher, private readonly registry: ExtractorRegistry) {}

  async resolve(chapterUrl: URL): Promise<ResolvedChapter> {
    const chapter = await this.extract(chapterUrl);
    return {
      chapter,
      navigation: adjacentChapterUrls({ url: chapter.url, nextUrl: chapter.extracted.nextUrl, prevUrl: chapter.extracted.prevUrl })
    };
  }

  prefetch(chapterUrl: string | undefined): void {
    const parsed = normalizeChapterUrl(chapterUrl ?? '');
    if (parsed) void this.extract(parsed).catch(() => undefined);
  }

  headersFor(pageUrl: string): ImageHeaderPolicy {
    return this.pageHeaders.get(pageUrl) ?? {};
  }

  retainWindow({ chapter, navigation }: ResolvedChapter): void {
    const retained = new Set<string>([chapter.url]);
    for (const adjacent of [navigation.prevUrl, navigation.nextUrl]) {
      const parsed = normalizeChapterUrl(adjacent ?? '');
      if (parsed) retained.add(parsed.href);
    }
    this.retentionWindows.set(chapter.seriesKey, retained);
    this.evictUnretained();
  }

  evictUnretained(): void {
    const retained = this.retainedChapterUrls();
    this.evict([...this.extractions.keys()].filter((chapterUrl) => !retained.has(chapterUrl)));
  }

  private retainedChapterUrls(): Set<string> {
    return new Set([...this.retentionWindows.values()].flatMap((window) => [...window]));
  }

  private evict(chapterUrls: string[]): void {
    const evictedPages: string[] = [];
    for (const chapterUrl of chapterUrls) {
      this.extractions.delete(chapterUrl);
      evictedPages.push(...(this.chapterPageUrls.get(chapterUrl) ?? []));
      this.chapterPageUrls.delete(chapterUrl);
    }
    const pagesStillRetained = new Set([...this.chapterPageUrls.values()].flat());
    for (const pageUrl of evictedPages) {
      if (!pagesStillRetained.has(pageUrl)) this.pageHeaders.delete(pageUrl);
    }
  }

  private extract(chapterUrl: URL): Promise<ChapterExtraction> {
    const cached = this.extractions.get(chapterUrl.href);
    if (cached) return cached;
    const pending = (async (): Promise<ChapterExtraction> => {
      let upstream: Response;
      try {
        upstream = await this.fetcher(chapterUrl.href, { headers: { Accept: 'text/html,application/xhtml+xml' } });
      } catch (error) {
        throw new ExtractionFailure(502, { error: 'FETCH_FAILED', detail: `Chapter fetch failed: ${friendlyDetail(error)}` });
      }
      if (!upstream.ok) {
        throw new ExtractionFailure(502, { error: 'FETCH_FAILED', status: upstream.status, detail: `Chapter site returned HTTP ${upstream.status}.` });
      }

      let extracted: ExtractResult | ExtractError;
      try {
        extracted = this.registry.extract(await upstream.text(), chapterUrl.href);
      } catch (error) {
        extracted = { error: 'NO_PAGE_RUN', detail: `The Chapter could not be parsed: ${friendlyDetail(error)}` };
      }
      if ('error' in extracted) throw new ExtractionFailure(422, extracted);

      const pageUrls = extracted.pages.map((page) => new URL(page.url).href);
      const policy = extracted.imageHeaders ?? { referer: chapterUrl.href };
      this.chapterPageUrls.set(chapterUrl.href, pageUrls);
      for (const pageUrl of pageUrls) this.pageHeaders.set(pageUrl, policy);
      return {
        url: chapterUrl.href,
        extracted,
        seriesKey: extracted.seriesKey ?? chapterUrl.hostname.toLowerCase(),
        chapterTitle: extracted.chapterTitle ?? decodeURIComponent(chapterUrl.pathname.split('/').filter(Boolean).at(-1) ?? 'Untitled Chapter'),
        seriesTitle: extracted.seriesTitle ?? chapterUrl.hostname
      };
    })();
    this.extractions.set(chapterUrl.href, pending);
    void pending.catch(() => { if (this.extractions.get(chapterUrl.href) === pending) this.extractions.delete(chapterUrl.href); });
    return pending;
  }
}
