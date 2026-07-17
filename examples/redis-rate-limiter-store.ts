/**
 * `HttpConfig.rateLimit.store` swaps the built-in per-process rate limiter for
 * any backend implementing `RateLimiterStore`, so multiple server instances
 * behind a load balancer share one limit instead of each instance enforcing
 * its own (which on N instances effectively multiplies the real-world limit
 * by N).
 *
 * This file is illustrative: it types against a minimal Redis-like client
 * shape but doesn't import a real Redis package. Install `ioredis` (or
 * equivalent) in your own project and adapt the calls below.
 */
import { createRestClient, type RateLimiterStore } from "rest-pipeline-js";

interface RedisLike {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<unknown>;
  /** Runs a Lua script atomically — used for the concurrency slot below. */
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

declare const redis: RedisLike; // from your app's Redis client setup

function createRedisRateLimiterStore(redis: RedisLike): RateLimiterStore {
  return {
    async incrementWindow(key, intervalMs) {
      const count = await redis.incr(key);
      if (count === 1) {
        // Only the first increment sets the expiry — matches `INCR; PEXPIRE NX`.
        await redis.pexpire(key, intervalMs);
      }
      return count;
    },

    async acquireConcurrencySlot(key, maxConcurrent, leaseMs) {
      // A real implementation needs an atomic "increment-if-below-cap" —
      // typically a small Lua script so the check-then-increment can't race
      // across processes. Sketch (adapt to your Redis client's eval API):
      //
      //   local current = redis.call('GET', KEYS[1]) or 0
      //   if tonumber(current) < tonumber(ARGV[1]) then
      //     redis.call('INCR', KEYS[1])
      //     redis.call('PEXPIRE', KEYS[1], ARGV[2])
      //     return 1
      //   end
      //   return 0
      //
      // Poll until the script reports success, then return a release
      // function that decrements the counter.
      const slotKey = `${key}:concurrency`;
      while (true) {
        const acquired = await redis.eval(
          `local current = tonumber(redis.call('GET', KEYS[1]) or '0')
           if current < tonumber(ARGV[1]) then
             redis.call('INCR', KEYS[1])
             redis.call('PEXPIRE', KEYS[1], ARGV[2])
             return 1
           end
           return 0`,
          1,
          slotKey,
          maxConcurrent,
          leaseMs,
        );
        if (acquired === 1) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      let released = false;
      return async () => {
        if (released) return;
        released = true;
        await redis.eval(
          `local current = tonumber(redis.call('GET', KEYS[1]) or '0')
           if current > 0 then redis.call('DECR', KEYS[1]) end
           return 1`,
          1,
          slotKey,
        );
      };
    },
  };
}

export const client = createRestClient({
  baseURL: "https://api.example.com",
  rateLimit: {
    maxRequestsPerInterval: 100,
    intervalMs: 60_000,
    maxConcurrent: 20,
    store: createRedisRateLimiterStore(redis),
    key: "api-example-com", // shared bucket name across all instances
  },
});
