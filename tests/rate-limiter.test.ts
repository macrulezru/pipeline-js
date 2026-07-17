import { RateLimiter } from "../src/rate-limiter";
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
  it("без конфига (нет ограничений) — acquire() разрешает сразу, release ничего не ждёт", async () => {
    const limiter = new RateLimiter({});
    const release = await limiter.acquire();
    expect(typeof release).toBe("function");
    release();
  });

  it("maxConcurrent: ограничивает число одновременных захватов, следующий ждёт release()", async () => {
    const limiter = new RateLimiter({ maxConcurrent: 1 });

    const release1 = await limiter.acquire();

    let secondAcquired = false;
    const secondPromise = limiter.acquire().then((release2) => {
      secondAcquired = true;
      return release2;
    });

    // Даём микротаскам прокрутиться — второй acquire не должен разрешиться,
    // пока не освобождён первый слот
    await Promise.resolve();
    await Promise.resolve();
    expect(secondAcquired).toBe(false);

    release1();
    const release2 = await secondPromise;
    expect(secondAcquired).toBe(true);
    release2();
  });

  it("maxConcurrent: drainQueue() пропускает следующего в очереди по FIFO", async () => {
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

  it("maxRequestsPerInterval: разрешает до лимита в пределах окна без ожидания", async () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({ maxRequestsPerInterval: 2, intervalMs: 1000 });

    const r1 = await limiter.acquire();
    r1();
    const r2 = await limiter.acquire();
    r2();

    // Третий запрос должен ждать до конца окна — проверяем, что acquire() не
    // резолвится синхронно/на текущем тике
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

  it("maxRequestsPerInterval: после истечения окна снова разрешает без ожидания", async () => {
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
});

describe("RateLimiter with store (distributed)", () => {
  it("делегирует sliding-window счётчик store.incrementWindow() с заданным key", async () => {
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

  it("ждёт и повторяет incrementWindow(), пока счётчик не окажется в пределах лимита", async () => {
    vi.useFakeTimers();
    const store = new FakeRateLimiterStore();
    // Предзаполняем окно на maxReqs, чтобы следующий инкремент сразу превысил лимит
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

    // После истечения окна следующий retry должен пройти
    await vi.advanceTimersByTimeAsync(1001);
    expect(resolved).toBe(true);
    expect(store.incrementWindowCalls.length).toBe(2);

    vi.useRealTimers();
  });

  it("делегирует concurrency-слот store.acquireConcurrencySlot() и вызывает release при отпускании", async () => {
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

  it("без явного key каждый инстанс RateLimiter получает собственный ключ", async () => {
    const store = new FakeRateLimiterStore();
    const limiterA = new RateLimiter({ maxRequestsPerInterval: 10, intervalMs: 1000, store });
    const limiterB = new RateLimiter({ maxRequestsPerInterval: 10, intervalMs: 1000, store });

    (await limiterA.acquire())();
    (await limiterB.acquire())();

    const keys = store.incrementWindowCalls.map((c) => c.key);
    expect(keys[0]).not.toBe(keys[1]);
  });
});
