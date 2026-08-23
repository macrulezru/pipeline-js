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
    /**
     * Waits until there's room in the sliding window, then reserves the slot
     * (records the timestamp) before returning — atomically with the capacity
     * check, so two overlapping acquire() calls can't both see "room" and
     * both proceed (a check-then-act race that a separate check + later
     * push(Date.now()) in the caller would otherwise allow).
     */
    private waitForWindow;
    /**
     * Wakes queued waiters up to `maxConcurrent`, reserving (incrementing
     * activeCount for) each one synchronously before resolving it — resolving
     * a waiter's promise only schedules its continuation as a microtask, so
     * without reserving here first, a single freed slot could otherwise wake
     * more than one waiter in the same synchronous pass (activeCount wouldn't
     * reflect the first wakeup yet when the loop checks again).
     */
    private drainQueue;
}
