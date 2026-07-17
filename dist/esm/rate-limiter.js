function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function generateKey() {
    var _a;
    const g = globalThis;
    if ((_a = g.crypto) === null || _a === void 0 ? void 0 : _a.randomUUID)
        return `rate-limiter-${g.crypto.randomUUID()}`;
    return `rate-limiter-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
/**
 * Семафор для ограничения параллельных запросов (maxConcurrent)
 * и скользящего окна (maxRequestsPerInterval / intervalMs).
 *
 * Без `config.store` — точный in-memory алгоритм в пределах одного процесса
 * (поведение не изменилось). С `config.store` — делегирует оба примитива
 * распределённому backend'у (см. RateLimiterStore), что позволяет нескольким
 * серверным инстансам делить один лимит.
 */
export class RateLimiter {
    constructor(config) {
        var _a;
        this.config = config;
        this.activeCount = 0;
        this.waitQueue = [];
        // Sliding-window counters
        this.windowTimestamps = [];
        this.key = (_a = config.key) !== null && _a !== void 0 ? _a : generateKey();
    }
    /**
     * Захватить слот. Возвращает функцию release — должна быть вызвана после завершения запроса.
     */
    async acquire() {
        if (this.config.store) {
            return this._acquireViaStore();
        }
        await this.waitForWindow();
        await this.waitForSlot();
        this.activeCount++;
        this.windowTimestamps.push(Date.now());
        return () => {
            this.activeCount--;
            this.drainQueue();
        };
    }
    async _acquireViaStore() {
        var _a, _b;
        const store = this.config.store;
        const intervalMs = (_a = this.config.intervalMs) !== null && _a !== void 0 ? _a : 1000;
        const maxReqs = this.config.maxRequestsPerInterval;
        if (maxReqs) {
            // Fixed-window счётчик: перебираем, пока не окажемся в пределах лимита.
            // "Лишние" инкременты естественно затухают с истечением TTL окна на
            // стороне store — busy-loop не возникает благодаря sleep(intervalMs).
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const count = await store.incrementWindow(this.key, intervalMs);
                if (count <= maxReqs)
                    break;
                await sleep(intervalMs);
            }
        }
        let releaseSlot;
        if (this.config.maxConcurrent) {
            const leaseMs = (_b = this.config.leaseMs) !== null && _b !== void 0 ? _b : 30000;
            releaseSlot = await store.acquireConcurrencySlot(this.key, this.config.maxConcurrent, leaseMs);
        }
        return () => {
            void (releaseSlot === null || releaseSlot === void 0 ? void 0 : releaseSlot());
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
