/**
 * `HttpConfig.circuitBreaker.store` swaps the built-in per-process circuit
 * breaker state for any backend implementing `CircuitBreakerStore`, so
 * multiple server instances share one open/closed/half-open state instead of
 * each instance needing its own `failureThreshold` failures before opening
 * (which weakens the protection on N instances — the backend keeps getting
 * hit by N × failureThreshold requests before anything opens).
 *
 * This file is illustrative: it types against a minimal Redis-like client
 * shape but doesn't import a real Redis package.
 */
import { createRestClient, CircuitOpenError, type CircuitBreakerStore } from "rest-pipeline-js";

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "PX", ttlMs: number): Promise<unknown>;
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<unknown>;
}

declare const redis: RedisLike; // from your app's Redis client setup

function createRedisCircuitBreakerStore(redis: RedisLike): CircuitBreakerStore {
  return {
    async get(key) {
      const raw = await redis.get(key);
      return raw ? JSON.parse(raw) : null;
    },
    async set(key, state, ttlMs) {
      await redis.set(key, JSON.stringify(state), "PX", ttlMs);
    },
    // Optional but recommended: avoids the read-modify-write race between
    // concurrent requests on different instances incrementing failureCount
    // at the same time (without it, CircuitBreaker falls back to get+set,
    // which can under-count under heavy concurrent failure bursts — still
    // fail-safe, just less precise).
    async incrementCounter(key, field, ttlMs) {
      const counterKey = `${key}:${field}`;
      const n = await redis.incr(counterKey);
      if (n === 1) await redis.pexpire(counterKey, ttlMs);
      return n;
    },
  };
}

export const client = createRestClient({
  baseURL: "https://api.example.com",
  circuitBreaker: {
    failureThreshold: 5,
    openMs: 30_000,
    store: createRedisCircuitBreakerStore(redis),
    key: "api-example-com", // shared bucket name across all instances
  },
});

async function example() {
  try {
    await client.get("/flaky-endpoint");
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      // Rejected locally by *this* instance, based on state shared via Redis —
      // no network call was made, even though the failures that opened the
      // circuit may have happened on a different instance entirely.
    }
  }
}

void example;
