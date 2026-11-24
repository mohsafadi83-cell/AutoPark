import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

export interface CacheStatsSnapshot {
  entries: number;
  maxEntries: number;
  hits: number;
  misses: number;
  sets: number;
  invalidations: number;
  dedupedInFlight: number;
  hitRatePct: number;
}

/**
 * Production in-memory database read-through cache with:
 * - Per-key TTL expiration
 * - Concurrent request stampede deduplication (`inFlight` promise coalescing)
 * - Prefix-based invalidation on database mutations
 * - Bounded entry count (FIFO/LRU eviction to prevent memory leaks)
 * - Live telemetry metrics (`getStats()`)
 */
@Injectable()
export class AppCacheService implements OnModuleDestroy {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly maxEntries = 500;
  private sweepTimer: NodeJS.Timeout | null = null;

  private hits = 0;
  private misses = 0;
  private sets = 0;
  private invalidations = 0;
  private dedupedInFlight = 0;

  constructor() {
    this.sweepTimer = setInterval(() => this.sweepExpired(), 30_000);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.store.clear();
    this.inFlight.clear();
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh insertion order (LRU behavior)
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits += 1;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    const now = Date.now();
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, {
      value,
      createdAt: now,
      expiresAt: now + Math.max(250, ttlMs),
    });
    this.sets += 1;
  }

  /**
   * Cache-aside loader with stampede protection:
   * If 10 clients request the same cache key simultaneously during a cache miss,
   * only ONE database query runs and all 10 callers share the same resolved result.
   */
  async getOrSet<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const existingPromise = this.inFlight.get(key);
    if (existingPromise) {
      this.dedupedInFlight += 1;
      return existingPromise as Promise<T>;
    }

    this.misses += 1;
    const p = (async () => {
      try {
        const result = await loader();
        this.set(key, result, ttlMs);
        return result;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, p);
    return p;
  }

  delete(key: string): boolean {
    const existed = this.store.delete(key);
    if (existed) this.invalidations += 1;
    return existed;
  }

  invalidatePrefix(prefix: string): number {
    let removed = 0;
    for (const k of [...this.store.keys()]) {
      if (k.startsWith(prefix)) {
        this.store.delete(k);
        removed += 1;
      }
    }
    if (removed > 0) this.invalidations += removed;
    return removed;
  }

  clear(): void {
    this.invalidations += this.store.size;
    this.store.clear();
  }

  getStats(): CacheStatsSnapshot {
    const total = this.hits + this.misses;
    return {
      entries: this.store.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      invalidations: this.invalidations,
      dedupedInFlight: this.dedupedInFlight,
      hitRatePct: total > 0 ? Math.round((this.hits / total) * 1000) / 10 : 0,
    };
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [k, v] of this.store.entries()) {
      if (now > v.expiresAt) {
        this.store.delete(k);
      }
    }
  }
}

@Global()
@Module({
  providers: [AppCacheService],
  exports: [AppCacheService],
})
export class CacheModule {}
