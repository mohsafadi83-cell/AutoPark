import { AppCacheService } from './cache.module';

describe('AppCacheService — Database Read-Through Cache', () => {
  let cache: AppCacheService;

  beforeEach(() => {
    cache = new AppCacheService();
  });

  afterEach(() => {
    cache.onModuleDestroy();
  });

  test('serves repeated reads from cache and reduces DB calls', async () => {
    let dbCalls = 0;
    const loader = async () => {
      dbCalls += 1;
      return { spaces: 12 };
    };

    const r1 = await cache.getOrSet('parking:spaces:all', 5000, loader);
    const r2 = await cache.getOrSet('parking:spaces:all', 5000, loader);
    const r3 = await cache.getOrSet('parking:spaces:all', 5000, loader);

    expect(r1).toEqual({ spaces: 12 });
    expect(r2).toEqual({ spaces: 12 });
    expect(r3).toEqual({ spaces: 12 });
    expect(dbCalls).toBe(1);

    const stats = cache.getStats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(2);
    expect(stats.hitRatePct).toBeGreaterThan(60);
  });

  test('deduplicates 10 concurrent cache-miss requests into 1 DB query (stampede protection)', async () => {
    let dbCalls = 0;
    const loader = async () => {
      dbCalls += 1;
      await new Promise((r) => setTimeout(r, 25));
      return { ok: true, id: dbCalls };
    };

    const results = await Promise.all(
      Array.from({ length: 10 }, () => cache.getOrSet('industrial:runtime_settings', 10000, loader)),
    );

    expect(dbCalls).toBe(1);
    expect(results.every((r) => r.id === 1)).toBe(true);
    expect(cache.getStats().dedupedInFlight).toBe(9);
  });

  test('invalidates all matching keys by prefix on database mutation', async () => {
    let dbCalls = 0;
    const loader = async () => ++dbCalls;

    await cache.getOrSet('parking:dashboard', 10000, loader);
    await cache.getOrSet('parking:spaces:all', 10000, loader);
    await cache.getOrSet('industrial:runtime_settings', 10000, loader);
    expect(dbCalls).toBe(3);

    const removed = cache.invalidatePrefix('parking:');
    expect(removed).toBe(2);

    // parking keys reload from DB, industrial stays cached!
    expect(await cache.getOrSet('parking:dashboard', 10000, loader)).toBe(4);
    expect(await cache.getOrSet('industrial:runtime_settings', 10000, loader)).toBe(3);
  });

  test('expires entries cleanly after TTL', async () => {
    let dbCalls = 0;
    const v1 = await cache.getOrSet('alarms:counts', 260, async () => ++dbCalls);
    expect(v1).toBe(1);
    await new Promise((r) => setTimeout(r, 310));
    const v2 = await cache.getOrSet('alarms:counts', 260, async () => ++dbCalls);
    expect(v2).toBe(2);
  });

  test('tracks per-namespace hit rates and supports full cache flush', async () => {
    await cache.getOrSet('auth:user:u1', 10000, async () => ({ id: 'u1' }));
    await cache.getOrSet('auth:user:u1', 10000, async () => ({ id: 'u1' }));
    await cache.getOrSet('vehicles:list:all', 10000, async () => [{ plate: '10-45821' }]);

    const stats = cache.getStats();
    expect(stats.backend).toBe('memory');
    expect(stats.byNamespace.auth.hits).toBe(1);
    expect(stats.byNamespace.auth.misses).toBe(1);
    expect(stats.byNamespace.auth.hitRatePct).toBe(50);
    expect(stats.byNamespace.vehicles.misses).toBe(1);

    const flushed = cache.clear();
    expect(flushed).toBe(2);
    expect(cache.getStats().entries).toBe(0);
  });
});
