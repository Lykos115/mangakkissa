import type { OpenError, OpenPayload } from './api.js';
import type { ReaderPage } from './spreads.js';

export const fitOptions = [
  { mode: 'height', label: 'Fit height' },
  { mode: 'width', label: 'Fit width' },
  { mode: 'original', label: 'Original size' }
] as const;
export type FitMode = typeof fitOptions[number]['mode'];
export const defaultFit: FitMode = 'height';

export interface PageLoadState { generation: number; failed: boolean; recovering: boolean }
export interface PageSize { width: number; height: number }

export interface ReaderState {
  opened?: OpenPayload;
  nextChapter?: OpenPayload['chapter'];
  nextError?: OpenError;
  spreadIndex: number;
  atEnd: boolean;
  transitionPending: boolean;
  continuationUrl: string;
  continuationPending: boolean;
  continuationError?: OpenError;
  pageLoads: Record<string, PageLoadState>;
  coverSolo: boolean;
  fit: FitMode;
  chromeVisible: boolean;
  announceChapterChange: boolean;
}

export const initialReaderState: ReaderState = {
  spreadIndex: 0,
  atEnd: false,
  transitionPending: false,
  continuationUrl: '',
  continuationPending: false,
  pageLoads: {},
  coverSolo: true,
  fit: defaultFit,
  chromeVisible: true,
  announceChapterChange: false
};

export type ReaderAction =
  | { type: 'session-started'; payload: OpenPayload }
  | { type: 'session-ended' }
  | { type: 'transition-started' }
  | { type: 'transition-finished' }
  | { type: 'chapter-replaced'; payload: OpenPayload; spreadIndex: number; announce: boolean }
  | { type: 'next-open-failed'; error: OpenError }
  | { type: 'spread-selected'; index: number }
  | { type: 'spread-count-changed'; count: number }
  | { type: 'spread-anchor-realigned'; previousSpreads: ReaderPage[][]; spreads: ReaderPage[][] }
  | { type: 'reached-end' }
  | { type: 'end-dismissed' }
  | { type: 'fit-cycled' }
  | { type: 'pairing-toggled' }
  | { type: 'chrome-toggled' }
  | { type: 'announce-cleared' }
  | { type: 'next-peek-started' }
  | { type: 'next-chapter-loaded'; chapter: OpenPayload['chapter'] }
  | { type: 'next-peek-failed'; error: OpenError }
  | { type: 'continuation-url-changed'; value: string }
  | { type: 'continuation-started' }
  | { type: 'continuation-succeeded'; payload: OpenPayload }
  | { type: 'continuation-failed'; error: OpenError }
  | { type: 'page-failed'; url: string; generation: number }
  | { type: 'page-loaded'; url: string; generation: number }
  | { type: 'page-retried'; url: string };

export function readerReducer(state: ReaderState, action: ReaderAction): ReaderState {
  switch (action.type) {
    case 'session-started':
      return { ...initialReaderState, opened: action.payload };
    case 'session-ended':
      return { ...state, opened: undefined };
    case 'transition-started':
      return { ...state, transitionPending: true };
    case 'transition-finished':
      return { ...state, transitionPending: false };
    case 'chapter-replaced':
      return {
        ...state,
        opened: action.payload,
        nextChapter: undefined,
        nextError: undefined,
        atEnd: false,
        spreadIndex: action.spreadIndex,
        continuationUrl: '',
        continuationError: undefined,
        pageLoads: {},
        announceChapterChange: action.announce
      };
    case 'next-open-failed':
      return { ...state, nextError: action.error, atEnd: true };
    case 'spread-selected':
      return { ...state, spreadIndex: action.index, atEnd: false };
    case 'spread-count-changed': {
      const clamped = Math.min(state.spreadIndex, Math.max(action.count - 1, 0));
      return clamped === state.spreadIndex ? state : { ...state, spreadIndex: clamped };
    }
    case 'spread-anchor-realigned': {
      const anchor = action.previousSpreads[Math.min(state.spreadIndex, action.previousSpreads.length - 1)]?.[0]?.url;
      const found = anchor === undefined ? -1 : action.spreads.findIndex((spread) => spread.some((page) => page.url === anchor));
      const next = found === -1 ? Math.min(state.spreadIndex, action.spreads.length - 1) : found;
      return next === state.spreadIndex ? state : { ...state, spreadIndex: next };
    }
    case 'reached-end':
      return { ...state, atEnd: true };
    case 'end-dismissed':
      return { ...state, atEnd: false };
    case 'fit-cycled': {
      const index = fitOptions.findIndex((option) => option.mode === state.fit);
      return { ...state, fit: fitOptions[(index + 1) % fitOptions.length].mode };
    }
    case 'pairing-toggled':
      return { ...state, coverSolo: !state.coverSolo };
    case 'chrome-toggled':
      return { ...state, chromeVisible: !state.chromeVisible };
    case 'announce-cleared':
      return { ...state, announceChapterChange: false };
    case 'next-peek-started':
      if (state.nextChapter === undefined && state.nextError === undefined) return state;
      return { ...state, nextChapter: undefined, nextError: undefined };
    case 'next-chapter-loaded':
      return { ...state, nextChapter: action.chapter };
    case 'next-peek-failed':
      return { ...state, nextError: action.error };
    case 'continuation-url-changed':
      return { ...state, continuationUrl: action.value };
    case 'continuation-started':
      return { ...state, continuationPending: true, continuationError: undefined };
    case 'continuation-succeeded':
      return {
        ...state,
        opened: action.payload,
        nextChapter: undefined,
        nextError: undefined,
        spreadIndex: 0,
        atEnd: false,
        continuationUrl: '',
        continuationPending: false,
        pageLoads: {},
        announceChapterChange: true
      };
    case 'continuation-failed':
      return { ...state, continuationError: action.error, continuationPending: false };
    case 'page-failed': {
      const current = state.pageLoads[action.url] ?? { generation: 0, failed: false, recovering: false };
      if (current.generation !== action.generation || (current.failed && !current.recovering)) return state;
      return { ...state, pageLoads: { ...state.pageLoads, [action.url]: { ...current, failed: true, recovering: false } } };
    }
    case 'page-loaded': {
      const current = state.pageLoads[action.url];
      if (!current || current.generation !== action.generation || (!current.failed && !current.recovering)) return state;
      return { ...state, pageLoads: { ...state.pageLoads, [action.url]: { ...current, failed: false, recovering: false } } };
    }
    case 'page-retried': {
      const current = state.pageLoads[action.url] ?? { generation: 1, failed: true, recovering: false };
      return { ...state, pageLoads: { ...state.pageLoads, [action.url]: { generation: current.generation + 1, failed: false, recovering: true } } };
    }
  }
}
