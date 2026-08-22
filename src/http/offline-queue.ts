import type { ApiError, ApiResponse, OfflineQueueConfig, QueuedRequest } from "../types.js";

/**
 * Thrown by `client.post()`/etc. instead of making a network call when the
 * request was queued for later (offline, `shouldQueue` matched). Carries
 * `queueId` so calling code can correlate it with the eventual
 * `onFlushSuccess`/`onFlushError` callback, e.g. to update a "pending sync"
 * badge for that specific action.
 */
export class OfflineQueuedError extends Error {
  readonly queueId: string;
  readonly method: string;
  readonly url: string;

  constructor(queueId: string, method: string, url: string) {
    super(`Request queued while offline, will be sent once back online: ${method} ${url}`);
    this.name = "OfflineQueuedError";
    this.queueId = queueId;
    this.method = method;
    this.url = url;
  }
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Default `shouldQueue`: queue mutating requests, never GET (a stale read isn't useful to "replay" later). */
export function defaultShouldQueue(info: { method: string; url: string; data?: unknown }): boolean {
  return MUTATING_METHODS.has(info.method.toUpperCase());
}

/** Default `isOnline`: `navigator.onLine` in browsers, `true` everywhere else. */
export function defaultIsOnline(): boolean {
  const nav = (globalThis as unknown as { navigator?: { onLine?: boolean } }).navigator;
  return nav?.onLine ?? true;
}

/** Default `onOnlineChange`: the browser's `window` `"online"` event. No-op outside a browser. */
export function defaultOnOnlineChange(callback: () => void): (() => void) | void {
  const win = (globalThis as unknown as {
    window?: { addEventListener?: (type: string, cb: () => void) => void; removeEventListener?: (type: string, cb: () => void) => void };
  }).window;
  if (!win?.addEventListener) return undefined;
  win.addEventListener("online", callback);
  return () => win.removeEventListener?.("online", callback);
}

function generateId(): string {
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `q-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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
export class OfflineQueue {
  private queue: QueuedRequest[] = [];
  private hydrated: Promise<void>;
  private unsubscribe: (() => void) | undefined;

  constructor(
    private config: OfflineQueueConfig,
    private sendReplay: OfflineQueueSendReplay,
    private toApiError: (error: unknown) => ApiError,
  ) {
    this.hydrated = this.hydrate();
    this.unsubscribe =
      (this.config.onOnlineChange ?? defaultOnOnlineChange)(() => {
        void this.flush();
      }) ?? undefined;
  }

  private async hydrate(): Promise<void> {
    try {
      const loaded = await this.config.persistAdapter.load();
      if (loaded) this.queue = loaded;
    } catch {
      // Start with an empty queue if the persisted snapshot can't be read.
    }
  }

  private async persist(): Promise<void> {
    try {
      await this.config.persistAdapter.save(this.queue);
    } catch {
      // Persisting is best-effort — the in-memory queue is still authoritative
      // for the lifetime of this process either way.
    }
  }

  isOnline(): boolean {
    return (this.config.isOnline ?? defaultIsOnline)();
  }

  shouldQueue(info: { method: string; url: string; data?: unknown }): boolean {
    return (this.config.shouldQueue ?? defaultShouldQueue)(info);
  }

  /** Queues one request, persists the updated queue, and returns the new entry. */
  async enqueue(info: {
    method: string;
    url: string;
    data?: unknown;
    params?: unknown;
    headers?: Record<string, string>;
    idempotencyKey?: string;
  }): Promise<QueuedRequest> {
    await this.hydrated;

    const entry: QueuedRequest = {
      id: generateId(),
      method: info.method.toUpperCase(),
      url: info.url,
      data: info.data,
      params: info.params,
      headers: info.headers,
      idempotencyKey: info.idempotencyKey ?? generateId(),
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
  async getAll(): Promise<QueuedRequest[]> {
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
  async flush(): Promise<void> {
    await this.hydrated;

    while (this.queue.length > 0) {
      if (!this.isOnline()) return;

      const next = this.queue[0];
      try {
        const response = await this.sendReplay(next);
        this.queue.shift();
        await this.persist();
        this.config.onFlushSuccess?.(next, response);
      } catch (err) {
        if (!this.isOnline()) return; // connectivity dropped mid-flush — leave it queued

        const apiError = this.toApiError(err);
        if (apiError.status !== undefined) {
          // A real response from the backend rejected it — don't retry
          // forever, surface it and move on to the rest of the queue.
          this.queue.shift();
          await this.persist();
          this.config.onFlushError?.(next, apiError);
        } else {
          // No HTTP status at all — a network-level failure indistinguishable
          // from "still offline" despite isOnline() saying otherwise. Leave
          // it queued; don't spin on the same entry within this call.
          return;
        }
      }
    }
  }

  /** Unsubscribes from online/offline notifications. Call when the owning client is no longer needed. */
  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}
