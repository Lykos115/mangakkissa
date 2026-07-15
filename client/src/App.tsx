import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  completeChapter as defaultCompleteChapter,
  getLibrary as defaultGetLibrary,
  openChapter as defaultOpenChapter,
  peekChapter as defaultPeekChapter,
  removeSeries as defaultRemoveSeries,
  renameSeries as defaultRenameSeries,
  type Library,
  type LibrarySeries,
  type OpenError,
  type OpenPayload
} from './api.js';
import { buildSpreads, deficientSpreadPages, pagesInReadingOrder, spreadPages, type ReaderPage } from './spreads.js';
import './styles.css';

const proxyUrl = (url: string) => `/api/image?url=${encodeURIComponent(url)}`;
const upscaleUrl = (url: string) => `${proxyUrl(url)}&upscale=2`;
const friendlyError = (code?: string, status?: number) => {
  if (code === 'FETCH_FAILED') return `Couldn't reach the site${status ? ` (HTTP ${status})` : ''}.`;
  if (code === 'LONG_STRIP_UNSUPPORTED') return 'This looks like a vertical-scroll comic — this reader only does page spreads.';
  return "Couldn't find chapter pages on this page — this site may need its own extractor.";
};

const fitOptions = [
  { mode: 'height', label: 'Fit height' },
  { mode: 'width', label: 'Fit width' },
  { mode: 'original', label: 'Original size' }
] as const;
type FitMode = typeof fitOptions[number]['mode'];
const defaultFit: FitMode = 'height';
const CHAPTER_TOAST_DURATION_MS = 1800;

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
    {retry && <button onClick={retry}>Retry</button>}
  </div>;
}

interface PageLoadState { generation: number; failed: boolean; recovering: boolean }
interface PageSize { width: number; height: number }

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
    return <button className="page-failure" onClick={() => onRetry(page.url)} aria-label={`Page ${pageNumber} didn't load — tap to retry`}>
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

export function App({
  openChapter = defaultOpenChapter,
  peekChapter = defaultPeekChapter,
  completeChapter = defaultCompleteChapter,
  getLibrary = defaultGetLibrary,
  renameSeries = defaultRenameSeries,
  removeSeries = defaultRemoveSeries
}: AppProps) {
  const [url, setUrl] = useState('');
  const [pastePending, setPastePending] = useState(false);
  const [pasteError, setPasteError] = useState<OpenError>();
  const [library, setLibrary] = useState<Library>({ series: [] });
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState<OpenError>();
  const [seriesPending, setSeriesPending] = useState<string>();
  const [seriesErrors, setSeriesErrors] = useState<Record<string, { error: OpenError; url: string }>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<{ key: string; title: string }>();
  const [managementError, setManagementError] = useState<Record<string, string>>({});
  const [opened, setOpened] = useState<OpenPayload>();
  const [nextChapter, setNextChapter] = useState<OpenPayload['chapter']>();
  const [nextError, setNextError] = useState<OpenError>();
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  const [continuationUrl, setContinuationUrl] = useState('');
  const [continuationPending, setContinuationPending] = useState(false);
  const [continuationError, setContinuationError] = useState<OpenError>();
  const [pageLoads, setPageLoads] = useState<Record<string, PageLoadState>>({});
  const [measuredSizes, setMeasuredSizes] = useState<Record<string, PageSize>>({});
  const [upscales, setUpscales] = useState<Record<string, 'ready' | 'failed'>>({});
  const [upscalerBroken, setUpscalerBroken] = useState(false);
  const [transitionPending, setTransitionPending] = useState(false);
  const [skipLetteredChapters, setSkipLetteredChapters] = useState(false);
  const [navigationRefreshPending, setNavigationRefreshPending] = useState(false);
  const [navigationRefreshError, setNavigationRefreshError] = useState<{ error: OpenError; requestedValue: boolean }>();
  const navigationRefreshGeneration = useRef(0);
  const openedRef = useRef<OpenPayload>();
  const [announceChapterChange, setAnnounceChapterChange] = useState(false);
  const completedChapters = useRef(new Set<string>());
  const [coverSolo, setCoverSolo] = useState(true);
  const [fit, setFit] = useState<FitMode>(defaultFit);
  const [chromeVisible, setChromeVisible] = useState(true);
  const currentThumbnail = useRef<HTMLButtonElement>(null);
  const withMeasuredSizes = (pages: ReaderPage[]) => pages.map((page) => measuredSizes[page.url] ? { ...page, ...measuredSizes[page.url] } : page);
  const chapterPages = useMemo(() => withMeasuredSizes(opened?.chapter.pages ?? []), [opened, measuredSizes]);
  const spreads = useMemo(() => opened ? buildSpreads(chapterPages, coverSolo) : [], [opened, chapterPages, coverSolo]);
  const nextSpreads = useMemo(() => nextChapter ? buildSpreads(withMeasuredSizes(nextChapter.pages), coverSolo) : [], [nextChapter, measuredSizes, coverSolo]);
  const widePages = useMemo(() => spreadPages(chapterPages), [chapterPages]);
  // Fires on learning deficiency: unconfigured means no upscale request is ever issued.
  const pendingUpscales = useMemo(() => opened?.upscaler !== 'ready' ? [] : [
    ...deficientSpreadPages(chapterPages),
    ...deficientSpreadPages(nextChapter ? withMeasuredSizes(nextChapter.pages) : [])
  ].filter((page) => !upscales[page.url]), [opened?.upscaler, chapterPages, nextChapter, measuredSizes, upscales]);
  const pageNumbers = useMemo(() => new Map(opened?.chapter.pages.map((page, index) => [page.url, index + 1]) ?? []), [opened]);
  const nextPageNumbers = useMemo(() => new Map(nextChapter?.pages.map((page, index) => [page.url, index + 1]) ?? []), [nextChapter]);
  const activeSpreadIndex = Math.min(spreadIndex, Math.max(spreads.length - 1, 0));
  openedRef.current = opened;

  const refreshLibrary = async () => {
    try {
      const next = await getLibrary();
      setLibrary(next);
      setLibraryError(undefined);
    } catch (caught) {
      setLibraryError(caught as OpenError);
    } finally {
      setLibraryLoading(false);
    }
  };

  useEffect(() => { void refreshLibrary(); }, [getLibrary]);

  useEffect(() => {
    if (!announceChapterChange) return;
    const timeout = window.setTimeout(() => setAnnounceChapterChange(false), CHAPTER_TOAST_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [announceChapterChange, opened?.chapter.url]);

  const openWithReaderOptions = (chapterUrl: string) => skipLetteredChapters
    ? openChapter(chapterUrl, { skipLettered: true })
    : openChapter(chapterUrl);

  const replaceChapter = async (chapterUrl: string, target: number | 'last', announce: boolean, presentFailure = false) => {
    if (transitionPending || navigationRefreshPending) return;
    setTransitionPending(true);
    try {
      const payload = await openWithReaderOptions(chapterUrl);
      setOpened(payload);
      setNextChapter(undefined);
      setNextError(undefined);
      setNavigationRefreshError(undefined);
      setAtEnd(false);
      setContinuationUrl('');
      setContinuationError(undefined);
      setPageLoads({});
      setSpreadIndex(target === 'last' ? Math.max(buildSpreads(withMeasuredSizes(payload.chapter.pages), coverSolo).length - 1, 0) : target);
      setAnnounceChapterChange(announce);
    } catch (caught) {
      if (presentFailure) {
        setNextError(caught as OpenError);
        setAtEnd(true);
      }
    } finally { setTransitionPending(false); }
  };
  const advance = () => {
    if (atEnd || navigationRefreshPending) return;
    if (activeSpreadIndex < spreads.length - 1) setSpreadIndex(activeSpreadIndex + 1);
    else if (!opened?.chapter.nextUrl || nextError) setAtEnd(true);
    else void replaceChapter(opened.chapter.nextUrl, 0, true, true);
  };
  const back = () => {
    if (navigationRefreshPending) return;
    if (atEnd) {
      setAtEnd(false);
      return;
    }
    if (activeSpreadIndex > 0) setSpreadIndex(activeSpreadIndex - 1);
    else if (opened?.chapter.prevUrl) void replaceChapter(opened.chapter.prevUrl, 'last', false);
  };
  const cycleFit = () => setFit((value) => {
    const index = fitOptions.findIndex((option) => option.mode === value);
    return fitOptions[(index + 1) % fitOptions.length].mode;
  });
  const togglePairing = () => setCoverSolo((value) => !value);
  const releasePointerFocus = (event: React.PointerEvent<HTMLButtonElement>) => event.currentTarget.blur();
  const showReader = (payload: OpenPayload) => {
    completedChapters.current.clear();
    navigationRefreshGeneration.current += 1;
    setOpened(payload);
    setNextChapter(undefined);
    setNextError(undefined);
    setSpreadIndex(0);
    setAtEnd(false);
    setContinuationUrl('');
    setContinuationError(undefined);
    setPageLoads({});
    setSkipLetteredChapters(false);
    setNavigationRefreshPending(false);
    setNavigationRefreshError(undefined);
    setCoverSolo(true);
    setFit(defaultFit);
    setChromeVisible(true);
    setAnnounceChapterChange(false);
  };
  const refreshNavigation = async (requestedValue: boolean) => {
    const current = openedRef.current;
    if (!current || navigationRefreshPending) return;
    const chapterUrl = current.chapter.url;
    const generation = navigationRefreshGeneration.current + 1;
    navigationRefreshGeneration.current = generation;
    setNavigationRefreshPending(true);
    setNavigationRefreshError(undefined);
    try {
      const payload = await peekChapter(chapterUrl, {
        ...(requestedValue ? { skipLettered: true } : {}),
        retainAsCurrent: true
      });
      if (navigationRefreshGeneration.current !== generation || openedRef.current?.chapter.url !== chapterUrl || payload.chapter.url !== chapterUrl) return;
      setOpened((value) => value?.chapter.url === chapterUrl ? { ...value, chapter: payload.chapter } : value);
      setSkipLetteredChapters(requestedValue);
      setNextChapter(undefined);
      setNextError(undefined);
    } catch (caught) {
      if (navigationRefreshGeneration.current === generation && openedRef.current?.chapter.url === chapterUrl) {
        setNavigationRefreshError({ error: caught as OpenError, requestedValue });
      }
    } finally {
      if (navigationRefreshGeneration.current === generation) setNavigationRefreshPending(false);
    }
  };
  const pageError = (pageUrl: string, generation: number) => setPageLoads((loads) => {
    const current = loads[pageUrl] ?? { generation: 0, failed: false, recovering: false };
    if (current.generation !== generation || (current.failed && !current.recovering)) return loads;
    return { ...loads, [pageUrl]: { ...current, failed: true, recovering: false } };
  });
  const pageLoaded = (pageUrl: string, generation: number, size: PageSize) => {
    if (size.width > 0 && size.height > 0) setMeasuredSizes((sizes) => {
      const current = sizes[pageUrl];
      if (current && current.width === size.width && current.height === size.height) return sizes;
      return { ...sizes, [pageUrl]: size };
    });
    setPageLoads((loads) => {
      const current = loads[pageUrl];
      if (!current || current.generation !== generation || (!current.failed && !current.recovering)) return loads;
      return { ...loads, [pageUrl]: { ...current, failed: false, recovering: false } };
    });
  };
  const retryPage = (pageUrl: string) => setPageLoads((loads) => {
    const current = loads[pageUrl] ?? { generation: 1, failed: true, recovering: false };
    return { ...loads, [pageUrl]: { generation: current.generation + 1, failed: false, recovering: true } };
  });
  const upscaleLoaded = (pageUrl: string) => setUpscales((entries) => ({ ...entries, [pageUrl]: 'ready' }));
  const upscaleFailed = (pageUrl: string) => {
    setUpscales((entries) => ({ ...entries, [pageUrl]: 'failed' }));
    setUpscalerBroken(true);
  };

  useEffect(() => {
    const nextUrl = opened?.chapter.nextUrl;
    if (!nextUrl) {
      setNextChapter(undefined);
      setNextError(undefined);
      return;
    }
    let current = true;
    setNextChapter(undefined);
    setNextError(undefined);
    void (skipLetteredChapters ? peekChapter(nextUrl, { skipLettered: true }) : peekChapter(nextUrl)).then((payload) => {
      if (current && payload.chapter.url === nextUrl) setNextChapter(payload.chapter);
    }).catch((caught) => {
      if (current) setNextError(caught as OpenError);
    });
    return () => { current = false; };
  }, [opened?.chapter.url, opened?.chapter.nextUrl, peekChapter, skipLetteredChapters]);

  useEffect(() => {
    if (!opened || spreads.length === 0 || activeSpreadIndex !== spreads.length - 1) return;
    if (completedChapters.current.has(opened.chapter.url)) return;
    completedChapters.current.add(opened.chapter.url);
    void completeChapter(opened.chapter.url).catch(() => completedChapters.current.delete(opened.chapter.url));
  }, [opened, spreads.length, activeSpreadIndex, completeChapter]);

  useEffect(() => {
    if (!opened) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.matches('input, textarea, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft' || event.key === ' ') {
        event.preventDefault();
        advance();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        back();
      } else if (event.key.toLowerCase() === 'f') {
        cycleFit();
      } else if (event.key.toLowerCase() === 'p') {
        togglePairing();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [opened, spreads.length, activeSpreadIndex, transitionPending, navigationRefreshPending, atEnd, nextError, skipLetteredChapters]);

  const spreadsRef = useRef<ReaderPage[][]>([]);
  const coverSoloRef = useRef(coverSolo);
  useEffect(() => {
    const previous = spreadsRef.current;
    const pairingShifted = coverSoloRef.current !== coverSolo;
    spreadsRef.current = spreads;
    coverSoloRef.current = coverSolo;
    if (previous === spreads || pairingShifted || previous.length === 0 || spreads.length === 0) return;
    setSpreadIndex((index) => {
      const anchor = previous[Math.min(index, previous.length - 1)]?.[0]?.url;
      const found = anchor === undefined ? -1 : spreads.findIndex((spread) => spread.some((page) => page.url === anchor));
      return found === -1 ? Math.min(index, spreads.length - 1) : found;
    });
  }, [spreads, coverSolo]);

  useEffect(() => {
    setSpreadIndex((value) => Math.min(value, Math.max(spreads.length - 1, 0)));
  }, [spreads.length]);

  useEffect(() => {
    currentThumbnail.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [activeSpreadIndex, spreads.length]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    setPastePending(true);
    setPasteError(undefined);
    try {
      showReader(await openChapter(url));
    } catch (caught) {
      setOpened(undefined);
      setPasteError(caught as OpenError);
    } finally {
      setPastePending(false);
    }
  };

  const openFromLibrary = async (key: string, chapterUrl: string) => {
    setSeriesPending(key);
    setSeriesErrors((errors) => {
      const next = { ...errors };
      delete next[key];
      return next;
    });
    try {
      showReader(await openChapter(chapterUrl));
    } catch (caught) {
      setSeriesErrors((errors) => ({ ...errors, [key]: { error: caught as OpenError, url: chapterUrl } }));
    } finally {
      setSeriesPending(undefined);
    }
  };

  const continueManually = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!continuationUrl || continuationPending) return;
    setContinuationPending(true);
    setContinuationError(undefined);
    try {
      const payload = await openWithReaderOptions(continuationUrl);
      setOpened(payload);
      setNextChapter(undefined);
      setNextError(undefined);
      setNavigationRefreshError(undefined);
      setSpreadIndex(0);
      setAtEnd(false);
      setContinuationUrl('');
      setPageLoads({});
      setAnnounceChapterChange(true);
    } catch (caught) {
      setContinuationError(caught as OpenError);
    } finally {
      setContinuationPending(false);
    }
  };

  const saveTitle = async (event: FormEvent, key: string) => {
    event.preventDefault();
    if (!editing || editing.key !== key) return;
    try {
      const renamed = await renameSeries(key, editing.title);
      setLibrary((value) => ({ series: value.series.map((entry) => entry.key === key ? renamed : entry) }));
      setEditing(undefined);
      setManagementError((errors) => {
        const next = { ...errors };
        delete next[key];
        return next;
      });
    } catch (caught) {
      setManagementError((errors) => ({ ...errors, [key]: (caught as Error).message }));
    }
  };

  const remove = async (series: LibrarySeries) => {
    if (!window.confirm(`Remove ${series.title} and its Visited Log?`)) return;
    try {
      await removeSeries(series.key);
      setLibrary((value) => ({ series: value.series.filter((entry) => entry.key !== series.key) }));
    } catch (caught) {
      setManagementError((errors) => ({ ...errors, [series.key]: (caught as Error).message }));
    }
  };

  if (opened) {
    const spread = spreads[activeSpreadIndex];
    const progress = atEnd ? 100 : Math.round(((activeSpreadIndex + 1) / spreads.length) * 100);
    const doubledWidth = spread.length === 1 && widePages.has(spread[0]);
    const leaveReader = () => {
      navigationRefreshGeneration.current += 1;
      setNavigationRefreshPending(false);
      setNavigationRefreshError(undefined);
      setOpened(undefined);
      void refreshLibrary();
    };
    return <main className={`reader-shell ${chromeVisible ? '' : 'immersive'}`}>
      {announceChapterChange && <div className="chapter-toast" role="status">Now reading {opened.chapter.title}</div>}
      {chromeVisible && <header className="reader-header">
        <button className="quiet-button" onClick={leaveReader}>Library</button>
        <div className="reader-title"><strong>{opened.series.title}</strong><span aria-hidden="true"> — </span><h1>{opened.chapter.title}</h1></div>
        <span className="spread-count">{atEnd ? 'End of Chapter' : `Spread ${activeSpreadIndex + 1} / ${spreads.length}`}</span>
        <div className="reader-controls">
          {upscalerBroken && <span className="upscale-error" role="alert">Spread upscaling isn’t working — originals are shown.</span>}
          <button className="quiet-button" onClick={cycleFit}>{fitOptions.find((option) => option.mode === fit)?.label} <kbd>f</kbd></button>
          <button className="quiet-button" aria-pressed={!coverSolo} onClick={togglePairing}>Shift pairing <kbd>p</kbd></button>
          <div className="navigation-option">
            <label className="navigation-option-toggle">
              <input
                type="checkbox"
                checked={skipLetteredChapters}
                disabled={navigationRefreshPending || transitionPending}
                onChange={(event) => { void refreshNavigation(event.target.checked); }}
              />
              <span>Skip lettered Chapters</span>
            </label>
            {navigationRefreshPending && <span className="navigation-refresh-status" role="status">Refreshing navigation…</span>}
            {navigationRefreshError && <span className="navigation-refresh-error" role="alert">
              <span>Couldn’t refresh Chapter navigation.</span>
              <button className="quiet-button" onClick={() => { void refreshNavigation(navigationRefreshError.requestedValue); }}>Retry</button>
            </span>}
          </div>
        </div>
      </header>}

      <section className={`reader-stage fit-${fit}`} data-testid="reader-stage">
        <div className="spread-scroller">
          {atEnd ? <section className="end-card" aria-labelledby="end-card-title">
            <p className="eyebrow">Chapter complete</p>
            <h2 id="end-card-title">End of {opened.chapter.title} — no next chapter found.</h2>
            <p>If there is one, paste its URL:</p>
            <form className="continuation-form" onSubmit={(event) => { void continueManually(event); }}>
              <label htmlFor="continuation-url">Next Chapter URL</label>
              <div className="paste-row"><input id="continuation-url" type="url" required value={continuationUrl} onChange={(event) => setContinuationUrl(event.target.value)} placeholder="https://example.test/chapter-2/"/><button disabled={continuationPending}>{continuationPending ? 'Opening…' : 'Continue'}</button></div>
            </form>
            {continuationError && <ErrorMessage error={continuationError} retry={() => { void continueManually(); }} />}
            {nextError && <div className="next-chapter-failure"><p>The detected next Chapter could not be opened.</p><ErrorMessage error={nextError} retry={() => { if (opened.chapter.nextUrl) void replaceChapter(opened.chapter.nextUrl, 0, true, true); }} /></div>}
            <div className="end-actions"><a href={opened.chapter.url} target="_blank" rel="noreferrer">Open Chapter on source site</a><button className="quiet-button" onClick={leaveReader}>Back to Library</button></div>
          </section> : <section className={`spread ${spread.length === 1 ? 'solo' : ''} ${doubledWidth ? 'doubled-width' : ''}`} data-testid="spread" aria-label={`Spread ${activeSpreadIndex + 1}`}>
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
        <button className="click-zone next-zone" disabled={transitionPending || navigationRefreshPending || atEnd} onClick={advance} onPointerUp={releasePointerFocus} aria-label="Next spread" />
        <button className="click-zone center-zone" onClick={() => setChromeVisible((value) => !value)} onPointerUp={releasePointerFocus} aria-label="Toggle controls" />
        <button className="click-zone previous-zone" disabled={transitionPending || navigationRefreshPending || (!atEnd && activeSpreadIndex === 0 && !opened.chapter.prevUrl)} onClick={back} onPointerUp={releasePointerFocus} aria-label="Previous spread" />
      </section>

      {chromeVisible && <footer className="filmstrip-shell">
        <div className="progress-track" role="progressbar" aria-label="Chapter progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div className="progress-value" style={{ width: `${progress}%` }} />
        </div>
        <nav className="filmstrip" aria-label="Chapter Spreads">
          {spreads.map((thumbnailSpread, index) => <button
            className={`thumbnail ${!atEnd && index === activeSpreadIndex ? 'current' : ''}`}
            aria-label={`Spread ${index + 1}`}
            aria-current={!atEnd && index === activeSpreadIndex ? 'true' : undefined}
            key={thumbnailSpread.map((page) => page.url).join('|')}
            onClick={() => { setAtEnd(false); setSpreadIndex(index); }}
            ref={!atEnd && index === activeSpreadIndex ? currentThumbnail : undefined}
          >
            {pagesInReadingOrder(thumbnailSpread).map((page) => <PageMedia
              key={page.url}
              page={page}
              pageNumber={pageNumbers.get(page.url) ?? 0}
              state={pageLoads[page.url]}
              thumbnail
              loading={index >= activeSpreadIndex && index <= activeSpreadIndex + 2 ? 'eager' : 'lazy'}
              onError={pageError}
              onLoad={pageLoaded}
              onRetry={retryPage}
            />)}
          </button>)}
          {nextChapter && <>
            <div className="chapter-divider" aria-label={`Next Chapter — ${nextChapter.title}`}><span>Next Chapter</span><strong>{nextChapter.title}</strong></div>
            {nextSpreads.map((thumbnailSpread, index) => <button
              className="thumbnail adjacent-thumbnail"
              aria-label={`${nextChapter.title}, Spread ${index + 1}`}
              key={thumbnailSpread.map((page) => page.url).join('|')}
              disabled={transitionPending || navigationRefreshPending}
              onClick={() => { void replaceChapter(nextChapter.url, index, true, true); }}
            >
              {pagesInReadingOrder(thumbnailSpread).map((page) => <PageMedia
                key={page.url}
                page={page}
                pageNumber={nextPageNumbers.get(page.url) ?? 0}
                state={pageLoads[page.url]}
                thumbnail
                loading="lazy"
                onError={pageError}
                onLoad={pageLoaded}
                onRetry={retryPage}
              />)}
            </button>)}
          </>}
        </nav>
      </footer>}
    </main>;
  }

  return <main className="library-shell"><div className="library-content">
    <section className="paste-card">
      <p className="eyebrow">Local manga reader</p><h1>Library</h1><p>Paste a Chapter URL to extract its Pages and read right to left.</p>
      <form onSubmit={submit}><label htmlFor="chapter-url">Chapter URL</label><div className="paste-row"><input id="chapter-url" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.test/chapter-1/"/><button disabled={pastePending}>{pastePending ? 'Opening…' : 'Open chapter'}</button></div></form>
      {pasteError && <ErrorMessage error={pasteError} retry={() => { void submit(); }} />}
    </section>

    <section className="series-library" aria-labelledby="series-library-title">
      <div className="section-heading"><div><p className="eyebrow">Recently read</p><h2 id="series-library-title">Series</h2></div><span>{library.series.length}</span></div>
      {libraryLoading && <p className="library-status">Loading Library…</p>}
      {libraryError && <ErrorMessage error={libraryError} retry={() => { setLibraryLoading(true); void refreshLibrary(); }} />}
      {!libraryLoading && !libraryError && library.series.length === 0 && <p className="library-status">No Series yet. Open a Chapter to begin.</p>}
      <div className="series-list">
        {library.series.map((series) => {
          const headingId = `series-${series.key.replace(/[^a-z0-9_-]/gi, '-')}`;
          const resumeChapter = series.chapters.find((chapter) => chapter.url === series.resumeChapterUrl);
          const isExpanded = expanded.has(series.key);
          const openError = seriesErrors[series.key];
          return <article className="series-card" key={series.key} aria-labelledby={headingId}>
            <div className="series-summary">
              <button className="resume-series" onClick={() => { void openFromLibrary(series.key, series.resumeChapterUrl); }} disabled={seriesPending === series.key} aria-label={`Resume ${series.title}`}>
                <span className="series-copy"><h3 id={headingId}>{series.title}</h3><span className="resume-label">Resume Chapter</span><strong>{resumeChapter?.title ?? series.resumeChapterUrl}</strong></span>
                <time dateTime={series.lastReadAt}>Last read {new Date(series.lastReadAt).toLocaleString()}</time>
              </button>
              <div className="series-actions">
                <button className="quiet-button" onClick={() => setExpanded((keys) => {
                  const next = new Set(keys);
                  if (next.has(series.key)) next.delete(series.key); else next.add(series.key);
                  return next;
                })} aria-expanded={isExpanded} aria-controls={`${headingId}-log`} aria-label={`${isExpanded ? 'Hide' : 'Show'} Visited Log for ${series.title}`}>Visited Log <span aria-hidden="true">{isExpanded ? '−' : '+'}</span></button>
                <button className="quiet-button" onClick={() => setEditing({ key: series.key, title: series.title })} aria-label={`Rename ${series.title}`}>Rename</button>
                <button className="quiet-button danger-button" onClick={() => { void remove(series); }} aria-label={`Remove ${series.title}`}>Remove</button>
              </div>
            </div>

            {editing?.key === series.key && <form className="rename-form" onSubmit={(event) => { void saveTitle(event, series.key); }}>
              <label htmlFor={`${headingId}-title`}>Series title</label><div className="form-row"><input id={`${headingId}-title`} required value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} autoFocus/><button>Save title</button><button type="button" className="quiet-button" onClick={() => setEditing(undefined)}>Cancel</button></div>
            </form>}
            {managementError[series.key] && <p className="management-error" role="alert">{managementError[series.key]}</p>}
            {openError && <ErrorMessage error={openError.error} retry={() => { void openFromLibrary(series.key, openError.url); }} />}

            {isExpanded && <section className="visited-log" id={`${headingId}-log`} aria-label={`Visited Log for ${series.title}`}>
              <ol>{series.chapters.map((chapter) => <li key={chapter.url}>
                <button className="chapter-row" disabled={seriesPending === series.key} onClick={() => { void openFromLibrary(series.key, chapter.url); }} aria-label={`Re-read ${chapter.title}`}>
                  <span><strong>{chapter.title}</strong><small>{chapter.pageCount} Pages</small></span>
                  <time dateTime={chapter.firstOpenedAt}>{new Date(chapter.firstOpenedAt).toLocaleDateString()}</time>
                </button>
              </li>)}</ol>
            </section>}
          </article>;
        })}
      </div>
    </section>
  </div></main>;
}
