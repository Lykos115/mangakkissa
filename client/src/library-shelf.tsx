// The landing page: a shelf of Series covers. Clicking a cover opens that
// Series' own screen (resume, chapter list, rename/remove, cover picker).
// Covers come from series.coverPageUrl (auto-set by the server from the first
// opened Chapter); Series without one fall back to peeking their first visited
// Chapter, then to a generated gradient cover.
import { FormEvent, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  getLibrary as defaultGetLibrary,
  openChapter as defaultOpenChapter,
  peekChapter as defaultPeekChapter,
  removeSeries as defaultRemoveSeries,
  renameSeries as defaultRenameSeries,
  setSeriesCover as defaultSetSeriesCover,
  type LibrarySeries,
  type OpenError,
  type OpenPayload
} from './api.js';
import { appUrl } from './app-url.js';
import { ErrorMessage } from './error-message.js';
import { initialLibraryState, libraryReducer } from './library-state.js';

const proxyUrl = (url: string) => `${appUrl('api/image')}?url=${encodeURIComponent(url)}`;

const hashHue = (text: string) => {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
};

function Cover({ title, pageUrl }: { title: string; pageUrl?: string }) {
  return <CoverImage key={pageUrl} title={title} pageUrl={pageUrl} />;
}

function CoverImage({ title, pageUrl }: { title: string; pageUrl?: string }) {
  const [broken, setBroken] = useState(false);
  if (!pageUrl || broken) {
    const hue = hashHue(title);
    return <div className="shelf-cover shelf-cover-fallback" role="img" aria-label={`No cover for ${title}`}
      style={{ background: `linear-gradient(155deg, hsl(${hue} 38% 26%), hsl(${(hue + 45) % 360} 32% 12%))` }}>
      <span>{title}</span>
    </div>;
  }
  return <img className="shelf-cover" src={proxyUrl(pageUrl)} alt={`Cover of ${title}`} loading="lazy" onError={() => setBroken(true)} />;
}

const progressOf = (series: LibrarySeries) => {
  const done = series.chapters.filter((chapter) => chapter.completed).length;
  return { done, total: series.chapters.length, ratio: series.chapters.length ? done / series.chapters.length : 0 };
};

const resumeTitle = (series: LibrarySeries) =>
  series.chapters.find((chapter) => chapter.url === series.resumeChapterUrl)?.title ?? series.resumeChapterUrl;

const lastRead = (series: LibrarySeries) => new Date(series.lastReadAt).toLocaleDateString();

const boothNumber = (index: number) => String(index + 1).padStart(2, '0');

const caughtUp = (series: LibrarySeries) => {
  const { done, total } = progressOf(series);
  return total > 0 && done === total;
};

// The member's card: quiet Library stats in place of a dashboard.
function MemberCard({ series }: { series: LibrarySeries[] }) {
  const chaptersRead = series.reduce((sum, entry) => sum + progressOf(entry).done, 0);
  const since = series.reduce((earliest, entry) => entry.addedAt < earliest ? entry.addedAt : earliest, series[0].addedAt);
  return <div className="member-card">
    <p className="member-brand">Member's card <span lang="ja">会員証</span></p>
    <p className="member-number">No. 0001</p>
    <dl>
      <div><dt>Booths</dt><dd>{series.length}</dd></div>
      <div><dt>Chapters read</dt><dd>{chaptersRead}</dd></div>
      <div><dt>Regular since</dt><dd>{new Date(since).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</dd></div>
    </dl>
  </div>;
}

interface ShelfApi {
  getLibrary: typeof defaultGetLibrary;
  openChapter: typeof defaultOpenChapter;
  peekChapter: typeof defaultPeekChapter;
  renameSeries: typeof defaultRenameSeries;
  removeSeries: typeof defaultRemoveSeries;
  setSeriesCover: typeof defaultSetSeriesCover;
}

function useLibrary({ getLibrary, openChapter, renameSeries, removeSeries, setSeriesCover }: ShelfApi, onOpened: (payload: OpenPayload) => void) {
  const [state, dispatch] = useReducer(libraryReducer, initialLibraryState);

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
    if (!state.editing || state.editing.key !== key) return;
    try {
      dispatch({ type: 'series-updated', series: await renameSeries(key, state.editing.title) });
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

  const saveCover = async (key: string, pageUrl: string) => {
    try {
      dispatch({ type: 'series-updated', series: await setSeriesCover(key, pageUrl) });
    } catch (caught) {
      dispatch({ type: 'management-failed', key, message: (caught as Error).message });
    }
  };

  return { state, dispatch, refresh, openFromLibrary, saveTitle, remove, saveCover };
}

type LibraryData = ReturnType<typeof useLibrary>;

// Covers for Series the server hasn't given a coverPageUrl yet (e.g. entries
// from before covers existed): peek the first visited Chapter's first page.
function useDetectedCovers(series: LibrarySeries[], peekChapter: typeof defaultPeekChapter) {
  const [detected, setDetected] = useState<Record<string, string>>({});
  useEffect(() => {
    let current = true;
    for (const entry of series) {
      if (entry.coverPageUrl || detected[entry.key]) continue;
      const firstChapter = entry.chapters[0]?.url ?? entry.resumeChapterUrl;
      void peekChapter(firstChapter).then((payload) => {
        const first = payload.chapter.pages[0];
        if (current && first) setDetected((known) => known[entry.key] ? known : { ...known, [entry.key]: first.url });
      }).catch(() => { /* the generated cover stands in */ });
    }
    return () => { current = false; };
  }, [series, detected, peekChapter]);
  return detected;
}

function PasteBar({ openChapter, onOpened }: { openChapter: typeof defaultOpenChapter; onOpened: (payload: OpenPayload) => void }) {
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
  return <form className="shelf-paste" onSubmit={(event) => { void submit(event); }}>
    <input type="url" required value={url} aria-label="Chapter URL" placeholder="Check in — paste a Chapter URL for a new booth…"
      onChange={(event) => setUrl(event.target.value)} />
    <button type="submit" disabled={pending}>{pending ? 'Opening…' : 'Open'}</button>
    {error && <ErrorMessage error={error} retry={() => { void submit(); }} />}
  </form>;
}

function ChapterList({ series, data }: { series: LibrarySeries; data: LibraryData }) {
  const { state, openFromLibrary } = data;
  return <ol className="chapter-log">
    {series.chapters.map((chapter) => <li key={chapter.url}>
      <button type="button" disabled={state.seriesPending === series.key}
        onClick={() => { void openFromLibrary(series.key, chapter.url); }}
        aria-label={`Read ${chapter.title}`}>
        <strong>{chapter.title}</strong>
        <small>{chapter.pageCount} Pages{chapter.completed ? ' · read' : ''}</small>
      </button>
    </li>)}
  </ol>;
}

function CoverPicker({ series, peekChapter, onPick, onClose }: {
  series: LibrarySeries;
  peekChapter: typeof defaultPeekChapter;
  onPick: (pageUrl: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [candidates, setCandidates] = useState<{ chapter: string; url: string }[]>([]);
  const [pending, setPending] = useState(true);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }, []);
  useEffect(() => {
    let current = true;
    setPending(true);
    // The first page of each visited Chapter holds the likely manga/chapter covers.
    void Promise.all(series.chapters.map(async (chapter) => {
      try {
        const payload = await peekChapter(chapter.url);
        const first = payload.chapter.pages[0];
        return first ? { chapter: chapter.title, url: first.url } : undefined;
      } catch {
        return undefined;
      }
    })).then((results) => {
      if (!current) return;
      setCandidates(results.filter((result): result is { chapter: string; url: string } => result !== undefined));
      setPending(false);
    });
    return () => { current = false; };
  }, [series, peekChapter]);
  return <dialog ref={dialogRef} className="picker-backdrop" aria-label={`Choose a cover for ${series.title}`}
    onClose={onClose}>
    <div className="picker">
      <h3>Choose a cover</h3>
      <p className="picker-hint">First page of each visited Chapter.</p>
      {pending && <p className="library-status">Loading chapter pages…</p>}
      {!pending && candidates.length === 0 && <p className="library-status">No pages found.</p>}
      <div className="picker-grid">
        {candidates.map((candidate) => <button type="button" key={candidate.url}
          onClick={() => { onPick(candidate.url); onClose(); }}>
          <img src={proxyUrl(candidate.url)} alt={candidate.chapter} loading="lazy" />
          <small>{candidate.chapter}</small>
        </button>)}
      </div>
      <button type="button" className="quiet-button" onClick={onClose}>Cancel</button>
    </div>
    <button type="button" className="picker-dismiss" aria-label="Close cover picker" onClick={onClose} />
  </dialog>;
}

function SeriesScreen({ series, booth, data, api, coverPageUrl, onBack }: {
  series: LibrarySeries;
  booth: string;
  data: LibraryData;
  api: ShelfApi;
  coverPageUrl?: string;
  onBack: () => void;
}) {
  const { state, dispatch, openFromLibrary, saveTitle, remove, saveCover } = data;
  const { seriesPending, editing, managementErrors, seriesErrors } = state;
  const [picking, setPicking] = useState(false);
  const progress = progressOf(series);
  const openError = seriesErrors[series.key];
  return <>
    <header className="shelf-topbar">
      <button type="button" className="quiet-button shelf-back" onClick={onBack}>← The Lobby</button>
    </header>
    <section className="shelf-hero">
      <div className="shelf-cover-wrap">
        <Cover title={series.title} pageUrl={coverPageUrl} />
        <button type="button" className="shelf-edit-cover" onClick={() => setPicking(true)}
          aria-label={`Change cover for ${series.title}`}>Change cover</button>
      </div>
      <div className="shelf-hero-copy">
        <p className="eyebrow">Booth {booth} <span lang="ja">個室</span> · {caughtUp(series) ? 'caught up' : 'reading'}</p>
        {editing?.key === series.key
          ? <form className="shelf-rename" onSubmit={(event) => { void saveTitle(event, series.key); }}>
              <input required value={editing.title} aria-label="Series title" autoFocus
                onChange={(event) => dispatch({ type: 'edit-changed', title: event.target.value })} />
              <button type="submit">Save</button>
              <button type="button" className="quiet-button" onClick={() => dispatch({ type: 'edit-cancelled' })}>Cancel</button>
            </form>
          : <h1>{series.title}</h1>}
        <p className="shelf-resume-line">{resumeTitle(series)}</p>
        <div className="shelf-hero-actions">
          <button type="button" disabled={seriesPending === series.key}
            onClick={() => { void openFromLibrary(series.key, series.resumeChapterUrl); }}
            aria-label={`Resume ${series.title}`}>
            {seriesPending === series.key ? 'Opening…' : 'Continue reading'}
          </button>
          <small>{progress.done}/{progress.total} Chapters read · last read {lastRead(series)}</small>
        </div>
        <div className="shelf-manage">
          <button type="button" className="quiet-button" onClick={() => dispatch({ type: 'edit-started', series })}
            aria-label={`Rename ${series.title}`}>Rename</button>
          <button type="button" className="quiet-button danger-button" onClick={() => { void remove(series); }}
            aria-label={`Remove ${series.title}`}>Remove</button>
        </div>
        {managementErrors[series.key] && <p className="shelf-paste-error" role="alert">{managementErrors[series.key]}</p>}
        {openError && <ErrorMessage error={openError.error} retry={() => { void openFromLibrary(series.key, openError.url); }} />}
        <h2 className="shelf-chapters-heading">Chapters</h2>
        <ChapterList series={series} data={data} />
      </div>
    </section>
    {picking && <CoverPicker series={series} peekChapter={api.peekChapter}
      onPick={(pageUrl) => { void saveCover(series.key, pageUrl); }}
      onClose={() => setPicking(false)} />}
  </>;
}

export function LibraryShelf({
  getLibrary = defaultGetLibrary,
  openChapter = defaultOpenChapter,
  peekChapter = defaultPeekChapter,
  renameSeries = defaultRenameSeries,
  removeSeries = defaultRemoveSeries,
  setSeriesCover = defaultSetSeriesCover,
  onOpened
}: Partial<ShelfApi> & { onOpened: (payload: OpenPayload) => void }) {
  const api: ShelfApi = { getLibrary, openChapter, peekChapter, renameSeries, removeSeries, setSeriesCover };
  const data = useLibrary(api, onOpened);
  const { state, refresh, openFromLibrary } = data;
  const { library, loading, error, seriesErrors } = state;
  const detected = useDetectedCovers(library.series, peekChapter);
  const coverOf = (series: LibrarySeries) => series.coverPageUrl ?? detected[series.key];

  const [selectedKey, setSelectedKey] = useState<string | undefined>(
    () => new URLSearchParams(window.location.search).get('series') ?? undefined);
  const select = (key?: string) => {
    setSelectedKey(key);
    const params = new URLSearchParams(window.location.search);
    if (key) params.set('series', key); else params.delete('series');
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
  };
  const selected = library.series.find((series) => series.key === selectedKey);

  if (selected && !loading && !error) {
    return <SeriesScreen series={selected} booth={boothNumber(library.series.indexOf(selected))} data={data} api={api} coverPageUrl={coverOf(selected)} onBack={() => select(undefined)} />;
  }

  return <>
    <div className="noren" aria-hidden="true">{['漫', '画', '喫', '茶'].map((glyph) => <span key={glyph}>{glyph}</span>)}</div>
    <header className="shelf-topbar">
      <h1><span className="eyebrow">Mangakkissa · open 24h · quiet floor</span>The Lobby</h1>
      <PasteBar openChapter={openChapter} onOpened={onOpened} />
    </header>
    {!loading && !error && library.series.length > 0 && <MemberCard series={library.series} />}
    {loading && <p className="library-status">Loading Library…</p>}
    {error && <ErrorMessage error={error} retry={() => { data.dispatch({ type: 'library-refresh-started' }); void refresh(); }} />}
    {!loading && !error && library.series.length === 0 && <p className="library-status">No Series yet. Open a Chapter to begin.</p>}
    {!loading && !error && <div className="shelf-grid">
      {library.series.map((series, index) => {
        const progress = progressOf(series);
        const openError = seriesErrors[series.key];
        return <article className="shelf-card" key={series.key} aria-label={series.title}>
          <span className="booth-plate" aria-hidden="true">{boothNumber(index)}</span>
          <span className={`booth-lamp ${caughtUp(series) ? 'free' : 'busy'}`} aria-hidden="true">{caughtUp(series) ? 'caught up' : 'reading'}</span>
          <button type="button" className="shelf-cover-button"
            onClick={() => select(series.key)}
            aria-label={`Open ${series.title}`}>
            <Cover title={series.title} pageUrl={coverOf(series)} />
            <span className="shelf-overlay" aria-hidden="true">
              <span className="shelf-up-next">Up next<br /><strong>{resumeTitle(series)}</strong></span>
            </span>
            <span className="shelf-progress" style={{ width: `${progress.ratio * 100}%` }} aria-hidden="true" />
          </button>
          <div className="shelf-meta">
            <h2>{series.title}</h2>
            <small>{progress.done}/{progress.total} Chapters read · {lastRead(series)}</small>
            <button type="button" className="shelf-resume-button" disabled={state.seriesPending === series.key}
              onClick={() => { void openFromLibrary(series.key, series.resumeChapterUrl); }}
              aria-label={`Resume ${series.title}`}>
              {state.seriesPending === series.key ? 'Opening…' : 'Resume'}
            </button>
            {openError && <ErrorMessage error={openError.error} retry={() => { void openFromLibrary(series.key, openError.url); }} />}
          </div>
        </article>;
      })}
    </div>}
  </>;
}
