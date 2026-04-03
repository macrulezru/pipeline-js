import axios from "axios";

import { TtlCache } from "./cache";
import { RateLimiter } from "./rate-limiter";
import type {
  HttpConfig,
  ApiError,
  ApiResponse,
  RestRequestConfig,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor,
} from "./types";
import { DEFAULT_SENSITIVE_HEADERS } from "./types";
import type { AxiosInstance, AxiosResponse } from "axios";

type RestClient = ReturnType<typeof createRestClient>;

export function toApiError(error: unknown): ApiError {
  if (axios.isCancel(error)) {
    return {
      message: "Request was cancelled",
      code: "REQUEST_CANCELLED",
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
    return {
      message: error.message,
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
 * Маскирует чувствительные заголовки в объекте перед передачей в метрики.
 * Не мутирует оригинальный объект.
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
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Нормализовать значение в массив */
function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/** Применить цепочку перехватчиков к значению */
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

/** Очистить кэш клиентов (полезно в тестах или при смене конфигурации) */
export function clearRestClientCache(): void {
  restClientCache.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// createRestClient
// ─────────────────────────────────────────────────────────────────────────────

export function createRestClient(config: HttpConfig) {
  const httpClient: AxiosInstance = axios.create({
    baseURL: config.baseURL,
    timeout: config.timeout,
    headers: config.headers,
    withCredentials: config.withCredentials,
  });

  // --- Кэш ответов ---
  const responseCache = new TtlCache<string, ApiResponse<any>>(1000);

  // --- Rate limiter ---
  const rateLimiter = config.rateLimit
    ? new RateLimiter(config.rateLimit)
    : null;

  // --- Sanitization helpers ---
  const shouldSanitize = config.sanitizeHeaders ?? false;
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
  const inFlightRequests = new Map<string, Promise<ApiResponse<any>>>();

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

  // ── Внутренняя логика одного HTTP-запроса (без dedup-обёртки) ──────────────
  // _retried — внутренний флаг, предотвращает бесконечную петлю при 401-retry
  async function _executeRequest<T = unknown>(
    command: string,
    req?: RestRequestConfig,
    _retried = false,
  ): Promise<ApiResponse<T>> {
    const reqId = req?.requestId ?? Math.random().toString(36).slice(2);
    const methodUpper = (req?.method ?? "GET").toUpperCase();
    const fullUrl = `${config.baseURL ?? ""}${command}`;

    // --- Auth: получаем токен и инжектируем заголовок ---
    let authHeaders: Record<string, string> = {};
    if (config.auth) {
      const token = await config.auth.getToken();
      authHeaders = { Authorization: `Bearer ${token}` };
    }

    const mergedHeaders: Record<string, string> = {
      ...(req?.headers as Record<string, string> | undefined),
      ...authHeaders,
    };

    // --- Request interceptors ---
    let processedReq: RestRequestConfig = { ...req, headers: mergedHeaders };
    if (reqInterceptors.length > 0) {
      processedReq = await applyInterceptors(reqInterceptors, processedReq);
    }

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
      const response: AxiosResponse<T> = await httpClient.request<T>({
        url: command,
        ...processedReq,
        headers: processedReq?.headers,
      });

      let payload: ApiResponse<T> = {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as Record<string, string>,
      };

      const duration = Date.now() - startTs;

      // --- Вычисление размера ответа ---
      let responseBytes: number | undefined;
      const headers = response.headers as Record<string, string>;
      const contentLengthHeader =
        headers["content-length"] || headers["Content-Length"];
      const parsedLength = contentLengthHeader
        ? Number(contentLengthHeader)
        : NaN;
      if (Number.isFinite(parsedLength) && parsedLength !== 0) {
        responseBytes = parsedLength;
      } else {
        try {
          const raw = response.data;
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

      config.metrics?.onRequestEnd?.({
        id: reqId,
        durationMs: duration,
        status: response.status,
        bytes: responseBytes,
        responseBody: response.data,
        responseHeaders: maybeSanitize(
          response.headers as Record<string, string>,
        ),
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

      // --- Сохранение в кэш ---
      const cacheEnabled =
        processedReq?.useCache ??
        (config.cache?.enabled && methodUpper === "GET");
      if (cacheEnabled) {
        const cacheTtl =
          processedReq?.cacheTtlMs ?? config.cache?.ttlMs ?? 60_000;
        const cacheKey = buildCacheKey(methodUpper, fullUrl, processedReq);
        responseCache.set(cacheKey, payload, cacheTtl);
      }

      return payload;
    } catch (error: unknown) {
      const duration = Date.now() - startTs;

      // --- Auth: 401 → onUnauthorized() → одна попытка повтора ---
      if (
        config.auth &&
        !_retried &&
        axios.isAxiosError(error) &&
        error.response?.status === 401
      ) {
        await config.auth.onUnauthorized?.();
        // Повторяем с флагом _retried=true — второй 401 уже не будет перехвачен
        return _executeRequest<T>(command, req, true);
      }

      let apiError = toApiError(error);

      // --- Error interceptors ---
      if (errInterceptors.length > 0) {
        apiError = await applyInterceptors(errInterceptors, apiError);
      }

      config.metrics?.onRequestEnd?.({
        id: reqId,
        durationMs: duration,
        error: apiError,
      });

      // --- Global onError handler ---
      if (config.onError) {
        await config.onError(apiError, processedReq ?? {});
      }

      throw error;
    } finally {
      release?.();
    }
  }

  // ── Основная функция запроса (с кэшем и dedup) ──────────────────────────────
  async function request<T = unknown>(
    command: string,
    req?: RestRequestConfig,
    _retried = false,
  ): Promise<ApiResponse<T>> {
    const methodUpper = (req?.method ?? "GET").toUpperCase();
    const fullUrl = `${config.baseURL ?? ""}${command}`;

    // --- Проверка кэша ---
    const cacheEnabled =
      req?.useCache ?? (config.cache?.enabled && methodUpper === "GET");
    const cacheTtl = req?.cacheTtlMs ?? config.cache?.ttlMs ?? 60_000;
    const cacheStrategy = config.cache?.strategy ?? "strict";
    const staleMs = config.cache?.staleMs ?? 0;

    if (cacheEnabled) {
      const cacheKey = buildCacheKey(methodUpper, fullUrl, req);

      if (cacheStrategy === "stale-while-revalidate") {
        const staleResult = responseCache.getStale(cacheKey, staleMs);
        if (staleResult) {
          if (staleResult.isStale) {
            // Фоновое обновление без блокирования
            _executeRequest<T>(command, req, _retried)
              .then((fresh) => responseCache.set(cacheKey, fresh, cacheTtl))
              .catch(() => {
                /* ignore background revalidation errors */
              });
          }
          return staleResult.value as ApiResponse<T>;
        }
      } else {
        const cached = responseCache.get(cacheKey);
        if (cached) return cached as ApiResponse<T>;
      }
    }

    // --- Request deduplication (только для GET без кэша) ---
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

  // --- Cancellable requests через AbortController ---
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
    /** Очистить кэш ответов данного клиента */
    clearCache: () => responseCache.clear(),
  };
}

export function getRestClient(config: HttpConfig): RestClient {
  const key = JSON.stringify({
    baseURL: config.baseURL,
    timeout: config.timeout,
    withCredentials: config.withCredentials,
    headers: config.headers ?? {},
    retry: config.retry ?? {},
    cache: config.cache ?? {},
    rateLimit: config.rateLimit ?? {},
    sanitizeHeaders: config.sanitizeHeaders ?? false,
    sensitiveHeaders: config.sensitiveHeaders ?? [],
    metrics: !!config.metrics,
    auth: !!config.auth,
    deduplicateRequests: config.deduplicateRequests ?? false,
    interceptors: !!config.interceptors,
    onError: !!config.onError,
  });

  const cachedClient = restClientCache.get(key);
  if (cachedClient) return cachedClient;

  // Evict старейшую запись при переполнении
  if (restClientCache.size >= MAX_CLIENT_CACHE_SIZE) {
    const oldestKey = restClientCache.keys().next().value;
    if (oldestKey !== undefined) restClientCache.delete(oldestKey);
  }

  const client = createRestClient(config);
  restClientCache.set(key, client);
  return client;
}
