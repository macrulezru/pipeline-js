"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toApiError = toApiError;
exports.sanitizeHeadersMap = sanitizeHeadersMap;
exports.clearRestClientCache = clearRestClientCache;
exports.createRestClient = createRestClient;
exports.getRestClient = getRestClient;
const axios_1 = __importDefault(require("axios"));
const cache_1 = require("./cache");
const rate_limiter_1 = require("./rate-limiter");
const types_1 = require("./types");
function toApiError(error) {
    var _a;
    if (axios_1.default.isCancel(error)) {
        return {
            message: "Request was cancelled",
            code: "REQUEST_CANCELLED",
        };
    }
    if (axios_1.default.isAxiosError(error)) {
        return {
            message: error.message,
            code: error.code,
            status: (_a = error.response) === null || _a === void 0 ? void 0 : _a.status,
            timestamp: new Date(),
        };
    }
    if (error instanceof Error) {
        return {
            message: error.message,
            timestamp: new Date(),
        };
    }
    return {
        message: "An unknown error occurred",
        timestamp: new Date(),
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Log sanitization
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Маскирует чувствительные заголовки в объекте перед передачей в метрики.
 * Не мутирует оригинальный объект.
 */
function sanitizeHeadersMap(headers, extraSensitive = []) {
    if (!headers)
        return headers;
    const blocked = new Set([
        ...types_1.DEFAULT_SENSITIVE_HEADERS.map((h) => h.toLowerCase()),
        ...extraSensitive.map((h) => h.toLowerCase()),
    ]);
    return Object.fromEntries(Object.entries(headers).map(([k, v]) => blocked.has(k.toLowerCase()) ? [k, "REDACTED"] : [k, v]));
}
// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
/** Нормализовать значение в массив */
function toArray(value) {
    if (!value)
        return [];
    return Array.isArray(value) ? value : [value];
}
/** Применить цепочку перехватчиков к значению */
async function applyInterceptors(interceptors, value) {
    let result = value;
    for (const interceptor of interceptors) {
        result = await interceptor(result);
    }
    return result;
}
// ─────────────────────────────────────────────────────────────────────────────
// Client cache
// ─────────────────────────────────────────────────────────────────────────────
const MAX_CLIENT_CACHE_SIZE = 100;
const restClientCache = new Map();
/** Очистить кэш клиентов (полезно в тестах или при смене конфигурации) */
function clearRestClientCache() {
    restClientCache.clear();
}
// ─────────────────────────────────────────────────────────────────────────────
// createRestClient
// ─────────────────────────────────────────────────────────────────────────────
function createRestClient(config) {
    var _a, _b, _c, _d, _e;
    const httpClient = axios_1.default.create({
        baseURL: config.baseURL,
        timeout: config.timeout,
        headers: config.headers,
        withCredentials: config.withCredentials,
    });
    // --- Кэш ответов ---
    const responseCache = new cache_1.TtlCache(1000);
    // --- Rate limiter ---
    const rateLimiter = config.rateLimit
        ? new rate_limiter_1.RateLimiter(config.rateLimit)
        : null;
    // --- Sanitization helpers ---
    const shouldSanitize = (_a = config.sanitizeHeaders) !== null && _a !== void 0 ? _a : false;
    const extraSensitive = (_b = config.sensitiveHeaders) !== null && _b !== void 0 ? _b : [];
    // --- Interceptors ---
    const reqInterceptors = toArray((_c = config.interceptors) === null || _c === void 0 ? void 0 : _c.request);
    const resInterceptors = toArray((_d = config.interceptors) === null || _d === void 0 ? void 0 : _d.response);
    const errInterceptors = toArray((_e = config.interceptors) === null || _e === void 0 ? void 0 : _e.error);
    // --- In-flight deduplication map ---
    const inFlightRequests = new Map();
    function maybeSanitize(headers) {
        return shouldSanitize
            ? sanitizeHeadersMap(headers, extraSensitive)
            : headers;
    }
    function buildCacheKey(method, url, req) {
        return JSON.stringify({
            method: method.toUpperCase(),
            url,
            params: req === null || req === void 0 ? void 0 : req.params,
            cacheKey: req === null || req === void 0 ? void 0 : req.cacheKey,
        });
    }
    // ── Внутренняя логика одного HTTP-запроса (без dedup-обёртки) ──────────────
    // _retried — внутренний флаг, предотвращает бесконечную петлю при 401-retry
    async function _executeRequest(command, req, _retried = false) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
        const reqId = (_a = req === null || req === void 0 ? void 0 : req.requestId) !== null && _a !== void 0 ? _a : Math.random().toString(36).slice(2);
        const methodUpper = ((_b = req === null || req === void 0 ? void 0 : req.method) !== null && _b !== void 0 ? _b : "GET").toUpperCase();
        const fullUrl = `${(_c = config.baseURL) !== null && _c !== void 0 ? _c : ""}${command}`;
        // --- Auth: получаем токен и инжектируем заголовок ---
        let authHeaders = {};
        if (config.auth) {
            const token = await config.auth.getToken();
            authHeaders = { Authorization: `Bearer ${token}` };
        }
        const mergedHeaders = {
            ...req === null || req === void 0 ? void 0 : req.headers,
            ...authHeaders,
        };
        // --- Request interceptors ---
        let processedReq = { ...req, headers: mergedHeaders };
        if (reqInterceptors.length > 0) {
            processedReq = await applyInterceptors(reqInterceptors, processedReq);
        }
        (_e = (_d = config.metrics) === null || _d === void 0 ? void 0 : _d.onRequestStart) === null || _e === void 0 ? void 0 : _e.call(_d, {
            id: reqId,
            method: methodUpper,
            url: fullUrl,
            timestamp: Date.now(),
            requestBody: processedReq === null || processedReq === void 0 ? void 0 : processedReq.data,
            requestParams: processedReq === null || processedReq === void 0 ? void 0 : processedReq.params,
            requestHeaders: maybeSanitize(processedReq === null || processedReq === void 0 ? void 0 : processedReq.headers),
        });
        const startTs = Date.now();
        // --- Rate limiting ---
        let release;
        if (rateLimiter && !(processedReq === null || processedReq === void 0 ? void 0 : processedReq.skipRateLimit)) {
            release = await rateLimiter.acquire();
        }
        try {
            let payload;
            if (config.adapter) {
                // ── Custom HTTP adapter (fetch, etc.) ───────────────────────────
                payload = await config.adapter.request({
                    ...processedReq,
                    baseURL: config.baseURL,
                    url: command,
                });
            }
            else {
                // ── Default: axios ───────────────────────────────────────────────
                const response = await httpClient.request({
                    url: command,
                    ...processedReq,
                    headers: processedReq === null || processedReq === void 0 ? void 0 : processedReq.headers,
                });
                payload = {
                    data: response.data,
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                };
            }
            const duration = Date.now() - startTs;
            // --- Вычисление размера ответа ---
            let responseBytes;
            const respHeaders = payload.headers;
            const contentLengthHeader = respHeaders["content-length"] || respHeaders["Content-Length"];
            const parsedLength = contentLengthHeader
                ? Number(contentLengthHeader)
                : NaN;
            if (Number.isFinite(parsedLength) && parsedLength !== 0) {
                responseBytes = parsedLength;
            }
            else {
                try {
                    const raw = payload.data;
                    if (typeof raw === "string") {
                        responseBytes = new TextEncoder().encode(raw).length;
                    }
                    else if (raw !== undefined) {
                        responseBytes = new TextEncoder().encode(JSON.stringify(raw)).length;
                    }
                }
                catch {
                    // ignore sizing errors
                }
            }
            (_g = (_f = config.metrics) === null || _f === void 0 ? void 0 : _f.onRequestEnd) === null || _g === void 0 ? void 0 : _g.call(_f, {
                id: reqId,
                durationMs: duration,
                status: payload.status,
                bytes: responseBytes,
                responseBody: payload.data,
                responseHeaders: maybeSanitize(payload.headers),
            });
            // --- Response interceptors ---
            if (resInterceptors.length > 0) {
                payload = await applyInterceptors(resInterceptors, payload);
            }
            // --- Сохранение в кэш ---
            const cacheEnabled = (_h = processedReq === null || processedReq === void 0 ? void 0 : processedReq.useCache) !== null && _h !== void 0 ? _h : (((_j = config.cache) === null || _j === void 0 ? void 0 : _j.enabled) && methodUpper === "GET");
            if (cacheEnabled) {
                const cacheTtl = (_m = (_k = processedReq === null || processedReq === void 0 ? void 0 : processedReq.cacheTtlMs) !== null && _k !== void 0 ? _k : (_l = config.cache) === null || _l === void 0 ? void 0 : _l.ttlMs) !== null && _m !== void 0 ? _m : 60000;
                const cacheKey = buildCacheKey(methodUpper, fullUrl, processedReq);
                responseCache.set(cacheKey, payload, cacheTtl);
            }
            return payload;
        }
        catch (error) {
            const duration = Date.now() - startTs;
            // --- Auth: 401 → onUnauthorized() → одна попытка повтора ---
            const errorStatus = axios_1.default.isAxiosError(error)
                ? (_o = error.response) === null || _o === void 0 ? void 0 : _o.status
                : error === null || error === void 0 ? void 0 : error.status;
            if (config.auth && !_retried && errorStatus === 401) {
                await ((_q = (_p = config.auth).onUnauthorized) === null || _q === void 0 ? void 0 : _q.call(_p));
                // Повторяем с флагом _retried=true — второй 401 уже не будет перехвачен
                return _executeRequest(command, req, true);
            }
            let apiError = toApiError(error);
            // --- Error interceptors ---
            if (errInterceptors.length > 0) {
                apiError = await applyInterceptors(errInterceptors, apiError);
            }
            (_s = (_r = config.metrics) === null || _r === void 0 ? void 0 : _r.onRequestEnd) === null || _s === void 0 ? void 0 : _s.call(_r, {
                id: reqId,
                durationMs: duration,
                error: apiError,
            });
            // --- Global onError handler ---
            if (config.onError) {
                await config.onError(apiError, processedReq !== null && processedReq !== void 0 ? processedReq : {});
            }
            throw error;
        }
        finally {
            release === null || release === void 0 ? void 0 : release();
        }
    }
    // ── Основная функция запроса (с кэшем и dedup) ──────────────────────────────
    async function request(command, req, _retried = false) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        const methodUpper = ((_a = req === null || req === void 0 ? void 0 : req.method) !== null && _a !== void 0 ? _a : "GET").toUpperCase();
        const fullUrl = `${(_b = config.baseURL) !== null && _b !== void 0 ? _b : ""}${command}`;
        // --- Проверка кэша ---
        const cacheEnabled = (_c = req === null || req === void 0 ? void 0 : req.useCache) !== null && _c !== void 0 ? _c : (((_d = config.cache) === null || _d === void 0 ? void 0 : _d.enabled) && methodUpper === "GET");
        const cacheTtl = (_g = (_e = req === null || req === void 0 ? void 0 : req.cacheTtlMs) !== null && _e !== void 0 ? _e : (_f = config.cache) === null || _f === void 0 ? void 0 : _f.ttlMs) !== null && _g !== void 0 ? _g : 60000;
        const cacheStrategy = (_j = (_h = config.cache) === null || _h === void 0 ? void 0 : _h.strategy) !== null && _j !== void 0 ? _j : "strict";
        const staleMs = (_l = (_k = config.cache) === null || _k === void 0 ? void 0 : _k.staleMs) !== null && _l !== void 0 ? _l : 0;
        if (cacheEnabled) {
            const cacheKey = buildCacheKey(methodUpper, fullUrl, req);
            if (cacheStrategy === "stale-while-revalidate") {
                const staleResult = responseCache.getStale(cacheKey, staleMs);
                if (staleResult) {
                    if (staleResult.isStale) {
                        // Фоновое обновление без блокирования
                        _executeRequest(command, req, _retried)
                            .then((fresh) => responseCache.set(cacheKey, fresh, cacheTtl))
                            .catch(() => {
                            /* ignore background revalidation errors */
                        });
                    }
                    return staleResult.value;
                }
            }
            else {
                const cached = responseCache.get(cacheKey);
                if (cached)
                    return cached;
            }
        }
        // --- Request deduplication (только для GET без кэша) ---
        const shouldDedup = ((_m = config.deduplicateRequests) !== null && _m !== void 0 ? _m : false) &&
            methodUpper === "GET" &&
            !(req === null || req === void 0 ? void 0 : req.skipRateLimit);
        if (shouldDedup) {
            const dedupKey = buildCacheKey(methodUpper, fullUrl, req);
            const existing = inFlightRequests.get(dedupKey);
            if (existing)
                return existing;
            const promise = _executeRequest(command, req, _retried).finally(() => {
                inFlightRequests.delete(dedupKey);
            });
            inFlightRequests.set(dedupKey, promise);
            return promise;
        }
        return _executeRequest(command, req, _retried);
    }
    // --- Cancellable requests через AbortController ---
    const abortControllers = new Map();
    function cancelRequest(key) {
        var _a;
        (_a = abortControllers.get(key)) === null || _a === void 0 ? void 0 : _a.abort();
        abortControllers.delete(key);
    }
    async function cancellableRequest(key, command, reqConfig) {
        cancelRequest(key);
        const controller = new AbortController();
        abortControllers.set(key, controller);
        try {
            return await request(command, {
                ...reqConfig,
                signal: controller.signal,
            });
        }
        finally {
            abortControllers.delete(key);
        }
    }
    return {
        request,
        get: (command, reqConfig) => request(command, { ...reqConfig, method: "GET" }),
        post: (command, data, reqConfig) => request(command, { ...reqConfig, method: "POST", data }),
        put: (command, data, reqConfig) => request(command, { ...reqConfig, method: "PUT", data }),
        patch: (command, data, reqConfig) => request(command, { ...reqConfig, method: "PATCH", data }),
        delete: (command, reqConfig) => request(command, { ...reqConfig, method: "DELETE" }),
        head: (command, reqConfig) => request(command, { ...reqConfig, method: "HEAD" }),
        options: (command, reqConfig) => request(command, { ...reqConfig, method: "OPTIONS" }),
        cancellableRequest,
        cancelRequest,
        /** Очистить кэш ответов данного клиента */
        clearCache: () => responseCache.clear(),
    };
}
function getRestClient(config) {
    var _a, _b, _c, _d, _e, _f, _g;
    const key = JSON.stringify({
        baseURL: config.baseURL,
        timeout: config.timeout,
        withCredentials: config.withCredentials,
        headers: (_a = config.headers) !== null && _a !== void 0 ? _a : {},
        retry: (_b = config.retry) !== null && _b !== void 0 ? _b : {},
        cache: (_c = config.cache) !== null && _c !== void 0 ? _c : {},
        rateLimit: (_d = config.rateLimit) !== null && _d !== void 0 ? _d : {},
        sanitizeHeaders: (_e = config.sanitizeHeaders) !== null && _e !== void 0 ? _e : false,
        sensitiveHeaders: (_f = config.sensitiveHeaders) !== null && _f !== void 0 ? _f : [],
        metrics: !!config.metrics,
        auth: !!config.auth,
        deduplicateRequests: (_g = config.deduplicateRequests) !== null && _g !== void 0 ? _g : false,
        interceptors: !!config.interceptors,
        onError: !!config.onError,
        adapter: !!config.adapter,
    });
    const cachedClient = restClientCache.get(key);
    if (cachedClient)
        return cachedClient;
    // Evict старейшую запись при переполнении
    if (restClientCache.size >= MAX_CLIENT_CACHE_SIZE) {
        const oldestKey = restClientCache.keys().next().value;
        if (oldestKey !== undefined)
            restClientCache.delete(oldestKey);
    }
    const client = createRestClient(config);
    restClientCache.set(key, client);
    return client;
}
