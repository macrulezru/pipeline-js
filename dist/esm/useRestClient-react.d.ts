import type { HttpConfig } from "./types.js";
/**
 * React hook for a memoized REST client.
 *
 * Recreates the client whenever `config` is a *new object reference* — standard
 * `useMemo` semantics. Pass a stable reference (memoize it yourself with
 * `useMemo`, keep it in `useState`/`useRef`, or define it as a module-level
 * constant) if you don't want a new client on every render.
 *
 * Earlier versions keyed the memo on `JSON.stringify(config)` instead. That
 * silently dropped function-valued fields (`auth`, `metrics`, `onError`,
 * `interceptors`, `adapter`) from the comparison — a new inline callback passed
 * on a later render was never picked up, the client kept calling the closure
 * captured on the first render. Reference-identity memoization has no such gap,
 * at the cost of requiring the caller to memoize the config object explicitly.
 *
 * @param config HttpConfig
 * @returns RestClient instance
 */
export declare function useRestClientReact(config: HttpConfig): {
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
};
