import { getRestClient } from './rest-client.js';
/** Небольшой хелпер: sleep с поддержкой AbortSignal */
function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal === null || signal === void 0 ? void 0 : signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
    });
}
/** Объединить два AbortSignal в один */
function mergeSignals(a, b) {
    if (!a && !b)
        return undefined;
    if (!a)
        return b;
    if (!b)
        return a;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (a.aborted || b.aborted) {
        controller.abort();
    }
    else {
        a.addEventListener('abort', abort, { once: true });
        b.addEventListener('abort', abort, { once: true });
    }
    return controller.signal;
}
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function generateIdempotencyKey() {
    var _a;
    const g = globalThis;
    if ((_a = g.crypto) === null || _a === void 0 ? void 0 : _a.randomUUID)
        return g.crypto.randomUUID();
    return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
/**
 * Разбирает значение заголовка Retry-After в миллисекунды.
 * Поддерживает оба формата: число секунд и HTTP-дата.
 * Возвращает значение, ограниченное maxMs сверху и 0 снизу.
 */
function parseRetryAfter(value, maxMs) {
    // Числовой формат: количество секунд (может быть 0)
    const asNumber = Number(value);
    if (!isNaN(asNumber) && value.trim() !== '') {
        return Math.min(Math.max(asNumber * 1000, 0), maxMs);
    }
    // Формат HTTP-даты: "Wed, 21 Oct 2015 07:28:00 GMT"
    const asDate = new Date(value);
    if (!isNaN(asDate.getTime())) {
        const waitMs = asDate.getTime() - Date.now();
        return Math.min(Math.max(waitMs, 0), maxMs);
    }
    return null;
}
export class RequestExecutor {
    constructor(httpConfig) {
        var _a;
        this.httpConfig = httpConfig;
        this.client = getRestClient(httpConfig);
        this.retryCfg = (_a = httpConfig.retry) !== null && _a !== void 0 ? _a : {};
    }
    /**
     * Выполнение одного запроса с поддержкой:
     * - retry с задержкой, экспоненциальным backoff и jitter
     * - фильтрацией retry по HTTP-статусу (retriableStatus)
     * - разбором заголовка Retry-After (приоритет над backoff-задержкой)
     * - потолком maxRetryAfterMs для Retry-After
     * - таймаута через AbortController (реально отменяет HTTP-запрос)
     * - внешнего AbortSignal (от orchestrator.abort())
     */
    async execute(command, reqConfig, retryCount, timeoutMs = 10000, externalSignal) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        const maxAttempts = (_a = retryCount !== null && retryCount !== void 0 ? retryCount : this.retryCfg.attempts) !== null && _a !== void 0 ? _a : 0;
        const baseDelay = (_b = this.retryCfg.delayMs) !== null && _b !== void 0 ? _b : 0;
        const backoffMult = (_c = this.retryCfg.backoffMultiplier) !== null && _c !== void 0 ? _c : 1;
        const retriableStatus = this.retryCfg.retriableStatus;
        const maxRetryAfterMs = (_d = this.retryCfg.maxRetryAfterMs) !== null && _d !== void 0 ? _d : 60000;
        // --- autoIdempotencyKey: сгенерировать ОДИН РАЗ до начала retry-цикла,
        // чтобы все попытки одного логического запроса несли один и тот же ключ ---
        let effectiveReqConfig = reqConfig;
        if (this.httpConfig.autoIdempotencyKey && !(reqConfig === null || reqConfig === void 0 ? void 0 : reqConfig.idempotencyKey)) {
            const method = ((_e = reqConfig === null || reqConfig === void 0 ? void 0 : reqConfig.method) !== null && _e !== void 0 ? _e : 'GET').toString().toUpperCase();
            if (MUTATING_METHODS.has(method)) {
                effectiveReqConfig = { ...reqConfig, idempotencyKey: generateIdempotencyKey() };
            }
        }
        let attempt = 0;
        let lastError;
        while (attempt <= maxAttempts) {
            // Проверяем внешний сигнал до каждой попытки
            if (externalSignal === null || externalSignal === void 0 ? void 0 : externalSignal.aborted) {
                throw new DOMException('Pipeline aborted', 'AbortError');
            }
            // Таймаут: создаём AbortController на каждую попытку
            const timeoutController = new AbortController();
            const timeoutId = timeoutMs > 0
                ? setTimeout(() => timeoutController.abort(), timeoutMs)
                : undefined;
            const signal = mergeSignals(externalSignal, timeoutController.signal);
            try {
                const result = await this.client.request(command, {
                    ...effectiveReqConfig,
                    signal,
                });
                return result;
            }
            catch (err) {
                lastError = err;
                // Если это AbortError от таймаута или внешнего сигнала — не повторяем
                const isAbort = (err === null || err === void 0 ? void 0 : err.name) === 'AbortError' ||
                    (err === null || err === void 0 ? void 0 : err.code) === 'ERR_CANCELED' ||
                    (externalSignal === null || externalSignal === void 0 ? void 0 : externalSignal.aborted);
                if (isAbort)
                    throw err;
                // Проверяем retriableStatus
                const httpStatus = (_g = (_f = err === null || err === void 0 ? void 0 : err.response) === null || _f === void 0 ? void 0 : _f.status) !== null && _g !== void 0 ? _g : err === null || err === void 0 ? void 0 : err.status;
                if (retriableStatus && httpStatus !== undefined) {
                    if (!retriableStatus.includes(httpStatus)) {
                        throw err;
                    }
                }
                attempt++;
                if (attempt > maxAttempts)
                    break;
                // ── Retry-After: приоритет над backoff-задержкой ─────────────────
                const retryAfterHeader = (_k = (_j = (_h = err === null || err === void 0 ? void 0 : err.response) === null || _h === void 0 ? void 0 : _h.headers) === null || _j === void 0 ? void 0 : _j['retry-after']) !== null && _k !== void 0 ? _k : (_m = (_l = err === null || err === void 0 ? void 0 : err.response) === null || _l === void 0 ? void 0 : _l.headers) === null || _m === void 0 ? void 0 : _m['Retry-After'];
                let delay;
                if (retryAfterHeader !== undefined) {
                    const parsed = parseRetryAfter(retryAfterHeader, maxRetryAfterMs);
                    // Если не распарсилось — фоллбэк на backoff
                    delay = parsed !== null
                        ? parsed
                        : baseDelay * Math.pow(backoffMult, attempt - 1);
                }
                else if (baseDelay > 0) {
                    delay =
                        baseDelay * Math.pow(backoffMult, attempt - 1) +
                            Math.random() * baseDelay * 0.1;
                }
                else {
                    delay = 0;
                }
                if (delay > 0) {
                    await sleep(Math.round(delay), externalSignal);
                }
            }
            finally {
                if (timeoutId !== undefined)
                    clearTimeout(timeoutId);
            }
        }
        throw lastError;
    }
}
