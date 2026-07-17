/**
 * `HttpConfig.cache.store` swaps the built-in per-process `TtlCache` for any
 * backend implementing `CacheStore` — here, Redis, so cached GET responses
 * are shared across every server instance behind your load balancer instead
 * of being cold on each one.
 *
 * This file is illustrative: it types against `ioredis`'s shape but doesn't
 * import it, so it has no effect on this package's own dependencies. Install
 * `ioredis` (or any client with an equivalent API) in your own project to use
 * it for real.
 */
import { createRestClient, type CacheStore, type ApiResponse } from "rest-pipeline-js";

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "PX", ttlMs: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  flushdb(): Promise<unknown>;
}

function createRedisCacheStore(redis: RedisLike): CacheStore<ApiResponse<unknown>> {
  return {
    async get(key) {
      const raw = await redis.get(key);
      return raw ? (JSON.parse(raw) as ApiResponse<unknown>) : undefined;
    },
    async set(key, value, ttlMs) {
      await redis.set(key, JSON.stringify(value), "PX", ttlMs);
    },
    async delete(key) {
      await redis.del(key);
    },
    async clear() {
      await redis.flushdb();
    },
    // deleteWhere() is intentionally omitted: pattern-matched deletion needs a
    // Redis SCAN over keys, which is store-specific. Without it,
    // client.invalidateCache() resolves to 0 rather than throwing — use
    // client.clearCache() (backed by flushdb()) instead, or implement
    // deleteWhere() with SCAN + a key-naming convention if you need it.
  };
}

declare const redis: RedisLike; // from your app's Redis client setup

export const client = createRestClient({
  baseURL: "https://api.example.com",
  cache: {
    enabled: true,
    ttlMs: 60_000,
    store: createRedisCacheStore(redis),
  },
});
