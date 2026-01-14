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
    baseURL?: string;
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
export type RestRequestConfig = import("axios").AxiosRequestConfig & {
    useCache?: boolean;
    cacheTtlMs?: number;
    cacheKey?: string;
    skipRateLimit?: boolean;
    requestId?: string;
};
/**
 * Конфиг одного шага (этапа) pipeline
 * @template Input Тип входных данных шага
 * @template Output Тип результата шага
 */
export type PipelineStageConfig<Input = any, Output = any> = {
    /** Уникальный ключ шага */
    key: string;
    /** Асинхронная функция-запрос шага */
    request?: (input: Input, allResults?: Record<string, PipelineStepResult>, shared?: Record<string, any>) => Promise<Output>;
    /** Условие выполнения шага */
    condition?: (input: Input, prevResults: Record<string, PipelineStepResult>, sharedData?: Record<string, any>) => boolean;
    /** Количество попыток при ошибке */
    retryCount?: number;
    /** Таймаут шага (мс) */
    timeoutMs?: number;
    /** Обработчик ошибок шага */
    errorHandler?: (error: any, stageKey: string, sharedData?: Record<string, any>) => any;
    /**
     * Хук before: вызывается перед выполнением запроса этапа (request).
     * Может синхронно или асинхронно модифицировать входные данные prev/allResults/sharedData.
     * Возвращаемое значение будет передано в request вместо prev (если возвращено !== undefined).
     */
    before?: (prev: Input, allResults: Record<string, PipelineStepResult>, shared?: Record<string, any>) => Promise<Input | void> | Input | void;
    /**
     * Хук post-processing: вызывается после получения результата (до перехода к следующему этапу).
     * Может синхронно или асинхронно модифицировать результат шага.
     * Возвращаемое значение будет записано как результат шага (data).
     */
    after?: (result: Output, allResults: Record<string, PipelineStepResult>, shared?: Record<string, any>) => Promise<Output> | Output;
};
/**
 * Статус выполнения шага pipeline
 */
export type PipelineStepStatus = "pending" | "loading" | "success" | "error" | "skipped";
/**
 * Результат выполнения шага pipeline
 */
export type PipelineStepResult = {
    /** Статус шага */
    status: PipelineStepStatus;
    /** Данные результата (если успех) */
    data?: any;
    /** Ошибка (если error) */
    error?: import("./types").ApiError;
};
/**
 * Конфиг всего pipeline (массив этапов)
 */
export type PipelineConfig = {
    stages: PipelineStageConfig[];
};
/**
 * Прогресс выполнения pipeline
 */
export type PipelineProgress = {
    currentStage: number;
    totalStages: number;
    stageStatuses: Array<PipelineStepStatus>;
};
/**
 * Результаты всех шагов pipeline (ключ — имя шага)
 */
export type PipelineStageResults = Record<string, PipelineStepResult>;
/**
 * Итоговый результат выполнения pipeline
 */
export type PipelineResult = {
    /** Результаты по шагам */
    stageResults: PipelineStageResults;
    /** true, если pipeline завершился успешно */
    success: boolean;
};
