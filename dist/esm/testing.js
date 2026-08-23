// Entry point: testing utilities. Import from "rest-pipeline-js/testing".
// Kept as a separate entry point (like /vue and /react) so it never ships in
// the core bundle for consumers who don't need it.
function matchesRoute(route, info) {
    if (route.method && route.method.toUpperCase() !== info.method.toUpperCase()) {
        return false;
    }
    if (typeof route.url === "string")
        return info.url.includes(route.url);
    // A global/sticky RegExp is stateful across .test() calls (lastIndex
    // advances on match) — reset it so a reused route.url behaves the same
    // way on every request instead of alternating true/false.
    route.url.lastIndex = 0;
    return route.url.test(info.url);
}
async function resolveSpec(result, info) {
    return typeof result === "function" ? await result(info) : result;
}
/**
 * Creates an `HttpAdapter` that responds according to the given routes
 * instead of hitting the real network — for unit/integration tests of code
 * that uses this package. Pass it to `HttpConfig.adapter`.
 *
 * @example
 * const adapter = createMockAdapter([
 *   { method: "GET", url: "/users/1", respond: { data: { id: 1, name: "Ada" } } },
 *   {
 *     method: "POST",
 *     url: "/orders",
 *     // first 2 attempts — 503 (to test retry), third — success
 *     respond: [
 *       { error: true, status: 503 },
 *       { error: true, status: 503 },
 *       { data: { id: 42 }, status: 201 },
 *     ],
 *   },
 * ]);
 *
 * const client = createRestClient({ baseURL: "https://api.example.com", adapter });
 * const res = await client.get("/users/1");
 * expect(adapter.calls).toHaveLength(1);
 */
export function createMockAdapter(routes) {
    const callIndexByRoute = new Map();
    const adapter = {
        calls: [],
        reset() {
            adapter.calls = [];
            callIndexByRoute.clear();
        },
        async request(config) {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
            const method = ((_a = config.method) !== null && _a !== void 0 ? _a : "GET").toString().toUpperCase();
            const url = (_b = config.url) !== null && _b !== void 0 ? _b : "";
            const info = {
                method,
                url,
                fullUrl: `${(_c = config.baseURL) !== null && _c !== void 0 ? _c : ""}${url}`,
                data: config.data,
                params: config.params,
                headers: config.headers,
            };
            const route = routes.find((r) => matchesRoute(r, info));
            adapter.calls.push({ ...info, matched: !!route, timestamp: Date.now() });
            if (!route) {
                throw new Error(`MockAdapter: no route matched ${method} ${url}`);
            }
            let result;
            if (Array.isArray(route.respond)) {
                const idx = (_d = callIndexByRoute.get(route)) !== null && _d !== void 0 ? _d : 0;
                const responses = route.respond;
                result = responses[Math.min(idx, responses.length - 1)];
                callIndexByRoute.set(route, idx + 1);
            }
            else {
                result = route.respond;
            }
            const spec = await resolveSpec(result, info);
            if (spec.delayMs && spec.delayMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, spec.delayMs));
            }
            const status = (_e = spec.status) !== null && _e !== void 0 ? _e : 200;
            const isError = (_f = spec.error) !== null && _f !== void 0 ? _f : status >= 400;
            if (isError) {
                const err = new Error(`MockAdapter: ${method} ${url} responded ${status}`);
                err.status = status;
                err.response = { status, data: spec.data, headers: (_g = spec.headers) !== null && _g !== void 0 ? _g : {} };
                throw err;
            }
            return {
                data: spec.data,
                status,
                statusText: (_h = spec.statusText) !== null && _h !== void 0 ? _h : "OK",
                headers: (_j = spec.headers) !== null && _j !== void 0 ? _j : {},
            };
        },
    };
    return adapter;
}
