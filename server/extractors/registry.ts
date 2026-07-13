import type { ExtractError, Extractor, ExtractResult } from '../types.js';

export class ExtractorRegistry {
  constructor(private readonly extractors: Extractor[]) {
    if (extractors.length === 0) throw new Error('Extractor registry cannot be empty');
  }

  extract(html: string, url: string): ExtractResult | ExtractError {
    const extractor = this.extractors.find((candidate) => candidate.matches(url));
    if (!extractor) return { error: 'NO_PAGE_RUN', detail: 'No Extractor matched this URL.' };
    return extractor.extract(html, url);
  }
}
