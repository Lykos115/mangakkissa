import { describe, expect, it, vi } from 'vitest';
import { ExtractionCache, ExtractionFailure } from '../server/extraction-cache.js';
import { ExtractorRegistry } from '../server/extractors/registry.js';
import type { ExtractResult, Fetcher } from '../server/types.js';

// Chapters are described as JSON "HTML"; a pass-through extractor decodes them,
// so tests control pages/adjacency without real markup.
const jsonExtractor = new ExtractorRegistry([{
  id: 'json',
  matches: () => true,
  extract: (html: string) => JSON.parse(html) as ExtractResult
}]);

const chapterUrl = (slug: string) => new URL(`https://series.example/${slug}`);

function harness(chapters: Record<string, Partial<ExtractResult>>) {
  const fetcher = vi.fn(async (url: string) => {
    const slug = new URL(url).pathname.slice(1);
    const chapter = chapters[slug];
    if (!chapter) return new Response('missing', { status: 404 });
    return new Response(JSON.stringify({ pages: [], ...chapter }));
  });
  return { fetcher, cache: new ExtractionCache(fetcher as Fetcher, jsonExtractor) };
}

describe('ExtractionCache', () => {
  it('serves repeated resolves from the cache without re-fetching', async () => {
    const { fetcher, cache } = harness({ 'ch-1': { pages: [{ url: 'https://img.example/1.jpg' }] } });
    const first = await cache.resolve(chapterUrl('ch-1'));
    const second = await cache.resolve(chapterUrl('ch-1'));
    expect(second.chapter).toBe(first.chapter);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('evicts a failed extraction so a retry re-fetches', async () => {
    const { fetcher, cache } = harness({});
    await expect(cache.resolve(chapterUrl('gone'))).rejects.toBeInstanceOf(ExtractionFailure);
    await expect(cache.resolve(chapterUrl('gone'))).rejects.toMatchObject({ httpStatus: 502, body: { status: 404 } });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps a Chapter cached while any Series Retention Window overlaps it', async () => {
    const shared = { 'ch-1': { seriesKey: 'series-a', nextUrl: 'https://series.example/ch-2' } };
    const { fetcher, cache } = harness({
      ...shared,
      'ch-2': { seriesKey: 'series-b', prevUrl: 'https://series.example/ch-1' }
    });
    const a = await cache.resolve(chapterUrl('ch-1'));
    const b = await cache.resolve(chapterUrl('ch-2'));
    cache.retainWindow(a);
    cache.retainWindow(b);
    // Replacing series-a's window drops ch-1 from it, but series-b still retains ch-1 as prev.
    cache.retainWindow({ chapter: { ...a.chapter, url: 'https://series.example/ch-9' }, navigation: {} });
    fetcher.mockClear();
    await cache.resolve(chapterUrl('ch-1'));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('prunes header policy on eviction unless another Chapter still lists the Page', async () => {
    const page = 'https://img.example/shared.jpg';
    const { cache } = harness({
      'ch-1': { pages: [{ url: page }], imageHeaders: { referer: 'https://series.example/ch-1' } },
      'ch-2': { pages: [{ url: page }], imageHeaders: { referer: 'https://series.example/ch-2' } },
      lone: { pages: [{ url: 'https://img.example/lone.jpg' }] }
    });
    const one = await cache.resolve(chapterUrl('ch-1'));
    await cache.resolve(chapterUrl('ch-2'));
    await cache.resolve(chapterUrl('lone'));
    cache.retainWindow(one); // evicts ch-2 and lone
    // Policy is last-writer-wins per Page; it must survive ch-2's eviction because ch-1 still lists the Page.
    expect(cache.headersFor(page)).toEqual({ referer: 'https://series.example/ch-2' });
    expect(cache.headersFor('https://img.example/lone.jpg')).toEqual({});
  });

  it('prefetch warms the cache and swallows failures', async () => {
    const { fetcher, cache } = harness({ 'ch-2': {} });
    cache.prefetch('https://series.example/ch-2');
    cache.prefetch('https://series.example/missing');
    cache.prefetch(undefined);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    fetcher.mockClear();
    await cache.resolve(chapterUrl('ch-2'));
    expect(fetcher).not.toHaveBeenCalled();
  });
});
