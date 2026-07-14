import { describe, expect, it, vi } from 'vitest';
import {
  MAX_ADJACENT_HOPS,
  resolveAdjacentChapterUrls,
  type ChapterNavigationSource
} from '../server/chapter-navigation.js';

const chapter = (number: string, navigation: Partial<ChapterNavigationSource> = {}): ChapterNavigationSource => ({
  url: `https://reader.test/chapter-${number}`,
  chapterTitle: `Chapter ${number}`,
  ...navigation
});

function mapLoader(chapters: ChapterNavigationSource[]) {
  const byUrl = new Map(chapters.map((entry) => [entry.url, entry]));
  return vi.fn(async (url: URL) => {
    const found = byUrl.get(url.href);
    if (!found) throw new Error(`Unexpected Chapter load: ${url.href}`);
    return found;
  });
}

describe('effective Chapter navigation', () => {
  it('normalizes and returns immediate links without loading when skipping is off', async () => {
    const loader = vi.fn();
    await expect(resolveAdjacentChapterUrls({
      url: 'https://reader.test/series/chapter-42#page',
      nextUrl: '../chapter-42e#top',
      prevUrl: '/chapter-41'
    }, loader, false)).resolves.toEqual({
      nextUrl: 'https://reader.test/chapter-42e',
      prevUrl: 'https://reader.test/chapter-41'
    });
    expect(loader).not.toHaveBeenCalled();
  });

  it('skips immediate-only lettered chains in both directions', async () => {
    const current = chapter('42', { nextUrl: '/chapter-42e', prevUrl: '/chapter-41I' });
    const loader = mapLoader([
      chapter('42e', { nextUrl: '/chapter-42f' }),
      chapter('42f', { nextUrl: '/chapter-43' }),
      chapter('41I', { prevUrl: '/chapter-41h' }),
      chapter('41h', { prevUrl: '/chapter-41' })
    ]);

    await expect(resolveAdjacentChapterUrls(current, loader, true)).resolves.toEqual({
      nextUrl: 'https://reader.test/chapter-43',
      prevUrl: 'https://reader.test/chapter-41'
    });
    expect(loader.mock.calls.map(([url]) => url.href).sort()).toEqual([
      'https://reader.test/chapter-41I',
      'https://reader.test/chapter-41h',
      'https://reader.test/chapter-42e',
      'https://reader.test/chapter-42f'
    ].sort());
  });

  it('uses an extracted title when the URL has no designation', async () => {
    const special: ChapterNavigationSource = {
      url: 'https://reader.test/special-edition',
      chapterTitle: 'Chapter 42I',
      nextUrl: '/chapter-43'
    };
    const loader = mapLoader([special]);
    await expect(resolveAdjacentChapterUrls(chapter('42', { nextUrl: special.url }), loader, true)).resolves.toEqual({
      nextUrl: 'https://reader.test/chapter-43'
    });
  });

  it('terminates loops per direction while preserving a valid opposite direction', async () => {
    const current = chapter('42', { nextUrl: '/chapter-42e', prevUrl: '/chapter-41' });
    const loader = mapLoader([chapter('42e', { nextUrl: '/chapter-42e' })]);
    await expect(resolveAdjacentChapterUrls(current, loader, true)).resolves.toEqual({
      prevUrl: 'https://reader.test/chapter-41'
    });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('stops after the hop limit without returning a lettered fallback', async () => {
    const intermediaries = Array.from({ length: MAX_ADJACENT_HOPS + 1 }, (_, index) => {
      const suffix = String.fromCharCode(97 + (index % 26));
      const cycle = Math.floor(index / 26);
      const token = `${42 + cycle}${suffix}`;
      const nextIndex = index + 1;
      const nextSuffix = String.fromCharCode(97 + (nextIndex % 26));
      const nextCycle = Math.floor(nextIndex / 26);
      return chapter(token, { nextUrl: `/chapter-${42 + nextCycle}${nextSuffix}` });
    });
    const loader = mapLoader(intermediaries);
    await expect(resolveAdjacentChapterUrls(chapter('42', { nextUrl: intermediaries[0].url }), loader, true)).resolves.toEqual({});
    expect(loader).toHaveBeenCalledTimes(MAX_ADJACENT_HOPS);
  });

  it('propagates intermediary failures and allows a later retry', async () => {
    const lettered = chapter('42e', { nextUrl: '/chapter-43' });
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(lettered);
    const current = chapter('42', { nextUrl: lettered.url });

    await expect(resolveAdjacentChapterUrls(current, loader, true)).rejects.toThrow('temporary failure');
    await expect(resolveAdjacentChapterUrls(current, loader, true)).resolves.toEqual({ nextUrl: 'https://reader.test/chapter-43' });
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
