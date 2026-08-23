import type {
  ApiError,
  CircuitBreakerConfig,
  CircuitBreakerSharedState,
  CircuitBreakerState,
} from "../types.js";

export type { CircuitBreakerState };

/** Safety-net TTL for store-backed state so an abandoned key doesn't linger forever in Redis etc. */
const STORE_STATE_TTL_MS = 24 * 60 * 60 * 1000;

/** Error thrown instead of the real request when the circuit breaker is open. */
export class CircuitOpenError extends Error {
  code = "CIRCUIT_OPEN";
  constructor() {
    super("Circuit breaker is open — request rejected without calling the network");
    this.name = "CircuitOpenError";
  }
}

function initialState(): CircuitBreakerSharedState {
  return { state: "closed", failureCount: 0, successCount: 0, openedAt: 0 };
}

function generateKey(): string {
  const g: any = globalThis as any;
  if (g.crypto?.randomUUID) return `circuit-breaker-${g.crypto.randomUUID()}`;
  return `circuit-breaker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
export class CircuitBreaker {
  private readonly key: string;

  // --- In-memory path (used when config.store is not set) ---
  private state: CircuitBreakerState = "closed";
  private failureCount = 0;
  private successCount = 0;
  private openedAt = 0;

  constructor(private config: CircuitBreakerConfig) {
    this.key = config.key ?? generateKey();
  }

  /** The current state (accounts for the automatic open → half-open transition on timeout). */
  async getState(): Promise<CircuitBreakerState> {
    if (this.config.store) {
      const shared = await this._readShared();
      return shared.state;
    }
    this._maybeTransitionToHalfOpen();
    return this.state;
  }

  /** Whether a request can be made right now (false if the circuit is open). */
  async canExecute(): Promise<boolean> {
    const state = await this.getState();
    return state !== "open";
  }

  /** Record a successful request. */
  async onSuccess(): Promise<void> {
    if (this.config.store) {
      const shared = await this._readShared();
      if (shared.state === "half-open") {
        const needed = this.config.successThreshold ?? 1;
        const successCount = await this._incrementShared(shared, "successCount");
        if (successCount >= needed) {
          await this._writeShared({ ...shared, state: "closed", failureCount: 0, successCount: 0 });
        }
      } else if (shared.failureCount !== 0) {
        await this._writeShared({ ...shared, failureCount: 0 });
      }
      return;
    }

    if (this.state === "half-open") {
      this.successCount++;
      const needed = this.config.successThreshold ?? 1;
      if (this.successCount >= needed) {
        this._close();
      }
    } else {
      this.failureCount = 0;
    }
  }

  /** Record a failed request (error has already been normalized to ApiError). */
  async onFailure(error: ApiError): Promise<void> {
    if (this.config.isFailure && !this.config.isFailure(error)) return;

    if (this.config.store) {
      const shared = await this._readShared();
      if (shared.state === "half-open") {
        await this._writeShared({ ...shared, state: "open", openedAt: Date.now(), failureCount: 0, successCount: 0 });
        return;
      }
      const failureCount = await this._incrementShared(shared, "failureCount");
      if (failureCount >= this.config.failureThreshold) {
        await this._writeShared({ ...shared, state: "open", openedAt: Date.now(), failureCount: 0, successCount: 0 });
      }
      return;
    }

    if (this.state === "half-open") {
      this._open();
      return;
    }
    this.failureCount++;
    if (this.failureCount >= this.config.failureThreshold) {
      this._open();
    }
  }

  // ── Store-backed helpers ──────────────────────────────────────────────

  /** Reads shared state, applying the open→half-open timeout transition (and persisting it) if due. */
  private async _readShared(): Promise<CircuitBreakerSharedState> {
    const store = this.config.store!;
    const current = (await store.get(this.key)) ?? initialState();
    if (current.state === "open" && Date.now() - current.openedAt >= this.config.openMs) {
      const transitioned: CircuitBreakerSharedState = { ...current, state: "half-open", successCount: 0 };
      await store.set(this.key, transitioned, STORE_STATE_TTL_MS);
      return transitioned;
    }
    return current;
  }

  private async _writeShared(state: CircuitBreakerSharedState): Promise<void> {
    await this.config.store!.set(this.key, state, STORE_STATE_TTL_MS);
  }

  /** Increments `field` either atomically (if the store supports it) or via read-modify-write. */
  private async _incrementShared(
    current: CircuitBreakerSharedState,
    field: "failureCount" | "successCount",
  ): Promise<number> {
    const store = this.config.store!;
    if (store.incrementCounter) {
      return store.incrementCounter(this.key, field, STORE_STATE_TTL_MS);
    }
    const next = current[field] + 1;
    await this._writeShared({ ...current, [field]: next });
    return next;
  }

  // ── In-memory path ────────────────────────────────────────────────────

  private _maybeTransitionToHalfOpen(): void {
    if (
      this.state === "open" &&
      Date.now() - this.openedAt >= this.config.openMs
    ) {
      this.state = "half-open";
      this.successCount = 0;
    }
  }

  private _open(): void {
    this.state = "open";
    this.openedAt = Date.now();
    this.failureCount = 0;
    this.successCount = 0;
  }

  private _close(): void {
    this.state = "closed";
    this.failureCount = 0;
    this.successCount = 0;
  }
}
