import type { HttpConfig } from '../src/types';
/**
 * Vue composition function for memoized REST client
 * @param config HttpConfig
 * @returns RestClient instance
 */
export declare function useRestClient(config: HttpConfig): import("vue").ComputedRef<{
    request: <T = unknown>(command: string, req?: import("../src/types").RestRequestConfig) => Promise<import("../src/types").ApiResponse<T>>;
    get: <T = unknown>(command: string, config?: Omit<import("../src/types").RestRequestConfig, "method">) => Promise<import("../src/types").ApiResponse<T>>;
    post: <T = unknown>(command: string, data?: unknown, config?: Omit<import("../src/types").RestRequestConfig, "method" | "data">) => Promise<import("../src/types").ApiResponse<T>>;
    put: <T = unknown>(command: string, data?: unknown, config?: Omit<import("../src/types").RestRequestConfig, "method" | "data">) => Promise<import("../src/types").ApiResponse<T>>;
    delete: <T = unknown>(command: string, config?: Omit<import("../src/types").RestRequestConfig, "method">) => Promise<import("../src/types").ApiResponse<T>>;
    cancellableRequest: <T = unknown>(key: string, command: string, config?: any) => Promise<import("../src/types").ApiResponse<T>>;
    cancelRequest: (key: string) => void;
}>;
