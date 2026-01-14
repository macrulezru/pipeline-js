import type { HttpConfig } from "../../dist/types";
/**
 * React hook for memoized REST client
 * @param config HttpConfig
 * @returns RestClient instance
 */
export declare function useRestClient(config: HttpConfig): {
    request: <T = unknown>(command: string, req?: import("../../dist/types").RestRequestConfig) => Promise<import("../../dist/types").ApiResponse<T>>;
    get: <T = unknown>(command: string, config?: Omit<import("../../dist/types").RestRequestConfig, "method">) => Promise<import("../../dist/types").ApiResponse<T>>;
    post: <T = unknown>(command: string, data?: unknown, config?: Omit<import("../../dist/types").RestRequestConfig, "method" | "data">) => Promise<import("../../dist/types").ApiResponse<T>>;
    put: <T = unknown>(command: string, data?: unknown, config?: Omit<import("../../dist/types").RestRequestConfig, "method" | "data">) => Promise<import("../../dist/types").ApiResponse<T>>;
    delete: <T = unknown>(command: string, config?: Omit<import("../../dist/types").RestRequestConfig, "method">) => Promise<import("../../dist/types").ApiResponse<T>>;
    cancellableRequest: <T = unknown>(key: string, command: string, config?: any) => Promise<import("../../dist/types").ApiResponse<T>>;
    cancelRequest: (key: string) => void;
};
