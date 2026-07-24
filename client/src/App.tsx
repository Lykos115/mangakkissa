import React, { FormEvent, useCallback, useEffect, useEffectEvent, useMemo, useReducer, useRef, useState } from 'react';
import {
  completeChapter as defaultCompleteChapter,
  getLibrary as defaultGetLibrary,
  openChapter as defaultOpenChapter,
  peekChapter as defaultPeekChapter,
  removeSeries as defaultRemoveSeries,
  renameSeries as defaultRenameSeries,
  type LibrarySeries,
  type OpenError,
  type OpenPayload
} from './api.js';
import { appUrl } from './app-url.js';
import { buildSpreads, deficientSpreadPages, pagesInReadingOrder, spreadPages, type ReaderPage } from './spreads.js';
import {
  fitOptions,
  initialReaderState,
  readerReducer,
  type FitMode,
  type NavigationRefreshFailure,
  type PageLoadState,
  type PageSize
} from './reader-state.js';
import { initialLibraryState, libraryReducer } from './library-state.js';
import './styles.css';

const proxyUrl = (url: string) => `${appUrl('api/image')}?url=${encodeURIComponent(url)}`;
const upscaleUrl = (url: string) => `${proxyUrl(url)}&upscale=2`;
const friendlyError = (code?: string, status?: number) => {
  if (code === 'FETCH_FAILED') return `Couldn't reach the site${status ? ` (HTTP ${status})` : ''}.`;
  if (code === 'LONG_STRIP_UNSUPPORTED') return 'This looks like a vertical-scroll comic — this reader only does page spreads.';
  return "Couldn't find chapter pages on this page — this site may need its own extractor.";
};

const CHAPTER_TOAST_DURATION_MS = 1800;

const withMeasuredSizes = (pages: ReaderPage[], sizes: Record<string, PageSize>) =>
  pages.map((page) => sizes[page.url] ? { ...page, ...sizes[page.url] } : page);

const releasePointerFocus = (event: React.PointerEvent<HTMLButtonElement>) => event.currentTarget.blur();

interface AppProps {
  openChapter?: typeof defaultOpenChapter;
  peekChapter?: typeof defaultPeekChapter;
  completeChapter?: typeof defaultCompleteChapter;
  getLibrary?: typeof defaultGetLibrary;
  renameSeries?: typeof defaultRenameSeries;
  removeSeries?: typeof defaultRemoveSeries;
}

function ErrorMessage({ error, retry }: { error: OpenError; retry?: () => void }) {
  return <div className="error" role="alert">
    <strong>{friendlyError(error.code, error.status)}</strong>
    <p>{error.code ?? 'UNKNOWN'} · HTTP {error.status ?? 'unknown'} · {error.detail ?? error.message}</p>
    {retry && <button type="button" onClick={retry}>Retry</button>}
  </div>;
}

function PageMedia({ page, pageNumber, state, thumbnail = false, loading, upscaledSrc, onError, onLoad, onRetry, onUpscaledError }: {
  page: ReaderPage;
  pageNumber: number;
  state?: PageLoadState;
  thumbnail?: boolean;
  loading?: 'eager' | 'lazy';
  upscaledSrc?: string;
  onError: (url: string, generation: number) => void;
  onLoad: (url: string, generation: number, size: PageSize) => void;
  onRetry: (url: string) => void;
  onUpscaledError?: (url: string) => void;
}) {
  const generation = state?.generation ?? 0;
  const recovering = state?.recovering === true;
  if (state?.failed) {
    if (thumbnail) return <span className="thumbnail-page-failure" role="img" aria-label={`Page ${pageNumber} failed to load`}><span aria-hidden="true">!</span></span>;
    return <button type="button" className="page-failure" onClick={() => onRetry(page.url)} aria-label={`Page ${pageNumber} didn't load — tap to retry`}>
      <strong>Page {pageNumber} didn’t load</strong><span>Tap to retry</span>
    </button>;
  }
  const upscaled = !thumbnail && upscaledSrc !== undefined;
  const src = upscaled ? upscaledSrc : `${proxyUrl(page.url)}${generation ? `&retry=${generation}` : ''}`;
  return <span className={thumbnail ? 'thumbnail-page' : 'page-media'}>
    <img src={src} alt={thumbnail ? '' : `Page ${pageNumber}`} loading={loading ?? (thumbnail ? 'lazy' : 'eager')}
      onError={() => upscaled ? onUpscaledError?.(page.url) : onError(page.url, generation)}
      onLoad={(event) => onLoad(page.url, generation, { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
    {thumbnail && recovering && <span className="broken-marker" role="img" aria-label={`Page ${pageNumber} failed to load`}>!</span>}
  </span>;
}

function ReaderHeader({ seriesTitle, chapterTitle, spreadLabel, upscalerBroken, fit, coverSolo, skipLetteredChapters, toggleDisabled, navigationRefreshPending, navigationRefreshError, onLeave, onCycleFit, onTogglePairing, onSkipChange, onRetryRefresh }: {
  seriesTitle: string;
  chapterTitle: string;
  spreadLabel: string;
  upscalerBroken: boolean;
  fit: FitMode;
  coverSolo: boolean;
  skipLetteredChapters: boolean;
  toggleDisabled: boolean;
  navigationRefreshPending: boolean;
  navigationRefreshError?: NavigationRefreshFailure;
  onLeave: () => void;
  onCycleFit: () => void;
  onTogglePairing: () => void;
  onSkipChange: (requestedValue: boolean) => void;
  onRetryRefresh: (requestedValue: boolean) => void;
}) {
  return <header className="reader-header">
    <button type="button" className="quiet-button" onClick={onLeave}>Library</button>
    <div className="reader-title"><strong>{seriesTitle}</strong><span aria-hidden="true"> — </span><h1>{chapterTitle}</h1></div>
    <span className="spread-count">{spreadLabel}</span>
    <div className="reader-controls">
      {upscalerBroken && <span className="upscale-error" role="alert">Spread upscaling isn’t working — originals are shown.</span>}
      <button type="button" className="quiet-button" onClick={onCycleFit}>{fitOptions.find((option) => option.mode === fit)?.label} <kbd>f</kbd></button>
      <button type="button" className="quiet-button" aria-pressed={!coverSolo} onClick={onTogglePairing}>Shift pairing <kbd>p</kbd></button>
      <div className="navigation-option">
        <label className="navigation-option-toggle">
          <input
            type="checkbox"
            checked={skipLetteredChapters}
            disabled={toggleDisabled}
            onChange={(event) => onSkipChange(event.target.checked)}
          />
          <span>Skip lettered Chapters</span>
        </label>
        {navigationRefreshPending && <span className="navigation-refresh-status" role="status">Refreshing navigation…</span>}
        {navigationRefreshError && <span className="navigation-refresh-error" role="alert">
          <span>Couldn’t refresh Chapter navigation.</span>
          <button type="button" className="quiet-button" onClick={() => onRetryRefresh(navigationRefreshError.requestedValue)}>Retry</button>
        </span>}
      </div>
    </div>
  </header>;
}

function EndCard({ chapterTitle, chapterUrl, continuationUrl, continuationPending, continuationError, nextError, onUrlChange, onContinue, onRetryContinue, onRetryNext, onLeave }: {
  chapterTitle: string;
  chapterUrl: string;
  continuationUrl: string;
  continuationPending: boolean;
  continuationError?: OpenError;
  nextError?: OpenError;
  onUrlChange: (value: string) => void;
  onContinue: (event: FormEvent) => void;
  onRetryContinue: () => void;
  onRetryNext: () => void;
  onLeave: () => void;
}) {
  return <section className="end-card" aria-labelledby="end-card-title">
    <p className="eyebrow">Chapter complete</p>
    <h2 id="end-card-title">End of {chapterTitle} — no next chapter found.</h2>
    <p>If there is one, paste its URL:</p>
    <form className="continuation-form" onSubmit={onContinue}>
      <label htmlFor="continuation-url">Next Chapter URL</label>
      <div className="paste-row"><input id="continuation-url" type="url" required value={continuationUrl} onChange={(event) => onUrlChange(event.target.value)} placeholder="https://example.test/chapter-2/"/><button type="submit" disabled={continuationPending}>{continuationPending ? 'Opening…' : 'Continue'}</button></div>
    </form>
    {continuationError && <ErrorMessage error={continuationError} retry={onRetryContinue} />}
    {nextError && <div className="next-chapter-failure"><p>The detected next Chapter could not be opened.</p><ErrorMessage error={nextError} retry={onRetryNext} /></div>}
    <div className="end-actions"><a href={chapterUrl} target="_blank" rel="noreferrer">Open Chapter on source site</a><button type="button" className="quiet-button" onClick={onLeave}>Back to Library</button></div>
  </section>;
}

function Filmstrip({ spreads, nextChapter, nextSpreads, activeSpreadIndex, atEnd, progress, pageNumbers, nextPageNumbers, pageLoads, navigationLocked, currentThumbnail, onSelect, onOpenNext, onPageError, onPageLoaded, onPageRetry }: {
  spreads: ReaderPage[][];
  nextChapter?: OpenPayload['chapter'];
  nextSpreads: ReaderPage[][];
  activeSpreadIndex: number;
  atEnd: boolean;
  progress: number;
  pageNumbers: Map<string, number>;
  nextPageNumbers: Map<string, number>;
  pageLoads: Record<string, PageLoadState>;
  navigationLocked: boolean;
  currentThumbnail: React.RefObject<HTMLButtonElement | null>;
  onSelect: (index: number) => void;
  onOpenNext: (chapterUrl: string, index: number) => void;
  onPageError: (url: string, generation: number) => void;
  onPageLoaded: (url: string, generation: number, size: PageSize) => void;
  onPageRetry: (url: string) => void;
}) {
  return <footer className="filmstrip-shell">
    <div className="progress-track" role="progressbar" aria-label="Chapter progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
      <div className="progress-value" style={{ width: `${progress}%` }} />
    </div>
    <nav className="filmstrip" aria-label="Chapter Spreads">
      {spreads.map((thumbnailSpread, index) => <button
        type="button"
        className={`thumbnail ${!atEnd && index === activeSpreadIndex ? 'current' : ''}`}
        aria-label={`Spread ${index + 1}`}
        aria-current={!atEnd && index === activeSpreadIndex ? 'true' : undefined}
        key={thumbnailSpread.map((page) => page.url).join('|')}
        onClick={() => onSelect(index)}
        ref={!atEnd && index === activeSpreadIndex ? currentThumbnail : undefined}
      >
        {pagesInReadingOrder(thumbnailSpread).map((page) => <PageMedia
          key={page.url}
          page={page}
          pageNumber={pageNumbers.get(page.url) ?? 0}
          state={pageLoads[page.url]}
          thumbnail
          loading={index >= activeSpreadIndex && index <= activeSpreadIndex + 2 ? 'eager' : 'lazy'}
          onError={onPageError}
          onLoad={onPageLoaded}
          onRetry={onPageRetry}
        />)}
      </button>)}
      {nextChapter && <>
        <div className="chapter-divider" aria-label={`Next Chapter — ${nextChapter.title}`}><span>Next Chapter</span><strong>{nextChapter.title}</strong></div>
        {nextSpreads.map((thumbnailSpread, index) => <button
          type="button"
          className="thumbnail adjacent-thumbnail"
          aria-label={`${nextChapter.title}, Spread ${index + 1}`}
          key={thumbnailSpread.map((page) => page.url).join('|')}
          disabled={navigationLocked}
          onClick={() => onOpenNext(nextChapter.url, index)}
        >
          {pagesInReadingOrder(thumbnailSpread).map((page) => <PageMedia
            key={page.url}
            page={page}
            pageNumber={nextPageNumbers.get(page.url) ?? 0}
            state={pageLoads[page.url]}
            thumbnail
            loading="lazy"
            onError={onPageError}
            onLoad={onPageLoaded}
            onRetry={onPageRetry}
          />)}
        </button>)}
      </>}
    </nav>
  </footer>;
}

function PasteCard({ openChapter, onOpened }: {
  openChapter: typeof defaultOpenChapter;
  onOpened: (payload: OpenPayload) => void;
}) {
  const [url, setUrl] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<OpenError>();
  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      onOpened(await openChapter(url));
    } catch (caught) {
      setError(caught as OpenError);
    } finally {
      setPending(false);
    }
  };
  return <section className="paste-card">
    <p className="eyebrow">Local manga reader</p><h1>Library</h1><p>Paste a Chapter URL to extract its Pages and read right to left.</p>
    <form onSubmit={submit}><label htmlFor="chapter-url">Chapter URL</label><div className="paste-row"><input id="chapter-url" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.test/chapter-1/"/><button type="submit" disabled={pending}>{pending ? 'Opening…' : 'Open chapter'}</button></div></form>
    {error && <ErrorMessage error={error} retry={() => { void submit(); }} />}
  </section>;
}

function LibrarySection({ getLibrary, openChapter, renameSeries, removeSeries, onOpened }: {
  getLibrary: typeof defaultGetLibrary;
  openChapter: typeof defaultOpenChapter;
  renameSeries: typeof defaultRenameSeries;
  removeSeries: typeof defaultRemoveSeries;
  onOpened: (payload: OpenPayload) => void;
}) {
  const [state, dispatch] = useReducer(libraryReducer, initialLibraryState);
  const { library, loading, error, seriesPending, seriesErrors, expanded, editing, managementErrors } = state;

  const refresh = useCallback(async () => {
    try {
      dispatch({ type: 'library-loaded', library: await getLibrary() });
    } catch (caught) {
      dispatch({ type: 'library-failed', error: caught as OpenError });
    }
  }, [getLibrary]);

  useEffect(() => { void refresh(); }, [refresh]);

  const openFromLibrary = async (key: string, chapterUrl: string) => {
    dispatch({ type: 'series-open-started', key });
    try {
      onOpened(await openChapter(chapterUrl));
    } catch (caught) {
      dispatch({ type: 'series-open-failed', key, failure: { error: caught as OpenError, url: chapterUrl } });
    } finally {
      dispatch({ type: 'series-open-finished' });
    }
  };

  const saveTitle = async (event: FormEvent, key: string) => {
    event.preventDefault();
    if (!editing || editing.key !== key) return;
    try {
      dispatch({ type: 'series-renamed', key, series: await renameSeries(key, editing.title) });
    } catch (caught) {
      dispatch({ type: 'management-failed', key, message: (caught as Error).message });
    }
  };

  const remove = async (series: LibrarySeries) => {
    if (!window.confirm(`Remove ${series.title} and its Visited Log?`)) return;
    try {
      await removeSeries(series.key);
      dispatch({ type: 'series-removed', key: series.key });
    } catch (caught) {
      dispatch({ type: 'management-failed', key: series.key, message: (caught as Error).message });
    }
  };

  return <section className="series-library" aria-labelledby="series-library-title">
    <div className="section-heading"><div><p className="eyebrow">Recently read</p><h2 id="series-library-title">Series</h2></div><span>{library.series.length}</span></div>
    {loading && <p className="library-status">Loading Library…</p>}
    {error && <ErrorMessage error={error} retry={() => { dispatch({ type: 'library-refresh-started' }); void refresh(); }} />}
    {!loading && !error && library.series.length === 0 && <p className="library-status">No Series yet. Open a Chapter to begin.</p>}
    <div className="series-list">
      {library.series.map((series) => {
        const headingId = `series-${series.key.replace(/[^a-z0-9_-]/gi, '-')}`;
        const resumeChapter = series.chapters.find((chapter) => chapter.url === series.resumeChapterUrl);
        const isExpanded = expanded.has(series.key);
        const openError = seriesErrors[series.key];
        return <article className="series-card" key={series.key} aria-labelledby={headingId}>
          <div className="series-summary">
            <button type="button" className="resume-series" onClick={() => { void openFromLibrary(series.key, series.resumeChapterUrl); }} disabled={seriesPending === series.key} aria-label={`Resume ${series.title}`}>
              <span className="series-copy"><h3 id={headingId}>{series.title}</h3><span className="resume-label">Resume Chapter</span><strong>{resumeChapter?.title ?? series.resumeChapterUrl}</strong></span>
              <time dateTime={series.lastReadAt}>Last read {new Date(series.lastReadAt).toLocaleString()}</time>
            </button>
            <div className="series-actions">
              <button type="button" className="quiet-button" onClick={() => dispatch({ type: 'log-toggled', key: series.key })} aria-expanded={isExpanded} aria-controls={`${headingId}-log`} aria-label={`${isExpanded ? 'Hide' : 'Show'} Visited Log for ${series.title}`}>Visited Log <span aria-hidden="true">{isExpanded ? '−' : '+'}</span></button>
              <button type="button" className="quiet-button" onClick={() => dispatch({ type: 'edit-started', series })} aria-label={`Rename ${series.title}`}>Rename</button>
              <button type="button" className="quiet-button danger-button" onClick={() => { void remove(series); }} aria-label={`Remove ${series.title}`}>Remove</button>
            </div>
          </div>

          {editing?.key === series.key && <form className="rename-form" onSubmit={(event) => { void saveTitle(event, series.key); }}>
            <label htmlFor={`${headingId}-title`}>Series title</label><div className="form-row"><input id={`${headingId}-title`} required value={editing.title} onChange={(event) => dispatch({ type: 'edit-changed', title: event.target.value })} autoFocus/><button type="submit">Save title</button><button type="button" className="quiet-button" onClick={() => dispatch({ type: 'edit-cancelled' })}>Cancel</button></div>
          </form>}
          {managementErrors[series.key] && <p className="management-error" role="alert">{managementErrors[series.key]}</p>}
          {openError && <ErrorMessage error={openError.error} retry={() => { void openFromLibrary(series.key, openError.url); }} />}

          {isExpanded && <section className="visited-log" id={`${headingId}-log`} aria-label={`Visited Log for ${series.title}`}>
            <ol>{series.chapters.map((chapter) => <li key={chapter.url}>
              <button type="button" className="chapter-row" disabled={seriesPending === series.key} onClick={() => { void openFromLibrary(series.key, chapter.url); }} aria-label={`Re-read ${chapter.title}`}>
                <span><strong>{chapter.title}</strong><small>{chapter.pageCount} Pages</small></span>
                <time dateTime={chapter.firstOpenedAt}>{new Date(chapter.firstOpenedAt).toLocaleDateString()}</time>
              </button>
            </li>)}</ol>
          </section>}
        </article>;
      })}
    </div>
  </section>;
}

export function App({
  openChapter = defaultOpenChapter,
  peekChapter = defaultPeekChapter,
  completeChapter = defaultCompleteChapter,
  getLibrary = defaultGetLibrary,
  renameSeries = defaultRenameSeries,
  removeSeries = defaultRemoveSeries
}: AppProps) {
  const [state, dispatch] = useReducer(readerReducer, initialReaderState);
  const {
    opened, nextChapter, nextError, spreadIndex, atEnd, transitionPending,
    continuationUrl, continuationPending, continuationError, pageLoads,
    skipLetteredChapters, navigationRefreshPending, navigationRefreshError,
    coverSolo, fit, chromeVisible, announceChapterChange
  } = state;
  const [measuredSizes, setMeasuredSizes] = useState<Record<string, PageSize>>({});
  const [upscales, setUpscales] = useState<Record<string, 'ready' | 'failed'>>({});
  const [upscalerBroken, setUpscalerBroken] = useState(false);
  const navigationRefreshGeneration = useRef(0);
  const completedChapters = useRef(new Set<string>());
  const currentThumbnail = useRef<HTMLButtonElement>(null);

  const chapterPages = useMemo(() => withMeasuredSizes(opened?.chapter.pages ?? [], measuredSizes), [opened, measuredSizes]);
  const spreads = useMemo(() => opened ? buildSpreads(chapterPages, coverSolo) : [], [opened, chapterPages, coverSolo]);
  const nextSpreads = useMemo(() => nextChapter ? buildSpreads(withMeasuredSizes(nextChapter.pages, measuredSizes), coverSolo) : [], [nextChapter, measuredSizes, coverSolo]);
  const widePages = useMemo(() => spreadPages(chapterPages), [chapterPages]);
  // Fires on learning deficiency: unconfigured means no upscale request is ever issued.
  const pendingUpscales = useMemo(() => opened?.upscaler !== 'ready' ? [] : [
    ...deficientSpreadPages(chapterPages),
    ...deficientSpreadPages(nextChapter ? withMeasuredSizes(nextChapter.pages, measuredSizes) : [])
  ].filter((page) => !upscales[page.url]), [opened?.upscaler, chapterPages, nextChapter, measuredSizes, upscales]);
  const pageNumbers = useMemo(() => new Map(opened?.chapter.pages.map((page, index) => [page.url, index + 1]) ?? []), [opened]);
  const nextPageNumbers = useMemo(() => new Map(nextChapter?.pages.map((page, index) => [page.url, index + 1]) ?? []), [nextChapter]);
  const activeSpreadIndex = Math.min(spreadIndex, Math.max(spreads.length - 1, 0));

  const startSession = (payload: OpenPayload) => {
    completedChapters.current.clear();
    navigationRefreshGeneration.current += 1;
    dispatch({ type: 'session-started', payload });
  };
  const leaveReader = () => {
    navigationRefreshGeneration.current += 1;
    dispatch({ type: 'session-ended' });
  };

  const openWithReaderOptions = useCallback((chapterUrl: string) => skipLetteredChapters
    ? openChapter(chapterUrl, { skipLettered: true })
    : openChapter(chapterUrl), [openChapter, skipLetteredChapters]);

  const replaceChapter = useCallback(async (chapterUrl: string, target: number | 'last', announce: boolean, presentFailure = false) => {
    if (transitionPending || navigationRefreshPending) return;
    dispatch({ type: 'transition-started' });
    try {
      const payload = await openWithReaderOptions(chapterUrl);
      const targetIndex = target === 'last' ? Math.max(buildSpreads(withMeasuredSizes(payload.chapter.pages, measuredSizes), coverSolo).length - 1, 0) : target;
      dispatch({ type: 'chapter-replaced', payload, spreadIndex: targetIndex, announce });
    } catch (caught) {
      if (presentFailure) dispatch({ type: 'next-open-failed', error: caught as OpenError });
    } finally { dispatch({ type: 'transition-finished' }); }
  }, [transitionPending, navigationRefreshPending, openWithReaderOptions, measuredSizes, coverSolo]);
  const advance = useCallback(() => {
    if (atEnd || navigationRefreshPending) return;
    if (activeSpreadIndex < spreads.length - 1) dispatch({ type: 'spread-selected', index: activeSpreadIndex + 1 });
    else if (!opened?.chapter.nextUrl || nextError) dispatch({ type: 'reached-end' });
    else void replaceChapter(opened.chapter.nextUrl, 0, true, true);
  }, [atEnd, navigationRefreshPending, activeSpreadIndex, spreads.length, opened, nextError, replaceChapter]);
  const back = useCallback(() => {
    if (navigationRefreshPending) return;
    if (atEnd) {
      dispatch({ type: 'end-dismissed' });
      return;
    }
    if (activeSpreadIndex > 0) dispatch({ type: 'spread-selected', index: activeSpreadIndex - 1 });
    else if (opened?.chapter.prevUrl) void replaceChapter(opened.chapter.prevUrl, 'last', false);
  }, [navigationRefreshPending, atEnd, activeSpreadIndex, opened, replaceChapter]);

  const refreshNavigation = async (requestedValue: boolean) => {
    if (!opened || navigationRefreshPending) return;
    const chapterUrl = opened.chapter.url;
    const generation = navigationRefreshGeneration.current + 1;
    navigationRefreshGeneration.current = generation;
    dispatch({ type: 'navigation-refresh-started' });
    try {
      const payload = await peekChapter(chapterUrl, {
        ...(requestedValue ? { skipLettered: true } : {}),
        retainAsCurrent: true
      });
      if (navigationRefreshGeneration.current !== generation || payload.chapter.url !== chapterUrl) return;
      dispatch({ type: 'navigation-refreshed', chapterUrl, chapter: payload.chapter, requestedValue });
    } catch (caught) {
      if (navigationRefreshGeneration.current === generation) {
        dispatch({ type: 'navigation-refresh-failed', chapterUrl, failure: { error: caught as OpenError, requestedValue } });
      }
    } finally {
      if (navigationRefreshGeneration.current === generation) dispatch({ type: 'navigation-refresh-finished' });
    }
  };

  const continueManually = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!continuationUrl || continuationPending) return;
    dispatch({ type: 'continuation-started' });
    try {
      dispatch({ type: 'continuation-succeeded', payload: await openWithReaderOptions(continuationUrl) });
    } catch (caught) {
      dispatch({ type: 'continuation-failed', error: caught as OpenError });
    }
  };

  const pageError = (pageUrl: string, generation: number) => dispatch({ type: 'page-failed', url: pageUrl, generation });
  const pageLoaded = (pageUrl: string, generation: number, size: PageSize) => {
    if (size.width > 0 && size.height > 0) setMeasuredSizes((sizes) => {
      const current = sizes[pageUrl];
      if (current && current.width === size.width && current.height === size.height) return sizes;
      return { ...sizes, [pageUrl]: size };
    });
    dispatch({ type: 'page-loaded', url: pageUrl, generation });
  };
  const retryPage = (pageUrl: string) => dispatch({ type: 'page-retried', url: pageUrl });
  const upscaleLoaded = (pageUrl: string) => setUpscales((entries) => ({ ...entries, [pageUrl]: 'ready' }));
  const upscaleFailed = (pageUrl: string) => {
    setUpscales((entries) => ({ ...entries, [pageUrl]: 'failed' }));
    setUpscalerBroken(true);
  };

  useEffect(() => {
    if (!announceChapterChange) return;
    const timeout = window.setTimeout(() => dispatch({ type: 'announce-cleared' }), CHAPTER_TOAST_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [announceChapterChange, opened?.chapter.url]);

  useEffect(() => {
    const nextUrl = opened?.chapter.nextUrl;
    dispatch({ type: 'next-peek-started' });
    if (!nextUrl) return;
    let current = true;
    void (skipLetteredChapters ? peekChapter(nextUrl, { skipLettered: true }) : peekChapter(nextUrl)).then((payload) => {
      if (current && payload.chapter.url === nextUrl) dispatch({ type: 'next-chapter-loaded', chapter: payload.chapter });
    }).catch((caught) => {
      if (current) dispatch({ type: 'next-peek-failed', error: caught as OpenError });
    });
    return () => { current = false; };
  }, [opened?.chapter.url, opened?.chapter.nextUrl, peekChapter, skipLetteredChapters]);

  useEffect(() => {
    if (!opened || spreads.length === 0 || activeSpreadIndex !== spreads.length - 1) return;
    if (completedChapters.current.has(opened.chapter.url)) return;
    completedChapters.current.add(opened.chapter.url);
    void completeChapter(opened.chapter.url).catch(() => completedChapters.current.delete(opened.chapter.url));
  }, [opened, spreads.length, activeSpreadIndex, completeChapter]);

  const onReaderKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.target instanceof HTMLElement && event.target.matches('input, textarea, [contenteditable="true"]')) return;
    if (event.key === 'ArrowLeft' || event.key === ' ') {
      event.preventDefault();
      advance();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      back();
    } else if (event.key.toLowerCase() === 'f') {
      dispatch({ type: 'fit-cycled' });
    } else if (event.key.toLowerCase() === 'p') {
      dispatch({ type: 'pairing-toggled' });
    }
  });

  useEffect(() => {
    if (!opened) return;
    const onKeyDown = (event: KeyboardEvent) => onReaderKey(event);
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [opened]);

  const spreadsRef = useRef<ReaderPage[][]>([]);
  const coverSoloRef = useRef(coverSolo);
  useEffect(() => {
    const previous = spreadsRef.current;
    const pairingShifted = coverSoloRef.current !== coverSolo;
    spreadsRef.current = spreads;
    coverSoloRef.current = coverSolo;
    if (previous === spreads || pairingShifted || previous.length === 0 || spreads.length === 0) return;
    dispatch({ type: 'spread-anchor-realigned', previousSpreads: previous, spreads });
  }, [spreads, coverSolo]);

  useEffect(() => {
    dispatch({ type: 'spread-count-changed', count: spreads.length });
  }, [spreads.length]);

  useEffect(() => {
    currentThumbnail.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [activeSpreadIndex, spreads.length]);

  if (opened) {
    const spread = spreads[activeSpreadIndex];
    const progress = atEnd ? 100 : Math.round(((activeSpreadIndex + 1) / spreads.length) * 100);
    const doubledWidth = spread.length === 1 && widePages.has(spread[0]);
    return <main className={`reader-shell ${chromeVisible ? '' : 'immersive'}`}>
      {announceChapterChange && <div className="chapter-toast" role="status">Now reading {opened.chapter.title}</div>}
      {chromeVisible && <ReaderHeader
        seriesTitle={opened.series.title}
        chapterTitle={opened.chapter.title}
        spreadLabel={atEnd ? 'End of Chapter' : `Spread ${activeSpreadIndex + 1} / ${spreads.length}`}
        upscalerBroken={upscalerBroken}
        fit={fit}
        coverSolo={coverSolo}
        skipLetteredChapters={skipLetteredChapters}
        toggleDisabled={navigationRefreshPending || transitionPending}
        navigationRefreshPending={navigationRefreshPending}
        navigationRefreshError={navigationRefreshError}
        onLeave={leaveReader}
        onCycleFit={() => dispatch({ type: 'fit-cycled' })}
        onTogglePairing={() => dispatch({ type: 'pairing-toggled' })}
        onSkipChange={(requestedValue) => { void refreshNavigation(requestedValue); }}
        onRetryRefresh={(requestedValue) => { void refreshNavigation(requestedValue); }}
      />}

      <section className={`reader-stage fit-${fit}`} data-testid="reader-stage">
        <div className="spread-scroller">
          {atEnd ? <EndCard
            chapterTitle={opened.chapter.title}
            chapterUrl={opened.chapter.url}
            continuationUrl={continuationUrl}
            continuationPending={continuationPending}
            continuationError={continuationError}
            nextError={nextError}
            onUrlChange={(value) => dispatch({ type: 'continuation-url-changed', value })}
            onContinue={(event) => { void continueManually(event); }}
            onRetryContinue={() => { void continueManually(); }}
            onRetryNext={() => { if (opened.chapter.nextUrl) void replaceChapter(opened.chapter.nextUrl, 0, true, true); }}
            onLeave={leaveReader}
          /> : <section className={`spread ${spread.length === 1 ? 'solo' : ''} ${doubledWidth ? 'doubled-width' : ''}`} data-testid="spread" aria-label={`Spread ${activeSpreadIndex + 1}`}>
            {pagesInReadingOrder(spread).map((page) => {
              const pageNumber = pageNumbers.get(page.url) ?? 0;
              return <PageMedia key={page.url} page={page} pageNumber={pageNumber} state={pageLoads[page.url]}
                upscaledSrc={upscales[page.url] === 'ready' ? upscaleUrl(page.url) : undefined}
                onError={pageError} onLoad={pageLoaded} onRetry={retryPage} onUpscaledError={upscaleFailed} />;
            })}
          </section>}
        </div>
        {pendingUpscales.map((page) => <img key={page.url} className="upscale-loader" hidden alt="" src={upscaleUrl(page.url)}
          onLoad={() => upscaleLoaded(page.url)} onError={() => upscaleFailed(page.url)} />)}
        <button type="button" className="click-zone next-zone" disabled={transitionPending || navigationRefreshPending || atEnd} onClick={advance} onPointerUp={releasePointerFocus} aria-label="Next spread" />
        <button type="button" className="click-zone center-zone" onClick={() => dispatch({ type: 'chrome-toggled' })} onPointerUp={releasePointerFocus} aria-label="Toggle controls" />
        <button type="button" className="click-zone previous-zone" disabled={transitionPending || navigationRefreshPending || (!atEnd && activeSpreadIndex === 0 && !opened.chapter.prevUrl)} onClick={back} onPointerUp={releasePointerFocus} aria-label="Previous spread" />
      </section>

      {chromeVisible && <Filmstrip
        spreads={spreads}
        nextChapter={nextChapter}
        nextSpreads={nextSpreads}
        activeSpreadIndex={activeSpreadIndex}
        atEnd={atEnd}
        progress={progress}
        pageNumbers={pageNumbers}
        nextPageNumbers={nextPageNumbers}
        pageLoads={pageLoads}
        navigationLocked={transitionPending || navigationRefreshPending}
        currentThumbnail={currentThumbnail}
        onSelect={(index) => dispatch({ type: 'spread-selected', index })}
        onOpenNext={(chapterUrl, index) => { void replaceChapter(chapterUrl, index, true, true); }}
        onPageError={pageError}
        onPageLoaded={pageLoaded}
        onPageRetry={retryPage}
      />}
    </main>;
  }

  return <main className="library-shell"><div className="library-content">
    <PasteCard openChapter={openChapter} onOpened={startSession} />
    <LibrarySection getLibrary={getLibrary} openChapter={openChapter} renameSeries={renameSeries} removeSeries={removeSeries} onOpened={startSession} />
  </div></main>;
}
