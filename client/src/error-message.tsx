import type { OpenError } from './api.js';
import { friendlyError } from './friendly-error.js';

export function ErrorMessage({ error, retry }: { error: OpenError; retry?: () => void }) {
  return <div className="error" role="alert">
    <strong>{friendlyError(error.code, error.status)}</strong>
    <p>{error.code ?? 'UNKNOWN'} · HTTP {error.status ?? 'unknown'} · {error.detail ?? error.message}</p>
    {retry && <button type="button" onClick={retry}>Retry</button>}
  </div>;
}
