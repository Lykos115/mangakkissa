import type { Page } from '../shared/contract.js';

export type { Page } from '../shared/contract.js';

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

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
