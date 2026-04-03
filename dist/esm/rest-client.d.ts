import type { HttpConfig, ApiError, ApiResponse, RestRequestConfig } from "./types";
type RestClient = ReturnType<typeof createRestClient>;
export declare function toApiError(error: unknown): ApiError;
/**
 * Маскирует чувствительные заголовки в объекте перед передачей в метрики.
 * Не мутирует оригинальный объект.
 */
export declare function sanitizeHeadersMap(headers: Record<string, string> | undefined, extraSensitive?: string[]): Record<string, string> | undefined;
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
    clearCache: () => void;
};
export declare function getRestClient(config: HttpConfig): RestClient;
export {};
