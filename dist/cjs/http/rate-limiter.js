"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = void 0;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function generateKey() {
    var _a;
    const g = globalThis;
    if ((_a = g.crypto) === null || _a === void 0 ? void 0 : _a.randomUUID)
        return `rate-limiter-${g.crypto.randomUUID()}`;
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
class RateLimiter {
    constructor(config) {
        var _a;
        this.config = config;
        this.activeCount = 0;
        this.waitQueue = [];
        // Sliding-window counters
        this.windowTimestamps = [];
        /** Timestamp (Date.now()) until which acquire() must wait — see throttleFor(). */
        this.throttledUntil = 0;
        this.key = (_a = config.key) !== null && _a !== void 0 ? _a : generateKey();
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
    throttleFor(ms) {
        if (ms <= 0)
            return;
        const until = Date.now() + ms;
        if (until > this.throttledUntil)
            this.throttledUntil = until;
    }
    /** The control object passed to RateLimitConfig.onRateLimitHeaders. */
    asControl() {
        return { throttleFor: (ms) => this.throttleFor(ms) };
    }
    async waitForThrottle() {
        const remaining = this.throttledUntil - Date.now();
        if (remaining > 0)
            await sleep(remaining);
    }
    /**
     * Acquire a slot. Returns a release function — must be called after the request completes.
     */
    async acquire() {
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
    async _acquireViaStore() {
        var _a, _b;
        const store = this.config.store;
        const intervalMs = (_a = this.config.intervalMs) !== null && _a !== void 0 ? _a : 1000;
        const maxReqs = this.config.maxRequestsPerInterval;
        if (maxReqs) {
            // Fixed-window counter: loop until we're within the limit.
            // "Extra" increments naturally decay as the window TTL expires on the
            // store side — no busy-loop occurs, thanks to sleep(intervalMs).
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const count = await store.incrementWindow(this.key, intervalMs);
                if (count <= maxReqs)
                    break;
                await sleep(intervalMs);
            }
        }
        let releaseSlot;
        if (this.config.maxConcurrent) {
            const leaseMs = (_b = this.config.leaseMs) !== null && _b !== void 0 ? _b : 30000;
            releaseSlot = await store.acquireConcurrencySlot(this.key, this.config.maxConcurrent, leaseMs);
        }
        return () => {
            void (releaseSlot === null || releaseSlot === void 0 ? void 0 : releaseSlot());
        };
    }
    async waitForSlot() {
        const max = this.config.maxConcurrent;
        if (!max)
            return;
        if (this.activeCount < max)
            return;
        return new Promise((resolve) => {
            this.waitQueue.push(resolve);
        });
    }
    async waitForWindow() {
        var _a;
        const maxReqs = this.config.maxRequestsPerInterval;
        const intervalMs = (_a = this.config.intervalMs) !== null && _a !== void 0 ? _a : 1000;
        if (!maxReqs)
            return;
        // Remove stale timestamps
        const now = Date.now();
        this.windowTimestamps = this.windowTimestamps.filter((ts) => now - ts < intervalMs);
        if (this.windowTimestamps.length < maxReqs)
            return;
        // Wait until the end of the current window
        const oldest = this.windowTimestamps[0];
        const waitMs = intervalMs - (now - oldest) + 1;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        // Clean up again after waiting
        const now2 = Date.now();
        this.windowTimestamps = this.windowTimestamps.filter((ts) => now2 - ts < intervalMs);
    }
    drainQueue() {
        const max = this.config.maxConcurrent;
        if (!max)
            return;
        while (this.activeCount < max && this.waitQueue.length > 0) {
            const next = this.waitQueue.shift();
            next === null || next === void 0 ? void 0 : next();
        }
    }
}
exports.RateLimiter = RateLimiter;
