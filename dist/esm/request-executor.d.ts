import type { RestRequestConfig, HttpConfig, ApiResponse } from './types';
export declare class RequestExecutor {
    private httpConfig;
    private client;
    private retryCfg;
    constructor(httpConfig: HttpConfig);
    /**
     * Выполнение одного запроса с поддержкой:
     * - retry с задержкой, экспоненциальным backoff и jitter
     * - фильтрацией retry по HTTP-статусу (retriableStatus)
     * - разбором заголовка Retry-After (приоритет над backoff-задержкой)
     * - потолком maxRetryAfterMs для Retry-After
     * - таймаута через AbortController (реально отменяет HTTP-запрос)
     * - внешнего AbortSignal (от orchestrator.abort())
     */
    execute<T = any>(command: string, reqConfig?: RestRequestConfig, retryCount?: number, timeoutMs?: number, externalSignal?: AbortSignal): Promise<ApiResponse<T>>;
}
