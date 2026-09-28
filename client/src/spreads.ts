import { isDoubledWidth, type Page } from '../../shared/contract.js';

export type ReaderPage = Page;

const isLandscape = (page: ReaderPage) => Boolean(page.width && page.height && page.width > page.height);

function baseWidth(pages: ReaderPage[]) {
  const counts = new Map<number, number>();
  for (const page of pages) if (page.width && !isLandscape(page)) counts.set(page.width, (counts.get(page.width) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
}

export function spreadPages(pages: ReaderPage[]) {
  const base = baseWidth(pages);
  return new Set(pages.filter((page) => isLandscape(page) || Boolean(base && page.width && isDoubledWidth(page.width, base))));
}

// Deficient Spreads only: landscape but short of the doubled width its neighbours set.
// Not isLandscape alone — that matches sharp Spreads too, which is right for layout and wrong for upscaling.
export function deficientSpreadPages(pages: ReaderPage[]) {
  const base = baseWidth(pages);
  if (!base) return new Set<ReaderPage>();
  return new Set(pages.filter((page) => isLandscape(page) && page.width! < base * 2 * 0.85));
}

export function pagesInReadingOrder(pages: ReaderPage[]) {
  return [...pages].reverse();
}

export function buildSpreads(pages: ReaderPage[], coverSolo = true): ReaderPage[][] {
  const spreads: ReaderPage[][] = [];
  const preJoined = spreadPages(pages);
  let pendingPage: ReaderPage | undefined;

  pages.forEach((page, index) => {
    if (preJoined.has(page)) {
      if (pendingPage) spreads.push([pendingPage]);
      pendingPage = undefined;
      spreads.push([page]);
    } else if (index === 0 && coverSolo) {
      spreads.push([page]);
    } else if (pendingPage) {
      spreads.push([pendingPage, page]);
      pendingPage = undefined;
    } else {
      pendingPage = page;
    }
  });

  if (pendingPage) spreads.push([pendingPage]);
  return spreads;
}
