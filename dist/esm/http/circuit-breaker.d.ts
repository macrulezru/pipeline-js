import type { ApiError, CircuitBreakerConfig, CircuitBreakerState } from "../types.js";
export type { CircuitBreakerState };
/** Error thrown instead of the real request when the circuit breaker is open. */
export declare class CircuitOpenError extends Error {
    code: string;
    constructor();
}
/**
 * A simple circuit breaker (closed → open → half-open → closed) for the HTTP client.
 * - closed: requests execute normally, consecutive failures are counted.
 * - open: requests are rejected immediately (CircuitOpenError), without hitting the network.
 * - half-open: after openMs, lets requests through "on trial"; success closes the circuit,
 *   failure opens it again.
 *
 * All public methods are async (return a Promise), even when `config.store`
 * is not set and state is kept in memory — this gives a uniform interface
 * regardless of backend. Without `config.store`, behavior and performance
 * are no different from a synchronous version (just wrapped in an
 * instantly-resolving promise).
 */
export declare class CircuitBreaker {
    private config;
    private readonly key;
    private state;
    private failureCount;
    private successCount;
    private openedAt;
    constructor(config: CircuitBreakerConfig);
    /** The current state (accounts for the automatic open → half-open transition on timeout). */
    getState(): Promise<CircuitBreakerState>;
    /** Whether a request can be made right now (false if the circuit is open). */
    canExecute(): Promise<boolean>;
    /** Record a successful request. */
    onSuccess(): Promise<void>;
    /** Record a failed request (error has already been normalized to ApiError). */
    onFailure(error: ApiError): Promise<void>;
    /** Reads shared state, applying the open→half-open timeout transition (and persisting it) if due. */
    private _readShared;
    private _writeShared;
    /** Increments `field` either atomically (if the store supports it) or via read-modify-write. */
    private _incrementShared;
    private _maybeTransitionToHalfOpen;
    private _open;
    private _close;
}
