import type { ApiError, ApiResponse, OfflineQueueConfig, QueuedRequest } from "../types.js";
/**
 * Thrown by `client.post()`/etc. instead of making a network call when the
 * request was queued for later (offline, `shouldQueue` matched). Carries
 * `queueId` so calling code can correlate it with the eventual
 * `onFlushSuccess`/`onFlushError` callback, e.g. to update a "pending sync"
 * badge for that specific action.
 */
export declare class OfflineQueuedError extends Error {
    readonly queueId: string;
    readonly method: string;
    readonly url: string;
    constructor(queueId: string, method: string, url: string);
}
/** Default `shouldQueue`: queue mutating requests, never GET (a stale read isn't useful to "replay" later). */
export declare function defaultShouldQueue(info: {
    method: string;
    url: string;
    data?: unknown;
}): boolean;
/** Default `isOnline`: `navigator.onLine` in browsers, `true` everywhere else. */
export declare function defaultIsOnline(): boolean;
/** Default `onOnlineChange`: the browser's `window` `"online"` event. No-op outside a browser. */
export declare function defaultOnOnlineChange(callback: () => void): (() => void) | void;
/**
 * Handed to `OfflineQueue` by `createRestClient()` — actually (re)sends one
 * queued request. Must bypass the client's own offline-check entirely (it's
 * called *because* we believe we're online now); `createRestClient()`
 * satisfies this by calling its internal `_executeRequest` directly rather
 * than the public `request()` funnel that the offline-check lives in.
 */
export type OfflineQueueSendReplay = (request: QueuedRequest) => Promise<ApiResponse<unknown>>;
/**
 * Framework-agnostic queue engine: persists queued requests, replays them
 * sequentially on flush, and can auto-flush on reconnect. Doesn't know
 * anything about axios/HTTP internals itself — `createRestClient()` wires it
 * up via `sendReplay` and `toApiError`.
 */
export declare class OfflineQueue {
    private config;
    private sendReplay;
    private toApiError;
    private queue;
    private hydrated;
    private unsubscribe;
    private flushing;
    constructor(config: OfflineQueueConfig, sendReplay: OfflineQueueSendReplay, toApiError: (error: unknown) => ApiError);
    private hydrate;
    private persist;
    isOnline(): boolean;
    shouldQueue(info: {
        method: string;
        url: string;
        data?: unknown;
    }): boolean;
    /** Queues one request, persists the updated queue, and returns the new entry. */
    enqueue(info: {
        method: string;
        url: string;
        data?: unknown;
        params?: unknown;
        headers?: Record<string, string>;
        idempotencyKey?: string;
    }): Promise<QueuedRequest>;
    /** Current queue contents, oldest first. */
    getAll(): Promise<QueuedRequest[]>;
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
    flush(): Promise<void>;
    /**
     * Removes a queue entry by id rather than shift()ing the front — `next`
     * may no longer be at index 0 by the time an await resolves (e.g. a
     * concurrent enqueue() trimmed the front via maxQueueSize while this entry
     * was in flight), so shift() could otherwise remove the wrong entry.
     */
    private removeById;
    /** Unsubscribes from online/offline notifications. Call when the owning client is no longer needed. */
    destroy(): void;
}
