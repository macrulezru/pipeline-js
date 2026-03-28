"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestExecutor = void 0;
const rest_client_1 = require("./rest-client");
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
/** Объединить два AbortSignal в один (aborts when either fires) */
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
class RequestExecutor {
    constructor(httpConfig) {
        var _a;
        this.httpConfig = httpConfig;
        this.client = (0, rest_client_1.getRestClient)(httpConfig);
        this.retryCfg = (_a = httpConfig.retry) !== null && _a !== void 0 ? _a : {};
    }
    /**
     * Выполнение одного запроса с поддержкой:
     * - retry с задержкой, экспоненциальным backoff и jitter
     * - фильтрацией retry по HTTP-статусу (retriableStatus)
     * - таймаута через AbortController (реально отменяет HTTP-запрос)
     * - внешнего AbortSignal (от orchestrator.abort())
     */
    async execute(command, reqConfig, retryCount, timeoutMs = 10000, externalSignal) {
        var _a, _b, _c, _d, _e;
        const maxAttempts = (_a = retryCount !== null && retryCount !== void 0 ? retryCount : this.retryCfg.attempts) !== null && _a !== void 0 ? _a : 0;
        const baseDelay = (_b = this.retryCfg.delayMs) !== null && _b !== void 0 ? _b : 0;
        const backoffMult = (_c = this.retryCfg.backoffMultiplier) !== null && _c !== void 0 ? _c : 1;
        const retriableStatus = this.retryCfg.retriableStatus;
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
                    ...reqConfig,
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
                const httpStatus = (_e = (_d = err === null || err === void 0 ? void 0 : err.response) === null || _d === void 0 ? void 0 : _d.status) !== null && _e !== void 0 ? _e : err === null || err === void 0 ? void 0 : err.status;
                if (retriableStatus && httpStatus !== undefined) {
                    if (!retriableStatus.includes(httpStatus)) {
                        throw err;
                    }
                }
                attempt++;
                if (attempt > maxAttempts)
                    break;
                // Экспоненциальный backoff + jitter
                if (baseDelay > 0) {
                    const delay = baseDelay * Math.pow(backoffMult, attempt - 1) +
                        Math.random() * baseDelay * 0.1;
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
exports.RequestExecutor = RequestExecutor;
