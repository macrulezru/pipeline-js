import type { HttpConfig } from "../types";
/**
 * Vue composition function for memoized REST client
 * @param config HttpConfig
 * @returns RestClient instance
 */
export declare const useRestClient: (config: HttpConfig) => import("vue").ComputedRef<{
    request: <T = unknown>(command: string, req?: import("../types").RestRequestConfig) => Promise<import("../types").ApiResponse<T>>;
    get: <T = unknown>(command: string, config?: Omit<import("../types").RestRequestConfig, "method">) => Promise<import("../types").ApiResponse<T>>;
    post: <T = unknown>(command: string, data?: unknown, config?: Omit<import("../types").RestRequestConfig, "method" | "data">) => Promise<import("../types").ApiResponse<T>>;
    put: <T = unknown>(command: string, data?: unknown, config?: Omit<import("../types").RestRequestConfig, "method" | "data">) => Promise<import("../types").ApiResponse<T>>;
    delete: <T = unknown>(command: string, config?: Omit<import("../types").RestRequestConfig, "method">) => Promise<import("../types").ApiResponse<T>>;
    cancellableRequest: <T = unknown>(key: string, command: string, config?: any) => Promise<import("../types").ApiResponse<T>>;
    cancelRequest: (key: string) => void;
}>;
