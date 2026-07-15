// The client/server contract: wire types both tiers exchange, and the
// doubled-width rule that decides when a Page counts as a pre-joined Spread.

export interface Page {
  url: string;
  width?: number;
  height?: number;
}

export interface VisitedChapter {
  url: string; title: string; pageCount: number; firstOpenedAt: string; completed: boolean;
}
export interface LibrarySeries {
  key: string; title: string; resumeChapterUrl: string; addedAt: string; lastReadAt: string; chapters: VisitedChapter[];
}
export interface Library { series: LibrarySeries[] }

export interface OpenPayload {
  chapter: { url: string; title: string; pages: Page[]; nextUrl?: string; prevUrl?: string };
  series: { key: string; title: string; resumeChapterUrl: string };
  reread: boolean;
  upscaler?: 'ready' | 'unconfigured';
}

export const WIDTH_TOLERANCE = 0.15;
export const closeToWidth = (value: number, target: number) => Math.abs(value - target) / target <= WIDTH_TOLERANCE;
export const isDoubledWidth = (width: number, base: number) => closeToWidth(width, base * 2);
