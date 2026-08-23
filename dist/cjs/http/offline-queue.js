"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OfflineQueue = exports.OfflineQueuedError = void 0;
exports.defaultShouldQueue = defaultShouldQueue;
exports.defaultIsOnline = defaultIsOnline;
exports.defaultOnOnlineChange = defaultOnOnlineChange;
/**
 * Thrown by `client.post()`/etc. instead of making a network call when the
 * request was queued for later (offline, `shouldQueue` matched). Carries
 * `queueId` so calling code can correlate it with the eventual
 * `onFlushSuccess`/`onFlushError` callback, e.g. to update a "pending sync"
 * badge for that specific action.
 */
class OfflineQueuedError extends Error {
    constructor(queueId, method, url) {
        super(`Request queued while offline, will be sent once back online: ${method} ${url}`);
        this.name = "OfflineQueuedError";
        this.queueId = queueId;
        this.method = method;
        this.url = url;
    }
}
exports.OfflineQueuedError = OfflineQueuedError;
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/** Default `shouldQueue`: queue mutating requests, never GET (a stale read isn't useful to "replay" later). */
function defaultShouldQueue(info) {
    return MUTATING_METHODS.has(info.method.toUpperCase());
}
/** Default `isOnline`: `navigator.onLine` in browsers, `true` everywhere else. */
function defaultIsOnline() {
    var _a;
    const nav = globalThis.navigator;
    return (_a = nav === null || nav === void 0 ? void 0 : nav.onLine) !== null && _a !== void 0 ? _a : true;
}
/** Default `onOnlineChange`: the browser's `window` `"online"` event. No-op outside a browser. */
function defaultOnOnlineChange(callback) {
    const win = globalThis.window;
    if (!(win === null || win === void 0 ? void 0 : win.addEventListener))
        return undefined;
    win.addEventListener("online", callback);
    return () => { var _a; return (_a = win.removeEventListener) === null || _a === void 0 ? void 0 : _a.call(win, "online", callback); };
}
function generateId() {
    var _a;
    const g = globalThis;
    if ((_a = g.crypto) === null || _a === void 0 ? void 0 : _a.randomUUID)
        return g.crypto.randomUUID();
    return `q-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
/**
 * Framework-agnostic queue engine: persists queued requests, replays them
 * sequentially on flush, and can auto-flush on reconnect. Doesn't know
 * anything about axios/HTTP internals itself — `createRestClient()` wires it
 * up via `sendReplay` and `toApiError`.
 */
class OfflineQueue {
    constructor(config, sendReplay, toApiError) {
        var _a, _b;
        this.config = config;
        this.sendReplay = sendReplay;
        this.toApiError = toApiError;
        this.queue = [];
        this.flushing = false;
        this.hydrated = this.hydrate();
        this.unsubscribe =
            (_b = ((_a = this.config.onOnlineChange) !== null && _a !== void 0 ? _a : defaultOnOnlineChange)(() => {
                void this.flush();
            })) !== null && _b !== void 0 ? _b : undefined;
    }
    async hydrate() {
        try {
            const loaded = await this.config.persistAdapter.load();
            if (loaded)
                this.queue = loaded;
        }
        catch {
            // Start with an empty queue if the persisted snapshot can't be read.
        }
    }
    async persist() {
        try {
            await this.config.persistAdapter.save(this.queue);
        }
        catch {
            // Persisting is best-effort — the in-memory queue is still authoritative
            // for the lifetime of this process either way.
        }
    }
    isOnline() {
        var _a;
        return ((_a = this.config.isOnline) !== null && _a !== void 0 ? _a : defaultIsOnline)();
    }
    shouldQueue(info) {
        var _a;
        return ((_a = this.config.shouldQueue) !== null && _a !== void 0 ? _a : defaultShouldQueue)(info);
    }
    /** Queues one request, persists the updated queue, and returns the new entry. */
    async enqueue(info) {
        var _a;
        await this.hydrated;
        const entry = {
            id: generateId(),
            method: info.method.toUpperCase(),
            url: info.url,
            data: info.data,
            params: info.params,
            headers: info.headers,
            idempotencyKey: (_a = info.idempotencyKey) !== null && _a !== void 0 ? _a : generateId(),
            queuedAt: Date.now(),
        };
        this.queue.push(entry);
        if (this.config.maxQueueSize && this.queue.length > this.config.maxQueueSize) {
            this.queue.splice(0, this.queue.length - this.config.maxQueueSize);
        }
        await this.persist();
        return entry;
    }
    /** Current queue contents, oldest first. */
    async getAll() {
        await this.hydrated;
        return [...this.queue];
    }
    /**
     * Attempts each queued request once, oldest first, stopping as soon as
     * `isOnline()` reports false again (leaving the rest queued for the next
     * flush). A request that fails with a genuine HTTP error (not "still
     * offline") is removed from the queue and reported via `onFlushError` —
     * it does not block the remaining entries. A request that fails with no
     * HTTP status at all (a network-level error, indistinguishable here from
     * "actually still offline") is left queued and retried on the next flush,
     * without retrying it again within this same call.
     *
     * This is deliberately a single pass per call, not a backoff loop —
     * `RequestExecutor`'s `retry`/`jitterStrategy` already own that job for an
     * individual attempt; a queue flush is a coarser retry cycle triggered by
     * reconnect events (or a manual call), not a tight retry loop against a
     * possibly still-recovering backend.
     */
    async flush() {
        var _a, _b, _c, _d;
        await this.hydrated;
        // Guard against overlapping calls (e.g. a manual flushQueue() while an
        // auto-flush from onOnlineChange is already in flight) — without this,
        // both would read the same queue[0] and could replay it twice.
        if (this.flushing)
            return;
        this.flushing = true;
        try {
            while (this.queue.length > 0) {
                if (!this.isOnline())
                    return;
                const next = this.queue[0];
                try {
                    const response = await this.sendReplay(next);
                    this.removeById(next.id);
                    await this.persist();
                    (_b = (_a = this.config).onFlushSuccess) === null || _b === void 0 ? void 0 : _b.call(_a, next, response);
                }
                catch (err) {
                    if (!this.isOnline())
                        return; // connectivity dropped mid-flush — leave it queued
                    const apiError = this.toApiError(err);
                    if (apiError.status !== undefined) {
                        // A real response from the backend rejected it — don't retry
                        // forever, surface it and move on to the rest of the queue.
                        this.removeById(next.id);
                        await this.persist();
                        (_d = (_c = this.config).onFlushError) === null || _d === void 0 ? void 0 : _d.call(_c, next, apiError);
                    }
                    else {
                        // No HTTP status at all — a network-level failure indistinguishable
                        // from "still offline" despite isOnline() saying otherwise. Leave
                        // it queued; don't spin on the same entry within this call.
                        return;
                    }
                }
            }
        }
        finally {
            this.flushing = false;
        }
    }
    /**
     * Removes a queue entry by id rather than shift()ing the front — `next`
     * may no longer be at index 0 by the time an await resolves (e.g. a
     * concurrent enqueue() trimmed the front via maxQueueSize while this entry
     * was in flight), so shift() could otherwise remove the wrong entry.
     */
    removeById(id) {
        const idx = this.queue.findIndex((r) => r.id === id);
        if (idx !== -1)
            this.queue.splice(idx, 1);
    }
    /** Unsubscribes from online/offline notifications. Call when the owning client is no longer needed. */
    destroy() {
        var _a;
        (_a = this.unsubscribe) === null || _a === void 0 ? void 0 : _a.call(this);
        this.unsubscribe = undefined;
    }
}
exports.OfflineQueue = OfflineQueue;
