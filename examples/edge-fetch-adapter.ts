/**
 * `HttpConfig.adapter` replaces the built-in axios client with anything that
 * implements `HttpAdapter`. Use this in environments without Node's `http`
 * module — Cloudflare Workers, Deno, other edge runtimes — where you'd rather
 * use the platform's native `fetch` and skip bundling axios entirely.
 *
 * When `adapter` is set, `createRestClient()` never calls `axios.create()`,
 * so axios isn't even instantiated (see rest-client.ts).
 */
import { createRestClient, type HttpAdapter, type RestRequestConfig, type ApiResponse } from "rest-pipeline-js";

const fetchAdapter: HttpAdapter = {
  async request<T>(config: RestRequestConfig & { baseURL?: string }): Promise<ApiResponse<T>> {
    const url = `${config.baseURL ?? ""}${config.url ?? ""}`;
    const res = await fetch(url, {
      method: config.method ?? "GET",
      headers: config.headers as Record<string, string> | undefined,
      body: config.data !== undefined ? JSON.stringify(config.data) : undefined,
      signal: config.signal as AbortSignal | undefined,
    });

    const data = (await res.json().catch(() => undefined)) as T;
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });

    if (!res.ok) {
      // Match the shape toApiError()/error interceptors expect: a `status`
      // (and optionally `response.status`) field on the thrown error.
      const err = new Error(`Request failed with status ${res.status}`) as Error & {
        status: number;
      };
      err.status = res.status;
      throw err;
    }

    return { data, status: res.status, statusText: res.statusText, headers };
  },
};

export const client = createRestClient({
  baseURL: "https://api.example.com",
  adapter: fetchAdapter,
  // Retry/cache/rate-limit/circuit-breaker all work unchanged with a custom
  // adapter — they operate above the transport layer.
  retry: { attempts: 2, delayMs: 200, backoffMultiplier: 2 },
});

// In a Cloudflare Worker:
// export default {
//   async fetch() {
//     const res = await client.get("/health");
//     return new Response(JSON.stringify(res.data));
//   },
// };
