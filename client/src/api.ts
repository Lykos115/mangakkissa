import type { Library, LibrarySeries, OpenPayload } from '../../shared/contract.js';
import { appUrl } from './app-url.js';

export type { Library, LibrarySeries, OpenPayload, VisitedChapter } from '../../shared/contract.js';

export interface OpenError extends Error { code?: string; status?: number; detail?: string }

async function responseError(response: Response): Promise<OpenError> {
  const body = await response.json().catch(() => ({}));
  const error = new Error(body.detail ?? 'Request failed') as OpenError;
  error.code = body.error;
  error.status = body.status ?? response.status;
  error.detail = body.detail;
  return error;
}

async function request(input: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (!response.ok) throw await responseError(response);
  return response;
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  return await (await request(input, init)).json() as T;
}

const jsonRequest = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

export async function openChapter(url: string): Promise<OpenPayload> {
  return requestJson(appUrl('api/chapter/open'), jsonRequest('POST', { url }));
}

export async function peekChapter(url: string): Promise<OpenPayload> {
  return requestJson(`${appUrl('api/chapter/peek')}?${new URLSearchParams({ url })}`);
}

export async function completeChapter(url: string): Promise<void> {
  await request(appUrl('api/chapter/complete'), jsonRequest('POST', { url }));
}

export async function getLibrary(): Promise<Library> {
  return requestJson(appUrl('api/library'));
}

export async function renameSeries(key: string, title: string): Promise<LibrarySeries> {
  return requestJson(appUrl(`api/series/${encodeURIComponent(key)}`), jsonRequest('PATCH', { title }));
}

export async function setSeriesCover(key: string, coverUrl: string): Promise<LibrarySeries> {
  return requestJson(appUrl(`api/series/${encodeURIComponent(key)}`), jsonRequest('PATCH', { coverUrl }));
}

export async function removeSeries(key: string): Promise<void> {
  await request(appUrl(`api/series/${encodeURIComponent(key)}`), { method: 'DELETE' });
}
