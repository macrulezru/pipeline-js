import { RateLimiter } from "../src/http/rate-limiter";
import type { RateLimiterStore } from "../src/types";

/** In-memory fake standing in for a distributed store (e.g. Redis) in tests. */
class FakeRateLimiterStore implements RateLimiterStore {
  windows = new Map<string, { count: number; expiresAt: number }>();
  concurrentHolders = new Map<string, number>();
  incrementWindowCalls: Array<{ key: string; intervalMs: number }> = [];
  acquireSlotCalls: Array<{ key: string; maxConcurrent: number; leaseMs: number }> = [];

  async incrementWindow(key: string, intervalMs: number): Promise<number> {
    this.incrementWindowCalls.push({ key, intervalMs });
    const now = Date.now();
    const entry = this.windows.get(key);
    if (!entry || now >= entry.expiresAt) {
      this.windows.set(key, { count: 1, expiresAt: now + intervalMs });
      return 1;
    }
    entry.count++;
    return entry.count;
  }

  async acquireConcurrencySlot(
    key: string,
    maxConcurrent: number,
    leaseMs: number,
  ): Promise<() => void> {
    this.acquireSlotCalls.push({ key, maxConcurrent, leaseMs });
    const current = this.concurrentHolders.get(key) ?? 0;
    this.concurrentHolders.set(key, current + 1);
    return () => {
      this.concurrentHolders.set(key, (this.concurrentHolders.get(key) ?? 1) - 1);
    };
  }
}

describe("RateLimiter", () => {
  it("no config (no limits) — acquire() resolves immediately, release doesn't wait for anything", async () => {
    const limiter = new RateLimiter({});
    const release = await limiter.acquire();
    expect(typeof release).toBe("function");
    release();
  });

  it("maxConcurrent: limits the number of concurrent acquisitions, the next one waits for release()", async () => {
    const limiter = new RateLimiter({ maxConcurrent: 1 });

    const release1 = await limiter.acquire();

    let secondAcquired = false;
    const secondPromise = limiter.acquire().then((release2) => {
      secondAcquired = true;
      return release2;
    });

    // Let microtasks flush — the second acquire should not resolve
    // until the first slot is released
    await Promise.resolve();
    await Promise.resolve();
    expect(secondAcquired).toBe(false);

    release1();
    const release2 = await secondPromise;
    expect(secondAcquired).toBe(true);
    release2();
  });

  it("maxConcurrent: drainQueue() lets the next one in the queue through in FIFO order", async () => {
    const limiter = new RateLimiter({ maxConcurrent: 1 });
    const order: number[] = [];

    const release1 = await limiter.acquire();
    const p2 = limiter.acquire().then((r) => {
      order.push(2);
      return r;
    });
    const p3 = limiter.acquire().then((r) => {
      order.push(3);
      return r;
    });

    release1();
    const release2 = await p2;
    release2();
    await p3;

    expect(order).toEqual([2, 3]);
  });

  it("maxRequestsPerInterval: allows up to the limit within the window without waiting", async () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({ maxRequestsPerInterval: 2, intervalMs: 1000 });

    const r1 = await limiter.acquire();
    r1();
    const r2 = await limiter.acquire();
    r2();

    // The third request should wait until the end of the window — verify that
    // acquire() does not resolve synchronously/on the current tick
    let resolved = false;
    limiter.acquire().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1001);
    expect(resolved).toBe(true);

    vi.useRealTimers();
  });

  it("maxRequestsPerInterval: allows again without waiting after the window expires", async () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({ maxRequestsPerInterval: 1, intervalMs: 100 });

    const r1 = await limiter.acquire();
    r1();

    await vi.advanceTimersByTimeAsync(150);

    let resolved = false;
    limiter.acquire().then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);

    vi.useRealTimers();
  });

  describe("throttleFor / asControl (proactive throttling based on rate-limit headers)", () => {
    it("throttleFor(ms) makes the next acquire() wait at least ms ms", async () => {
      vi.useFakeTimers();
      const limiter = new RateLimiter({});

      limiter.throttleFor(500);

      let resolved = false;
      limiter.acquire().then(() => {
        resolved = true;
      });

      await vi.advanceTimersByTimeAsync(499);
      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(resolved).toBe(true);

      vi.useRealTimers();
    });

    it("throttleFor(0) and negative values — no-op", async () => {
      const limiter = new RateLimiter({});
      limiter.throttleFor(0);
      limiter.throttleFor(-100);
      const release = await limiter.acquire(); // should not wait
      release();
    });

    it("calling throttleFor again with a smaller value does not shorten an already scheduled wait", async () => {
      vi.useFakeTimers();
      const limiter = new RateLimiter({});

      limiter.throttleFor(1000);
      limiter.throttleFor(100); // shorter — should not override the longer already-scheduled wait

      let resolved = false;
      limiter.acquire().then(() => {
        resolved = true;
      });

      await vi.advanceTimersByTimeAsync(999);
      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(resolved).toBe(true);

      vi.useRealTimers();
    });

    it("asControl() returns an object whose throttleFor delegates to the same limiter", async () => {
      vi.useFakeTimers();
      const limiter = new RateLimiter({});
      const control = limiter.asControl();

      control.throttleFor(200);

      let resolved = false;
      limiter.acquire().then(() => {
        resolved = true;
      });

      await vi.advanceTimersByTimeAsync(199);
      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(resolved).toBe(true);

      vi.useRealTimers();
    });

    it("throttleFor is applied even before delegating to store-based mode", async () => {
      vi.useFakeTimers();
      const store: import("../src/types").RateLimiterStore = {
        incrementWindow: vi.fn(async () => 1),
      };
      const limiter = new RateLimiter({ maxRequestsPerInterval: 5, intervalMs: 1000, store });

      limiter.throttleFor(300);

      let resolved = false;
      limiter.acquire().then(() => {
        resolved = true;
      });

      await vi.advanceTimersByTimeAsync(299);
      expect(resolved).toBe(false);
      expect(store.incrementWindow).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(resolved).toBe(true);
      expect(store.incrementWindow).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});

describe("RateLimiter with store (distributed)", () => {
  it("delegates the sliding-window counter to store.incrementWindow() with the given key", async () => {
    const store = new FakeRateLimiterStore();
    const limiter = new RateLimiter({
      maxRequestsPerInterval: 5,
      intervalMs: 1000,
      store,
      key: "bucket-a",
    });

    const release = await limiter.acquire();
    release();

    expect(store.incrementWindowCalls).toEqual([{ key: "bucket-a", intervalMs: 1000 }]);
  });

  it("waits and retries incrementWindow() until the counter is within the limit", async () => {
    vi.useFakeTimers();
    const store = new FakeRateLimiterStore();
    // Pre-fill the window to maxReqs so the next increment immediately exceeds the limit
    store.windows.set("bucket-b", { count: 2, expiresAt: Date.now() + 1000 });

    const limiter = new RateLimiter({
      maxRequestsPerInterval: 2,
      intervalMs: 1000,
      store,
      key: "bucket-b",
    });

    let resolved = false;
    limiter.acquire().then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false);
    expect(store.incrementWindowCalls.length).toBe(1);

    // After the window expires, the next retry should succeed
    await vi.advanceTimersByTimeAsync(1001);
    expect(resolved).toBe(true);
    expect(store.incrementWindowCalls.length).toBe(2);

    vi.useRealTimers();
  });

  it("delegates the concurrency slot to store.acquireConcurrencySlot() and calls release when released", async () => {
    const store = new FakeRateLimiterStore();
    const limiter = new RateLimiter({
      maxConcurrent: 3,
      leaseMs: 5000,
      store,
      key: "bucket-c",
    });

    const release = await limiter.acquire();
    expect(store.acquireSlotCalls).toEqual([{ key: "bucket-c", maxConcurrent: 3, leaseMs: 5000 }]);
    expect(store.concurrentHolders.get("bucket-c")).toBe(1);

    release();
    expect(store.concurrentHolders.get("bucket-c")).toBe(0);
  });

  it("without an explicit key, each RateLimiter instance gets its own key", async () => {
    const store = new FakeRateLimiterStore();
    const limiterA = new RateLimiter({ maxRequestsPerInterval: 10, intervalMs: 1000, store });
    const limiterB = new RateLimiter({ maxRequestsPerInterval: 10, intervalMs: 1000, store });

    (await limiterA.acquire())();
    (await limiterB.acquire())();

    const keys = store.incrementWindowCalls.map((c) => c.key);
    expect(keys[0]).not.toBe(keys[1]);
  });
});
