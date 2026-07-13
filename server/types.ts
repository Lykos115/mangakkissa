export interface Page {
  url: string;
  width?: number;
  height?: number;
}

export interface ExtractResult {
  pages: Page[];
  chapterTitle?: string;
  seriesTitle?: string;
  seriesKey?: string;
  nextUrl?: string;
  prevUrl?: string;
  imageHeaders?: { referer?: string; userAgent?: string };
}

export type ExtractErrorCode = 'FETCH_FAILED' | 'NO_IMAGES' | 'NO_PAGE_RUN' | 'LONG_STRIP_UNSUPPORTED';
export interface ExtractError { error: ExtractErrorCode; status?: number; detail: string }
export interface Extractor {
  id: string;
  matches(url: string): boolean;
  extract(html: string, url: string): ExtractResult | ExtractError;
}

export interface VisitedChapter {
  url: string; title: string; pageCount: number; firstOpenedAt: string; completed: boolean;
}
export interface LibrarySeries {
  key: string; title: string; resumeChapterUrl: string; addedAt: string; lastReadAt: string; chapters: VisitedChapter[];
}
export interface Library { series: LibrarySeries[] }
