"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = void 0;
/**
 * Семафор для ограничения параллельных запросов (maxConcurrent)
 * и скользящего окна (maxRequestsPerInterval / intervalMs)
 */
class RateLimiter {
    constructor(config) {
        this.config = config;
        this.activeCount = 0;
        this.waitQueue = [];
        // Sliding-window counters
        this.windowTimestamps = [];
    }
    /**
     * Захватить слот. Возвращает функцию release — должна быть вызвана после завершения запроса.
     */
    async acquire() {
        await this.waitForWindow();
        await this.waitForSlot();
        this.activeCount++;
        this.windowTimestamps.push(Date.now());
        return () => {
            this.activeCount--;
            this.drainQueue();
        };
    }
    async waitForSlot() {
        const max = this.config.maxConcurrent;
        if (!max)
            return;
        if (this.activeCount < max)
            return;
        return new Promise((resolve) => {
            this.waitQueue.push(resolve);
        });
    }
    async waitForWindow() {
        var _a;
        const maxReqs = this.config.maxRequestsPerInterval;
        const intervalMs = (_a = this.config.intervalMs) !== null && _a !== void 0 ? _a : 1000;
        if (!maxReqs)
            return;
        // Удаляем устаревшие метки
        const now = Date.now();
        this.windowTimestamps = this.windowTimestamps.filter((ts) => now - ts < intervalMs);
        if (this.windowTimestamps.length < maxReqs)
            return;
        // Ждём до конца текущего окна
        const oldest = this.windowTimestamps[0];
        const waitMs = intervalMs - (now - oldest) + 1;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        // Повторная очистка после ожидания
        const now2 = Date.now();
        this.windowTimestamps = this.windowTimestamps.filter((ts) => now2 - ts < intervalMs);
    }
    drainQueue() {
        const max = this.config.maxConcurrent;
        if (!max)
            return;
        while (this.activeCount < max && this.waitQueue.length > 0) {
            const next = this.waitQueue.shift();
            next === null || next === void 0 ? void 0 : next();
        }
    }
}
exports.RateLimiter = RateLimiter;
