import type { RestRequestConfig, HttpConfig, ApiResponse } from './types';
export declare class RequestExecutor {
    private client;
    constructor(httpConfig: HttpConfig);
    /**
     * Выполнение одного запроса с поддержкой retry и таймаута
     */
    execute<T = any>(command: string, reqConfig?: RestRequestConfig, retryCount?: number, timeoutMs?: number): Promise<ApiResponse<T>>;
}
