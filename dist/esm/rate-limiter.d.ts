import type { RateLimitConfig } from './types.js';
/**
 * Семафор для ограничения параллельных запросов (maxConcurrent)
 * и скользящего окна (maxRequestsPerInterval / intervalMs).
 *
 * Без `config.store` — точный in-memory алгоритм в пределах одного процесса
 * (поведение не изменилось). С `config.store` — делегирует оба примитива
 * распределённому backend'у (см. RateLimiterStore), что позволяет нескольким
 * серверным инстансам делить один лимит.
 */
export declare class RateLimiter {
    private config;
    private activeCount;
    private waitQueue;
    private windowTimestamps;
    private readonly key;
    constructor(config: RateLimitConfig);
    /**
     * Захватить слот. Возвращает функцию release — должна быть вызвана после завершения запроса.
     */
    acquire(): Promise<() => void>;
    private _acquireViaStore;
    private waitForSlot;
    private waitForWindow;
    private drainQueue;
}
