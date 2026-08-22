"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestExecutor = void 0;
const rest_client_js_1 = require("./rest-client.js");
/** Small helper: sleep with AbortSignal support */
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
/** Merge two AbortSignals into one */
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
 * Parses the Retry-After header value into milliseconds.
 * Supports both formats: a number of seconds and an HTTP date.
 * Returns a value clamped to maxMs at the top and 0 at the bottom.
 */
function parseRetryAfter(value, maxMs) {
    // Numeric format: number of seconds (can be 0)
    const asNumber = Number(value);
    if (!isNaN(asNumber) && value.trim() !== '') {
        return Math.min(Math.max(asNumber * 1000, 0), maxMs);
    }
    // HTTP date format: "Wed, 21 Oct 2015 07:28:00 GMT"
    const asDate = new Date(value);
    if (!isNaN(asDate.getTime())) {
        const waitMs = asDate.getTime() - Date.now();
        return Math.min(Math.max(waitMs, 0), maxMs);
    }
    return null;
}
class RequestExecutor {
    constructor(httpConfig) {
        var _a;
        this.httpConfig = httpConfig;
        this.client = (0, rest_client_js_1.getRestClient)(httpConfig);
        this.retryCfg = (_a = httpConfig.retry) !== null && _a !== void 0 ? _a : {};
    }
    /**
     * Executes a single request with support for:
     * - retry with delay, exponential backoff, and jitter
     * - filtering retries by HTTP status (retriableStatus)
     * - parsing the Retry-After header (takes priority over the backoff delay)
     * - a maxRetryAfterMs ceiling for Retry-After
     * - a timeout via AbortController (actually cancels the HTTP request)
     * - an external AbortSignal (from orchestrator.abort())
     */
    async execute(command, reqConfig, retryCount, timeoutMs = 10000, externalSignal) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
        const maxAttempts = (_a = retryCount !== null && retryCount !== void 0 ? retryCount : this.retryCfg.attempts) !== null && _a !== void 0 ? _a : 0;
        const baseDelay = (_b = this.retryCfg.delayMs) !== null && _b !== void 0 ? _b : 0;
        const backoffMult = (_c = this.retryCfg.backoffMultiplier) !== null && _c !== void 0 ? _c : 1;
        const retriableStatus = this.retryCfg.retriableStatus;
        const maxRetryAfterMs = (_d = this.retryCfg.maxRetryAfterMs) !== null && _d !== void 0 ? _d : 60000;
        const jitterStrategy = (_e = this.retryCfg.jitterStrategy) !== null && _e !== void 0 ? _e : 'fixed';
        // Ceiling for "decorrelated": the largest nominal backoff delay that
        // this series of attempts could produce without jitter.
        const decorrelatedCap = baseDelay * Math.pow(backoffMult, maxAttempts);
        // "Decorrelated" jitter state — the delay of the previous attempt of this call.
        let prevDelay = baseDelay;
        /** Backoff delay for attempt number `n`, according to jitterStrategy. */
        function computeBackoffDelay(n) {
            if (baseDelay <= 0)
                return 0;
            const nominal = baseDelay * Math.pow(backoffMult, n - 1);
            switch (jitterStrategy) {
                case 'full':
                    // AWS "full jitter": uniformly between 0 and the nominal backoff.
                    return Math.random() * nominal;
                case 'decorrelated': {
                    // AWS "decorrelated jitter": depends on the previous attempt's delay —
                    // less synchronization between parallel clients than "full".
                    const next = Math.min(decorrelatedCap, baseDelay + Math.random() * (prevDelay * 3 - baseDelay));
                    prevDelay = next;
                    return next;
                }
                case 'fixed':
                default:
                    // Backward compatible: nominal backoff plus up to +10% on top.
                    return nominal + Math.random() * baseDelay * 0.1;
            }
        }
        // --- autoIdempotencyKey: generate it ONCE before the retry loop starts,
        // so that all attempts of one logical request carry the same key ---
        let effectiveReqConfig = reqConfig;
        if (this.httpConfig.autoIdempotencyKey && !(reqConfig === null || reqConfig === void 0 ? void 0 : reqConfig.idempotencyKey)) {
            const method = ((_f = reqConfig === null || reqConfig === void 0 ? void 0 : reqConfig.method) !== null && _f !== void 0 ? _f : 'GET').toString().toUpperCase();
            if (MUTATING_METHODS.has(method)) {
                effectiveReqConfig = { ...reqConfig, idempotencyKey: generateIdempotencyKey() };
            }
        }
        let attempt = 0;
        let lastError;
        while (attempt <= maxAttempts) {
            // Check the external signal before each attempt
            if (externalSignal === null || externalSignal === void 0 ? void 0 : externalSignal.aborted) {
                throw new DOMException('Pipeline aborted', 'AbortError');
            }
            // Timeout: create an AbortController for each attempt
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
                const e = err;
                // If this is an AbortError from the timeout or the external signal — don't retry
                const isAbort = (e === null || e === void 0 ? void 0 : e.name) === 'AbortError' ||
                    (e === null || e === void 0 ? void 0 : e.code) === 'ERR_CANCELED' ||
                    (externalSignal === null || externalSignal === void 0 ? void 0 : externalSignal.aborted);
                if (isAbort)
                    throw err;
                // Check retriableStatus
                const httpStatus = (_h = (_g = e === null || e === void 0 ? void 0 : e.response) === null || _g === void 0 ? void 0 : _g.status) !== null && _h !== void 0 ? _h : e === null || e === void 0 ? void 0 : e.status;
                if (retriableStatus && httpStatus !== undefined) {
                    if (!retriableStatus.includes(httpStatus)) {
                        throw err;
                    }
                }
                attempt++;
                if (attempt > maxAttempts)
                    break;
                // ── Retry-After: takes priority over the backoff delay ─────────────────
                const retryAfterHeader = (_l = (_k = (_j = e === null || e === void 0 ? void 0 : e.response) === null || _j === void 0 ? void 0 : _j.headers) === null || _k === void 0 ? void 0 : _k['retry-after']) !== null && _l !== void 0 ? _l : (_o = (_m = e === null || e === void 0 ? void 0 : e.response) === null || _m === void 0 ? void 0 : _m.headers) === null || _o === void 0 ? void 0 : _o['Retry-After'];
                let delay;
                if (retryAfterHeader !== undefined) {
                    const parsed = parseRetryAfter(retryAfterHeader, maxRetryAfterMs);
                    // If parsing failed — fall back to backoff (with the same jitterStrategy)
                    delay = parsed !== null ? parsed : computeBackoffDelay(attempt);
                }
                else {
                    delay = computeBackoffDelay(attempt);
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
exports.RequestExecutor = RequestExecutor;
