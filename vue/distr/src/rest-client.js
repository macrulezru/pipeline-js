"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toApiError = toApiError;
exports.createRestClient = createRestClient;
exports.getRestClient = getRestClient;
const axios_1 = __importDefault(require("axios"));
function toApiError(error) {
    var _a;
    if (axios_1.default.isCancel(error)) {
        return {
            message: 'Запрос был отменен',
            code: 'REQUEST_CANCELLED',
        };
    }
    if (axios_1.default.isAxiosError(error)) {
        const axiosError = error;
        return {
            message: axiosError.message,
            code: axiosError.code,
            status: (_a = axiosError.response) === null || _a === void 0 ? void 0 : _a.status,
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
        message: 'Произошла неизвестная ошибка',
        timestamp: new Date(),
    };
}
const restClientCache = new Map();
function createRestClient(config) {
    const httpClient = axios_1.default.create({
        baseURL: config.baseURL,
        timeout: config.timeout,
        headers: config.headers,
        withCredentials: config.withCredentials,
    });
    // ...реализация rate limit, cache, interceptors, request, etc. (скопировать из rest.ts при необходимости)
    // Для краткости: реализуйте полный функционал по мере необходимости.
    async function request(command, req) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const reqId = (_a = req === null || req === void 0 ? void 0 : req.requestId) !== null && _a !== void 0 ? _a : Math.random().toString(36).slice(2);
        const methodUpper = ((_b = req === null || req === void 0 ? void 0 : req.method) !== null && _b !== void 0 ? _b : 'GET').toUpperCase();
        const fullUrl = `${config.baseURL}${command}`;
        (_d = (_c = config.metrics) === null || _c === void 0 ? void 0 : _c.onRequestStart) === null || _d === void 0 ? void 0 : _d.call(_c, {
            id: reqId,
            method: methodUpper,
            url: fullUrl,
            timestamp: Date.now(),
            requestBody: req === null || req === void 0 ? void 0 : req.data,
            requestParams: req === null || req === void 0 ? void 0 : req.params,
            requestHeaders: req === null || req === void 0 ? void 0 : req.headers,
        });
        const startTs = Date.now();
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
            // --- вычисление размера ответа ---
            let responseBytes = undefined;
            const headers = response.headers;
            const contentLengthHeader = headers['content-length'] || headers['Content-Length'] || undefined;
            const parsedLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;
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
                        const str = JSON.stringify(raw);
                        responseBytes = new TextEncoder().encode(str).length;
                    }
                }
                catch {
                    // ignore sizing errors
                }
            }
            (_f = (_e = config.metrics) === null || _e === void 0 ? void 0 : _e.onRequestEnd) === null || _f === void 0 ? void 0 : _f.call(_e, {
                id: reqId,
                durationMs: duration,
                status: response.status,
                bytes: responseBytes,
                responseBody: response.data,
                responseHeaders: response.headers,
            });
            return payload;
        }
        catch (error) {
            const duration = Date.now() - startTs;
            (_h = (_g = config.metrics) === null || _g === void 0 ? void 0 : _g.onRequestEnd) === null || _h === void 0 ? void 0 : _h.call(_g, {
                id: reqId,
                durationMs: duration,
                error: toApiError(error),
            });
            throw error;
        }
    }
    // --- Реализация cancellableRequest ---
    const cancelTokenSources = new Map();
    function cancelRequest(key) {
        const source = cancelTokenSources.get(key);
        if (source) {
            source.cancel(`Запрос отменен по ключу: ${key}`);
            cancelTokenSources.delete(key);
        }
    }
    async function cancellableRequest(key, command, config) {
        cancelRequest(key);
        const axios = await import('axios');
        const source = axios.default.CancelToken.source();
        cancelTokenSources.set(key, source);
        try {
            return await request(command, {
                ...config,
                cancelToken: source.token,
            });
        }
        finally {
            cancelTokenSources.delete(key);
        }
    }
    return {
        request,
        get: (command, config) => request(command, { ...config, method: 'GET' }),
        post: (command, data, config) => request(command, { ...config, method: 'POST', data }),
        put: (command, data, config) => request(command, { ...config, method: 'PUT', data }),
        delete: (command, config) => request(command, { ...config, method: 'DELETE' }),
        cancellableRequest,
        cancelRequest,
    };
}
function getRestClient(config) {
    var _a, _b;
    const key = JSON.stringify({
        baseURL: config.baseURL,
        timeout: config.timeout,
        withCredentials: config.withCredentials,
        headers: (_a = config.headers) !== null && _a !== void 0 ? _a : {},
        retry: (_b = config.retry) !== null && _b !== void 0 ? _b : {},
        metrics: !!config.metrics,
    });
    const cachedClient = restClientCache.get(key);
    if (cachedClient)
        return cachedClient;
    const client = createRestClient(config);
    restClientCache.set(key, client);
    return client;
}
