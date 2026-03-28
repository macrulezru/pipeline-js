import type { HttpConfig, ApiError, ApiResponse, RestRequestConfig } from './types';
type RestClient = ReturnType<typeof createRestClient>;
export declare function toApiError(error: unknown): ApiError;
/** Очистить кэш клиентов (полезно в тестах или при смене конфигурации) */
export declare function clearRestClientCache(): void;
export declare function createRestClient(config: HttpConfig): {
    request: <T = unknown>(command: string, req?: RestRequestConfig) => Promise<ApiResponse<T>>;
    get: <T = unknown>(command: string, reqConfig?: Omit<RestRequestConfig, "method">) => Promise<ApiResponse<T>>;
    post: <T = unknown>(command: string, data?: unknown, reqConfig?: Omit<RestRequestConfig, "method" | "data">) => Promise<ApiResponse<T>>;
    put: <T = unknown>(command: string, data?: unknown, reqConfig?: Omit<RestRequestConfig, "method" | "data">) => Promise<ApiResponse<T>>;
    patch: <T = unknown>(command: string, data?: unknown, reqConfig?: Omit<RestRequestConfig, "method" | "data">) => Promise<ApiResponse<T>>;
    delete: <T = unknown>(command: string, reqConfig?: Omit<RestRequestConfig, "method">) => Promise<ApiResponse<T>>;
    cancellableRequest: <T = unknown>(key: string, command: string, reqConfig?: RestRequestConfig) => Promise<ApiResponse<T>>;
    cancelRequest: (key: string) => void;
    /** Очистить кэш ответов данного клиента */
    clearCache: () => void;
};
export declare function getRestClient(config: HttpConfig): RestClient;
export {};
