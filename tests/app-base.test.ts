import { describe, expect, it } from 'vitest';
import { appUrl } from '../client/src/app-url.js';
import { appBaseUrl, normalizeAppBasePath } from '../shared/app-base.js';

describe('application base path', () => {
  it('defaults to the reverse-proxy mount and normalizes slashes', () => {
    expect(normalizeAppBasePath(undefined)).toBe('/mangakkissa');
    expect(normalizeAppBasePath('manga-reader/')).toBe('/manga-reader');
    expect(appBaseUrl('/manga-reader')).toBe('/manga-reader/');
    expect(appBaseUrl('/', '/')).toBe('/');
    expect(appUrl('/api/library', '/manga-reader/')).toBe('/manga-reader/api/library');
  });

  it.each(['/manga-reader?debug=1', '/manga-reader#reader', '/../reader', '/manga-reader\\reader'])(
    'rejects invalid base path %s',
    (basePath) => expect(() => normalizeAppBasePath(basePath)).toThrow('Invalid application base path')
  );
});
