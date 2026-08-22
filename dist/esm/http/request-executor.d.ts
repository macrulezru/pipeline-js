import type { RestRequestConfig, HttpConfig, ApiResponse } from '../types.js';
export declare class RequestExecutor {
    private httpConfig;
    private client;
    private retryCfg;
    constructor(httpConfig: HttpConfig);
    /**
     * Executes a single request with support for:
     * - retry with delay, exponential backoff, and jitter
     * - filtering retries by HTTP status (retriableStatus)
     * - parsing the Retry-After header (takes priority over the backoff delay)
     * - a maxRetryAfterMs ceiling for Retry-After
     * - a timeout via AbortController (actually cancels the HTTP request)
     * - an external AbortSignal (from orchestrator.abort())
     */
    execute<T = unknown>(command: string, reqConfig?: RestRequestConfig, retryCount?: number, timeoutMs?: number, externalSignal?: AbortSignal): Promise<ApiResponse<T>>;
}
