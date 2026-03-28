import type { RateLimitConfig } from './types';
/**
 * Семафор для ограничения параллельных запросов (maxConcurrent)
 * и скользящего окна (maxRequestsPerInterval / intervalMs)
 */
export declare class RateLimiter {
    private config;
    private activeCount;
    private waitQueue;
    private windowTimestamps;
    constructor(config: RateLimitConfig);
    /**
     * Захватить слот. Возвращает функцию release — должна быть вызвана после завершения запроса.
     */
    acquire(): Promise<() => void>;
    private waitForSlot;
    private waitForWindow;
    private drainQueue;
}
