import type { HttpConfig } from "./types";
/**
 * Vue composition function for memoized REST client
 * @param config HttpConfig
 * @returns RestClient instance
 */
export declare const useRestClientVue: (config: HttpConfig) => import("vue").ComputedRef<{
    request: <T = unknown>(command: string, req?: import("./types").RestRequestConfig, _retried?: boolean) => Promise<import("./types").ApiResponse<T>>;
    get: <T = unknown>(command: string, reqConfig?: Omit<import("./types").RestRequestConfig, "method">) => Promise<import("./types").ApiResponse<T>>;
    post: <T = unknown>(command: string, data?: unknown, reqConfig?: Omit<import("./types").RestRequestConfig, "method" | "data">) => Promise<import("./types").ApiResponse<T>>;
    put: <T = unknown>(command: string, data?: unknown, reqConfig?: Omit<import("./types").RestRequestConfig, "method" | "data">) => Promise<import("./types").ApiResponse<T>>;
    patch: <T = unknown>(command: string, data?: unknown, reqConfig?: Omit<import("./types").RestRequestConfig, "method" | "data">) => Promise<import("./types").ApiResponse<T>>;
    delete: <T = unknown>(command: string, reqConfig?: Omit<import("./types").RestRequestConfig, "method">) => Promise<import("./types").ApiResponse<T>>;
    head: <T = unknown>(command: string, reqConfig?: Omit<import("./types").RestRequestConfig, "method">) => Promise<import("./types").ApiResponse<T>>;
    options: <T = unknown>(command: string, reqConfig?: Omit<import("./types").RestRequestConfig, "method">) => Promise<import("./types").ApiResponse<T>>;
    cancellableRequest: <T = unknown>(key: string, command: string, reqConfig?: import("./types").RestRequestConfig) => Promise<import("./types").ApiResponse<T>>;
    cancelRequest: (key: string) => void;
    clearCache: () => void;
}>;
