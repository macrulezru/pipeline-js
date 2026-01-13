import type { HttpConfig, ApiError, ApiResponse, RestRequestConfig } from './types';
type RestClient = ReturnType<typeof createRestClient>;
export declare function toApiError(error: unknown): ApiError;
export declare function createRestClient(config: HttpConfig): {
    request: <T = unknown>(command: string, req?: RestRequestConfig) => Promise<ApiResponse<T>>;
    get: <T = unknown>(command: string, config?: Omit<RestRequestConfig, "method">) => Promise<ApiResponse<T>>;
    post: <T = unknown>(command: string, data?: unknown, config?: Omit<RestRequestConfig, "method" | "data">) => Promise<ApiResponse<T>>;
    put: <T = unknown>(command: string, data?: unknown, config?: Omit<RestRequestConfig, "method" | "data">) => Promise<ApiResponse<T>>;
    delete: <T = unknown>(command: string, config?: Omit<RestRequestConfig, "method">) => Promise<ApiResponse<T>>;
    cancellableRequest: <T = unknown>(key: string, command: string, config?: any) => Promise<ApiResponse<T>>;
    cancelRequest: (key: string) => void;
};
export declare function getRestClient(config: HttpConfig): RestClient;
export {};
