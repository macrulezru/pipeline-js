export interface RetryConfig {
    attempts: number;
    delayMs: number;
    backoffMultiplier: number;
    retriableStatus?: number[];
}
export type RetryOptions = Partial<RetryConfig>;
export interface CacheConfig {
    enabled: boolean;
    ttlMs: number;
}
export interface RateLimitConfig {
    maxConcurrent?: number;
    maxRequestsPerInterval?: number;
    intervalMs?: number;
}
export interface MetricsHandler {
    onRequestStart?: (info: {
        id: string;
        method?: string;
        url?: string;
        timestamp: number;
        requestBody?: unknown;
        requestParams?: unknown;
        requestHeaders?: Record<string, string>;
    }) => void;
    onRequestEnd?: (info: {
        id: string;
        durationMs: number;
        status?: number;
        error?: ApiError;
        bytes?: number;
        responseBody?: unknown;
        responseHeaders?: Record<string, string>;
    }) => void;
}
export interface HttpConfig {
    baseURL: string;
    timeout?: number;
    headers?: Record<string, string>;
    withCredentials?: boolean;
    retry?: RetryOptions;
    cache?: CacheConfig;
    rateLimit?: RateLimitConfig;
    metrics?: MetricsHandler;
}
export interface ApiError {
    message: string;
    code?: string | number;
    status?: number;
    timestamp?: Date;
}
export interface ApiResponse<T = unknown> {
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, string>;
}
export type RestRequestConfig = import('axios').AxiosRequestConfig & {
    useCache?: boolean;
    cacheTtlMs?: number;
    cacheKey?: string;
    skipRateLimit?: boolean;
    requestId?: string;
};
export type PipelineStageConfig<Input, Output> = {
    key: string;
    request: (input: Input, allResults?: any) => Promise<Output>;
    condition?: (input: Input, prevResults: any, sharedData?: Record<string, any>) => boolean;
    retryCount?: number;
    timeoutMs?: number;
    errorHandler?: (error: any, stageKey: string, sharedData?: Record<string, any>) => any;
};
export type PipelineConfig = {
    stages: PipelineStageConfig<any, any>[];
};
export type PipelineProgress = {
    currentStage: number;
    totalStages: number;
    stageStatuses: Array<'pending' | 'in-progress' | 'success' | 'error' | 'skipped'>;
};
export type PipelineResult = {
    results: any[];
    errors: any[];
    success: boolean;
};
