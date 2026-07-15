import type { Fetcher } from './types.js';
import { friendlyDetail } from './errors.js';

export const DEFAULT_IMAGE_CACHE_MAX_BYTES = 200 * 1024 * 1024;
const MAX_REQUESTS_PER_HOST = 4;

export interface PageResource {
  body: Buffer;
  contentType: string;
}

export interface PageFetchFailure {
  status?: number;
  detail: string;
}

export class ByteLru {
  private readonly entries = new Map<string, PageResource>();
  private bytes = 0;

  constructor(private readonly maxBytes: number) {}

  get(key: string): PageResource | undefined {
    const value = this.entries.get(key);
    if (!value) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: PageResource): void {
    const previous = this.entries.get(key);
    if (previous) {
      this.bytes -= previous.body.byteLength;
      this.entries.delete(key);
    }
    if (value.body.byteLength > this.maxBytes) return;
    this.entries.set(key, value);
    this.bytes += value.body.byteLength;
    while (this.bytes > this.maxBytes) {
      const oldest = this.entries.entries().next().value as [string, PageResource] | undefined;
      if (!oldest) break;
      this.entries.delete(oldest[0]);
      this.bytes -= oldest[1].body.byteLength;
    }
  }
}

class HostLimiter {
  private readonly active = new Map<string, number>();
  private readonly queues = new Map<string, Array<() => void>>();

  async run<T>(host: string, operation: () => Promise<T>): Promise<T> {
    await this.acquire(host);
    try {
      return await operation();
    } finally {
      this.release(host);
    }
  }

  private acquire(host: string): Promise<void> {
    const active = this.active.get(host) ?? 0;
    if (active < MAX_REQUESTS_PER_HOST) {
      this.active.set(host, active + 1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const queue = this.queues.get(host) ?? [];
      queue.push(resolve);
      this.queues.set(host, queue);
    });
  }

  private release(host: string): void {
    const queue = this.queues.get(host);
    const next = queue?.shift();
    if (next) {
      if (queue?.length === 0) this.queues.delete(host);
      next();
      return;
    }
    const active = (this.active.get(host) ?? 1) - 1;
    if (active === 0) this.active.delete(host);
    else this.active.set(host, active);
  }
}

export class ImagePipeline {
  private readonly cache: ByteLru;
  private readonly limiter = new HostLimiter();
  private readonly pending = new Map<string, Promise<PageResource>>();

  constructor(private readonly fetcher: Fetcher, maxBytes = DEFAULT_IMAGE_CACHE_MAX_BYTES) {
    this.cache = new ByteLru(maxBytes);
  }

  async get(source: URL, headers: Record<string, string>, refresh = false): Promise<PageResource> {
    if (!refresh) {
      const cached = this.cache.get(source.href);
      if (cached) return cached;
    }
    const pendingKey = refresh ? `${source.href}\0refresh` : source.href;
    const existing = this.pending.get(pendingKey);
    if (existing) return existing;

    const request = this.fetchWithRetry(source, headers).then((resource) => {
      this.cache.set(source.href, resource);
      return resource;
    }).finally(() => {
      if (this.pending.get(pendingKey) === request) this.pending.delete(pendingKey);
    });
    this.pending.set(pendingKey, request);
    return request;
  }

  private async fetchWithRetry(source: URL, headers: Record<string, string>): Promise<PageResource> {
    let failure: PageFetchFailure | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await this.limiter.run(source.hostname, async () => {
          const upstream = await this.fetcher(source.href, { headers });
          if (!upstream.ok) {
            await upstream.body?.cancel().catch(() => undefined);
            return { failure: { status: upstream.status, detail: `Page source returned HTTP ${upstream.status}.` } };
          }
          return { resource: {
            body: Buffer.from(await upstream.arrayBuffer()),
            contentType: upstream.headers.get('content-type') ?? 'application/octet-stream'
          } };
        });
        if (result.resource) return result.resource;
        failure = result.failure;
      } catch (error) {
        failure = { detail: `Page fetch failed: ${friendlyDetail(error)}` };
      }
    }
    throw failure ?? { detail: 'Page fetch failed.' } satisfies PageFetchFailure;
  }
}
