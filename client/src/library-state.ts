import type { Library, LibrarySeries, OpenError } from './api.js';

export interface SeriesOpenFailure { error: OpenError; url: string }

export interface LibraryState {
  library: Library;
  loading: boolean;
  error?: OpenError;
  seriesPending?: string;
  seriesErrors: Record<string, SeriesOpenFailure>;
  editing?: { key: string; title: string };
  managementErrors: Record<string, string>;
}

export const initialLibraryState: LibraryState = {
  library: { series: [] },
  loading: true,
  seriesErrors: {},
  managementErrors: {}
};

export type LibraryAction =
  | { type: 'library-loaded'; library: Library }
  | { type: 'library-failed'; error: OpenError }
  | { type: 'library-refresh-started' }
  | { type: 'series-open-started'; key: string }
  | { type: 'series-open-failed'; key: string; failure: SeriesOpenFailure }
  | { type: 'series-open-finished' }
  | { type: 'edit-started'; series: LibrarySeries }
  | { type: 'edit-changed'; title: string }
  | { type: 'edit-cancelled' }
  | { type: 'series-updated'; series: LibrarySeries }
  | { type: 'series-removed'; key: string }
  | { type: 'management-failed'; key: string; message: string };

const without = <Value,>(entries: Record<string, Value>, key: string): Record<string, Value> => {
  const next = { ...entries };
  delete next[key];
  return next;
};

export function libraryReducer(state: LibraryState, action: LibraryAction): LibraryState {
  switch (action.type) {
    case 'library-loaded':
      return { ...state, library: action.library, loading: false, error: undefined };
    case 'library-failed':
      return { ...state, loading: false, error: action.error };
    case 'library-refresh-started':
      return { ...state, loading: true };
    case 'series-open-started':
      return { ...state, seriesPending: action.key, seriesErrors: without(state.seriesErrors, action.key) };
    case 'series-open-failed':
      return { ...state, seriesErrors: { ...state.seriesErrors, [action.key]: action.failure } };
    case 'series-open-finished':
      return { ...state, seriesPending: undefined };
    case 'edit-started':
      return { ...state, editing: { key: action.series.key, title: action.series.title } };
    case 'edit-changed':
      return state.editing ? { ...state, editing: { ...state.editing, title: action.title } } : state;
    case 'edit-cancelled':
      return { ...state, editing: undefined };
    case 'series-updated':
      return {
        ...state,
        library: { series: state.library.series.map((entry) => entry.key === action.series.key ? action.series : entry) },
        editing: undefined,
        managementErrors: without(state.managementErrors, action.series.key)
      };
    case 'series-removed':
      return { ...state, library: { series: state.library.series.filter((entry) => entry.key !== action.key) } };
    case 'management-failed':
      return { ...state, managementErrors: { ...state.managementErrors, [action.key]: action.message } };
  }
}
