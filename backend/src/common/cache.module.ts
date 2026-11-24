import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as net from 'net';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

export interface CacheNamespaceStats {
  hits: number;
  misses: number;
  invalidations: number;
  hitRatePct: number;
}

export interface CacheStatsSnapshot {
  backend: 'memory' | 'redis+memory';
  redisConfigured: boolean;
  redisConnected: boolean;
  entries: number;
  maxEntries: number;
  hits: number;
  misses: number;
  sets: number;
  invalidations: number;
  dedupedInFlight: number;
  redisHits: number;
  redisErrors: number;
  hitRatePct: number;
  byNamespace: Record<string, CacheNamespaceStats>;
}

/**
 * Lightweight, zero-dependency Redis RESP2 TCP client for optional L2 distributed caching.
 * Activated only when `REDIS_URL` is set (e.g., `redis://127.0.0.1:6379/0`).
 * Never throws unhandled socket errors; falls back gracefully to L1 in-memory LRU cache.
 */
class LightweightRedisClient {
  private readonly host: string;
  private readonly port: number;
  private readonly password: string | null;
  private readonly db: number;
  private connected = false;

  constructor(redisUrl: string) {
    const parsed = new URL(redisUrl);
    this.host = parsed.hostname || '127.0.0.1';
    this.port = parsed.port ? Number(parsed.port) : 6379;
    this.password = parsed.password ? decodeURIComponent(parsed.password) : null;
    const dbPart = parsed.pathname?.replace(/^\//, '');
    this.db = dbPart && /^\d+$/.test(dbPart) ? Number(dbPart) : 0;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private encodeResp(args: string[]): Buffer {
    const parts: Buffer[] = [Buffer.from(`*${args.length}\r\n`, 'utf8')];
    for (const arg of args) {
      const b = Buffer.from(arg, 'utf8');
      parts.push(Buffer.from(`$${b.length}\r\n`, 'utf8'), b, Buffer.from('\r\n', 'utf8'));
    }
    return Buffer.concat(parts);
  }

  private parseFirstReply(buf: Buffer): { done: boolean; value: string | string[] | number | null } {
    if (buf.length < 3) return { done: false, value: null };
    const prefix = String.fromCharCode(buf[0]);
    const crlf = buf.indexOf('\r\n');
    if (crlf < 0) return { done: false, value: null };

    if (prefix === '+' || prefix === '-') {
      return { done: true, value: buf.subarray(1, crlf).toString('utf8') };
    }
    if (prefix === ':') {
      return { done: true, value: Number(buf.subarray(1, crlf).toString('utf8')) };
    }
    if (prefix === '$') {
      const len = Number(buf.subarray(1, crlf).toString('utf8'));
      if (len < 0) return { done: true, value: null };
      const start = crlf + 2;
      if (buf.length < start + len + 2) return { done: false, value: null };
      return { done: true, value: buf.subarray(start, start + len).toString('utf8') };
    }
    if (prefix === '*') {
      const count = Number(buf.subarray(1, crlf).toString('utf8'));
      if (count <= 0) return { done: true, value: [] };
      const items: string[] = [];
      let off = crlf + 2;
      for (let i = 0; i < count; i++) {
        if (off >= buf.length || buf[off] !== 36) return { done: false, value: null };
        const nextCrlf = buf.indexOf('\r\n', off);
        if (nextCrlf < 0) return { done: false, value: null };
        const len = Number(buf.subarray(off + 1, nextCrlf).toString('utf8'));
        const dataStart = nextCrlf + 2;
        if (buf.length < dataStart + len + 2) return { done: false, value: null };
        items.push(buf.subarray(dataStart, dataStart + len).toString('utf8'));
        off = dataStart + len + 2;
      }
      return { done: true, value: items };
    }
    return { done: true, value: null };
  }

  async command(args: string[], timeoutMs = 350): Promise<string | string[] | number | null> {
    return new Promise((resolve, reject) => {
      const sock = net.connect({ host: this.host, port: this.port });
      let rx = Buffer.alloc(0);
      let settled = false;

      const finish = (err: Error | null, res?: string | string[] | number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        sock.destroy();
        if (err) {
          this.connected = false;
          reject(err);
        } else {
          this.connected = true;
          resolve(res ?? null);
        }
      };

      const timer = setTimeout(() => finish(new Error('Redis command timeout')), timeoutMs);
      timer.unref?.();

      sock.once('error', (err) => finish(err));
      sock.once('connect', () => {
        const preamble: Buffer[] = [];
        if (this.password) preamble.push(this.encodeResp(['AUTH', this.password]));
        if (this.db > 0) preamble.push(this.encodeResp(['SELECT', String(this.db)]));
        preamble.push(this.encodeResp(args));
        sock.write(Buffer.concat(preamble));
      });

      let skipReplies = (this.password ? 1 : 0) + (this.db > 0 ? 1 : 0);

      sock.on('data', (chunk: Buffer) => {
        rx = Buffer.concat([rx, chunk]);
        while (skipReplies > 0) {
          const crlf = rx.indexOf('\r\n');
          if (crlf < 0) return;
          rx = rx.subarray(crlf + 2);
          skipReplies -= 1;
        }
        const parsed = this.parseFirstReply(rx);
        if (parsed.done) {
          finish(null, parsed.value);
        }
      });
    });
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.command(['PING'], 500);
      return res === 'PONG';
    } catch {
      return false;
    }
  }
}

/**
 * Production multi-tier database read-through cache with:
 * - L1 In-Memory LRU cache with per-key TTL expiration and bounded size (1,000 entries)
 * - Optional L2 Redis distributed cache (`REDIS_URL`) with automatic fail-safe fallback
 * - Concurrent request stampede deduplication (`inFlight` promise coalescing)
 * - Prefix-based invalidation on every database mutation
 * - Per-namespace & global hit-rate telemetry (`getStats()`)
 */
@Injectable()
export class AppCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppCacheService.name);
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly maxEntries = 1000;
  private readonly redisPrefix = 'autopark:cache:';
  private sweepTimer: NodeJS.Timeout | null = null;
  private redis: LightweightRedisClient | null = null;

  private hits = 0;
  private misses = 0;
  private sets = 0;
  private invalidations = 0;
  private dedupedInFlight = 0;
  private redisHits = 0;
  private redisErrors = 0;
  private readonly nsStats = new Map<string, { hits: number; misses: number; invalidations: number }>();

  constructor() {
    this.sweepTimer = setInterval(() => this.sweepExpired(), 30_000);
    this.sweepTimer.unref?.();

    const redisUrl = (process.env.REDIS_URL || '').trim();
    if (redisUrl) {
      try {
        this.redis = new LightweightRedisClient(redisUrl);
      } catch (err) {
        this.logger.warn(`Invalid REDIS_URL ignored (falling back to in-memory LRU): ${(err as Error).message}`);
        this.redis = null;
      }
    }
  }

  async onModuleInit() {
    if (this.redis) {
      const ok = await this.redis.ping();
      if (ok) {
        this.logger.log('Database cache initialized in dual-tier Redis L2 + In-Memory L1 mode');
      } else {
        this.logger.warn('REDIS_URL unreachable at startup — running seamlessly on In-Memory L1 LRU cache');
      }
    }
  }

  onModuleDestroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.store.clear();
    this.inFlight.clear();
  }

  private getNamespace(key: string): string {
    const idx = key.indexOf(':');
    return idx > 0 ? key.slice(0, idx) : 'general';
  }

  private ensureNs(ns: string) {
    let row = this.nsStats.get(ns);
    if (!row) {
      row = { hits: 0, misses: 0, invalidations: 0 };
      this.nsStats.set(ns, row);
    }
    return row;
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
    this.ensureNs(this.getNamespace(key)).hits += 1;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    const effectiveTtl = Math.max(250, ttlMs);
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
      expiresAt: now + effectiveTtl,
    });
    this.sets += 1;

    if (this.redis) {
      try {
        const serialized = JSON.stringify(value);
        void this.redis
          .command(['PSETEX', `${this.redisPrefix}${key}`, String(effectiveTtl), serialized])
          .catch(() => {
            this.redisErrors += 1;
          });
      } catch {
        // Non-JSON-serializable values remain cached cleanly in L1 memory
      }
    }
  }

  /**
   * Cache-aside loader with stampede protection + optional L2 Redis hydration:
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

    const ns = this.getNamespace(key);
    const p = (async () => {
      try {
        // Optional L2 Redis lookup before hitting PostgreSQL
        if (this.redis) {
          try {
            const raw = await this.redis.command(['GET', `${this.redisPrefix}${key}`]);
            if (typeof raw === 'string') {
              const parsed = JSON.parse(raw) as T;
              this.hits += 1;
              this.redisHits += 1;
              this.ensureNs(ns).hits += 1;
              this.setLocalOnly(key, parsed, ttlMs);
              return parsed;
            }
          } catch {
            this.redisErrors += 1;
          }
        }

        this.misses += 1;
        this.ensureNs(ns).misses += 1;
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

  private setLocalOnly<T>(key: string, value: T, ttlMs: number): void {
    const now = Date.now();
    if (this.store.has(key)) this.store.delete(key);
    else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, { value, createdAt: now, expiresAt: now + Math.max(250, ttlMs) });
  }

  delete(key: string): boolean {
    const existed = this.store.delete(key);
    if (existed) {
      this.invalidations += 1;
      this.ensureNs(this.getNamespace(key)).invalidations += 1;
    }
    if (this.redis) {
      void this.redis.command(['DEL', `${this.redisPrefix}${key}`]).catch(() => {
        this.redisErrors += 1;
      });
    }
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
    if (removed > 0) {
      this.invalidations += removed;
      this.ensureNs(this.getNamespace(prefix)).invalidations += removed;
    }
    if (this.redis) {
      void this.redis
        .command(['KEYS', `${this.redisPrefix}${prefix}*`])
        .then((keys) => {
          if (Array.isArray(keys) && keys.length > 0) {
            return this.redis?.command(['DEL', ...keys]);
          }
          return null;
        })
        .catch(() => {
          this.redisErrors += 1;
        });
    }
    return removed;
  }

  clear(): number {
    const count = this.store.size;
    this.invalidations += count;
    this.store.clear();
    if (this.redis) {
      void this.redis
        .command(['KEYS', `${this.redisPrefix}*`])
        .then((keys) => {
          if (Array.isArray(keys) && keys.length > 0) {
            return this.redis?.command(['DEL', ...keys]);
          }
          return null;
        })
        .catch(() => {
          this.redisErrors += 1;
        });
    }
    return count;
  }

  getStats(): CacheStatsSnapshot {
    const total = this.hits + this.misses;
    const byNamespace: Record<string, CacheNamespaceStats> = {};
    for (const [ns, s] of this.nsStats.entries()) {
      const nsTotal = s.hits + s.misses;
      byNamespace[ns] = {
        hits: s.hits,
        misses: s.misses,
        invalidations: s.invalidations,
        hitRatePct: nsTotal > 0 ? Math.round((s.hits / nsTotal) * 1000) / 10 : 0,
      };
    }

    return {
      backend: this.redis ? 'redis+memory' : 'memory',
      redisConfigured: Boolean(this.redis),
      redisConnected: this.redis ? this.redis.isConnected() : false,
      entries: this.store.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      invalidations: this.invalidations,
      dedupedInFlight: this.dedupedInFlight,
      redisHits: this.redisHits,
      redisErrors: this.redisErrors,
      hitRatePct: total > 0 ? Math.round((this.hits / total) * 1000) / 10 : 0,
      byNamespace,
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
