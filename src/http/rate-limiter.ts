import type { RateLimitConfig, RateLimitControl } from '../types.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateKey(): string {
  const g: any = globalThis as any;
  if (g.crypto?.randomUUID) return `rate-limiter-${g.crypto.randomUUID()}`;
  return `rate-limiter-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * A semaphore for limiting concurrent requests (maxConcurrent)
 * and a sliding window (maxRequestsPerInterval / intervalMs).
 *
 * Without `config.store` — an exact in-memory algorithm within a single
 * process (behavior unchanged). With `config.store` — delegates both
 * primitives to a distributed backend (see RateLimiterStore), which allows
 * multiple server instances to share a single limit.
 */
export class RateLimiter {
  private activeCount = 0;
  private waitQueue: Array<() => void> = [];

  // Sliding-window counters
  private windowTimestamps: number[] = [];

  private readonly key: string;

  /** Timestamp (Date.now()) until which acquire() must wait — see throttleFor(). */
  private throttledUntil = 0;

  constructor(private config: RateLimitConfig) {
    this.key = config.key ?? generateKey();
  }

  /**
   * Forces the next call(s) to acquire() to wait at least ms ms before
   * proceeding — proactive throttling based on the response's rate-limit
   * headers (see RateLimitConfig.onRateLimitHeaders), in addition to the
   * regular maxConcurrent/maxRequestsPerInterval. Works both in in-memory
   * mode and in store-based mode (waits before delegating to the store).
   * Takes the maximum with any already-set wait — a repeated (shorter) call
   * does not shrink an already-scheduled pause.
   */
  throttleFor(ms: number): void {
    if (ms <= 0) return;
    const until = Date.now() + ms;
    if (until > this.throttledUntil) this.throttledUntil = until;
  }

  /** The control object passed to RateLimitConfig.onRateLimitHeaders. */
  asControl(): RateLimitControl {
    return { throttleFor: (ms) => this.throttleFor(ms) };
  }

  private async waitForThrottle(): Promise<void> {
    const remaining = this.throttledUntil - Date.now();
    if (remaining > 0) await sleep(remaining);
  }

  /**
   * Acquire a slot. Returns a release function — must be called after the request completes.
   */
  async acquire(): Promise<() => void> {
    await this.waitForThrottle();

    if (this.config.store) {
      return this._acquireViaStore();
    }

    await this.waitForWindow();
    await this.waitForSlot();
    this.activeCount++;
    this.windowTimestamps.push(Date.now());

    return () => {
      this.activeCount--;
      this.drainQueue();
    };
  }

  private async _acquireViaStore(): Promise<() => void> {
    const store = this.config.store!;
    const intervalMs = this.config.intervalMs ?? 1000;
    const maxReqs = this.config.maxRequestsPerInterval;

    if (maxReqs) {
      // Fixed-window counter: loop until we're within the limit.
      // "Extra" increments naturally decay as the window TTL expires on the
      // store side — no busy-loop occurs, thanks to sleep(intervalMs).
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const count = await store.incrementWindow(this.key, intervalMs);
        if (count <= maxReqs) break;
        await sleep(intervalMs);
      }
    }

    let releaseSlot: (() => void | Promise<void>) | undefined;
    if (this.config.maxConcurrent) {
      const leaseMs = this.config.leaseMs ?? 30_000;
      releaseSlot = await store.acquireConcurrencySlot(
        this.key,
        this.config.maxConcurrent,
        leaseMs,
      );
    }

    return () => {
      void releaseSlot?.();
    };
  }

  private async waitForSlot(): Promise<void> {
    const max = this.config.maxConcurrent;
    if (!max) return;

    if (this.activeCount < max) return;

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  private async waitForWindow(): Promise<void> {
    const maxReqs = this.config.maxRequestsPerInterval;
    const intervalMs = this.config.intervalMs ?? 1000;
    if (!maxReqs) return;

    // Remove stale timestamps
    const now = Date.now();
    this.windowTimestamps = this.windowTimestamps.filter(
      (ts) => now - ts < intervalMs
    );

    if (this.windowTimestamps.length < maxReqs) return;

    // Wait until the end of the current window
    const oldest = this.windowTimestamps[0];
    const waitMs = intervalMs - (now - oldest) + 1;
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));

    // Clean up again after waiting
    const now2 = Date.now();
    this.windowTimestamps = this.windowTimestamps.filter(
      (ts) => now2 - ts < intervalMs
    );
  }

  private drainQueue(): void {
    const max = this.config.maxConcurrent;
    if (!max) return;

    while (this.activeCount < max && this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      next?.();
    }
  }
}
