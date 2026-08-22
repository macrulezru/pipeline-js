import type { RateLimitConfig, RateLimitControl } from '../types.js';
/**
 * A semaphore for limiting concurrent requests (maxConcurrent)
 * and a sliding window (maxRequestsPerInterval / intervalMs).
 *
 * Without `config.store` — an exact in-memory algorithm within a single
 * process (behavior unchanged). With `config.store` — delegates both
 * primitives to a distributed backend (see RateLimiterStore), which allows
 * multiple server instances to share a single limit.
 */
export declare class RateLimiter {
    private config;
    private activeCount;
    private waitQueue;
    private windowTimestamps;
    private readonly key;
    /** Timestamp (Date.now()) until which acquire() must wait — see throttleFor(). */
    private throttledUntil;
    constructor(config: RateLimitConfig);
    /**
     * Forces the next call(s) to acquire() to wait at least ms ms before
     * proceeding — proactive throttling based on the response's rate-limit
     * headers (see RateLimitConfig.onRateLimitHeaders), in addition to the
     * regular maxConcurrent/maxRequestsPerInterval. Works both in in-memory
     * mode and in store-based mode (waits before delegating to the store).
     * Takes the maximum with any already-set wait — a repeated (shorter) call
     * does not shrink an already-scheduled pause.
     */
    throttleFor(ms: number): void;
    /** The control object passed to RateLimitConfig.onRateLimitHeaders. */
    asControl(): RateLimitControl;
    private waitForThrottle;
    /**
     * Acquire a slot. Returns a release function — must be called after the request completes.
     */
    acquire(): Promise<() => void>;
    private _acquireViaStore;
    private waitForSlot;
    private waitForWindow;
    private drainQueue;
}
