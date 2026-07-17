import type { HttpConfig, ApiError, ApiResponse, RestRequestConfig } from "./types.js";
type RestClient = ReturnType<typeof createRestClient>;
export declare function toApiError(error: unknown): ApiError;
/**
 * Маскирует чувствительные заголовки в объекте перед передачей в метрики.
 * Не мутирует оригинальный объект.
 */
export declare function sanitizeHeadersMap(headers: Record<string, string> | undefined, extraSensitive?: string[]): Record<string, string> | undefined;
/**
 * Строит заголовок `traceparent` (W3C Trace Context, версия "00").
 * Если `traceId` задан и является валидными 32 hex-символами — используется как
 * есть (например, `runId` пайплайна без дефисов: UUID без дефисов — ровно
 * 32 hex-символа); иначе генерируется случайный.
 */
export declare function generateTraceparent(traceId?: string): string;
/** Очистить кэш клиентов (полезно в тестах или при смене конфигурации) */
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
    /** Очистить кэш ответов данного клиента */
    clearCache: () => Promise<void>;
    /**
     * Точечно инвалидировать кэш ответов по URL (подстрока, RegExp или предикат),
     * не затрагивая записи для других эндпоинтов. Возвращает количество удалённых записей.
     */
    invalidateCache: (matcher: string | RegExp | ((info: {
        method: string;
        url: string;
    }) => boolean)) => Promise<number>;
    /** Текущее состояние circuit breaker ("closed" | "open" | "half-open"), либо null, если он не настроен. `async`, если circuitBreaker.store задан (иначе резолвится мгновенно). */
    getCircuitBreakerState: () => Promise<import("./circuit-breaker.js").CircuitBreakerState | null>;
};
export declare function getRestClient(config: HttpConfig): RestClient;
export {};
