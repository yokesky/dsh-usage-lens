/**
 * The usage-lens panel service: incremental cache refresh + range aggregate,
 * exposed as one handler the route dispatch calls. Single-flight guard keeps
 * concurrent panel requests from duplicating the scan.
 * @module dsh-usage-lens/api
 */

import type { CacheFile, SessionCacheEntry } from './cache.ts'
import { loadCacheFile, refreshCache, saveCacheFile } from './cache.ts'
import { aggregate, isRangeDays } from './aggregate.ts'
import type { PanelData } from './types.ts'
import { UsageLensError } from './wire.ts'

/** Persistence faces injected for testability. */
export interface UsageLensStore {
  load(): Promise<CacheFile>
  save(cache: CacheFile): Promise<void>
  refresh(cache: CacheFile): Promise<CacheFile>
}

/** Default store over the resolved config paths. */
export function fileStore(sessionsRoot: string, cacheFile: string): UsageLensStore {
  return {
    load: () => loadCacheFile(cacheFile),
    save: (cache) => saveCacheFile(cacheFile, cache),
    refresh: (cache) => refreshCache(cache, sessionsRoot),
  }
}

/** The panel request body. */
export interface PanelRequest {
  rangeDays?: unknown
}

export class UsageLensPanel {
  private cache: CacheFile | null = null
  private inflight: Promise<void> | null = null

  constructor(
    private readonly store: UsageLensStore,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Run one panel query (refresh is single-flight; aggregation is per-request). */
  panel(request: PanelRequest): Promise<PanelData> {
    const rangeDays = request.rangeDays
    if (!isRangeDays(rangeDays)) {
      return Promise.reject(new UsageLensError('bad-range', 'rangeDays must be 7 or 30', 400))
    }
    if (this.inflight === null) {
      this.inflight = this.refresh().finally(() => {
        this.inflight = null
      })
    }
    return this.inflight.then(() => {
      const cache = this.cache!
      return aggregate(Object.values(cache.sessions).map((entry: SessionCacheEntry) => entry.folded), rangeDays, this.now())
    })
  }

  private async refresh(): Promise<void> {
    const cache = this.cache ?? (await this.store.load())
    try {
      await this.store.refresh(cache)
    } catch (error) {
      // A refresh failure must not take the panel down: serve the last
      // known state when one exists, otherwise surface the error.
      if (this.cache === null) throw error
    }
    this.cache = cache
    void this.store.save(cache).catch(() => {})
  }
}
