import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Library, LibrarySeries } from '../../shared/contract.js';

interface SeriesInput { key: string; title: string }
interface ChapterInput { url: string; title: string; pageCount: number }

interface StoreFileSystem {
  mkdir: typeof mkdir;
  writeFile: typeof writeFile;
  rename: typeof rename;
  unlink: typeof unlink;
}

const defaultFileSystem: StoreFileSystem = { mkdir, writeFile, rename, unlink };

export class LibraryStore {
  private writeQueue: Promise<unknown> = Promise.resolve();
  private constructor(
    private readonly path: string,
    private state: Library,
    private readonly now: () => Date,
    private readonly fileSystem: StoreFileSystem
  ) {}

  static async open(path: string, now: () => Date = () => new Date(), fileSystem: StoreFileSystem = defaultFileSystem) {
    let state: Library = { series: [] };
    try {
      state = JSON.parse(await readFile(path, 'utf8')) as Library;
      if (!Array.isArray(state.series)) throw new Error('library.json must contain a series array');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return new LibraryStore(path, state, now, fileSystem);
  }

  snapshot(): Library { return structuredClone(this.state); }

  findSeries(key: string): LibrarySeries | undefined {
    const series = this.state.series.find((entry) => entry.key === key);
    return series ? structuredClone(series) : undefined;
  }

  library(): Library {
    const library = this.snapshot();
    library.series.sort((left, right) => right.lastReadAt.localeCompare(left.lastReadAt));
    return library;
  }

  async recordOpen(seriesInput: SeriesInput, chapter: ChapterInput): Promise<{ series: LibrarySeries; reread: boolean }> {
    return this.mutate(() => {
      const next = structuredClone(this.state);
      const timestamp = this.now().toISOString();
      let series = next.series.find((entry) => entry.key === seriesInput.key);
      if (!series) {
        series = { key: seriesInput.key, title: seriesInput.title, resumeChapterUrl: chapter.url, addedAt: timestamp, lastReadAt: timestamp, chapters: [] };
        next.series.push(series);
      }
      const reread = series.chapters.some((entry) => entry.url === chapter.url);
      if (!reread) {
        series.chapters.push({ ...chapter, firstOpenedAt: timestamp, completed: false });
        series.resumeChapterUrl = chapter.url;
      }
      series.lastReadAt = timestamp;
      return { next, result: { series: structuredClone(series), reread } };
    });
  }

  async completeChapter(url: string): Promise<boolean> {
    return this.mutate(() => {
      for (let seriesIndex = 0; seriesIndex < this.state.series.length; seriesIndex += 1) {
        const chapterIndex = this.state.series[seriesIndex].chapters.findIndex((chapter) => chapter.url === url);
        if (chapterIndex < 0) continue;
        if (this.state.series[seriesIndex].chapters[chapterIndex].completed) return { result: true };
        const next = structuredClone(this.state);
        next.series[seriesIndex].chapters[chapterIndex].completed = true;
        return { next, result: true };
      }
      return { result: false };
    });
  }

  async renameSeries(key: string, title: string): Promise<LibrarySeries | undefined> {
    return this.mutate(() => {
      const index = this.state.series.findIndex((entry) => entry.key === key);
      if (index < 0) return { result: undefined };
      if (this.state.series[index].title === title) return { result: structuredClone(this.state.series[index]) };
      const next = structuredClone(this.state);
      next.series[index].title = title;
      return { next, result: structuredClone(next.series[index]) };
    });
  }

  async removeSeries(key: string): Promise<boolean> {
    return this.mutate(() => {
      const index = this.state.series.findIndex((entry) => entry.key === key);
      if (index < 0) return { result: false };
      const next = structuredClone(this.state);
      next.series.splice(index, 1);
      return { next, result: true };
    });
  }

  private async mutate<T>(prepare: () => { next?: Library; result: T }): Promise<T> {
    const operation = this.writeQueue.then(async () => {
      const { next, result } = prepare();
      if (next) {
        await this.persist(next);
        this.state = next;
      }
      return result;
    });
    this.writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async persist(next: Library) {
    await this.fileSystem.mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await this.fileSystem.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    try {
      await this.fileSystem.rename(temporary, this.path);
    } catch (error) {
      await this.fileSystem.unlink(temporary).catch(() => undefined);
      throw error;
    }
  }
}
