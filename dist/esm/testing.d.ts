import type { HttpAdapter } from "./types.js";
/** Information about a request, available to the route handler and to entries in `calls`. */
export interface MockRequestInfo {
    method: string;
    /** Relative URL, as passed to `client.get(url)`/`request.url` (e.g. `/users/1`). */
    url: string;
    /** `baseURL + url`, if `baseURL` was set in `HttpConfig`. */
    fullUrl: string;
    data?: unknown;
    params?: unknown;
    headers?: Record<string, string>;
}
/** An entry in `MockAdapter.calls`' call history. */
export interface MockAdapterCallRecord extends MockRequestInfo {
    /** Whether the request matched any route. `false` — no handler found, request rejected. */
    matched: boolean;
    timestamp: number;
}
export interface MockResponseSpec<T = unknown> {
    data?: T;
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    /** Simulates network latency (a real `setTimeout`, also works with fake timers). */
    delayMs?: number;
    /**
     * Explicitly force resolve/reject regardless of `status`. By default —
     * `status >= 400` rejects the request (matching axios/fetch's default
     * behavior), `status < 400` (or no `status`, i.e. 200 by default) —
     * resolves. Rejection throws an `Error` with `status` and
     * `response: { status, data, headers }` fields — that's enough for both
     * `retry.retriableStatus` and `circuitBreaker`, as well as error
     * interceptors that check `err.status`/`err.response?.status`.
     */
    error?: boolean;
}
export type MockHandlerResult<T = unknown> = MockResponseSpec<T> | ((info: MockRequestInfo) => MockResponseSpec<T> | Promise<MockResponseSpec<T>>);
export interface MockRoute {
    method?: string;
    /** Substring (matched via `.includes()`) or `RegExp` (`.test()`), matched against `url` (not `fullUrl`). */
    url: string | RegExp;
    /**
     * A single response, or an array of responses consumed one at a time for
     * each matching request — e.g. `[{ error: true, status: 500 }, { data: {...} }]`
     * for testing "fails first, then succeeds" (retry). Once the array is
     * exhausted, the last element repeats.
     */
    respond: MockHandlerResult | MockHandlerResult[];
}
export interface MockAdapter extends HttpAdapter {
    /** History of all requests through this adapter, in call order. */
    calls: MockAdapterCallRecord[];
    /** Clears the call history and the position counters for `respond` arrays — does not touch the routes themselves. */
    reset(): void;
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
export declare function createMockAdapter(routes: MockRoute[]): MockAdapter;
