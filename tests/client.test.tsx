// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../client/src/App.js';
import type { Library, LibrarySeries } from '../client/src/api.js';
import { buildSpreads } from '../client/src/spreads.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const payload = { chapter: { url: 'https://reader.test/c1', title: 'Chapter 1', pages: [
  { url: 'https://cdn.test/1.jpg', width: 800, height: 1200 },
  { url: 'https://cdn.test/2.jpg', width: 800, height: 1200 },
  { url: 'https://cdn.test/3.jpg', width: 800, height: 1200 },
  { url: 'https://cdn.test/4.jpg', width: 1600, height: 1200 },
  { url: 'https://cdn.test/5.jpg', width: 800, height: 1200 }
]}, series: { key: 'reader.test', title: 'Ink House', resumeChapterUrl: 'https://reader.test/c1' }, reread: false };

const nextPayload = { chapter: { url: 'https://reader.test/c2', title: 'Chapter 2', prevUrl: payload.chapter.url, pages: [
  { url: 'https://cdn.test/6.jpg', width: 800, height: 1200 },
  { url: 'https://cdn.test/7.jpg', width: 800, height: 1200 },
  { url: 'https://cdn.test/8.jpg', width: 800, height: 1200 }
]}, series: { key: 'reader.test', title: 'Ink House', resumeChapterUrl: 'https://reader.test/c2' }, reread: false };

const series: LibrarySeries = {
  key: 'reader.test', title: 'Ink House', resumeChapterUrl: 'https://reader.test/c2',
  addedAt: '2026-07-12T09:00:00.000Z', lastReadAt: '2026-07-13T11:00:00.000Z', chapters: [
    { url: 'https://reader.test/c1', title: 'Chapter 1', pageCount: 5, firstOpenedAt: '2026-07-12T09:00:00.000Z', completed: true },
    { url: 'https://reader.test/c2', title: 'Chapter 2', pageCount: 4, firstOpenedAt: '2026-07-13T11:00:00.000Z', completed: false }
  ]
};
const olderSeries: LibrarySeries = {
  key: 'older.test', title: 'Older Tales', resumeChapterUrl: 'https://older.test/c4',
  addedAt: '2026-07-10T09:00:00.000Z', lastReadAt: '2026-07-12T08:00:00.000Z', chapters: [
    { url: 'https://older.test/c4', title: 'Chapter 4', pageCount: 3, firstOpenedAt: '2026-07-12T08:00:00.000Z', completed: false }
  ]
};
const emptyLibrary: Library = { series: [] };

async function submitChapter(openChapter: (url: string) => Promise<typeof payload>) {
  render(<App openChapter={openChapter} getLibrary={async () => emptyLibrary} />);
  await userEvent.type(screen.getByLabelText('Chapter URL'), payload.chapter.url);
  await userEvent.click(screen.getByRole('button', { name: 'Open chapter' }));
}

async function openReader() {
  await submitChapter(async () => payload);
  await screen.findByRole('heading', { name: 'Chapter 1' });
}

describe('Spread builder', () => {
  it('makes a solo cover, RTL pairs, solo wide Pages, and preserves every Page once', () => {
    expect(buildSpreads(payload.chapter.pages).map((spread) => spread.map((page) => page.url))).toEqual([
      ['https://cdn.test/1.jpg'],
      ['https://cdn.test/2.jpg', 'https://cdn.test/3.jpg'],
      ['https://cdn.test/4.jpg'],
      ['https://cdn.test/5.jpg']
    ]);
  });

  it('shifts pairing by one Page without pairing across a doubled-width Page', () => {
    expect(buildSpreads(payload.chapter.pages, false).map((spread) => spread.map((page) => page.url))).toEqual([
      ['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg'],
      ['https://cdn.test/3.jpg'],
      ['https://cdn.test/4.jpg'],
      ['https://cdn.test/5.jpg']
    ]);
  });
});

describe('client open flow', () => {
  it('opens the Reader only after success and uses proxy image URLs in RTL placement', async () => {
    const openChapter = vi.fn(async () => payload);
    await submitChapter(openChapter);
    expect(await screen.findByRole('heading', { name: 'Chapter 1' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next spread' }));
    const spread = screen.getByTestId('spread');
    const images = within(spread).getAllByRole('img');
    expect(images.map((image) => image.getAttribute('alt'))).toEqual(['Page 3', 'Page 2']);
    expect(images.every((image) => image.getAttribute('src')?.startsWith('/api/image?url='))).toBe(true);
  });

  it('keeps a failed extraction inline on the Library and retries it', async () => {
    const failure = Object.assign(new Error('No run'), { code: 'NO_PAGE_RUN', status: 422, detail: 'Only two candidates' });
    const openChapter = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(payload);
    await submitChapter(openChapter);
    expect(await screen.findByText(/Couldn't find chapter pages/)).toBeInTheDocument();
    expect(screen.getByText(/NO_PAGE_RUN.*422.*Only two candidates/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Chapter 1' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Chapter 1' })).toBeInTheDocument();
  });

  it.each([
    ['FETCH_FAILED', 503, "Couldn't reach the site (HTTP 503)."],
    ['NO_IMAGES', 422, "Couldn't find chapter pages on this page — this site may need its own extractor."],
    ['NO_PAGE_RUN', 422, "Couldn't find chapter pages on this page — this site may need its own extractor."],
    ['LONG_STRIP_UNSUPPORTED', 422, 'This looks like a vertical-scroll comic — this reader only does page spreads.']
  ])('presents %s with reason-specific copy and technical status', async (code, status, message) => {
    const failure = Object.assign(new Error(code), { code, status, detail: `${code} detail` });
    await submitChapter(vi.fn().mockRejectedValue(failure));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${code}.*${status}.*${code} detail`))).toBeInTheDocument();
  });
});

describe('Library management', () => {
  it('lists Series in API order with Resume Chapter title, date, and expandable Visited Logs', async () => {
    render(<App getLibrary={async () => ({ series: [series, olderSeries] })} />);
    const entries = await screen.findAllByRole('article');
    expect(entries.map((entry) => within(entry).getByRole('heading').textContent)).toEqual(['Ink House', 'Older Tales']);
    expect(within(entries[0]).getByText('Chapter 2')).toBeInTheDocument();
    expect(within(entries[0]).getByText('Last read', { exact: false }).closest('time')).toHaveAttribute('datetime', series.lastReadAt);
    const toggle = within(entries[0]).getByRole('button', { name: 'Show Visited Log for Ink House' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(entries[0]).getByRole('button', { name: 'Re-read Chapter 1' })).toBeInTheDocument();
  });

  it('resumes and Re-reads through the normal open path', async () => {
    const openChapter = vi.fn(async (url: string) => ({ ...payload, chapter: { ...payload.chapter, url }, reread: url.endsWith('c1') }));
    render(<App getLibrary={async () => ({ series: [series] })} openChapter={openChapter} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Resume Ink House' }));
    expect(openChapter).toHaveBeenCalledWith('https://reader.test/c2');
    expect(await screen.findByText('Spread 1 / 4')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Library' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Show Visited Log for Ink House' }));
    await userEvent.click(screen.getByRole('button', { name: 'Re-read Chapter 1' }));
    expect(openChapter).toHaveBeenLastCalledWith('https://reader.test/c1');
  });

  it('keeps a failed resume inside its Series entry and retries the same URL', async () => {
    const failure = Object.assign(new Error('Site down'), { code: 'FETCH_FAILED', status: 503, detail: 'Chapter site returned HTTP 503.' });
    const openChapter = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(payload);
    render(<App getLibrary={async () => ({ series: [series, olderSeries] })} openChapter={openChapter} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Resume Ink House' }));
    const entry = screen.getByRole('article', { name: 'Ink House' });
    expect(within(entry).getByText("Couldn't reach the site (HTTP 503).")).toBeInTheDocument();
    expect(within(entry).getByText(/FETCH_FAILED.*503.*Chapter site returned/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume Older Tales' })).toBeEnabled();
    await userEvent.click(within(entry).getByRole('button', { name: 'Retry' }));
    expect(openChapter).toHaveBeenLastCalledWith(series.resumeChapterUrl);
    expect(await screen.findByRole('heading', { name: 'Chapter 1' })).toBeInTheDocument();
  });

  it('renames a Series and confirms before removing it with its Visited Log', async () => {
    const renamed = { ...series, title: 'The Ink House' };
    const renameSeries = vi.fn(async () => renamed);
    const removeSeries = vi.fn(async () => undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<App getLibrary={async () => ({ series: [series] })} renameSeries={renameSeries} removeSeries={removeSeries} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Rename Ink House' }));
    const input = screen.getByLabelText('Series title');
    await userEvent.clear(input);
    await userEvent.type(input, 'The Ink House');
    await userEvent.click(screen.getByRole('button', { name: 'Save title' }));
    expect(renameSeries).toHaveBeenCalledWith('reader.test', 'The Ink House');
    expect(await screen.findByRole('heading', { name: 'The Ink House' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove The Ink House' }));
    expect(removeSeries).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'The Ink House' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove The Ink House' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(removeSeries).toHaveBeenCalledWith('reader.test');
    expect(screen.queryByRole('heading', { name: 'The Ink House' })).not.toBeInTheDocument();
  });
});

describe('Adjacent Chapter flow', () => {
  it('peeks the next Chapter, renders a divider, and opens a selected next-Chapter Spread without resetting reader controls', async () => {
    const first = { ...payload, chapter: { ...payload.chapter, nextUrl: nextPayload.chapter.url } };
    const openChapter = vi.fn(async (url: string) => url === nextPayload.chapter.url ? nextPayload : first);
    const peekChapter = vi.fn(async () => nextPayload);
    const completeChapter = vi.fn(async () => undefined);
    render(<App openChapter={openChapter} peekChapter={peekChapter} completeChapter={completeChapter} getLibrary={async () => emptyLibrary} />);
    await userEvent.type(screen.getByLabelText('Chapter URL'), first.chapter.url);
    await userEvent.click(screen.getByRole('button', { name: 'Open chapter' }));

    const divider = await screen.findByLabelText('Next Chapter — Chapter 2');
    expect(divider).toBeInTheDocument();
    expect(peekChapter).toHaveBeenCalledWith(nextPayload.chapter.url);
    const nextThumbnails = divider.parentElement?.querySelectorAll('.adjacent-thumbnail img') ?? [];
    expect([...nextThumbnails].map((image) => image.getAttribute('loading'))).toEqual(['lazy', 'lazy', 'lazy']);
    expect([...nextThumbnails].every((image) => image.getAttribute('src')?.startsWith('/api/image?url='))).toBe(true);
    await userEvent.keyboard('f');
    await userEvent.click(screen.getByRole('button', { name: 'Chapter 2, Spread 2' }));

    expect(openChapter).toHaveBeenLastCalledWith(nextPayload.chapter.url);
    expect(await screen.findByRole('heading', { name: 'Chapter 2' })).toBeInTheDocument();
    expect(screen.getByText('Spread 2 / 2')).toBeInTheDocument();
    expect(screen.getByTestId('reader-stage')).toHaveClass('fit-width');
    expect(screen.getByRole('status')).toHaveTextContent('Chapter 2');
  });

  it('completes the last Spread and advances across the boundary through the normal open path', async () => {
    const first = { ...payload, chapter: { ...payload.chapter, nextUrl: nextPayload.chapter.url } };
    const openChapter = vi.fn(async (url: string) => url === nextPayload.chapter.url ? nextPayload : first);
    const completeChapter = vi.fn(async () => undefined);
    render(<App openChapter={openChapter} peekChapter={async () => nextPayload} completeChapter={completeChapter} getLibrary={async () => emptyLibrary} />);
    await userEvent.type(screen.getByLabelText('Chapter URL'), first.chapter.url);
    await userEvent.click(screen.getByRole('button', { name: 'Open chapter' }));
    await screen.findByLabelText('Next Chapter — Chapter 2');
    await userEvent.click(screen.getByRole('button', { name: 'Spread 4' }));
    expect(completeChapter).toHaveBeenCalledWith(first.chapter.url);
    await userEvent.click(screen.getByRole('button', { name: 'Next spread' }));
    expect(await screen.findByRole('heading', { name: 'Chapter 2' })).toBeInTheDocument();
    expect(screen.getByText('Spread 1 / 2')).toBeInTheDocument();
  });

  it('goes back before the first Spread by normally opening the previous Chapter at its last Spread', async () => {
    const previous = { ...payload, reread: true };
    const openChapter = vi.fn(async (url: string) => url === previous.chapter.url ? previous : nextPayload);
    render(<App openChapter={openChapter} peekChapter={async () => { throw new Error('No next'); }} completeChapter={async () => undefined} getLibrary={async () => emptyLibrary} />);
    await userEvent.type(screen.getByLabelText('Chapter URL'), nextPayload.chapter.url);
    await userEvent.click(screen.getByRole('button', { name: 'Open chapter' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Previous spread' }));
    expect(openChapter).toHaveBeenLastCalledWith(previous.chapter.url);
    expect(await screen.findByRole('heading', { name: 'Chapter 1' })).toBeInTheDocument();
    expect(screen.getByText('Spread 4 / 4')).toBeInTheDocument();
  });

  it('completes a one-Spread latest Chapter immediately', async () => {
    const latest = { ...payload, chapter: { ...payload.chapter, url: 'https://reader.test/latest', title: 'Latest Chapter', pages: [payload.chapter.pages[0]] } };
    const completeChapter = vi.fn(async () => undefined);
    render(<App openChapter={async () => latest} completeChapter={completeChapter} getLibrary={async () => emptyLibrary} />);
    await userEvent.type(screen.getByLabelText('Chapter URL'), latest.chapter.url);
    await userEvent.click(screen.getByRole('button', { name: 'Open chapter' }));
    await screen.findByRole('heading', { name: 'Latest Chapter' });
    expect(completeChapter).toHaveBeenCalledWith(latest.chapter.url);
  });

  it('shows the honest no-next card and manually continues through the normal open flow', async () => {
    const openChapter = vi.fn(async (url: string) => url === nextPayload.chapter.url ? nextPayload : payload);
    render(<App openChapter={openChapter} getLibrary={async () => emptyLibrary} />);
    await userEvent.type(screen.getByLabelText('Chapter URL'), payload.chapter.url);
    await userEvent.click(screen.getByRole('button', { name: 'Open chapter' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Spread 4' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next spread' }));

    expect(screen.getByRole('heading', { name: 'End of Chapter 1 — no next chapter found.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Chapter on source site' })).toHaveAttribute('href', payload.chapter.url);
    expect(screen.getByRole('button', { name: 'Back to Library' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Next Chapter URL'), nextPayload.chapter.url);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(openChapter).toHaveBeenLastCalledWith(nextPayload.chapter.url);
    expect(await screen.findByRole('heading', { name: 'Chapter 2' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Now reading Chapter 2');
  });

  it('shows a concrete detected-next failure on the end card and retries it', async () => {
    const first = { ...payload, chapter: { ...payload.chapter, nextUrl: nextPayload.chapter.url } };
    const failure = Object.assign(new Error('No pages'), { code: 'NO_IMAGES', status: 422, detail: 'No image elements were found.' });
    const openChapter = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(nextPayload);
    render(<App openChapter={openChapter} peekChapter={vi.fn().mockRejectedValue(failure)} getLibrary={async () => emptyLibrary} />);
    await userEvent.type(screen.getByLabelText('Chapter URL'), first.chapter.url);
    await userEvent.click(screen.getByRole('button', { name: 'Open chapter' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Spread 4' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next spread' }));

    expect(await screen.findByText('The detected next Chapter could not be opened.')).toBeInTheDocument();
    expect(screen.getByText(/NO_IMAGES.*422.*No image elements/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Chapter 2' })).toBeInTheDocument();
  });
});

describe('Page failure handling', () => {
  it('shows the placeholder after the server retry cycle, marks its thumbnail, and starts a new cycle on tap', async () => {
    await openReader();
    await userEvent.click(screen.getByRole('button', { name: 'Next spread' }));
    const failedPage = within(screen.getByTestId('spread')).getByRole('img', { name: 'Page 3' });
    const unaffectedPage = within(screen.getByTestId('spread')).getByRole('img', { name: 'Page 2' });

    fireEvent.error(failedPage);

    expect(screen.getByRole('button', { name: "Page 3 didn't load — tap to retry" })).toBeInTheDocument();
    expect(unaffectedPage).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Page 3 failed to load' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next spread' }));
    expect(screen.getByText('Spread 3 / 4')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Spread 2' }));

    await userEvent.click(screen.getByRole('button', { name: "Page 3 didn't load — tap to retry" }));
    const retryingPage = within(screen.getByTestId('spread')).getByRole('img', { name: 'Page 3' });
    expect(retryingPage.getAttribute('src')).toContain('retry=1');
    expect(screen.getByRole('img', { name: 'Page 3 failed to load' })).toBeInTheDocument();
    fireEvent.load(retryingPage);
    expect(screen.queryByRole('img', { name: 'Page 3 failed to load' })).not.toBeInTheDocument();
  });
});

describe('Reader controls', () => {
  it('navigates in RTL reading direction with keys and click zones', async () => {
    await openReader();
    expect(screen.getByText('Spread 1 / 4')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByText('Spread 2 / 4')).toBeInTheDocument();
    await userEvent.keyboard(' ');
    expect(screen.getByText('Spread 3 / 4')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByText('Spread 2 / 4')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next spread' }));
    expect(screen.getByText('Spread 3 / 4')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Previous spread' }));
    expect(screen.getByText('Spread 2 / 4')).toBeInTheDocument();
  });

  it('cycles all fit modes with f', async () => {
    await openReader();
    const stage = screen.getByTestId('reader-stage');
    expect(stage).toHaveClass('fit-height');
    await userEvent.keyboard('f');
    expect(stage).toHaveClass('fit-width');
    await userEvent.keyboard('f');
    expect(stage).toHaveClass('fit-original');
    await userEvent.keyboard('f');
    expect(stage).toHaveClass('fit-height');
  });

  it('toggles all chrome from the center zone', async () => {
    await openReader();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Chapter Spreads' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Toggle controls' }));
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Chapter Spreads' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Toggle controls' }));
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('shifts pairing for the session and leaves doubled-width Pages solo', async () => {
    await openReader();
    await userEvent.keyboard('p');
    expect(within(screen.getByTestId('spread')).getAllByRole('img').map((image) => image.getAttribute('alt'))).toEqual(['Page 2', 'Page 1']);
    await userEvent.click(screen.getByRole('button', { name: 'Spread 3' }));
    expect(within(screen.getByTestId('spread')).getAllByRole('img').map((image) => image.getAttribute('alt'))).toEqual(['Page 4']);
  });

  it('jumps through the Spread filmstrip, tracks progress, and prioritizes the next two Spreads', async () => {
    await openReader();
    const progress = screen.getByRole('progressbar', { name: 'Chapter progress' });
    expect(progress).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByRole('button', { name: 'Spread 1' })).toHaveAttribute('aria-current', 'true');

    const thumbnails = screen.getByRole('navigation', { name: 'Chapter Spreads' }).querySelectorAll('img');
    expect([...thumbnails].map((image) => image.getAttribute('loading'))).toEqual(['eager', 'eager', 'eager', 'eager', 'lazy']);

    await userEvent.click(screen.getByRole('button', { name: 'Spread 4' }));
    expect(screen.getByText('Spread 4 / 4')).toBeInTheDocument();
    expect(progress).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('button', { name: 'Spread 4' })).toHaveAttribute('aria-current', 'true');
    expect([...thumbnails].map((image) => image.getAttribute('loading'))).toEqual(['lazy', 'lazy', 'lazy', 'lazy', 'eager']);
  });
});
