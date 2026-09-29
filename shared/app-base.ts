export const DEFAULT_APP_BASE_PATH = '/mangakkissa';

export function normalizeAppBasePath(value: string | undefined, fallback = DEFAULT_APP_BASE_PATH): string {
  const candidate = (value ?? fallback).trim();
  if (!candidate || candidate === '/') return '/';
  if (candidate.includes('?') || candidate.includes('#') || candidate.includes('\\')) {
    throw new Error(`Invalid application base path: ${candidate}`);
  }

  const segments = candidate.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`Invalid application base path: ${candidate}`);
  }
  return `/${segments.join('/')}`;
}

export function appBaseUrl(value: string | undefined, fallback = DEFAULT_APP_BASE_PATH): string {
  const path = normalizeAppBasePath(value, fallback);
  return path === '/' ? '/' : `${path}/`;
}
