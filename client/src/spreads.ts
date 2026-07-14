export interface ReaderPage { url: string; width?: number; height?: number }

const isLandscape = (page: ReaderPage) => Boolean(page.width && page.height && page.width > page.height);

function baseWidth(pages: ReaderPage[]) {
  const counts = new Map<number, number>();
  for (const page of pages) if (page.width && !isLandscape(page)) counts.set(page.width, (counts.get(page.width) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
}

export function spreadPages(pages: ReaderPage[]) {
  const base = baseWidth(pages);
  return new Set(pages.filter((page) => isLandscape(page) || Boolean(base && page.width && Math.abs(page.width - base * 2) / (base * 2) <= 0.15)));
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
