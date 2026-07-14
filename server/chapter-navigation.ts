import { parseChapterDesignation } from './chapter-designation.js';

export const MAX_ADJACENT_HOPS = 25;

export interface ChapterNavigationSource {
  url: string;
  chapterTitle?: string;
  nextUrl?: string;
  prevUrl?: string;
}

export interface ResolvedChapterNavigation {
  nextUrl?: string;
  prevUrl?: string;
}

export type ChapterNavigationLoader = (url: URL) => Promise<ChapterNavigationSource>;

type Direction = 'nextUrl' | 'prevUrl';

export function normalizeChapterUrl(value: string, base?: string): URL | undefined {
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    url.hash = '';
    return url;
  } catch {
    return undefined;
  }
}

async function resolveDirection(
  current: ChapterNavigationSource,
  direction: Direction,
  loadChapter: ChapterNavigationLoader
): Promise<string | undefined> {
  const currentUrl = normalizeChapterUrl(current.url);
  if (!currentUrl) return undefined;

  const visited = new Set([currentUrl.href]);
  let source = current;

  for (let hop = 0; hop < MAX_ADJACENT_HOPS; hop += 1) {
    const candidate = normalizeChapterUrl(source[direction] ?? '', source.url);
    if (!candidate || visited.has(candidate.href)) return undefined;
    visited.add(candidate.href);

    let designation = parseChapterDesignation(candidate.pathname);
    if (designation && designation.suffix === '') return candidate.href;

    const loaded = await loadChapter(candidate);
    designation ??= parseChapterDesignation(loaded.chapterTitle);
    if (!designation || designation.suffix === '') return candidate.href;
    source = loaded;
  }

  return undefined;
}

export async function resolveAdjacentChapterUrls(
  current: ChapterNavigationSource,
  loadChapter: ChapterNavigationLoader,
  skipLettered = false
): Promise<ResolvedChapterNavigation> {
  if (!skipLettered) {
    const nextUrl = normalizeChapterUrl(current.nextUrl ?? '', current.url)?.href;
    const prevUrl = normalizeChapterUrl(current.prevUrl ?? '', current.url)?.href;
    return {
      ...(nextUrl ? { nextUrl } : {}),
      ...(prevUrl ? { prevUrl } : {})
    };
  }

  const [nextUrl, prevUrl] = await Promise.all([
    resolveDirection(current, 'nextUrl', loadChapter),
    resolveDirection(current, 'prevUrl', loadChapter)
  ]);
  return {
    ...(nextUrl ? { nextUrl } : {}),
    ...(prevUrl ? { prevUrl } : {})
  };
}
