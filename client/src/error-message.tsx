import type { OpenError } from './api.js';

export const friendlyError = (code?: string, status?: number) => {
  if (code === 'FETCH_FAILED') return `Couldn't reach the site${status ? ` (HTTP ${status})` : ''}.`;
  if (code === 'LONG_STRIP_UNSUPPORTED') return 'This looks like a vertical-scroll comic — this reader only does page spreads.';
  return "Couldn't find chapter pages on this page — this site may need its own extractor.";
};

export function ErrorMessage({ error, retry }: { error: OpenError; retry?: () => void }) {
  return <div className="error" role="alert">
    <strong>{friendlyError(error.code, error.status)}</strong>
    <p>{error.code ?? 'UNKNOWN'} · HTTP {error.status ?? 'unknown'} · {error.detail ?? error.message}</p>
    {retry && <button type="button" onClick={retry}>Retry</button>}
  </div>;
}
