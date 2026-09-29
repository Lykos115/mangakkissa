export interface ChapterNavigationSource {
  url: string;
  nextUrl?: string;
  prevUrl?: string;
}

export interface ResolvedChapterNavigation {
  nextUrl?: string;
  prevUrl?: string;
}

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

export function adjacentChapterUrls(current: ChapterNavigationSource): ResolvedChapterNavigation {
  const nextUrl = current.nextUrl ? normalizeChapterUrl(current.nextUrl, current.url)?.href : undefined;
  const prevUrl = current.prevUrl ? normalizeChapterUrl(current.prevUrl, current.url)?.href : undefined;
  return {
    ...(nextUrl ? { nextUrl } : {}),
    ...(prevUrl ? { prevUrl } : {})
  };
}
