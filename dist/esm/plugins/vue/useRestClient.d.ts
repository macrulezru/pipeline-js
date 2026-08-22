import type { HttpConfig } from "../../types.js";
/**
 * Vue composition function for memoized REST client
 * @param config HttpConfig
 * @returns RestClient instance
 */
export declare const useRestClientVue: (config: HttpConfig) => import("vue").ComputedRef<{
    request: <T = unknown>(command: string, req?: import("./index.js").RestRequestConfig, _retried?: boolean) => Promise<import("./index.js").ApiResponse<T>>;
    get: <T = unknown>(command: string, reqConfig?: Omit<import("./index.js").RestRequestConfig, "method">) => Promise<import("./index.js").ApiResponse<T>>;
    post: <T = unknown>(command: string, data?: unknown, reqConfig?: Omit<import("./index.js").RestRequestConfig, "method" | "data">) => Promise<import("./index.js").ApiResponse<T>>;
    put: <T = unknown>(command: string, data?: unknown, reqConfig?: Omit<import("./index.js").RestRequestConfig, "method" | "data">) => Promise<import("./index.js").ApiResponse<T>>;
    patch: <T = unknown>(command: string, data?: unknown, reqConfig?: Omit<import("./index.js").RestRequestConfig, "method" | "data">) => Promise<import("./index.js").ApiResponse<T>>;
    delete: <T = unknown>(command: string, reqConfig?: Omit<import("./index.js").RestRequestConfig, "method">) => Promise<import("./index.js").ApiResponse<T>>;
    head: <T = unknown>(command: string, reqConfig?: Omit<import("./index.js").RestRequestConfig, "method">) => Promise<import("./index.js").ApiResponse<T>>;
    options: <T = unknown>(command: string, reqConfig?: Omit<import("./index.js").RestRequestConfig, "method">) => Promise<import("./index.js").ApiResponse<T>>;
    cancellableRequest: <T = unknown>(key: string, command: string, reqConfig?: import("./index.js").RestRequestConfig) => Promise<import("./index.js").ApiResponse<T>>;
    cancelRequest: (key: string) => void;
    clearCache: () => Promise<void>;
    invalidateCache: (matcher: string | RegExp | ((info: {
        method: string;
        url: string;
    }) => boolean)) => Promise<number>;
    getCircuitBreakerState: () => Promise<import("./index.js").CircuitBreakerState | null>;
    getQueuedRequests: () => Promise<import("./index.js").QueuedRequest[]>;
    flushQueue: () => Promise<void>;
}>;
