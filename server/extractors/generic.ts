import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { ExtractError, Extractor, ExtractResult, Page } from '../types.js';

const WIDTH_TOLERANCE = 0.15;
const closeTo = (value: number, target: number) => Math.abs(value - target) / target <= WIDTH_TOLERANCE;
const numberAttr = (value: string | undefined) => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};
const shape = (url: string) => url.replace(/\d+/g, '#').replace(/[?#].*$/, '');

interface Candidate extends Page { index: number; shape: string }

function chooseScope($: cheerio.CheerioAPI) {
  for (const selector of ['article', 'main', '.entry-content']) {
    const found = $(selector).first();
    if (found.length) return found;
  }
  return $('body').first();
}

function longestRun(candidates: Candidate[], base: number | undefined): Candidate[] {
  let winner: Candidate[] = [];
  let current: Candidate[] = [];
  const flush = () => { if (current.length > winner.length) winner = current; current = []; };
  for (const candidate of candidates) {
    const adjacent = !current.length || candidate.index === current[current.length - 1].index + 1;
    const widthFits = !base || !candidate.width || closeTo(candidate.width, base) || closeTo(candidate.width, base * 2);
    const shapeFits = candidate.width !== undefined || !current.length || current[current.length - 1].width !== undefined || candidate.shape === current[current.length - 1].shape;
    if (!adjacent || !widthFits || !shapeFits) flush();
    if (widthFits) current.push(candidate);
  }
  flush();
  return winner;
}

function dominantRun(candidates: Candidate[]): Candidate[] {
  const bases = [...new Set(candidates.flatMap((candidate) => candidate.width ? [candidate.width] : []))];
  if (!bases.length) return longestRun(candidates, undefined);
  return bases.reduce<Candidate[]>((winner, base) => {
    const run = longestRun(candidates, base);
    return run.length > winner.length ? run : winner;
  }, []);
}

function titleSuffix(title: string | undefined) {
  if (!title) return undefined;
  const parts = title.split(/\s+[—|–-]\s+/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.at(-1) : undefined;
}

interface ChapterDesignation { number: number; suffix: string }

function designation(...sources: Array<string | undefined>): ChapterDesignation | undefined {
  for (const source of sources) {
    if (!source) continue;
    const matches = [...source.matchAll(/(\d+)([a-z]*)/gi)];
    const match = matches.at(-1);
    if (match) return { number: Number.parseInt(match[1], 10), suffix: match[2].toLowerCase() };
  }
  return undefined;
}

function compareDesignation(left: ChapterDesignation, right: ChapterDesignation) {
  return left.number - right.number || left.suffix.localeCompare(right.suffix);
}

function adjacentChapterUrls($: cheerio.CheerioAPI, chapterUrl: string, chapterTitle: string | undefined) {
  const current = designation(new URL(chapterUrl).pathname, chapterTitle);
  if (!current) return {};

  const candidates = new Map<string, ChapterDesignation>();
  $('a').each((_index, node: Element) => {
    const anchor = $(node);
    const rel = anchor.attr('rel')?.toLowerCase().split(/\s+/) ?? [];
    const text = anchor.text().trim();
    const inPostNavigation = anchor.closest('.post-navigation, [class*="post-navigation"]').length > 0;
    if (!rel.includes('prev') && !rel.includes('next') && !inPostNavigation && !/next|prev(ious)? chapter/i.test(text)) return;
    const href = anchor.attr('href');
    if (!href) return;
    try {
      const resolved = new URL(href, chapterUrl);
      const parsed = designation(resolved.pathname, anchor.attr('title'), text);
      if (parsed && resolved.href !== chapterUrl) candidates.set(resolved.href, parsed);
    } catch { /* malformed adjacent URL is not a candidate */ }
  });

  let previous: [string, ChapterDesignation] | undefined;
  let next: [string, ChapterDesignation] | undefined;
  for (const candidate of candidates) {
    const order = compareDesignation(candidate[1], current);
    if (order < 0 && (!previous || compareDesignation(candidate[1], previous[1]) > 0)) previous = candidate;
    if (order > 0 && (!next || compareDesignation(candidate[1], next[1]) < 0)) next = candidate;
  }
  return { ...(previous ? { prevUrl: previous[0] } : {}), ...(next ? { nextUrl: next[0] } : {}) };
}

export const genericExtractor: Extractor = {
  id: 'generic',
  matches: () => true,
  extract(html: string, chapterUrl: string): ExtractResult | ExtractError {
    const $ = cheerio.load(html);
    if ($('img').length === 0) return { error: 'NO_IMAGES', detail: 'The page contains no image elements.' };

    const scope = chooseScope($);
    const candidates: Candidate[] = [];
    scope.find('img').each((index, node: Element) => {
      const element = $(node);
      const source = element.attr('data-src') ?? element.attr('data-lazy-src') ?? element.attr('data-original') ?? element.attr('src');
      if (!source || source.trim().toLowerCase().startsWith('data:')) return;
      const width = numberAttr(element.attr('width'));
      const height = numberAttr(element.attr('height'));
      if (width !== undefined && width < 400) return;
      try {
        const url = new URL(source, chapterUrl).href;
        candidates.push({ url, width, height, index, shape: shape(url) });
      } catch { /* malformed image URL is not a Page */ }
    });

    const run = dominantRun(candidates);
    if (run.length < 3) return { error: 'NO_PAGE_RUN', detail: `The longest qualifying image run contained ${run.length} Page${run.length === 1 ? '' : 's'}; at least 3 are required.` };

    const measured = run.filter((page) => page.width && page.height);
    const tall = measured.filter((page) => page.height! > 2 * page.width!).length;
    if (measured.length > 0 && tall > run.length / 2) {
      return { error: 'LONG_STRIP_UNSUPPORTED', detail: `${tall} of ${run.length} Pages are taller than twice their width.` };
    }

    const pages = run.map(({ index: _index, shape: _shape, ...page }) => page);
    const chapterTitle = $('h1.entry-title, article h1, main h1, h1').first().text().trim() || undefined;
    const seriesTitle = $('meta[property="og:site_name"]').attr('content')?.trim() || titleSuffix($('title').first().text().trim());
    return { pages, chapterTitle, seriesTitle, ...adjacentChapterUrls($, chapterUrl, chapterTitle), imageHeaders: { referer: chapterUrl } };
  }
};
