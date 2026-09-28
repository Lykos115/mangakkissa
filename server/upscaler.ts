import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { friendlyDetail } from './errors.js';
import { ByteLru, type PageFetchFailure, type PageResource } from './image-pipeline.js';

export const DEFAULT_UPSCALE_CACHE_MAX_BYTES = 32 * 1024 * 1024;
export const UPSCALE_SCALE = 2;
export const UPSCALE_MODEL = 'cunet';
const DEFAULT_TEMP_DIR = join(tmpdir(), 'manga-reader-upscales');

export type UpscaleRunner = (binary: string, inputPath: string, outputPath: string) => Promise<void>;

const spawnRunner: UpscaleRunner = (binary, inputPath, outputPath) => new Promise((resolve, reject) => {
  const child = spawn(binary, ['-i', inputPath, '-o', outputPath, '-s', String(UPSCALE_SCALE), '-g', '-1', '-f', 'webp'], {
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk; });
  child.on('error', (error) => reject(new Error(`could not spawn upscaler: ${error.message}`)));
  child.on('close', (code) => {
    if (code === 0) resolve();
    else reject(new Error(`upscaler exited with code ${code}${stderr ? `: ${stderr.trim().slice(0, 300)}` : ''}`));
  });
});

interface UpscalerOptions {
  maxBytes?: number;
  tempDir?: string;
  run?: UpscaleRunner;
}

export class Upscaler {
  private readonly cache: ByteLru;
  private readonly pending = new Map<string, Promise<PageResource>>();
  private readonly tempDir: string;
  private readonly run: UpscaleRunner;
  // Boot-time sweep: per-job `finally` covers every failure the process survives,
  // only this covers the ones it doesn't (SIGKILL, crash).
  private readonly swept: Promise<void>;

  constructor(private readonly binary: string, { maxBytes = DEFAULT_UPSCALE_CACHE_MAX_BYTES, tempDir = DEFAULT_TEMP_DIR, run = spawnRunner }: UpscalerOptions = {}) {
    this.cache = new ByteLru(maxBytes);
    this.tempDir = tempDir;
    this.run = run;
    this.swept = rm(this.tempDir, { recursive: true, force: true }).catch(() => undefined);
  }

  async upscale(source: URL, fetchOriginal: () => Promise<PageResource>): Promise<PageResource> {
    const key = createHash('sha256').update(`${source.href}|${UPSCALE_SCALE}|${UPSCALE_MODEL}`).digest('hex');
    const cached = this.cache.get(key);
    if (cached) return cached;
    const existing = this.pending.get(key);
    if (existing) return existing;

    const request = this.execute(source, fetchOriginal).then((resource) => {
      this.cache.set(key, resource);
      return resource;
    }).finally(() => {
      if (this.pending.get(key) === request) this.pending.delete(key);
    });
    this.pending.set(key, request);
    return request;
  }

  private async execute(source: URL, fetchOriginal: () => Promise<PageResource>): Promise<PageResource> {
    const original = await fetchOriginal();
    await this.swept;
    await mkdir(this.tempDir, { recursive: true });
    const job = randomUUID();
    const inputPath = join(this.tempDir, `${job}-in`);
    const outputPath = join(this.tempDir, `${job}-out.webp`);
    try {
      await writeFile(inputPath, original.body);
      await this.run(this.binary, inputPath, outputPath);
      return { body: await readFile(outputPath), contentType: 'image/webp' };
    } catch (error) {
      const reason = (error as Partial<PageFetchFailure>).detail ?? friendlyDetail(error);
      const detail = `Upscale failed for ${source.href}: ${reason}`;
      console.warn(detail);
      throw { detail } satisfies PageFetchFailure;
    } finally {
      await Promise.all([inputPath, outputPath].map((path) => unlink(path).catch(() => undefined)));
    }
  }
}
