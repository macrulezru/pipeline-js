"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toApiError = toApiError;
exports.clearRestClientCache = clearRestClientCache;
exports.createRestClient = createRestClient;
exports.getRestClient = getRestClient;
const axios_1 = __importDefault(require("axios"));
const cache_1 = require("./cache");
const rate_limiter_1 = require("./rate-limiter");
function toApiError(error) {
    var _a;
    if (axios_1.default.isCancel(error)) {
        return {
            message: 'Request was cancelled',
            code: 'REQUEST_CANCELLED',
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
        message: 'An unknown error occurred',
        timestamp: new Date(),
    };
}
const MAX_CLIENT_CACHE_SIZE = 100;
const restClientCache = new Map();
/** Очистить кэш клиентов (полезно в тестах или при смене конфигурации) */
function clearRestClientCache() {
    restClientCache.clear();
}
function createRestClient(config) {
    const httpClient = axios_1.default.create({
        baseURL: config.baseURL,
        timeout: config.timeout,
        headers: config.headers,
        withCredentials: config.withCredentials,
    });
    // --- Кэш ответов ---
    const responseCache = new cache_1.TtlCache(1000);
    // --- Rate limiter ---
    const rateLimiter = config.rateLimit ? new rate_limiter_1.RateLimiter(config.rateLimit) : null;
    function buildCacheKey(method, url, req) {
        return JSON.stringify({
            method: method.toUpperCase(),
            url,
            params: req === null || req === void 0 ? void 0 : req.params,
            cacheKey: req === null || req === void 0 ? void 0 : req.cacheKey,
        });
    }
    async function request(command, req) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        const reqId = (_a = req === null || req === void 0 ? void 0 : req.requestId) !== null && _a !== void 0 ? _a : Math.random().toString(36).slice(2);
        const methodUpper = ((_b = req === null || req === void 0 ? void 0 : req.method) !== null && _b !== void 0 ? _b : 'GET').toUpperCase();
        const fullUrl = `${(_c = config.baseURL) !== null && _c !== void 0 ? _c : ''}${command}`;
        // --- Проверка кэша ---
        const cacheEnabled = (_d = req === null || req === void 0 ? void 0 : req.useCache) !== null && _d !== void 0 ? _d : (((_e = config.cache) === null || _e === void 0 ? void 0 : _e.enabled) && methodUpper === 'GET');
        const cacheTtl = (_h = (_f = req === null || req === void 0 ? void 0 : req.cacheTtlMs) !== null && _f !== void 0 ? _f : (_g = config.cache) === null || _g === void 0 ? void 0 : _g.ttlMs) !== null && _h !== void 0 ? _h : 60000;
        if (cacheEnabled) {
            const cacheKey = buildCacheKey(methodUpper, fullUrl, req);
            const cached = responseCache.get(cacheKey);
            if (cached)
                return cached;
        }
        (_k = (_j = config.metrics) === null || _j === void 0 ? void 0 : _j.onRequestStart) === null || _k === void 0 ? void 0 : _k.call(_j, {
            id: reqId,
            method: methodUpper,
            url: fullUrl,
            timestamp: Date.now(),
            requestBody: req === null || req === void 0 ? void 0 : req.data,
            requestParams: req === null || req === void 0 ? void 0 : req.params,
            requestHeaders: req === null || req === void 0 ? void 0 : req.headers,
        });
        const startTs = Date.now();
        // --- Rate limiting ---
        let release;
        if (rateLimiter && !(req === null || req === void 0 ? void 0 : req.skipRateLimit)) {
            release = await rateLimiter.acquire();
        }
        try {
            const response = await httpClient.request({
                url: command,
                ...req,
            });
            const payload = {
                data: response.data,
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
            };
            const duration = Date.now() - startTs;
            // --- Вычисление размера ответа ---
            let responseBytes;
            const headers = response.headers;
            const contentLengthHeader = headers['content-length'] || headers['Content-Length'];
            const parsedLength = contentLengthHeader ? Number(contentLengthHeader) : NaN;
            if (Number.isFinite(parsedLength) && parsedLength !== 0) {
                responseBytes = parsedLength;
            }
            else {
                try {
                    const raw = response.data;
                    if (typeof raw === 'string') {
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
            (_m = (_l = config.metrics) === null || _l === void 0 ? void 0 : _l.onRequestEnd) === null || _m === void 0 ? void 0 : _m.call(_l, {
                id: reqId,
                durationMs: duration,
                status: response.status,
                bytes: responseBytes,
                responseBody: response.data,
                responseHeaders: response.headers,
            });
            // --- Сохранение в кэш ---
            if (cacheEnabled) {
                const cacheKey = buildCacheKey(methodUpper, fullUrl, req);
                responseCache.set(cacheKey, payload, cacheTtl);
            }
            return payload;
        }
        catch (error) {
            const duration = Date.now() - startTs;
            (_p = (_o = config.metrics) === null || _o === void 0 ? void 0 : _o.onRequestEnd) === null || _p === void 0 ? void 0 : _p.call(_o, {
                id: reqId,
                durationMs: duration,
                error: toApiError(error),
            });
            throw error;
        }
        finally {
            release === null || release === void 0 ? void 0 : release();
        }
    }
    // --- Cancellable requests через AbortController (не CancelToken) ---
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
        get: (command, reqConfig) => request(command, { ...reqConfig, method: 'GET' }),
        post: (command, data, reqConfig) => request(command, { ...reqConfig, method: 'POST', data }),
        put: (command, data, reqConfig) => request(command, { ...reqConfig, method: 'PUT', data }),
        patch: (command, data, reqConfig) => request(command, { ...reqConfig, method: 'PATCH', data }),
        delete: (command, reqConfig) => request(command, { ...reqConfig, method: 'DELETE' }),
        cancellableRequest,
        cancelRequest,
        /** Очистить кэш ответов данного клиента */
        clearCache: () => responseCache.clear(),
    };
}
function getRestClient(config) {
    var _a, _b, _c, _d;
    const key = JSON.stringify({
        baseURL: config.baseURL,
        timeout: config.timeout,
        withCredentials: config.withCredentials,
        headers: (_a = config.headers) !== null && _a !== void 0 ? _a : {},
        retry: (_b = config.retry) !== null && _b !== void 0 ? _b : {},
        cache: (_c = config.cache) !== null && _c !== void 0 ? _c : {},
        rateLimit: (_d = config.rateLimit) !== null && _d !== void 0 ? _d : {},
        metrics: !!config.metrics,
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
