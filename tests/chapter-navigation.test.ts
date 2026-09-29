import { describe, expect, it } from 'vitest';
import { adjacentChapterUrls } from '../server/chapter-navigation.js';

describe('Chapter navigation', () => {
  it('normalizes immediate links against the Chapter URL', () => {
    expect(adjacentChapterUrls({
      url: 'https://reader.test/series/chapter-42#page',
      nextUrl: '../chapter-42e#top',
      prevUrl: '/chapter-41'
    })).toEqual({
      nextUrl: 'https://reader.test/chapter-42e',
      prevUrl: 'https://reader.test/chapter-41'
    });
  });

  it('drops missing and non-HTTP links', () => {
    expect(adjacentChapterUrls({ url: 'https://reader.test/chapter-1', nextUrl: 'javascript:alert(1)' })).toEqual({});
  });
});
