import axios from "axios";

import { TtlCache } from "./cache.js";
import { RateLimiter } from "./rate-limiter.js";
import { CircuitBreaker, CircuitOpenError } from "./circuit-breaker.js";
import { OfflineQueue, OfflineQueuedError } from "./offline-queue.js";
import type {
  HttpConfig,
  ApiError,
  ApiResponse,
  RestRequestConfig,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor,
  CacheStore,
  TracingSpan,
  QueuedRequest,
} from "../types.js";
import { DEFAULT_SENSITIVE_HEADERS } from "../types.js";
import type { AxiosInstance, AxiosResponse } from "axios";

type RestClient = ReturnType<typeof createRestClient>;

export function toApiError(error: unknown): ApiError {
  if (axios.isCancel(error)) {
    return {
      message: "Request was cancelled",
      code: "REQUEST_CANCELLED",
    };
  }
  if (error instanceof OfflineQueuedError) {
    return {
      message: error.message,
      code: "OFFLINE_QUEUED",
      timestamp: new Date(),
    };
  }
  if (axios.isAxiosError(error)) {
    return {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      timestamp: new Date(),
    };
  }
  if (error instanceof Error) {
    // Duck-typed, matching the same status/code extraction rest-client.ts
    // already does elsewhere for non-axios errors (see the 401-detection and
    // rate-limit-header logic in _executeRequest's catch block) — a custom
    // HttpAdapter throwing a plain Error with `.status`/`.response.status`
    // attached (see examples/edge-fetch-adapter.ts) still surfaces a usable
    // ApiError.status, e.g. for CircuitBreakerConfig.isFailure(error).
    const duckTyped = error as Error & {
      status?: number;
      code?: string | number;
      response?: { status?: number };
    };
    return {
      message: error.message,
      code: duckTyped.code,
      status: duckTyped.status ?? duckTyped.response?.status,
      timestamp: new Date(),
    };
  }
  return {
    message: "An unknown error occurred",
    timestamp: new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Log sanitization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Masks sensitive headers in an object before passing it to metrics.
 * Does not mutate the original object.
 */
export function sanitizeHeadersMap(
  headers: Record<string, string> | undefined,
  extraSensitive: string[] = [],
): Record<string, string> | undefined {
  if (!headers) return headers;
  const blocked = new Set([
    ...DEFAULT_SENSITIVE_HEADERS.map((h) => h.toLowerCase()),
    ...extraSensitive.map((h) => h.toLowerCase()),
  ]);
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) =>
      blocked.has(k.toLowerCase()) ? [k, "REDACTED"] : [k, v],
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tracing: W3C Trace Context (traceparent)
// ─────────────────────────────────────────────────────────────────────────────

const HEX_TRACE_ID_RE = /^[0-9a-f]{32}$/i;

function randomHex(length: number): string {
  const g = globalThis as unknown as {
    crypto?: { getRandomValues?: (arr: Uint8Array) => Uint8Array };
  };
  if (g.crypto?.getRandomValues) {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    g.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b: number) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, length);
  }
  let out = "";
  while (out.length < length) out += Math.random().toString(16).slice(2);
  return out.slice(0, length);
}

/**
 * Builds a `traceparent` header (W3C Trace Context, version "00").
 * If `traceId` is provided and is a valid 32-char hex string, it is used as-is
 * (e.g. a pipeline `runId` without dashes: a UUID without dashes is exactly
 * 32 hex characters); otherwise a random one is generated.
 */
export function generateTraceparent(traceId?: string): string {
  const tid = traceId && HEX_TRACE_ID_RE.test(traceId) ? traceId.toLowerCase() : randomHex(32);
  const spanId = randomHex(16);
  return `00-${tid}-${spanId}-01`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Normalize a value into an array */
function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/** Apply a chain of interceptors to a value */
async function applyInterceptors<T>(
  interceptors: Array<(v: T) => T | Promise<T>>,
  value: T,
): Promise<T> {
  let result = value;
  for (const interceptor of interceptors) {
    result = await interceptor(result);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client cache
// ─────────────────────────────────────────────────────────────────────────────

const MAX_CLIENT_CACHE_SIZE = 100;
const restClientCache: Map<string, RestClient> = new Map();

/** Clear the client cache (useful in tests or when configuration changes) */
export function clearRestClientCache(): void {
  restClientCache.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// createRestClient
// ─────────────────────────────────────────────────────────────────────────────

export function createRestClient(config: HttpConfig) {
  // If a custom adapter is provided, the built-in axios instance is not created at all
  // (saves initialization and avoids requiring axios for edge/serverless environments).
  const httpClient: AxiosInstance | undefined = config.adapter
    ? undefined
    : axios.create({
        baseURL: config.baseURL,
        timeout: config.timeout,
        headers: config.headers,
        withCredentials: config.withCredentials,
      });

  // --- Response cache ---
  // Defaults to the built-in in-memory TtlCache; can be replaced with an
  // external backend (Redis, etc.) via config.cache.store for server-side
  // multi-instance deployments.
  const responseCache: CacheStore<ApiResponse<unknown>> =
    config.cache?.store ?? new TtlCache<string, ApiResponse<unknown>>(1000);

  // --- Rate limiter ---
  const rateLimiter = config.rateLimit
    ? new RateLimiter(config.rateLimit)
    : null;

  // --- Circuit breaker ---
  const circuitBreaker = config.circuitBreaker
    ? new CircuitBreaker(config.circuitBreaker)
    : null;

  // --- Offline queue ---
  // sendReplay calls _executeRequest directly (defined further below, but
  // available here via function-declaration hoisting) rather than going
  // through request()'s public funnel — a replay must bypass the
  // offline-check below entirely, since it's only invoked when the queue
  // itself already believes connectivity is back.
  const offlineQueue = config.offlineQueue?.enabled
    ? new OfflineQueue(
        config.offlineQueue,
        (queued: QueuedRequest) =>
          _executeRequest(queued.url, {
            method: queued.method,
            data: queued.data,
            params: queued.params,
            headers: queued.headers,
            idempotencyKey: queued.idempotencyKey,
          }),
        toApiError,
      )
    : null;

  // --- Sanitization helpers ---
  // Secure by default: metrics callbacks are commonly forwarded to external
  // observability systems, so Authorization/Cookie/etc. are masked unless the
  // caller explicitly opts out.
  const shouldSanitize = config.sanitizeHeaders ?? true;
  const extraSensitive = config.sensitiveHeaders ?? [];

  // --- Interceptors ---
  const reqInterceptors = toArray<RequestInterceptor>(
    config.interceptors?.request,
  );
  const resInterceptors = toArray<ResponseInterceptor>(
    config.interceptors?.response,
  );
  const errInterceptors = toArray<ErrorInterceptor>(config.interceptors?.error);

  // --- In-flight deduplication map ---
  const inFlightRequests = new Map<string, Promise<ApiResponse<unknown>>>();

  // --- Auth: token cache (used when auth.tokenTtlMs is set) ---
  let cachedToken: { value: string; expiresAt: number } | null = null;

  function invalidateTokenCache(): void {
    cachedToken = null;
  }

  async function getAuthToken(): Promise<string> {
    const auth = config.auth!;
    if (auth.tokenTtlMs && cachedToken && Date.now() < cachedToken.expiresAt) {
      return cachedToken.value;
    }
    const token = await auth.getToken();
    if (auth.tokenTtlMs) {
      cachedToken = { value: token, expiresAt: Date.now() + auth.tokenTtlMs };
    }
    return token;
  }

  function maybeSanitize(
    headers: Record<string, string> | undefined,
  ): Record<string, string> | undefined {
    return shouldSanitize
      ? sanitizeHeadersMap(headers, extraSensitive)
      : headers;
  }

  function buildCacheKey(
    method: string,
    url: string,
    req?: RestRequestConfig,
  ): string {
    return JSON.stringify({
      method: method.toUpperCase(),
      url,
      params: req?.params,
      cacheKey: req?.cacheKey,
    });
  }

  /**
   * Targeted invalidation of the response cache: removes only entries whose URL
   * matches the matcher (a substring, RegExp, or predicate), rather than the
   * entire cache. Useful to call after mutating requests (POST/PUT/DELETE) for
   * related GET endpoints.
   *
   * Requires cache.store (if a custom one is provided) to implement deleteWhere() —
   * without it, returns 0 and deletes nothing.
   */
  async function invalidateCache(
    matcher: string | RegExp | ((info: { method: string; url: string }) => boolean),
  ): Promise<number> {
    if (!responseCache.deleteWhere) return 0;
    return responseCache.deleteWhere((key) => {
      let parsed: { method: string; url: string };
      try {
        parsed = JSON.parse(key);
      } catch {
        return false;
      }
      if (typeof matcher === "function") return matcher(parsed);
      if (matcher instanceof RegExp) return matcher.test(parsed.url);
      return parsed.url.includes(matcher);
    });
  }

  // ── Internal logic for a single HTTP request (without the dedup wrapper) ───
  // _retried — internal flag that prevents an infinite loop on a 401 retry
  async function _executeRequest<T = unknown>(
    command: string,
    req?: RestRequestConfig,
    _retried = false,
  ): Promise<ApiResponse<T>> {
    const reqId = req?.requestId ?? Math.random().toString(36).slice(2);
    const methodUpper = (req?.method ?? "GET").toUpperCase();
    const fullUrl = `${config.baseURL ?? ""}${command}`;

    // --- Circuit breaker: reject without touching the network/auth if the circuit is open ---
    if (circuitBreaker && !(await circuitBreaker.canExecute())) {
      const apiError = toApiError(new CircuitOpenError());
      config.metrics?.onRequestStart?.({
        id: reqId,
        method: methodUpper,
        url: fullUrl,
        timestamp: Date.now(),
        requestBody: req?.data,
        requestParams: req?.params,
      });
      config.metrics?.onRequestEnd?.({ id: reqId, durationMs: 0, error: apiError });
      if (config.onError) await config.onError(apiError, req ?? {});
      throw new CircuitOpenError();
    }

    // --- Auth: get the token (from cache, if auth.tokenTtlMs is set) and inject the header ---
    let authHeaders: Record<string, string> = {};
    if (config.auth) {
      const token = await getAuthToken();
      authHeaders = { Authorization: `Bearer ${token}` };
    }

    // --- Tracing: W3C traceparent (does not overwrite an explicitly set header) ---
    let tracingHeaders: Record<string, string> = {};
    const existingHeaders = req?.headers as Record<string, string> | undefined;
    const hasExplicitTraceparent =
      existingHeaders &&
      Object.keys(existingHeaders).some((h) => h.toLowerCase() === "traceparent");
    if (config.tracing?.generateTraceparent && !hasExplicitTraceparent) {
      tracingHeaders = { traceparent: generateTraceparent(req?.traceId) };
    }

    // --- Idempotency-Key (when explicitly set on the request) ---
    let idempotencyHeaders: Record<string, string> = {};
    if (req?.idempotencyKey) {
      const headerName = config.idempotencyHeaderName ?? "Idempotency-Key";
      idempotencyHeaders = { [headerName]: req.idempotencyKey };
    }

    const mergedHeaders: Record<string, string> = {
      ...tracingHeaders,
      ...idempotencyHeaders,
      ...(req?.headers as Record<string, string> | undefined),
      ...authHeaders,
    };

    // --- Request interceptors ---
    let processedReq: RestRequestConfig = { ...req, headers: mergedHeaders };
    if (reqInterceptors.length > 0) {
      processedReq = await applyInterceptors(reqInterceptors, processedReq);
    }

    // --- Tracing provider: create a span around the actual request ---
    const span: TracingSpan | undefined = config.tracing?.provider?.startSpan(
      `HTTP ${methodUpper} ${command}`,
      { "http.method": methodUpper, "http.url": fullUrl },
    );

    config.metrics?.onRequestStart?.({
      id: reqId,
      method: methodUpper,
      url: fullUrl,
      timestamp: Date.now(),
      requestBody: processedReq?.data,
      requestParams: processedReq?.params,
      requestHeaders: maybeSanitize(
        processedReq?.headers as Record<string, string> | undefined,
      ),
    });

    const startTs = Date.now();

    // --- Rate limiting ---
    let release: (() => void) | undefined;
    if (rateLimiter && !processedReq?.skipRateLimit) {
      release = await rateLimiter.acquire();
    }

    try {
      let payload: ApiResponse<T>;

      if (config.adapter) {
        // ── Custom HTTP adapter (fetch, etc.) ───────────────────────────
        payload = await config.adapter.request<T>({
          ...processedReq,
          baseURL: config.baseURL,
          url: command,
        });
      } else {
        // ── Default: axios ───────────────────────────────────────────────
        const response: AxiosResponse<T> = await httpClient!.request<T>({
          url: command,
          ...processedReq,
          headers: processedReq?.headers,
        });
        payload = {
          data: response.data,
          status: response.status,
          statusText: response.statusText,
          headers: response.headers as Record<string, string>,
        };
      }

      const duration = Date.now() - startTs;

      // --- Computing the response size ---
      let responseBytes: number | undefined;
      const respHeaders = payload.headers;
      const contentLengthHeader =
        respHeaders["content-length"] || respHeaders["Content-Length"];
      const parsedLength = contentLengthHeader
        ? Number(contentLengthHeader)
        : NaN;
      if (Number.isFinite(parsedLength) && parsedLength !== 0) {
        responseBytes = parsedLength;
      } else {
        try {
          const raw = payload.data;
          if (typeof raw === "string") {
            responseBytes = new TextEncoder().encode(raw).length;
          } else if (raw !== undefined) {
            responseBytes = new TextEncoder().encode(
              JSON.stringify(raw),
            ).length;
          }
        } catch {
          // ignore sizing errors
        }
      }

      // --- Proactive rate-limit throttling based on response headers ---
      if (config.rateLimit?.onRateLimitHeaders && rateLimiter) {
        config.rateLimit.onRateLimitHeaders(payload.headers, rateLimiter.asControl());
      }

      config.metrics?.onRequestEnd?.({
        id: reqId,
        durationMs: duration,
        status: payload.status,
        bytes: responseBytes,
        responseBody: payload.data,
        responseHeaders: maybeSanitize(payload.headers),
      });

      // --- Response interceptors ---
      if (resInterceptors.length > 0) {
        payload = await applyInterceptors(
          resInterceptors as Array<
            (v: ApiResponse<T>) => ApiResponse<T> | Promise<ApiResponse<T>>
          >,
          payload,
        );
      }

      // --- Storing in the cache ---
      const cacheEnabled =
        processedReq?.useCache ??
        (config.cache?.enabled && methodUpper === "GET");
      if (cacheEnabled) {
        const cacheTtl =
          processedReq?.cacheTtlMs ?? config.cache?.ttlMs ?? 60_000;
        const cacheKey = buildCacheKey(methodUpper, fullUrl, processedReq);
        await responseCache.set(cacheKey, payload, cacheTtl);
      }

      await circuitBreaker?.onSuccess();
      span?.setStatus?.({ code: "ok" });
      span?.end();
      return payload;
    } catch (error: unknown) {
      const duration = Date.now() - startTs;

      // --- Auth: 401 → onUnauthorized() → a single retry attempt ---
      const errorStatus = axios.isAxiosError(error)
        ? error.response?.status
        : (error as { status?: number } | undefined)?.status;

      // --- Proactive rate-limit throttling based on the error response headers
      // (e.g. a 429 usually also carries X-RateLimit-*/Retry-After-like headers) ---
      const errorHeaders = axios.isAxiosError(error)
        ? (error.response?.headers as Record<string, string> | undefined)
        : undefined;
      if (config.rateLimit?.onRateLimitHeaders && rateLimiter && errorHeaders) {
        config.rateLimit.onRateLimitHeaders(errorHeaders, rateLimiter.asControl());
      }

      if (config.auth && !_retried && errorStatus === 401) {
        invalidateTokenCache();
        await config.auth.onUnauthorized?.();
        // The current span belongs to this attempt (which failed due to 401);
        // the retry below will create its own span.
        span?.setStatus?.({ code: "error", message: "401 — retrying with refreshed token" });
        span?.end();
        // Retry with the _retried=true flag — a second 401 will no longer be intercepted
        return _executeRequest<T>(command, req, true);
      }

      let apiError = toApiError(error);

      // --- Error interceptors ---
      if (errInterceptors.length > 0) {
        apiError = await applyInterceptors(errInterceptors, apiError);
      }

      // --- Circuit breaker: request cancellations are not counted as backend failures ---
      const isCancellation =
        apiError.code === "REQUEST_CANCELLED" ||
        (error as { name?: string } | undefined)?.name === "AbortError";
      if (circuitBreaker && !isCancellation) {
        await circuitBreaker.onFailure(apiError);
      }

      config.metrics?.onRequestEnd?.({
        id: reqId,
        durationMs: duration,
        error: apiError,
      });

      span?.setStatus?.({ code: "error", message: apiError.message });
      span?.recordException?.(error);
      span?.end();

      // --- Global onError handler ---
      if (config.onError) {
        await config.onError(apiError, processedReq ?? {});
      }

      throw error;
    } finally {
      release?.();
    }
  }

  // ── Main request function (with cache and dedup) ────────────────────────────
  async function request<T = unknown>(
    command: string,
    req?: RestRequestConfig,
    _retried = false,
  ): Promise<ApiResponse<T>> {
    const methodUpper = (req?.method ?? "GET").toUpperCase();
    const fullUrl = `${config.baseURL ?? ""}${command}`;

    // --- Offline queue: queue instead of sending, if offline and shouldQueue matches ---
    if (
      offlineQueue &&
      !offlineQueue.isOnline() &&
      offlineQueue.shouldQueue({ method: methodUpper, url: command, data: req?.data })
    ) {
      const queued = await offlineQueue.enqueue({
        method: methodUpper,
        url: command,
        data: req?.data,
        params: req?.params,
        headers: req?.headers as Record<string, string> | undefined,
        idempotencyKey: req?.idempotencyKey,
      });
      const queuedError = new OfflineQueuedError(queued.id, methodUpper, command);
      const apiError = toApiError(queuedError);
      config.metrics?.onRequestStart?.({
        id: queued.id,
        method: methodUpper,
        url: fullUrl,
        timestamp: queued.queuedAt,
        requestBody: req?.data,
        requestParams: req?.params,
      });
      config.metrics?.onRequestEnd?.({ id: queued.id, durationMs: 0, error: apiError });
      if (config.onError) await config.onError(apiError, req ?? {});
      throw queuedError;
    }

    // --- Cache check ---
    const cacheEnabled =
      req?.useCache ?? (config.cache?.enabled && methodUpper === "GET");
    const cacheTtl = req?.cacheTtlMs ?? config.cache?.ttlMs ?? 60_000;
    const cacheStrategy = config.cache?.strategy ?? "strict";
    const staleMs = config.cache?.staleMs ?? 0;

    if (cacheEnabled) {
      const cacheKey = buildCacheKey(methodUpper, fullUrl, req);

      if (cacheStrategy === "stale-while-revalidate" && responseCache.getStale) {
        const staleResult = await responseCache.getStale(cacheKey, staleMs);
        if (staleResult) {
          if (staleResult.isStale) {
            // Background refresh without blocking
            _executeRequest<T>(command, req, _retried)
              .then((fresh) => responseCache.set(cacheKey, fresh, cacheTtl))
              .catch(() => {
                /* ignore background revalidation errors */
              });
          }
          return staleResult.value as ApiResponse<T>;
        }
      } else {
        const cached = await responseCache.get(cacheKey);
        if (cached) return cached as ApiResponse<T>;
      }
    }

    // --- Request deduplication (GET only, without caching) ---
    const shouldDedup =
      (config.deduplicateRequests ?? false) &&
      methodUpper === "GET" &&
      !req?.skipRateLimit;

    if (shouldDedup) {
      const dedupKey = buildCacheKey(methodUpper, fullUrl, req);
      const existing = inFlightRequests.get(dedupKey);
      if (existing) return existing as Promise<ApiResponse<T>>;

      const promise = _executeRequest<T>(command, req, _retried).finally(() => {
        inFlightRequests.delete(dedupKey);
      });
      inFlightRequests.set(dedupKey, promise);
      return promise;
    }

    return _executeRequest<T>(command, req, _retried);
  }

  // --- Cancellable requests via AbortController ---
  const abortControllers = new Map<string, AbortController>();

  function cancelRequest(key: string): void {
    abortControllers.get(key)?.abort();
    abortControllers.delete(key);
  }

  async function cancellableRequest<T = unknown>(
    key: string,
    command: string,
    reqConfig?: RestRequestConfig,
  ): Promise<ApiResponse<T>> {
    cancelRequest(key);
    const controller = new AbortController();
    abortControllers.set(key, controller);
    try {
      return await request<T>(command, {
        ...reqConfig,
        signal: controller.signal,
      });
    } finally {
      abortControllers.delete(key);
    }
  }

  return {
    request,
    get: <T = unknown>(
      command: string,
      reqConfig?: Omit<RestRequestConfig, "method">,
    ) => request<T>(command, { ...reqConfig, method: "GET" }),
    post: <T = unknown>(
      command: string,
      data?: unknown,
      reqConfig?: Omit<RestRequestConfig, "method" | "data">,
    ) => request<T>(command, { ...reqConfig, method: "POST", data }),
    put: <T = unknown>(
      command: string,
      data?: unknown,
      reqConfig?: Omit<RestRequestConfig, "method" | "data">,
    ) => request<T>(command, { ...reqConfig, method: "PUT", data }),
    patch: <T = unknown>(
      command: string,
      data?: unknown,
      reqConfig?: Omit<RestRequestConfig, "method" | "data">,
    ) => request<T>(command, { ...reqConfig, method: "PATCH", data }),
    delete: <T = unknown>(
      command: string,
      reqConfig?: Omit<RestRequestConfig, "method">,
    ) => request<T>(command, { ...reqConfig, method: "DELETE" }),
    head: <T = unknown>(
      command: string,
      reqConfig?: Omit<RestRequestConfig, "method">,
    ) => request<T>(command, { ...reqConfig, method: "HEAD" }),
    options: <T = unknown>(
      command: string,
      reqConfig?: Omit<RestRequestConfig, "method">,
    ) => request<T>(command, { ...reqConfig, method: "OPTIONS" }),
    cancellableRequest,
    cancelRequest,
    /** Clear this client's response cache */
    clearCache: async () => { await responseCache.clear(); },
    /**
     * Selectively invalidate the response cache by URL (substring, RegExp, or predicate),
     * without affecting entries for other endpoints. Returns the number of deleted entries.
     */
    invalidateCache,
    /** Current circuit breaker state ("closed" | "open" | "half-open"), or null if it is not configured. `async` when circuitBreaker.store is set (otherwise resolves instantly). */
    getCircuitBreakerState: async (): Promise<import("./circuit-breaker.js").CircuitBreakerState | null> =>
      circuitBreaker ? await circuitBreaker.getState() : null,
    /** Requests currently queued awaiting the next flush (empty array if `offlineQueue` isn't configured). */
    getQueuedRequests: async (): Promise<QueuedRequest[]> =>
      offlineQueue ? offlineQueue.getAll() : [],
    /**
     * Manually attempts to send everything currently queued — also happens
     * automatically on reconnect (see `offlineQueue.onOnlineChange`). No-op
     * if `offlineQueue` isn't configured.
     */
    flushQueue: async (): Promise<void> => {
      await offlineQueue?.flush();
    },
  };
}

export function getRestClient(config: HttpConfig): RestClient {
  const key = JSON.stringify({
    baseURL: config.baseURL,
    timeout: config.timeout,
    withCredentials: config.withCredentials,
    headers: config.headers ?? {},
    retry: config.retry ?? {},
    // Function-valued fields (store/isFailure/provider) are dropped by
    // JSON.stringify — tracked as booleans instead so two configs that only
    // differ in *which* store/predicate/provider they pass don't collide on
    // the same cached client.
    cache: { ...(config.cache ?? {}), store: !!config.cache?.store },
    rateLimit: { ...(config.rateLimit ?? {}), store: !!config.rateLimit?.store },
    circuitBreaker: {
      ...(config.circuitBreaker ?? {}),
      store: !!config.circuitBreaker?.store,
      isFailure: !!config.circuitBreaker?.isFailure,
    },
    sanitizeHeaders: config.sanitizeHeaders ?? true,
    sensitiveHeaders: config.sensitiveHeaders ?? [],
    metrics: !!config.metrics,
    auth: !!config.auth,
    deduplicateRequests: config.deduplicateRequests ?? false,
    interceptors: !!config.interceptors,
    onError: !!config.onError,
    adapter: !!config.adapter,
    tracing: {
      generateTraceparent: !!config.tracing?.generateTraceparent,
      provider: !!config.tracing?.provider,
    },
    idempotencyHeaderName: config.idempotencyHeaderName,
    autoIdempotencyKey: !!config.autoIdempotencyKey,
    offlineQueue: {
      enabled: !!config.offlineQueue?.enabled,
      persistAdapter: !!config.offlineQueue?.persistAdapter,
      isOnline: !!config.offlineQueue?.isOnline,
      onOnlineChange: !!config.offlineQueue?.onOnlineChange,
      shouldQueue: !!config.offlineQueue?.shouldQueue,
      maxQueueSize: config.offlineQueue?.maxQueueSize,
    },
  });

  const cachedClient = restClientCache.get(key);
  if (cachedClient) return cachedClient;

  // Evict the oldest entry on overflow
  if (restClientCache.size >= MAX_CLIENT_CACHE_SIZE) {
    const oldestKey = restClientCache.keys().next().value;
    if (oldestKey !== undefined) restClientCache.delete(oldestKey);
  }

  const client = createRestClient(config);
  restClientCache.set(key, client);
  return client;
}
