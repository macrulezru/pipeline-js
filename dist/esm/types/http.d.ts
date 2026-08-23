import type { PipelineStateAdapter } from "./pipeline.js";
/**
 * Authentication provider.
 * Called before every request to obtain a token.
 * On a 401 response, onUnauthorized is called (if provided), after which the request is retried once.
 */
export interface AuthProvider {
    /** Returns the token for the Authorization: Bearer <token> header */
    getToken(): Promise<string>;
    /**
     * Called when a 401 is received — this is where the token should be refreshed.
     * After this method returns, the request will be retried with the new token.
     * The retry happens only once to avoid an infinite loop.
     */
    onUnauthorized?(): Promise<void>;
    /**
     * If set — the result of getToken() is cached for this duration (ms) and reused
     * between requests instead of calling getToken() before every request.
     * The cache is automatically invalidated on a 401 (before calling onUnauthorized and retrying).
     * Default: not set — getToken() is called before every request, as before.
     */
    tokenTtlMs?: number;
}
/**
 * Headers masked in logs by default when sanitizeHeaders: true.
 * Can be extended via HttpConfig.sensitiveHeaders.
 */
export declare const DEFAULT_SENSITIVE_HEADERS: readonly ["authorization", "x-api-key", "x-auth-token", "cookie", "set-cookie", "proxy-authorization"];
export interface RetryConfig {
    attempts: number;
    delayMs: number;
    backoffMultiplier: number;
    retriableStatus?: number[];
    /**
     * Maximum wait time from the Retry-After header, in ms.
     * If the server returned a Retry-After larger than this value, this ceiling will be used instead.
     * Default: 60,000 (1 minute).
     */
    maxRetryAfterMs?: number;
    /**
     * Jitter algorithm applied to the computed backoff delay. Does not affect
     * the delay from the Retry-After header — that always takes priority as-is.
     *
     * - `"fixed"` (default) — current behavior, backward compatible:
     *   `delayMs * backoffMultiplier^(attempt-1)` plus a random +0..10% on top
     *   (the delay is never less than the pure backoff value).
     * - `"full"` — AWS "full jitter": `delay = random(0, delayMs * backoffMultiplier^(attempt-1))`.
     *   Spreads many parallel clients retrying at the same time better over
     *   time (fewer synchronized load spikes on the backend), but individual
     *   delays can be much shorter than the nominal backoff.
     * - `"decorrelated"` — AWS "decorrelated jitter":
     *   `delay = min(cap, random(delayMs, prevDelay * 3))`, where `prevDelay` is
     *   the delay of the previous attempt (initially `delayMs`), and `cap` is
     *   `delayMs * backoffMultiplier^attempts` (a ceiling for the maximum
     *   number of attempts of this call). Even less synchronization between
     *   clients than `"full"`, at the cost of depending on the previous delay.
     *
     * @see https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
     */
    jitterStrategy?: "fixed" | "full" | "decorrelated";
}
export type RetryOptions = Partial<RetryConfig>;
/**
 * Abstract backend for the response cache. Allows replacing the built-in in-memory
 * `TtlCache` with an external store (Redis, etc.) — useful for server-side
 * multi-instance deployments, where an in-memory cache isn't shared between processes.
 * Methods can be synchronous or asynchronous (return a Promise) — the client
 * always calls them via `await`.
 *
 * `getStale`/`deleteWhere` are optional: without them the
 * `stale-while-revalidate` strategy and `invalidateCache()` are unavailable, respectively
 * (in that case `invalidateCache()` returns 0 and deletes nothing — see its JSDoc).
 *
 * @example
 * const redisStore: CacheStore = {
 *   async get(key) { const v = await redis.get(key); return v ? JSON.parse(v) : undefined; },
 *   async set(key, value, ttlMs) { await redis.set(key, JSON.stringify(value), "PX", ttlMs); },
 *   async delete(key) { await redis.del(key); },
 *   async clear() { await redis.flushdb(); },
 * };
 */
export interface CacheStore<V = ApiResponse<any>> {
    get(key: string): V | undefined | Promise<V | undefined>;
    set(key: string, value: V, ttlMs: number): void | Promise<void>;
    delete(key: string): void | Promise<void>;
    clear(): void | Promise<void>;
    /** Only required for the 'stale-while-revalidate' strategy. */
    getStale?(key: string, staleMs: number): {
        value: V;
        isStale: boolean;
    } | undefined | Promise<{
        value: V;
        isStale: boolean;
    } | undefined>;
    /** Only required for targeted invalidation via invalidateCache(). */
    deleteWhere?(predicate: (key: string) => boolean): number | Promise<number>;
}
export interface CacheConfig {
    enabled: boolean;
    ttlMs: number;
    /**
     * Caching strategy:
     * - 'strict' (default): returns the cache only until the TTL expires
     * - 'stale-while-revalidate': returns the stale cache while refreshing it in the background
     */
    strategy?: "strict" | "stale-while-revalidate";
    /**
     * Additional time after ttlMs (in ms) during which a stale response
     * can still be served under the 'stale-while-revalidate' strategy.
     * Default: 0 (a stale response is served indefinitely until staleMs expires).
     */
    staleMs?: number;
    /**
     * Custom cache backend (e.g. Redis) instead of the built-in in-memory TtlCache.
     * Default: not set — TtlCache is used within the process/client.
     */
    store?: CacheStore<ApiResponse<any>>;
}
/**
 * Abstract backend for distributed rate limiting (e.g. Redis) —
 * several server instances share a single limit instead of each
 * process counting requests independently (which, across N instances, effectively yields a limit
 * of ×N). Analogous to `CacheStore`, but for the two primitives of a rate limiter.
 *
 * Without a `store` (default), `RateLimiter` uses an exact in-memory algorithm
 * within a single process — behavior does not change.
 *
 * @example
 * const redisStore: RateLimiterStore = {
 *   async incrementWindow(key, intervalMs) {
 *     const n = await redis.incr(key);
 *     if (n === 1) await redis.pexpire(key, intervalMs);
 *     return n;
 *   },
 *   async acquireConcurrencySlot(key, max, leaseMs) {
 *     // see examples/redis-rate-limiter-store.ts for a full implementation via a Lua script
 *   },
 * };
 */
export interface RateLimiterStore {
    /**
     * Atomically increments the request counter for `key` within a sliding
     * (fixed-window) window of `intervalMs` — creating the key with this TTL on the first
     * increment — and returns the counter value *after* the increment.
     * Corresponds to `INCR key; PEXPIRE key intervalMs NX` in Redis.
     *
     * Like any fixed-window counter, it allows a burst of roughly 2×limit
     * at the window boundary (unlike a sliding-log implementation) — this is an accepted
     * trade-off for the sake of interface simplicity.
     */
    incrementWindow(key: string, intervalMs: number): Promise<number>;
    /**
     * Occupies one of `maxConcurrent` slots for `key`, waiting until a slot
     * becomes available, and returns a release function. `leaseMs` limits
     * how long the slot is held if the process that acquired it crashes
     * without calling release — the implementation must itself reclaim such a
     * "stale" lease once `leaseMs` has elapsed.
     *
     * Unlike `incrementWindow`, an exact distributed semaphore without a
     * central locking service is impossible — consider this an approximate
     * limit, not a strict guarantee (as is true of most distributed
     * semaphores in practice).
     */
    acquireConcurrencySlot(key: string, maxConcurrent: number, leaseMs: number): Promise<() => void | Promise<void>>;
}
export interface RateLimitConfig {
    maxConcurrent?: number;
    maxRequestsPerInterval?: number;
    intervalMs?: number;
    /**
     * Custom backend for distributed rate limiting across multiple
     * server instances (e.g. Redis) instead of the built-in in-memory
     * limiter, which only sees requests from its own process.
     * Default: not set — the exact in-memory limiter is used.
     */
    store?: RateLimiterStore;
    /**
     * Limit "bucket" key when using a shared `store` — allows
     * several independent limiters to share a single Redis connection without
     * key collisions. Default: a random id generated per `RateLimiter`
     * instance (i.e. without an explicit `key`, sharing between instances does not work).
     */
    key?: string;
    /**
     * Lease duration (ms) for `store.acquireConcurrencySlot()` — the time
     * after which an occupied slot is forcibly released if it was not
     * released explicitly (e.g. due to a process crash). Only taken into account
     * if both `store` and `maxConcurrent` are set.
     * Default: 30000 (30s).
     */
    leaseMs?: number;
    /**
     * Called after every response (successful or errored) with the raw
     * response headers — allows proactively throttling requests based on
     * the backend's rate-limit headers (`X-RateLimit-Remaining`, `RateLimit-*` from the
     * IETF draft, vendor-specific ones, etc.), rather than only reacting after
     * a 429/Retry-After. The library does not parse any specific header format itself
     * (there is no single standard) — the callback receives the raw headers and a
     * `control` object for controlling the limiter.
     *
     * @example
     * onRateLimitHeaders: (headers, control) => {
     *   const remaining = Number(headers["x-ratelimit-remaining"]);
     *   const resetSec = Number(headers["x-ratelimit-reset"]);
     *   if (remaining === 0 && Number.isFinite(resetSec)) {
     *     control.throttleFor(resetSec * 1000);
     *   }
     * }
     */
    onRateLimitHeaders?: (headers: Record<string, string>, control: RateLimitControl) => void;
}
/** Passed to `RateLimitConfig.onRateLimitHeaders` for proactive throttle control. */
export interface RateLimitControl {
    /**
     * Forces the next `acquire()` call(s) to wait at least `ms` ms
     * before proceeding — e.g. if a header such as
     * `X-RateLimit-Remaining: 0` signals that the window is exhausted.
     * Does not shorten an already-set longer wait (the maximum is taken).
     * No-op if `ms <= 0`.
     */
    throttleFor(ms: number): void;
}
/** Circuit breaker state: closed → open → half-open → closed. */
export type CircuitBreakerState = "closed" | "open" | "half-open";
/** Shared (e.g. stored in Redis) circuit breaker state for a distributed scenario. */
export type CircuitBreakerSharedState = {
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    /** Timestamp (Date.now()) of the moment the transition to open occurred. */
    openedAt: number;
};
/**
 * Abstract backend for a distributed circuit breaker — several
 * server instances share a single state (closed/open/half-open) instead
 * of each process opening/closing the circuit independently, which
 * weakens the protection (opening would require `failureThreshold` failures
 * *on each* instance rather than in total on the backend).
 *
 * Without a `store` (default), `CircuitBreaker` uses in-memory state
 * within a single process — behavior does not change.
 *
 * @example
 * const redisStore: CircuitBreakerStore = {
 *   async get(key) {
 *     const raw = await redis.get(key);
 *     return raw ? JSON.parse(raw) : null;
 *   },
 *   async set(key, state, ttlMs) {
 *     await redis.set(key, JSON.stringify(state), "PX", ttlMs);
 *   },
 * };
 */
export interface CircuitBreakerStore {
    /** Returns the shared state, or null if it has not been written yet. */
    get(key: string): Promise<CircuitBreakerSharedState | null>;
    /** Fully overwrites the shared state. `ttlMs` is provided in case the backend wants to expire the entry itself (not required to be used). */
    set(key: string, state: CircuitBreakerSharedState, ttlMs: number): Promise<void>;
    /**
     * Optional: atomically increments `field` by 1 and returns the new value —
     * removes race conditions on concurrent requests from different instances (as opposed to
     * `get` + compute + `set`). Without it, `CircuitBreaker` uses
     * get+compute+set, which under high concurrency may undercount some
     * increments, but remains functionally operational (a fail-safe
     * mechanism, not an exact counter).
     */
    incrementCounter?(key: string, field: "failureCount" | "successCount", ttlMs: number): Promise<number>;
}
export interface CircuitBreakerConfig {
    /** Number of consecutive failures (in the closed state) after which the circuit opens. */
    failureThreshold: number;
    /** How many ms the circuit stays open (requests are rejected without hitting the network) before transitioning to half-open. */
    openMs: number;
    /**
     * Custom backend for a distributed circuit breaker across multiple
     * server instances (e.g. Redis) instead of the built-in in-memory
     * state, which only sees requests from its own process.
     * Default: not set — in-memory state is used.
     */
    store?: CircuitBreakerStore;
    /**
     * State "bucket" key when using a shared `store` — allows
     * several independent breakers to share a single Redis connection without
     * key collisions. Default: a random id generated per
     * `CircuitBreaker` instance (i.e. without an explicit `key`, sharing between instances does not work).
     */
    key?: string;
    /**
     * Number of successful requests in the half-open state required to close the circuit.
     * Any failure in half-open immediately returns the circuit to open.
     * Default: 1.
     */
    successThreshold?: number;
    /**
     * Predicate: which errors should count as a failure for the circuit breaker.
     * Default (not set) — any request error counts as a failure.
     * Useful, for example, to avoid opening the circuit on 4xx validation errors.
     */
    isFailure?: (error: ApiError) => boolean;
}
export interface MetricsHandler {
    onRequestStart?: (info: {
        id: string;
        method?: string;
        url?: string;
        timestamp: number;
        requestBody?: unknown;
        requestParams?: unknown;
        requestHeaders?: Record<string, string>;
    }) => void;
    onRequestEnd?: (info: {
        id: string;
        durationMs: number;
        status?: number;
        error?: ApiError;
        bytes?: number;
        responseBody?: unknown;
        responseHeaders?: Record<string, string>;
    }) => void;
}
/**
 * Minimal "span" interface, intentionally shape-compatible with the
 * OpenTelemetry `Span` (duck-typing — the package does not pull in `@opentelemetry/api` as
 * a dependency). For an implementation on a real OTel SDK, see
 * `examples/opentelemetry-tracing.ts`.
 */
export interface TracingSpan {
    end(): void;
    setStatus?(status: {
        code: "ok" | "error";
        message?: string;
    }): void;
    recordException?(error: unknown): void;
}
/**
 * Hook for integrating with a tracing system (OpenTelemetry, Sentry, Datadog
 * APM, etc.). `startSpan()` is called before every HTTP request,
 * `span.end()` after it completes (successfully or not); `setStatus`/
 * `recordException` are called on error, if implemented.
 *
 * Not to be confused with `HttpConfig.tracing.generateTraceparent` — that only adds
 * a `traceparent` header, whereas this hook creates real spans in your
 * tracing system.
 */
export interface TracingProvider {
    startSpan(name: string, attributes?: Record<string, string | number | boolean>): TracingSpan;
}
/** Request tracing settings (see HttpConfig.tracing). */
export interface TracingConfig {
    /**
     * Automatically generate and add a `traceparent` header
     * (W3C Trace Context, https://www.w3.org/TR/trace-context/) to every
     * request, if one is not already explicitly set in the request headers.
     * Default: false.
     */
    generateTraceparent?: boolean;
    /** Hook for creating spans in your tracing system — see TracingProvider. */
    provider?: TracingProvider;
}
export type RestRequestConfig = import("axios").AxiosRequestConfig & {
    useCache?: boolean;
    cacheTtlMs?: number;
    cacheKey?: string;
    skipRateLimit?: boolean;
    requestId?: string;
    /**
     * Value of the idempotency header (see HttpConfig.idempotencyHeaderName,
     * default "Idempotency-Key") — signals to the backend that repeated
     * requests with this same value should be treated as a single logical operation
     * (useful for mutating requests during a retry or network ambiguity).
     * The library only sets the header — actual deduplication must be
     * implemented by the backend.
     */
    idempotencyKey?: string;
    /**
     * Explicit traceId (32 hex characters, as in a W3C traceparent) for correlating
     * multiple requests into a single trace — for example, `orchestrator.getRunId()`
     * without dashes (a UUID without dashes is exactly 32 hex characters). Used
     * together with `HttpConfig.tracing.generateTraceparent`; if not set, a
     * random traceId is generated for each request.
     */
    traceId?: string;
};
/**
 * Request interceptor. Can modify the request config before it is sent.
 */
export type RequestInterceptor = (config: RestRequestConfig) => RestRequestConfig | Promise<RestRequestConfig>;
/**
 * Response interceptor. Can transform the response after it is received.
 */
export type ResponseInterceptor<T = unknown> = (response: ApiResponse<T>) => ApiResponse<T> | Promise<ApiResponse<T>>;
/**
 * Error interceptor. Can transform or enrich the error.
 */
export type ErrorInterceptor = (error: ApiError) => ApiError | Promise<ApiError>;
export interface HttpConfig {
    baseURL?: string;
    timeout?: number;
    headers?: Record<string, string>;
    withCredentials?: boolean;
    retry?: RetryOptions;
    cache?: CacheConfig;
    rateLimit?: RateLimitConfig;
    metrics?: MetricsHandler;
    /** Authentication provider with automatic token refresh on 401 */
    auth?: AuthProvider;
    /**
     * Mask sensitive headers in metrics (onRequestStart/onRequestEnd).
     * Default: true (secure by default) — set to false to receive
     * headers in plain form (e.g. for local debugging).
     */
    sanitizeHeaders?: boolean;
    /**
     * Additional headers to mask (supplement DEFAULT_SENSITIVE_HEADERS).
     * Case-insensitive comparison.
     */
    sensitiveHeaders?: string[];
    /**
     * Global HTTP client error handler.
     * Called on every request error (before it is thrown).
     */
    onError?: (error: ApiError, config: RestRequestConfig) => void | Promise<void>;
    /**
     * Request and response interceptors.
     * request interceptors run in array order before sending.
     * response interceptors run in array order after receiving the response.
     * error interceptors run in array order on error.
     */
    interceptors?: {
        request?: RequestInterceptor | RequestInterceptor[];
        response?: ResponseInterceptor | ResponseInterceptor[];
        error?: ErrorInterceptor | ErrorInterceptor[];
    };
    /**
     * Deduplication of identical in-flight GET requests.
     * If enabled — several simultaneous requests with identical parameters
     * are merged into a single promise.
     * Default: false.
     */
    deduplicateRequests?: boolean;
    /**
     * Abstract HTTP adapter. Replaces the built-in axios client.
     * Use for edge/serverless environments (Cloudflare Workers, Deno)
     * or to pass a native fetch.
     */
    adapter?: HttpAdapter;
    /**
     * Circuit breaker: after failureThreshold consecutive failures, requests are rejected
     * immediately (without hitting the network) for openMs, protecting a downed backend from extra load.
     * Not set by default — behavior without a circuit breaker does not change.
     */
    circuitBreaker?: CircuitBreakerConfig;
    /**
     * Request tracing: a W3C `traceparent` header and/or a hook for integrating
     * with OpenTelemetry/Sentry/Datadog APM, etc. Not set by default —
     * behavior does not change.
     */
    tracing?: TracingConfig;
    /**
     * Name of the idempotency header set when
     * `RestRequestConfig.idempotencyKey` is provided (or auto-generated — see
     * `autoIdempotencyKey`). Default: "Idempotency-Key".
     */
    idempotencyHeaderName?: string;
    /**
     * If true — the `RequestExecutor` (the one that actually performs retries, see
     * README → RequestExecutor) itself generates an `idempotencyKey` for mutating
     * methods (POST/PUT/PATCH/DELETE) if one was not explicitly provided by the
     * caller, once before the retry loop begins — so that all attempts of one
     * logical request use the same key. Does not affect direct
     * calls to `client.post()`/`client.put()` etc. that bypass RequestExecutor —
     * there `idempotencyKey` must be set explicitly.
     * Default: false.
     */
    autoIdempotencyKey?: boolean;
    /**
     * Queue mutating requests made while offline and replay them once back
     * online, instead of failing immediately. Not set by default — behavior
     * does not change. See `OfflineQueueConfig` and the "Offline queue"
     * section of the README.
     */
    offlineQueue?: OfflineQueueConfig;
}
/** A single request captured by the offline queue, awaiting replay. */
export interface QueuedRequest {
    /** Unique id for this queue entry (not the same as `idempotencyKey`). */
    id: string;
    method: string;
    /** Relative URL, as passed to `client.post(url, ...)` etc. */
    url: string;
    data?: unknown;
    params?: unknown;
    headers?: Record<string, string>;
    /**
     * Generated once when the request is queued (if the caller didn't already
     * set one) and reused on every replay attempt, so a request that was
     * actually applied right before connectivity dropped — or a flush that
     * partially succeeds before failing — doesn't get double-applied by a
     * backend that honors idempotency keys. The library only sets the header;
     * actual deduplication is the backend's responsibility, same as
     * `RestRequestConfig.idempotencyKey` elsewhere.
     */
    idempotencyKey: string;
    /** `Date.now()` at the time this request was queued. */
    queuedAt: number;
}
export interface OfflineQueueConfig {
    enabled: boolean;
    /**
     * Where the queue is persisted so it survives a page reload / app
     * restart while offline. Required — an offline queue that only lives in
     * memory defeats the purpose (a reload while offline would silently lose
     * every queued mutation). Reuses `PipelineStateAdapter` (see
     * `PipelineConfig.options.persistAdapter`) rather than a bespoke
     * interface — e.g. `localStorage`, or the same Redis-backed adapter
     * pattern shown in `examples/redis-cache-store.ts`, works unchanged here.
     */
    persistAdapter: PipelineStateAdapter<QueuedRequest[]>;
    /**
     * Reports current connectivity. Default: `navigator.onLine` in browsers,
     * `true` everywhere else (so offline-queueing never silently activates
     * outside a browser unless you explicitly wire up your own check —
     * Node/React Native have no built-in equivalent of `navigator.onLine`).
     */
    isOnline?: () => boolean;
    /**
     * Subscribes to online/offline transitions so the queue can flush
     * automatically the moment connectivity returns. Default: the browser's
     * `window` `"online"` event. Return an unsubscribe function (or nothing).
     * Provide your own for Node/React Native (e.g. React Native's `NetInfo`)
     * — without one outside a browser, nothing triggers an automatic flush;
     * call `client.flushQueue()` yourself when you know connectivity is back.
     */
    onOnlineChange?: (callback: () => void) => (() => void) | void;
    /**
     * Which requests get queued instead of failing while offline. Default:
     * mutating methods (POST/PUT/PATCH/DELETE) — matches
     * `RequestExecutor.autoIdempotencyKey`'s own default set of methods.
     * GET requests are never queued by this default (a stale read isn't
     * useful to "replay" later) — override if you need different behavior.
     */
    shouldQueue?: (info: {
        method: string;
        url: string;
        data?: unknown;
    }) => boolean;
    /** Caps the queue at this many entries — the oldest entry is dropped (FIFO) once exceeded. Default: unbounded. */
    maxQueueSize?: number;
    /** Called after a queued request is successfully replayed. */
    onFlushSuccess?: (request: QueuedRequest, response: ApiResponse<unknown>) => void;
    /**
     * Called when a queued request is replayed and the backend rejects it
     * (a real HTTP error, not "still offline" — see the README's Offline
     * queue section for exactly how that distinction is made). The entry is
     * removed from the queue either way; use this to surface a permanent
     * failure to the user rather than have it vanish silently.
     */
    onFlushError?: (request: QueuedRequest, error: ApiError) => void;
}
export interface ApiError {
    message: string;
    code?: string | number;
    status?: number;
    timestamp?: Date;
}
export interface ApiResponse<T = unknown> {
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, string>;
}
/**
 * Abstract HTTP adapter. Allows using fetch or any other
 * HTTP client instead of the built-in axios. If not specified — axios is used.
 *
 * `config.onUploadProgress`/`config.onDownloadProgress` (inherited from
 * `AxiosRequestConfig`) automatically work only on the built-in
 * axios path. A custom adapter receives them in the `config` object as-is, but
 * must invoke them itself (e.g. via a `ReadableStream` reader for
 * `fetch`) — the library itself does not do this on the adapter's behalf.
 *
 * @example
 * const fetchAdapter: HttpAdapter = {
 *   async request(config) {
 *     const res = await fetch(`${config.baseURL ?? ""}${config.url ?? ""}`, {
 *       method: config.method ?? "GET",
 *       body: config.data ? JSON.stringify(config.data) : undefined,
 *       headers: { "Content-Type": "application/json", ...config.headers },
 *       signal: config.signal,
 *     });
 *     const data = await res.json();
 *     return { data, status: res.status, statusText: res.statusText, headers: {} };
 *   },
 * };
 */
export type HttpAdapter = {
    request<T = unknown>(config: RestRequestConfig & {
        baseURL?: string;
    }): Promise<ApiResponse<T>>;
};
