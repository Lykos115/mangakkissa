import { describe, expect, it, vi } from 'vitest';
import { genericExtractor } from '../server/extractors/generic.js';
import { ExtractorRegistry } from '../server/extractors/registry.js';
import type { Extractor } from '../server/types.js';

const page = (n: number, attrs = '') => `<img ${attrs} data-src="/pages/chapter-1-${String(n).padStart(3, '0')}.jpg" width="800" height="1200">`;

describe('Generic Extractor', () => {
  it('extracts the dominant scoped run in DOM order, lazy URLs, titles, and a doubled-width Page', () => {
    const html = `<!doctype html><head><meta property="og:site_name" content="Ink House"><title>Ignored — Other</title></head><body>
      <img src="/logo.png" width="100"><article><h1 class="entry-title">Chapter 7</h1>
      ${page(1, 'src="data:image/gif;base64,x"')}${page(2)}${page(3, 'width="1600"')}${page(4)}</article>
      ${page(99)}</body>`;
    const result = genericExtractor.extract(html, 'https://reader.test/chapter-7/');
    expect(result).toEqual({
      pages: [
        { url: 'https://reader.test/pages/chapter-1-001.jpg', width: 800, height: 1200 },
        { url: 'https://reader.test/pages/chapter-1-002.jpg', width: 800, height: 1200 },
        { url: 'https://reader.test/pages/chapter-1-003.jpg', width: 1600, height: 1200 },
        { url: 'https://reader.test/pages/chapter-1-004.jpg', width: 800, height: 1200 }
      ],
      chapterTitle: 'Chapter 7', seriesTitle: 'Ink House', imageHeaders: { referer: 'https://reader.test/chapter-7/' }
    });
  });

  it('uses lazy attribute precedence and supports unknown dimensions with matching URL shapes', () => {
    const html = `<main>
      <img data-src="/p/001.jpg" data-lazy-src="/wrong-a.jpg" src="/wrong-b.jpg">
      <img data-lazy-src="/p/002.jpg" data-original="/wrong-c.jpg">
      <img data-original="/p/003.jpg" src="/wrong-d.jpg">
      <img src="/p/004.jpg"></main>`;
    const result = genericExtractor.extract(html, 'https://example.test/c/');
    if ('error' in result) throw new Error(result.error);
    expect(result.pages.map((p) => p.url)).toEqual([
      'https://example.test/p/001.jpg', 'https://example.test/p/002.jpg',
      'https://example.test/p/003.jpg', 'https://example.test/p/004.jpg'
    ]);
  });

  it('assigns adjacent Chapters by designation order without trusting rel direction', () => {
    const html = `<main><h1>Chapter 40</h1>
      ${page(1)}${page(2)}${page(3)}
      <nav class="post-navigation">
        <a rel="next" href="/chapter-39/">Previous Chapter</a>
        <a rel="prev" href="/chapter-40f/">Next Chapter</a>
        <a href="/chapter-41/">Next Chapter</a>
        <a href="/chapter-40f/">duplicate candidate</a>
      </nav>
    </main>`;
    expect(genericExtractor.extract(html, 'https://reader.test/chapter-40/')).toMatchObject({
      prevUrl: 'https://reader.test/chapter-39/',
      nextUrl: 'https://reader.test/chapter-40f/'
    });
  });

  it.each([
    ['NO_IMAGES', '<body><p>empty</p></body>'],
    ['NO_PAGE_RUN', `<body>${page(1)}${page(2)}</body>`],
    ['LONG_STRIP_UNSUPPORTED', `<body>${page(1, 'height="2000"')}${page(2, 'height="2000"')}${page(3, 'height="2000"')}</body>`]
  ])('returns %s instead of partial content', (code, html) => {
    expect(genericExtractor.extract(html, 'https://example.test/c/')).toMatchObject({ error: code });
  });
});

describe('Extractor registry', () => {
  it('uses the first matching Extractor only', () => {
    const first = { id: 'first', matches: () => true, extract: vi.fn(() => ({ pages: [] })) } satisfies Extractor;
    const second = { id: 'second', matches: () => true, extract: vi.fn(() => ({ pages: [] })) } satisfies Extractor;
    const registry = new ExtractorRegistry([first, second]);
    registry.extract('<body/>', 'https://example.test');
    expect(first.extract).toHaveBeenCalledOnce();
    expect(second.extract).not.toHaveBeenCalled();
  });
});
