import axios from "axios";
import { TtlCache } from "./cache.js";
import { RateLimiter } from "./rate-limiter.js";
import { CircuitBreaker, CircuitOpenError } from "./circuit-breaker.js";
import { OfflineQueue, OfflineQueuedError } from "./offline-queue.js";
import { DEFAULT_SENSITIVE_HEADERS } from "../types.js";
export function toApiError(error) {
    var _a, _b, _c;
    if (axios.isCancel(error)) {
        return {
            message: "Request was cancelled",
            code: "REQUEST_CANCELLED",
        };
    }
    if (error instanceof OfflineQueuedError) {
        return {
            message: error.message,
            code: "OFFLINE_QUEUED",
            timestamp: new Date(),
        };
    }
    if (axios.isAxiosError(error)) {
        return {
            message: error.message,
            code: error.code,
            status: (_a = error.response) === null || _a === void 0 ? void 0 : _a.status,
            timestamp: new Date(),
        };
    }
    if (error instanceof Error) {
        // Duck-typed, matching the same status/code extraction rest-client.ts
        // already does elsewhere for non-axios errors (see the 401-detection and
        // rate-limit-header logic in _executeRequest's catch block) — a custom
        // HttpAdapter throwing a plain Error with `.status`/`.response.status`
        // attached (see examples/edge-fetch-adapter.ts) still surfaces a usable
        // ApiError.status, e.g. for CircuitBreakerConfig.isFailure(error).
        const duckTyped = error;
        return {
            message: error.message,
            code: duckTyped.code,
            status: (_b = duckTyped.status) !== null && _b !== void 0 ? _b : (_c = duckTyped.response) === null || _c === void 0 ? void 0 : _c.status,
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
 * Masks sensitive headers in an object before passing it to metrics.
 * Does not mutate the original object.
 */
export function sanitizeHeadersMap(headers, extraSensitive = []) {
    if (!headers)
        return headers;
    const blocked = new Set([
        ...DEFAULT_SENSITIVE_HEADERS.map((h) => h.toLowerCase()),
        ...extraSensitive.map((h) => h.toLowerCase()),
    ]);
    return Object.fromEntries(Object.entries(headers).map(([k, v]) => blocked.has(k.toLowerCase()) ? [k, "REDACTED"] : [k, v]));
}
// ─────────────────────────────────────────────────────────────────────────────
// Tracing: W3C Trace Context (traceparent)
// ─────────────────────────────────────────────────────────────────────────────
const HEX_TRACE_ID_RE = /^[0-9a-f]{32}$/i;
function randomHex(length) {
    var _a;
    const g = globalThis;
    if ((_a = g.crypto) === null || _a === void 0 ? void 0 : _a.getRandomValues) {
        const bytes = new Uint8Array(Math.ceil(length / 2));
        g.crypto.getRandomValues(bytes);
        return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
            .join("")
            .slice(0, length);
    }
    let out = "";
    while (out.length < length)
        out += Math.random().toString(16).slice(2);
    return out.slice(0, length);
}
/**
 * Builds a `traceparent` header (W3C Trace Context, version "00").
 * If `traceId` is provided and is a valid 32-char hex string, it is used as-is
 * (e.g. a pipeline `runId` without dashes: a UUID without dashes is exactly
 * 32 hex characters); otherwise a random one is generated.
 */
export function generateTraceparent(traceId) {
    const tid = traceId && HEX_TRACE_ID_RE.test(traceId) ? traceId.toLowerCase() : randomHex(32);
    const spanId = randomHex(16);
    return `00-${tid}-${spanId}-01`;
}
// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
/** Normalize a value into an array */
function toArray(value) {
    if (!value)
        return [];
    return Array.isArray(value) ? value : [value];
}
/** Apply a chain of interceptors to a value */
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
/** Clear the client cache (useful in tests or when configuration changes) */
export function clearRestClientCache() {
    restClientCache.clear();
}
// ─────────────────────────────────────────────────────────────────────────────
// createRestClient
// ─────────────────────────────────────────────────────────────────────────────
export function createRestClient(config) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    // If a custom adapter is provided, the built-in axios instance is not created at all
    // (saves initialization and avoids requiring axios for edge/serverless environments).
    const httpClient = config.adapter
        ? undefined
        : axios.create({
            baseURL: config.baseURL,
            timeout: config.timeout,
            headers: config.headers,
            withCredentials: config.withCredentials,
        });
    // --- Response cache ---
    // Defaults to the built-in in-memory TtlCache; can be replaced with an
    // external backend (Redis, etc.) via config.cache.store for server-side
    // multi-instance deployments.
    const responseCache = (_b = (_a = config.cache) === null || _a === void 0 ? void 0 : _a.store) !== null && _b !== void 0 ? _b : new TtlCache(1000);
    // --- Rate limiter ---
    const rateLimiter = config.rateLimit
        ? new RateLimiter(config.rateLimit)
        : null;
    // --- Circuit breaker ---
    const circuitBreaker = config.circuitBreaker
        ? new CircuitBreaker(config.circuitBreaker)
        : null;
    // --- Offline queue ---
    // sendReplay calls _executeRequest directly (defined further below, but
    // available here via function-declaration hoisting) rather than going
    // through request()'s public funnel — a replay must bypass the
    // offline-check below entirely, since it's only invoked when the queue
    // itself already believes connectivity is back.
    const offlineQueue = ((_c = config.offlineQueue) === null || _c === void 0 ? void 0 : _c.enabled)
        ? new OfflineQueue(config.offlineQueue, (queued) => _executeRequest(queued.url, {
            method: queued.method,
            data: queued.data,
            params: queued.params,
            headers: queued.headers,
            idempotencyKey: queued.idempotencyKey,
        }), toApiError)
        : null;
    // --- Sanitization helpers ---
    // Secure by default: metrics callbacks are commonly forwarded to external
    // observability systems, so Authorization/Cookie/etc. are masked unless the
    // caller explicitly opts out.
    const shouldSanitize = (_d = config.sanitizeHeaders) !== null && _d !== void 0 ? _d : true;
    const extraSensitive = (_e = config.sensitiveHeaders) !== null && _e !== void 0 ? _e : [];
    // --- Interceptors ---
    const reqInterceptors = toArray((_f = config.interceptors) === null || _f === void 0 ? void 0 : _f.request);
    const resInterceptors = toArray((_g = config.interceptors) === null || _g === void 0 ? void 0 : _g.response);
    const errInterceptors = toArray((_h = config.interceptors) === null || _h === void 0 ? void 0 : _h.error);
    // --- In-flight deduplication map ---
    const inFlightRequests = new Map();
    // --- Auth: token cache (used when auth.tokenTtlMs is set) ---
    let cachedToken = null;
    function invalidateTokenCache() {
        cachedToken = null;
    }
    async function getAuthToken() {
        const auth = config.auth;
        if (auth.tokenTtlMs && cachedToken && Date.now() < cachedToken.expiresAt) {
            return cachedToken.value;
        }
        const token = await auth.getToken();
        if (auth.tokenTtlMs) {
            cachedToken = { value: token, expiresAt: Date.now() + auth.tokenTtlMs };
        }
        return token;
    }
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
    /**
     * Targeted invalidation of the response cache: removes only entries whose URL
     * matches the matcher (a substring, RegExp, or predicate), rather than the
     * entire cache. Useful to call after mutating requests (POST/PUT/DELETE) for
     * related GET endpoints.
     *
     * Requires cache.store (if a custom one is provided) to implement deleteWhere() —
     * without it, returns 0 and deletes nothing.
     */
    async function invalidateCache(matcher) {
        if (!responseCache.deleteWhere)
            return 0;
        return responseCache.deleteWhere((key) => {
            let parsed;
            try {
                parsed = JSON.parse(key);
            }
            catch {
                return false;
            }
            if (typeof matcher === "function")
                return matcher(parsed);
            if (matcher instanceof RegExp)
                return matcher.test(parsed.url);
            return parsed.url.includes(matcher);
        });
    }
    // ── Internal logic for a single HTTP request (without the dedup wrapper) ───
    // _retried — internal flag that prevents an infinite loop on a 401 retry
    async function _executeRequest(command, req, _retried = false) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7;
        const reqId = (_a = req === null || req === void 0 ? void 0 : req.requestId) !== null && _a !== void 0 ? _a : Math.random().toString(36).slice(2);
        const methodUpper = ((_b = req === null || req === void 0 ? void 0 : req.method) !== null && _b !== void 0 ? _b : "GET").toUpperCase();
        const fullUrl = `${(_c = config.baseURL) !== null && _c !== void 0 ? _c : ""}${command}`;
        // --- Circuit breaker: reject without touching the network/auth if the circuit is open ---
        if (circuitBreaker && !(await circuitBreaker.canExecute())) {
            const apiError = toApiError(new CircuitOpenError());
            (_e = (_d = config.metrics) === null || _d === void 0 ? void 0 : _d.onRequestStart) === null || _e === void 0 ? void 0 : _e.call(_d, {
                id: reqId,
                method: methodUpper,
                url: fullUrl,
                timestamp: Date.now(),
                requestBody: req === null || req === void 0 ? void 0 : req.data,
                requestParams: req === null || req === void 0 ? void 0 : req.params,
            });
            (_g = (_f = config.metrics) === null || _f === void 0 ? void 0 : _f.onRequestEnd) === null || _g === void 0 ? void 0 : _g.call(_f, { id: reqId, durationMs: 0, error: apiError });
            if (config.onError)
                await config.onError(apiError, req !== null && req !== void 0 ? req : {});
            throw new CircuitOpenError();
        }
        // --- Auth: get the token (from cache, if auth.tokenTtlMs is set) and inject the header ---
        let authHeaders = {};
        if (config.auth) {
            const token = await getAuthToken();
            authHeaders = { Authorization: `Bearer ${token}` };
        }
        // --- Tracing: W3C traceparent (does not overwrite an explicitly set header) ---
        let tracingHeaders = {};
        const existingHeaders = req === null || req === void 0 ? void 0 : req.headers;
        const hasExplicitTraceparent = existingHeaders &&
            Object.keys(existingHeaders).some((h) => h.toLowerCase() === "traceparent");
        if (((_h = config.tracing) === null || _h === void 0 ? void 0 : _h.generateTraceparent) && !hasExplicitTraceparent) {
            tracingHeaders = { traceparent: generateTraceparent(req === null || req === void 0 ? void 0 : req.traceId) };
        }
        // --- Idempotency-Key (when explicitly set on the request) ---
        let idempotencyHeaders = {};
        if (req === null || req === void 0 ? void 0 : req.idempotencyKey) {
            const headerName = (_j = config.idempotencyHeaderName) !== null && _j !== void 0 ? _j : "Idempotency-Key";
            idempotencyHeaders = { [headerName]: req.idempotencyKey };
        }
        const mergedHeaders = {
            ...tracingHeaders,
            ...idempotencyHeaders,
            ...req === null || req === void 0 ? void 0 : req.headers,
            ...authHeaders,
        };
        // --- Request interceptors ---
        let processedReq = { ...req, headers: mergedHeaders };
        if (reqInterceptors.length > 0) {
            processedReq = await applyInterceptors(reqInterceptors, processedReq);
        }
        // --- Tracing provider: create a span around the actual request ---
        const span = (_l = (_k = config.tracing) === null || _k === void 0 ? void 0 : _k.provider) === null || _l === void 0 ? void 0 : _l.startSpan(`HTTP ${methodUpper} ${command}`, { "http.method": methodUpper, "http.url": fullUrl });
        (_o = (_m = config.metrics) === null || _m === void 0 ? void 0 : _m.onRequestStart) === null || _o === void 0 ? void 0 : _o.call(_m, {
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
            // --- Computing the response size ---
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
            // --- Proactive rate-limit throttling based on response headers ---
            if (((_p = config.rateLimit) === null || _p === void 0 ? void 0 : _p.onRateLimitHeaders) && rateLimiter) {
                config.rateLimit.onRateLimitHeaders(payload.headers, rateLimiter.asControl());
            }
            (_r = (_q = config.metrics) === null || _q === void 0 ? void 0 : _q.onRequestEnd) === null || _r === void 0 ? void 0 : _r.call(_q, {
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
            // --- Storing in the cache ---
            const cacheEnabled = (_s = processedReq === null || processedReq === void 0 ? void 0 : processedReq.useCache) !== null && _s !== void 0 ? _s : (((_t = config.cache) === null || _t === void 0 ? void 0 : _t.enabled) && methodUpper === "GET");
            if (cacheEnabled) {
                const cacheTtl = (_w = (_u = processedReq === null || processedReq === void 0 ? void 0 : processedReq.cacheTtlMs) !== null && _u !== void 0 ? _u : (_v = config.cache) === null || _v === void 0 ? void 0 : _v.ttlMs) !== null && _w !== void 0 ? _w : 60000;
                const cacheKey = buildCacheKey(methodUpper, fullUrl, processedReq);
                await responseCache.set(cacheKey, payload, cacheTtl);
            }
            await (circuitBreaker === null || circuitBreaker === void 0 ? void 0 : circuitBreaker.onSuccess());
            (_x = span === null || span === void 0 ? void 0 : span.setStatus) === null || _x === void 0 ? void 0 : _x.call(span, { code: "ok" });
            span === null || span === void 0 ? void 0 : span.end();
            return payload;
        }
        catch (error) {
            const duration = Date.now() - startTs;
            // --- Auth: 401 → onUnauthorized() → a single retry attempt ---
            const errorStatus = axios.isAxiosError(error)
                ? (_y = error.response) === null || _y === void 0 ? void 0 : _y.status
                : error === null || error === void 0 ? void 0 : error.status;
            // --- Proactive rate-limit throttling based on the error response headers
            // (e.g. a 429 usually also carries X-RateLimit-*/Retry-After-like headers) ---
            const errorHeaders = axios.isAxiosError(error)
                ? (_z = error.response) === null || _z === void 0 ? void 0 : _z.headers
                : undefined;
            if (((_0 = config.rateLimit) === null || _0 === void 0 ? void 0 : _0.onRateLimitHeaders) && rateLimiter && errorHeaders) {
                config.rateLimit.onRateLimitHeaders(errorHeaders, rateLimiter.asControl());
            }
            if (config.auth && !_retried && errorStatus === 401) {
                invalidateTokenCache();
                await ((_2 = (_1 = config.auth).onUnauthorized) === null || _2 === void 0 ? void 0 : _2.call(_1));
                // The current span belongs to this attempt (which failed due to 401);
                // the retry below will create its own span.
                (_3 = span === null || span === void 0 ? void 0 : span.setStatus) === null || _3 === void 0 ? void 0 : _3.call(span, { code: "error", message: "401 — retrying with refreshed token" });
                span === null || span === void 0 ? void 0 : span.end();
                // Retry with the _retried=true flag — a second 401 will no longer be intercepted
                return _executeRequest(command, req, true);
            }
            let apiError = toApiError(error);
            // --- Error interceptors ---
            if (errInterceptors.length > 0) {
                apiError = await applyInterceptors(errInterceptors, apiError);
            }
            // --- Circuit breaker: request cancellations are not counted as backend failures ---
            const isCancellation = apiError.code === "REQUEST_CANCELLED" ||
                (error === null || error === void 0 ? void 0 : error.name) === "AbortError";
            if (circuitBreaker && !isCancellation) {
                await circuitBreaker.onFailure(apiError);
            }
            (_5 = (_4 = config.metrics) === null || _4 === void 0 ? void 0 : _4.onRequestEnd) === null || _5 === void 0 ? void 0 : _5.call(_4, {
                id: reqId,
                durationMs: duration,
                error: apiError,
            });
            (_6 = span === null || span === void 0 ? void 0 : span.setStatus) === null || _6 === void 0 ? void 0 : _6.call(span, { code: "error", message: apiError.message });
            (_7 = span === null || span === void 0 ? void 0 : span.recordException) === null || _7 === void 0 ? void 0 : _7.call(span, error);
            span === null || span === void 0 ? void 0 : span.end();
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
    // ── Main request function (with cache and dedup) ────────────────────────────
    async function request(command, req, _retried = false) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
        const methodUpper = ((_a = req === null || req === void 0 ? void 0 : req.method) !== null && _a !== void 0 ? _a : "GET").toUpperCase();
        const fullUrl = `${(_b = config.baseURL) !== null && _b !== void 0 ? _b : ""}${command}`;
        // --- Offline queue: queue instead of sending, if offline and shouldQueue matches ---
        if (offlineQueue &&
            !offlineQueue.isOnline() &&
            offlineQueue.shouldQueue({ method: methodUpper, url: command, data: req === null || req === void 0 ? void 0 : req.data })) {
            const queued = await offlineQueue.enqueue({
                method: methodUpper,
                url: command,
                data: req === null || req === void 0 ? void 0 : req.data,
                params: req === null || req === void 0 ? void 0 : req.params,
                headers: req === null || req === void 0 ? void 0 : req.headers,
                idempotencyKey: req === null || req === void 0 ? void 0 : req.idempotencyKey,
            });
            const queuedError = new OfflineQueuedError(queued.id, methodUpper, command);
            const apiError = toApiError(queuedError);
            (_d = (_c = config.metrics) === null || _c === void 0 ? void 0 : _c.onRequestStart) === null || _d === void 0 ? void 0 : _d.call(_c, {
                id: queued.id,
                method: methodUpper,
                url: fullUrl,
                timestamp: queued.queuedAt,
                requestBody: req === null || req === void 0 ? void 0 : req.data,
                requestParams: req === null || req === void 0 ? void 0 : req.params,
            });
            (_f = (_e = config.metrics) === null || _e === void 0 ? void 0 : _e.onRequestEnd) === null || _f === void 0 ? void 0 : _f.call(_e, { id: queued.id, durationMs: 0, error: apiError });
            if (config.onError)
                await config.onError(apiError, req !== null && req !== void 0 ? req : {});
            throw queuedError;
        }
        // --- Cache check ---
        const cacheEnabled = (_g = req === null || req === void 0 ? void 0 : req.useCache) !== null && _g !== void 0 ? _g : (((_h = config.cache) === null || _h === void 0 ? void 0 : _h.enabled) && methodUpper === "GET");
        const cacheTtl = (_l = (_j = req === null || req === void 0 ? void 0 : req.cacheTtlMs) !== null && _j !== void 0 ? _j : (_k = config.cache) === null || _k === void 0 ? void 0 : _k.ttlMs) !== null && _l !== void 0 ? _l : 60000;
        const cacheStrategy = (_o = (_m = config.cache) === null || _m === void 0 ? void 0 : _m.strategy) !== null && _o !== void 0 ? _o : "strict";
        const staleMs = (_q = (_p = config.cache) === null || _p === void 0 ? void 0 : _p.staleMs) !== null && _q !== void 0 ? _q : 0;
        if (cacheEnabled) {
            const cacheKey = buildCacheKey(methodUpper, fullUrl, req);
            if (cacheStrategy === "stale-while-revalidate" && responseCache.getStale) {
                const staleResult = await responseCache.getStale(cacheKey, staleMs);
                if (staleResult) {
                    if (staleResult.isStale) {
                        // Background refresh without blocking
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
                const cached = await responseCache.get(cacheKey);
                if (cached)
                    return cached;
            }
        }
        // --- Request deduplication (GET only, without caching) ---
        const shouldDedup = ((_r = config.deduplicateRequests) !== null && _r !== void 0 ? _r : false) &&
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
    // --- Cancellable requests via AbortController ---
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
        /** Clear this client's response cache */
        clearCache: async () => { await responseCache.clear(); },
        /**
         * Selectively invalidate the response cache by URL (substring, RegExp, or predicate),
         * without affecting entries for other endpoints. Returns the number of deleted entries.
         */
        invalidateCache,
        /** Current circuit breaker state ("closed" | "open" | "half-open"), or null if it is not configured. `async` when circuitBreaker.store is set (otherwise resolves instantly). */
        getCircuitBreakerState: async () => circuitBreaker ? await circuitBreaker.getState() : null,
        /** Requests currently queued awaiting the next flush (empty array if `offlineQueue` isn't configured). */
        getQueuedRequests: async () => offlineQueue ? offlineQueue.getAll() : [],
        /**
         * Manually attempts to send everything currently queued — also happens
         * automatically on reconnect (see `offlineQueue.onOnlineChange`). No-op
         * if `offlineQueue` isn't configured.
         */
        flushQueue: async () => {
            await (offlineQueue === null || offlineQueue === void 0 ? void 0 : offlineQueue.flush());
        },
    };
}
export function getRestClient(config) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
    const key = JSON.stringify({
        baseURL: config.baseURL,
        timeout: config.timeout,
        withCredentials: config.withCredentials,
        headers: (_a = config.headers) !== null && _a !== void 0 ? _a : {},
        retry: (_b = config.retry) !== null && _b !== void 0 ? _b : {},
        // Function-valued fields (store/isFailure/provider) are dropped by
        // JSON.stringify — tracked as booleans instead so two configs that only
        // differ in *which* store/predicate/provider they pass don't collide on
        // the same cached client.
        cache: { ...((_c = config.cache) !== null && _c !== void 0 ? _c : {}), store: !!((_d = config.cache) === null || _d === void 0 ? void 0 : _d.store) },
        rateLimit: { ...((_e = config.rateLimit) !== null && _e !== void 0 ? _e : {}), store: !!((_f = config.rateLimit) === null || _f === void 0 ? void 0 : _f.store) },
        circuitBreaker: {
            ...((_g = config.circuitBreaker) !== null && _g !== void 0 ? _g : {}),
            store: !!((_h = config.circuitBreaker) === null || _h === void 0 ? void 0 : _h.store),
            isFailure: !!((_j = config.circuitBreaker) === null || _j === void 0 ? void 0 : _j.isFailure),
        },
        sanitizeHeaders: (_k = config.sanitizeHeaders) !== null && _k !== void 0 ? _k : true,
        sensitiveHeaders: (_l = config.sensitiveHeaders) !== null && _l !== void 0 ? _l : [],
        metrics: !!config.metrics,
        auth: !!config.auth,
        deduplicateRequests: (_m = config.deduplicateRequests) !== null && _m !== void 0 ? _m : false,
        interceptors: !!config.interceptors,
        onError: !!config.onError,
        adapter: !!config.adapter,
        tracing: {
            generateTraceparent: !!((_o = config.tracing) === null || _o === void 0 ? void 0 : _o.generateTraceparent),
            provider: !!((_p = config.tracing) === null || _p === void 0 ? void 0 : _p.provider),
        },
        idempotencyHeaderName: config.idempotencyHeaderName,
        autoIdempotencyKey: !!config.autoIdempotencyKey,
        offlineQueue: {
            enabled: !!((_q = config.offlineQueue) === null || _q === void 0 ? void 0 : _q.enabled),
            persistAdapter: !!((_r = config.offlineQueue) === null || _r === void 0 ? void 0 : _r.persistAdapter),
            isOnline: !!((_s = config.offlineQueue) === null || _s === void 0 ? void 0 : _s.isOnline),
            onOnlineChange: !!((_t = config.offlineQueue) === null || _t === void 0 ? void 0 : _t.onOnlineChange),
            shouldQueue: !!((_u = config.offlineQueue) === null || _u === void 0 ? void 0 : _u.shouldQueue),
            maxQueueSize: (_v = config.offlineQueue) === null || _v === void 0 ? void 0 : _v.maxQueueSize,
        },
    });
    const cachedClient = restClientCache.get(key);
    if (cachedClient)
        return cachedClient;
    // Evict the oldest entry on overflow
    if (restClientCache.size >= MAX_CLIENT_CACHE_SIZE) {
        const oldestKey = restClientCache.keys().next().value;
        if (oldestKey !== undefined)
            restClientCache.delete(oldestKey);
    }
    const client = createRestClient(config);
    restClientCache.set(key, client);
    return client;
}
