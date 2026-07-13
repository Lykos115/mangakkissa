import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { LibraryStore } from '../server/storage/library-store.js';

const chapter = { url: 'https://reader.test/chapter-1', title: 'Chapter 1', pageCount: 4 };

async function temporaryStore(now: () => Date = () => new Date('2026-07-13T10:00:00.000Z')) {
  const dir = await mkdtemp(join(tmpdir(), 'reader-store-'));
  const path = join(dir, 'library.json');
  return { path, store: await LibraryStore.open(path, now) };
}

describe('Library storage', () => {
  it('atomically persists a new Series without Page URLs and reloads it', async () => {
    const { path, store } = await temporaryStore();
    const result = await store.recordOpen({ key: 'reader.test', title: 'Ink House' }, chapter);
    expect(result.reread).toBe(false);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ series: [{
      key: 'reader.test', title: 'Ink House', resumeChapterUrl: chapter.url,
      addedAt: '2026-07-13T10:00:00.000Z', lastReadAt: '2026-07-13T10:00:00.000Z',
      chapters: [{ ...chapter, firstOpenedAt: '2026-07-13T10:00:00.000Z', completed: false }]
    }] });
    expect((await LibraryStore.open(path)).snapshot()).toEqual(store.snapshot());
  });

  it('adds a new Chapter, but a Re-read neither duplicates it nor moves Resume Chapter', async () => {
    let now = '2026-07-13T10:00:00.000Z';
    const { store } = await temporaryStore(() => new Date(now));
    await store.recordOpen({ key: 'reader.test', title: 'Ink House' }, chapter);
    now = '2026-07-13T11:00:00.000Z';
    await store.recordOpen({ key: 'reader.test', title: 'Changed extraction title' }, { ...chapter, url: 'https://reader.test/chapter-2', title: 'Chapter 2' });
    now = '2026-07-13T12:00:00.000Z';
    const result = await store.recordOpen({ key: 'reader.test', title: 'Changed again' }, chapter);
    const series = store.snapshot().series[0];
    expect(result.reread).toBe(true);
    expect(series.title).toBe('Ink House');
    expect(series.resumeChapterUrl).toBe('https://reader.test/chapter-2');
    expect(series.lastReadAt).toBe(now);
    expect(series.chapters).toHaveLength(2);
  });

  it('lists Series by most recent read, including Re-read recency', async () => {
    let now = '2026-07-13T10:00:00.000Z';
    const { store } = await temporaryStore(() => new Date(now));
    await store.recordOpen({ key: 'first.test', title: 'First' }, { ...chapter, url: 'https://first.test/c1' });
    now = '2026-07-13T11:00:00.000Z';
    await store.recordOpen({ key: 'second.test', title: 'Second' }, { ...chapter, url: 'https://second.test/c1' });
    now = '2026-07-13T12:00:00.000Z';
    await store.recordOpen({ key: 'first.test', title: 'Ignored' }, { ...chapter, url: 'https://first.test/c1' });
    expect(store.library().series.map((series) => series.key)).toEqual(['first.test', 'second.test']);
  });

  it('marks a visited Chapter complete idempotently and persists it across restart', async () => {
    const { path, store } = await temporaryStore();
    await store.recordOpen({ key: 'reader.test', title: 'Ink House' }, chapter);

    expect(await store.completeChapter(chapter.url)).toBe(true);
    expect(await store.completeChapter(chapter.url)).toBe(true);
    expect(await store.completeChapter('https://reader.test/missing')).toBe(false);
    expect(store.snapshot().series[0].chapters[0].completed).toBe(true);
    expect((await LibraryStore.open(path)).snapshot().series[0].chapters[0].completed).toBe(true);
  });

  it('renames and removes by identity and persists both across restart', async () => {
    const { path, store } = await temporaryStore();
    await store.recordOpen({ key: 'reader.test', title: 'Ink House' }, chapter);
    const before = store.snapshot().series[0];
    const renamed = await store.renameSeries('reader.test', 'The Ink House');
    expect(renamed).toEqual({ ...before, title: 'The Ink House' });
    expect((await LibraryStore.open(path)).snapshot().series[0]).toEqual(renamed);

    expect(await store.removeSeries('reader.test')).toBe(true);
    expect(store.snapshot()).toEqual({ series: [] });
    expect((await LibraryStore.open(path)).snapshot()).toEqual({ series: [] });
  });

  it('uses a temporary file and does not commit memory when the atomic rename fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'reader-store-'));
    const path = join(dir, 'library.json');
    const writeFile = vi.fn(async () => undefined);
    const rename = vi.fn(async () => { throw new Error('rename failed'); });
    const store = await LibraryStore.open(path, () => new Date('2026-07-13T10:00:00.000Z'), {
      mkdir: vi.fn(async () => undefined), writeFile, rename, unlink: vi.fn(async () => undefined)
    });

    await expect(store.recordOpen({ key: 'reader.test', title: 'Ink House' }, chapter)).rejects.toThrow('rename failed');
    expect(store.snapshot()).toEqual({ series: [] });
    expect(writeFile).toHaveBeenCalledOnce();
    const temporary = String(writeFile.mock.calls[0][0]);
    expect(temporary).not.toBe(path);
    expect(temporary).toMatch(/\.tmp$/);
    expect(rename).toHaveBeenCalledWith(temporary, path);
  });
});
