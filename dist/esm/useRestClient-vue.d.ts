import type { HttpConfig } from "./types.js";
/**
 * Vue composition function for memoized REST client
 * @param config HttpConfig
 * @returns RestClient instance
 */
export declare const useRestClientVue: (config: HttpConfig) => import("vue").ComputedRef<{
    request: <T = unknown>(command: string, req?: import("./types.js").RestRequestConfig, _retried?: boolean) => Promise<import("./types.js").ApiResponse<T>>;
    get: <T = unknown>(command: string, reqConfig?: Omit<import("./types.js").RestRequestConfig, "method">) => Promise<import("./types.js").ApiResponse<T>>;
    post: <T = unknown>(command: string, data?: unknown, reqConfig?: Omit<import("./types.js").RestRequestConfig, "method" | "data">) => Promise<import("./types.js").ApiResponse<T>>;
    put: <T = unknown>(command: string, data?: unknown, reqConfig?: Omit<import("./types.js").RestRequestConfig, "method" | "data">) => Promise<import("./types.js").ApiResponse<T>>;
    patch: <T = unknown>(command: string, data?: unknown, reqConfig?: Omit<import("./types.js").RestRequestConfig, "method" | "data">) => Promise<import("./types.js").ApiResponse<T>>;
    delete: <T = unknown>(command: string, reqConfig?: Omit<import("./types.js").RestRequestConfig, "method">) => Promise<import("./types.js").ApiResponse<T>>;
    head: <T = unknown>(command: string, reqConfig?: Omit<import("./types.js").RestRequestConfig, "method">) => Promise<import("./types.js").ApiResponse<T>>;
    options: <T = unknown>(command: string, reqConfig?: Omit<import("./types.js").RestRequestConfig, "method">) => Promise<import("./types.js").ApiResponse<T>>;
    cancellableRequest: <T = unknown>(key: string, command: string, reqConfig?: import("./types.js").RestRequestConfig) => Promise<import("./types.js").ApiResponse<T>>;
    cancelRequest: (key: string) => void;
    clearCache: () => Promise<void>;
    invalidateCache: (matcher: string | RegExp | ((info: {
        method: string;
        url: string;
    }) => boolean)) => Promise<number>;
    getCircuitBreakerState: () => Promise<import("./types.js").CircuitBreakerState | null>;
}>;
