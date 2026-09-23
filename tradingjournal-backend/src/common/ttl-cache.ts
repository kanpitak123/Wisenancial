/**
 * Minimal in-process TTL cache. Not for correctness-critical data — only for collapsing
 * bursts of near-simultaneous, identical reads (e.g. the 6 Analytics tabs one page load
 * fires) into a single DB round trip. Callers must explicitly `invalidate()` on any write
 * that could make a cached read stale.
 *
 * Per-process, in-memory only — each backend process holds its own independent copy.
 * If the backend ever runs as multiple instances (horizontal scaling, PM2 cluster mode,
 * multiple dynos/pods), an invalidate() on one instance does NOT reach the others' caches,
 * so a stale read is possible on a different instance for up to the TTL. Fine for a single
 * dev-server instance; revisit (e.g. move to Redis) before scaling the backend out.
 */
export class TtlCache<V> {
  private readonly store = new Map<
    string,
    { value: V; expiresAt: number }
  >();

  constructor(private readonly ttlMs: number) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /** Fetches from cache, or computes + caches on a miss. */
  async getOrSet(
    key: string,
    compute: () => Promise<V>,
  ): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await compute();
    this.set(key, value);
    return value;
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Drops every entry whose key starts with `prefix` (e.g. all ranges for one portfolio). */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }
}
