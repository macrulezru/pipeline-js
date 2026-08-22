import type { HttpConfig, ApiError, ApiResponse, RestRequestConfig, QueuedRequest } from "../types.js";
type RestClient = ReturnType<typeof createRestClient>;
export declare function toApiError(error: unknown): ApiError;
/**
 * Masks sensitive headers in an object before passing it to metrics.
 * Does not mutate the original object.
 */
export declare function sanitizeHeadersMap(headers: Record<string, string> | undefined, extraSensitive?: string[]): Record<string, string> | undefined;
/**
 * Builds a `traceparent` header (W3C Trace Context, version "00").
 * If `traceId` is provided and is a valid 32-char hex string, it is used as-is
 * (e.g. a pipeline `runId` without dashes: a UUID without dashes is exactly
 * 32 hex characters); otherwise a random one is generated.
 */
export declare function generateTraceparent(traceId?: string): string;
/** Clear the client cache (useful in tests or when configuration changes) */
export declare function clearRestClientCache(): void;
export declare function createRestClient(config: HttpConfig): {
    request: <T = unknown>(command: string, req?: RestRequestConfig, _retried?: boolean) => Promise<ApiResponse<T>>;
    get: <T = unknown>(command: string, reqConfig?: Omit<RestRequestConfig, "method">) => Promise<ApiResponse<T>>;
    post: <T = unknown>(command: string, data?: unknown, reqConfig?: Omit<RestRequestConfig, "method" | "data">) => Promise<ApiResponse<T>>;
    put: <T = unknown>(command: string, data?: unknown, reqConfig?: Omit<RestRequestConfig, "method" | "data">) => Promise<ApiResponse<T>>;
    patch: <T = unknown>(command: string, data?: unknown, reqConfig?: Omit<RestRequestConfig, "method" | "data">) => Promise<ApiResponse<T>>;
    delete: <T = unknown>(command: string, reqConfig?: Omit<RestRequestConfig, "method">) => Promise<ApiResponse<T>>;
    head: <T = unknown>(command: string, reqConfig?: Omit<RestRequestConfig, "method">) => Promise<ApiResponse<T>>;
    options: <T = unknown>(command: string, reqConfig?: Omit<RestRequestConfig, "method">) => Promise<ApiResponse<T>>;
    cancellableRequest: <T = unknown>(key: string, command: string, reqConfig?: RestRequestConfig) => Promise<ApiResponse<T>>;
    cancelRequest: (key: string) => void;
    /** Clear this client's response cache */
    clearCache: () => Promise<void>;
    /**
     * Selectively invalidate the response cache by URL (substring, RegExp, or predicate),
     * without affecting entries for other endpoints. Returns the number of deleted entries.
     */
    invalidateCache: (matcher: string | RegExp | ((info: {
        method: string;
        url: string;
    }) => boolean)) => Promise<number>;
    /** Current circuit breaker state ("closed" | "open" | "half-open"), or null if it is not configured. `async` when circuitBreaker.store is set (otherwise resolves instantly). */
    getCircuitBreakerState: () => Promise<import("./circuit-breaker.js").CircuitBreakerState | null>;
    /** Requests currently queued awaiting the next flush (empty array if `offlineQueue` isn't configured). */
    getQueuedRequests: () => Promise<QueuedRequest[]>;
    /**
     * Manually attempts to send everything currently queued — also happens
     * automatically on reconnect (see `offlineQueue.onOnlineChange`). No-op
     * if `offlineQueue` isn't configured.
     */
    flushQueue: () => Promise<void>;
};
export declare function getRestClient(config: HttpConfig): RestClient;
export {};
