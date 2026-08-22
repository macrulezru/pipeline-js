// Entry point: testing utilities. Import from "rest-pipeline-js/testing".
// Kept as a separate entry point (like /vue and /react) so it never ships in
// the core bundle for consumers who don't need it.

import type { ApiResponse, HttpAdapter, RestRequestConfig } from "./types.js";

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

export type MockHandlerResult<T = unknown> =
  | MockResponseSpec<T>
  | ((info: MockRequestInfo) => MockResponseSpec<T> | Promise<MockResponseSpec<T>>);

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

function matchesRoute(route: MockRoute, info: MockRequestInfo): boolean {
  if (route.method && route.method.toUpperCase() !== info.method.toUpperCase()) {
    return false;
  }
  if (typeof route.url === "string") return info.url.includes(route.url);
  return route.url.test(info.url);
}

async function resolveSpec<T>(
  result: MockHandlerResult<T>,
  info: MockRequestInfo,
): Promise<MockResponseSpec<T>> {
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
export function createMockAdapter(routes: MockRoute[]): MockAdapter {
  const callIndexByRoute = new Map<MockRoute, number>();

  const adapter: MockAdapter = {
    calls: [],
    reset() {
      adapter.calls = [];
      callIndexByRoute.clear();
    },
    async request<T = unknown>(
      config: RestRequestConfig & { baseURL?: string },
    ): Promise<ApiResponse<T>> {
      const method = (config.method ?? "GET").toString().toUpperCase();
      const url = config.url ?? "";
      const info: MockRequestInfo = {
        method,
        url,
        fullUrl: `${config.baseURL ?? ""}${url}`,
        data: config.data,
        params: config.params,
        headers: config.headers as Record<string, string> | undefined,
      };

      const route = routes.find((r) => matchesRoute(r, info));

      adapter.calls.push({ ...info, matched: !!route, timestamp: Date.now() });

      if (!route) {
        throw new Error(`MockAdapter: no route matched ${method} ${url}`);
      }

      let result: MockHandlerResult<T>;
      if (Array.isArray(route.respond)) {
        const idx = callIndexByRoute.get(route) ?? 0;
        const responses = route.respond as MockHandlerResult<T>[];
        result = responses[Math.min(idx, responses.length - 1)];
        callIndexByRoute.set(route, idx + 1);
      } else {
        result = route.respond as MockHandlerResult<T>;
      }

      const spec = await resolveSpec(result, info);

      if (spec.delayMs && spec.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, spec.delayMs));
      }

      const status = spec.status ?? 200;
      const isError = spec.error ?? status >= 400;

      if (isError) {
        const err = new Error(`MockAdapter: ${method} ${url} responded ${status}`) as Error & {
          status: number;
          response: { status: number; data: unknown; headers: Record<string, string> };
        };
        err.status = status;
        err.response = { status, data: spec.data, headers: spec.headers ?? {} };
        throw err;
      }

      return {
        data: spec.data as T,
        status,
        statusText: spec.statusText ?? "OK",
        headers: spec.headers ?? {},
      };
    },
  };

  return adapter;
}
