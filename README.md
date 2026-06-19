<div align="center" style="background:#111827;border-radius:20px;padding:28px 20px 20px;margin-bottom:32px">
  <h1 style="color:#f9fafb;margin:0 0 32px;font-size:2.2em;letter-spacing:-0.03em;font-weight:700;font-family:sans-serif">
    rest-pipeline-js
  </h1>
  <img
    src="https://s3.twcstorage.ru/c9a2cc89-780f97fd-311d-4a1a-b86f-c25665c9dc46/images/npm/rest-pipeline-js_v2.webp"
    alt="rest-pipeline-js"
    style="max-width:100%;width:auto;height:300px;border-radius:12px"
  />
</div>

Flexible, modular pipeline orchestrator for REST APIs — sequential and parallel stages, retry with backoff, response caching, rate limiting, auth provider, stream stages (SSE / AsyncIterable), plugin system, and Vue / React integrations — all with a single dependency (axios).

---

## Contents

- [Features](#features)
- [Installation](#installation)
- [Demo](#demo)
- [Quick start](#quick-start)
- [createRestClient](#createrestclient)
- [Auth Provider](#auth-provider)
- [Log Sanitization](#log-sanitization)
- [RequestExecutor](#requestexecutor)
- [Circuit breaker](#circuit-breaker)
- [PipelineOrchestrator](#pipelineorchestrator)
- [Error recovery (errorHandler + recoverStep)](#error-recovery-errorhandler--recoverstep)
- [Parallel stages](#parallel-stages)
- [Global middleware](#global-middleware)
- [Pause / Resume](#pause--resume)
- [Export / Import state](#export--import-state)
- [Pipeline metrics](#pipeline-metrics)
- [Correlating a run (runId)](#correlating-a-run-runid)
- [createPipeline() + pipe() builder](#createpipeline--pipe-builder)
- [validatePipelineConfig()](#validatepipelineconfig)
- [Plugin system](#plugin-system)
- [Persist adapter](#persist-adapter)
- [Stream stages](#stream-stages-sse--asynciterable)
- [HTTP Adapter](#http-adapter-custom-fetch--edge-environments)
- [Vue integration](#vue-integration)
- [React integration](#react-integration)
- [Entry points](#entry-points)
- [Architecture](#architecture)
- [Bundle size & peer dependencies](#bundle-size--peer-dependencies)

---

## Features

- **`createRestClient()`** — full-featured HTTP client built on top of axios: retry with exponential backoff and `Retry-After` support, response caching (incl. targeted `invalidateCache()`), rate limiting (concurrency + req/interval), circuit breaker, auth provider with automatic 401 refresh and optional token caching, request cancellation by key, custom HTTP adapters
- **`PipelineOrchestrator`** — sequential and parallel stage execution; each stage has `condition`, `before`, `request`, `after`, `errorHandler` hooks (all receive the pipeline's `AbortSignal`); `sharedData` pool shared across all stages
- **Error recovery** — `errorHandler` can return `recoverStep(data)` to turn a failed stage back into a successful one and keep the pipeline going, instead of only transforming the error
- **Global middleware** — `beforeEach` / `afterEach` / `onError` hooks that apply to every stage without modifying individual configs
- **Parallel groups** — multiple stages run concurrently via `Promise.all`, or through a bounded pool via `concurrency`; single failure stops the group
- **Pause / Resume / Abort** — `pause()` waits after the current stage; `resume()` continues; `abort()` cancels the current HTTP request and propagates its `AbortSignal` into every stage hook so custom `request`/`before`/`after` functions can cancel their own work too
- **Export / Import state** — serialize `stageResults` + logs to a plain object; restore on the next page load
- **Stream stages** — `stream: async function*` for SSE / any `AsyncIterable`; `onChunk` callback in real time; abort-aware
- **Pipeline metrics & run correlation** — `onPipelineStart`, `onPipelineEnd`, `onStepDuration` callbacks, plus a `runId` (also on `getRunId()`, log entries, and step events) shared by every callback/event from the same run
- **`createPipeline()` / `pipe()` builder** — short factory and fluent builder API for common patterns; in TypeScript, `pipe().step()` chains infer `prev`'s type from the previous step automatically
- **`validatePipelineConfig()`** — catch duplicate keys, empty keys, type errors before runtime
- **Plugin system** — install reusable behavior (logging, analytics, etc.); cleanup via `destroy()`
- **Persist adapter** — pluggable save/load interface; auto-save after each stage
- **Log sanitization** — mask sensitive headers (`authorization`, `x-api-key`, `cookie`, …) in metrics callbacks
- **Vue integration** — `usePipelineRunVue`, `usePipelineProgressVue`, and more (import from `rest-pipeline-js/vue`)
- **React integration** — `usePipelineRunReact`, `usePipelineProgressReact`, and more (import from `rest-pipeline-js/react`)
- **Tree-shakeable** — `sideEffects: false`; Vue and React entry points are code-split

---

## Installation

```bash
npm install rest-pipeline-js
```

Peer dependencies for framework integrations:

```bash
# Vue
npm install vue@>=3.3

# React
npm install react@>=19 react-dom@>=19
```

---

## Demo

A multi-scenario interactive demo showcasing the key features of `rest-pipeline-js`. All demos use real public REST APIs.

```bash
git clone https://github.com/macrulezru/pipeline-js.git
cd pipeline-js
npm install
npm run demo:vue
```

Opens at `http://localhost:3000`. The demo app lives in the `demo/` directory.

| Demo                      | What it shows                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| ✈️ **Flight Pipeline**    | 4-stage sequential pipeline with `sharedData`, `pauseBefore`/`pauseAfter`, middleware, boarding pass result |
| 🔀 **Parallel Loading**   | `pipe()` fluent builder with `.parallel([])` — 3 sources queried simultaneously, timing breakdown           |
| 🛡️ **Retry & Recovery**   | Configurable flaky stage with exponential backoff, event log, `abort()`, pause/resume between stages        |
| ⚡ **Cache & Rate Limit** | `createRestClient()` with cache TTL — see server vs cache timing; rate limiter burst visualization          |

---

## Quick start

```js
import { createRestClient, PipelineOrchestrator } from "rest-pipeline-js";

// 1. Create a REST client
const client = createRestClient({
  baseURL: "https://api.example.com",
  retry: { attempts: 2, delayMs: 500, backoffMultiplier: 2 },
  cache: { enabled: true, ttlMs: 60000 },
  auth: {
    getToken: async () => localStorage.getItem("token") ?? "",
    onUnauthorized: async () => {
      /* refresh token */
    },
  },
});

const res = await client.get("/users/1");

// 2. Run a pipeline
const orchestrator = new PipelineOrchestrator({
  config: {
    stages: [
      {
        key: "fetchUser",
        request: async ({ sharedData }) =>
          client.get(`/users/${sharedData.userId}`),
      },
      {
        key: "processData",
        request: async ({ prev }) => ({ ...prev.data, processed: true }),
      },
    ],
  },
  sharedData: { userId: 42 },
});

const result = await orchestrator.run();
console.log(result.success, result.stageResults);
```

---

## createRestClient

```ts
createRestClient(config: HttpConfig): RestClient
```

Creates a REST client with advanced HTTP features.

### Methods

| Method                                  | Description                        |
| --------------------------------------- | ---------------------------------- |
| `get(url, config?)`                     | GET request                        |
| `post(url, data?, config?)`             | POST request                       |
| `put(url, data?, config?)`              | PUT request                        |
| `patch(url, data?, config?)`            | PATCH request                      |
| `delete(url, config?)`                  | DELETE request                     |
| `request(url, config?)`                 | Generic request                    |
| `cancellableRequest(key, url, config?)` | Request cancellable by key         |
| `cancelRequest(key)`                    | Cancel request by key              |
| `clearCache()`                          | Clear this client's entire response cache |
| `invalidateCache(matcher)`               | Clear only cache entries whose URL matches `matcher` (substring, `RegExp`, or `(info) => boolean`); returns the number of entries removed |
| `getCircuitBreakerState()`              | `"closed" \| "open" \| "half-open"`, or `null` if `circuitBreaker` isn't configured |

### HttpConfig options

| Option                             | Description                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `baseURL`                          | Base URL for all requests                                                        |
| `timeout`                          | Request timeout in ms                                                            |
| `headers`                          | Default headers                                                                  |
| `withCredentials`                  | Include cookies                                                                  |
| `retry.attempts`                   | Number of retry attempts                                                         |
| `retry.delayMs`                    | Base delay between retries in ms                                                 |
| `retry.backoffMultiplier`          | Exponential backoff multiplier                                                   |
| `retry.retriableStatus`            | HTTP status codes eligible for retry (e.g. `[429, 500, 503]`)                    |
| `retry.maxRetryAfterMs`            | Max wait from `Retry-After` header in ms (default: `60000`)                      |
| `cache.enabled`                    | Enable response caching for GET requests                                         |
| `cache.ttlMs`                      | Cache TTL in ms                                                                  |
| `rateLimit.maxConcurrent`          | Max simultaneous requests                                                        |
| `rateLimit.maxRequestsPerInterval` | Max requests per time window                                                     |
| `rateLimit.intervalMs`             | Time window size in ms                                                           |
| `metrics.onRequestStart`           | Callback on request start                                                        |
| `metrics.onRequestEnd`             | Callback on request end (includes duration and bytes)                            |
| `auth.getToken`                    | Async function returning a Bearer token (called before every request, unless `auth.tokenTtlMs` is set) |
| `auth.onUnauthorized`              | Optional async callback on 401 — refresh the token here; request is retried once |
| `auth.tokenTtlMs`                  | Cache `getToken()`'s result for this many ms instead of calling it before every request; invalidated automatically on 401 |
| `sanitizeHeaders`                  | Mask sensitive headers in metrics callbacks (default: `false`)                   |
| `sensitiveHeaders`                 | Additional headers to mask (extends `DEFAULT_SENSITIVE_HEADERS`)                 |
| `adapter`                          | Custom HTTP adapter (e.g. native `fetch`) — replaces built-in axios              |
| `circuitBreaker`                   | See [Circuit breaker](#circuit-breaker) — `{ failureThreshold, openMs, successThreshold?, isFailure? }` |

### Per-request cache override

```js
const res = await client.get("/data", {
  useCache: true,
  cacheTtlMs: 30000,
  cacheKey: "my-custom-key",
});
```

### Targeted cache invalidation

`clearCache()` wipes the entire response cache. To invalidate only the entries affected by a mutation (e.g. after a `POST`/`PUT`/`DELETE`), use `invalidateCache()` instead — it accepts a substring, a `RegExp`, or a predicate over `{ method, url }`, and returns how many entries were removed:

```js
await client.post("/users/1/orders", newOrder);

client.invalidateCache("/users/1"); // substring match on the cached URL
client.invalidateCache(/^https:\/\/api\.example\.com\/users\/\d+$/);
client.invalidateCache(({ method, url }) => method === "GET" && url.includes("/orders"));
```

### Full example

```js
import { createRestClient } from "rest-pipeline-js";

const client = createRestClient({
  baseURL: "https://api.example.com",
  timeout: 5000,
  retry: {
    attempts: 2,
    delayMs: 500,
    backoffMultiplier: 2,
    retriableStatus: [429, 500, 503],
  },
  cache: { enabled: true, ttlMs: 60000 },
  rateLimit: { maxConcurrent: 3, maxRequestsPerInterval: 10, intervalMs: 1000 },
  auth: {
    getToken: async () => localStorage.getItem("token") ?? "",
    onUnauthorized: async () => {
      /* refresh token here */
    },
  },
  sanitizeHeaders: true,
});

const res = await client.get("/users/1");
console.log(res.data);

// PATCH support
await client.patch("/users/1", { name: "Alice" });

// Cancellable request
const req = client.cancellableRequest("my-key", "/search", {
  params: { q: "foo" },
});
// Cancel it any time:
client.cancelRequest("my-key");
```

---

## Auth Provider

Automatically inject an `Authorization: Bearer <token>` header before every request. On a `401` response, `onUnauthorized` is called (e.g. to refresh the token) and the request is retried **once** — preventing infinite loops.

```js
const client = createRestClient({
  baseURL: "https://api.example.com",
  auth: {
    getToken: async () => {
      return localStorage.getItem("access_token") ?? "";
    },
    onUnauthorized: async () => {
      const newToken = await refreshAccessToken();
      localStorage.setItem("access_token", newToken);
    },
  },
});

// Authorization: Bearer <token> is added automatically to every request
const res = await client.get("/profile");
```

### Caching the token

If `getToken()` is expensive (e.g. it talks to a secure storage or refresh endpoint), set `tokenTtlMs` to reuse the result across requests instead of calling `getToken()` before every single one. The cache is invalidated automatically on a `401`, so the next request always re-fetches a fresh token before retrying:

```js
const client = createRestClient({
  baseURL: "https://api.example.com",
  auth: {
    getToken: async () => requestTokenFromSecureEnclave(), // expensive
    onUnauthorized: async () => refreshAccessToken(),
    tokenTtlMs: 5 * 60_000, // reuse for up to 5 minutes
  },
});
```

---

## Log Sanitization

Mask sensitive headers in metrics callbacks (`onRequestStart` / `onRequestEnd`) so they never appear in logs.

```js
import { createRestClient, DEFAULT_SENSITIVE_HEADERS } from "rest-pipeline-js";

// DEFAULT_SENSITIVE_HEADERS includes: authorization, x-api-key, x-auth-token,
// cookie, set-cookie, proxy-authorization

const client = createRestClient({
  baseURL: "https://api.example.com",
  sanitizeHeaders: true, // opt-in — disabled by default
  sensitiveHeaders: ["x-internal-secret"], // extend the default list
  metrics: {
    onRequestStart: (info) => {
      // info.requestHeaders — sensitive values replaced with "REDACTED"
      console.log(info.requestHeaders);
    },
  },
});
```

Use `sanitizeHeadersMap` directly:

```js
import { sanitizeHeadersMap } from "rest-pipeline-js";

const safe = sanitizeHeadersMap(
  { authorization: "Bearer abc", "content-type": "application/json" },
  ["x-custom-secret"],
);
// { authorization: "REDACTED", "content-type": "application/json" }
```

---

## RequestExecutor

Wrapper for REST requests with retry, timeout (via `AbortController`), `Retry-After` header support, and backoff.

```js
import { RequestExecutor } from "rest-pipeline-js";

const executor = new RequestExecutor({
  baseURL: "https://api.example.com",
  retry: {
    attempts: 3,
    delayMs: 500,
    backoffMultiplier: 2,
    retriableStatus: [429, 500, 502, 503],
    maxRetryAfterMs: 30000, // cap Retry-After at 30 s
  },
});

// 5th arg: external AbortSignal (e.g. from orchestrator.abort())
const res = await executor.execute("/data", undefined, 3, 5000, signal);
```

When the server returns a `Retry-After` header (numeric seconds or HTTP-date), that delay takes priority over the backoff formula. Values exceeding `maxRetryAfterMs` are clamped to the cap. Timeout is enforced via `AbortController` — the actual HTTP request is cancelled, not just the promise.

---

## Circuit breaker

Protect a failing backend (and your own app) from piling up retries/timeouts: after `failureThreshold` consecutive failures, the client stops calling the network entirely for `openMs` and rejects requests immediately with a `CircuitOpenError` (`code: "CIRCUIT_OPEN"`). After `openMs`, it lets a probe request through (`half-open`); success closes the circuit again, failure re-opens it.

```js
import { createRestClient, CircuitOpenError } from "rest-pipeline-js";

const client = createRestClient({
  baseURL: "https://api.example.com",
  circuitBreaker: {
    failureThreshold: 5, // open after 5 consecutive failures
    openMs: 30_000, // stay open for 30s before probing again
    successThreshold: 2, // need 2 successful probes to fully close
    isFailure: (error) => error.status === undefined || error.status >= 500, // ignore 4xx
  },
});

try {
  await client.get("/flaky-endpoint");
} catch (err) {
  if (err instanceof CircuitOpenError) {
    // rejected locally — no network call was made
  }
}

client.getCircuitBreakerState(); // "closed" | "open" | "half-open"
```

- Works on top of retry, cache, rate limiting, auth, and custom `adapter`s — it sits around the actual network call, same as those features.
- Each retry attempt (from `RequestExecutor`/`request.retry`) counts as its own pass through the breaker, so a flaky endpoint with retries enabled opens the circuit faster, not slower.
- Cancelled/aborted requests are never counted as failures.
- Not set by default — without `circuitBreaker`, behavior is unchanged.

---

## PipelineOrchestrator

Main class for building and managing a pipeline of sequential (and parallel) stages.

### Constructor

```js
new PipelineOrchestrator({
  config,       // PipelineConfig — stages and optional middleware
  httpConfig?,  // HttpConfig — HTTP client settings
  sharedData?,  // Record<string, any> — shared pool across all stages
  options?,     // { autoReset?: boolean }
})
```

### Methods

| Method                                     | Description                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `run(onStepPause?, externalSignal?)`       | Execute all stages. Returns `{ stageResults, success }`                               |
| `rerunStep(stepKey, options?)`             | Re-execute a single stage (respects condition, before, after, middleware)             |
| `abort()`                                  | Abort pipeline execution (cancels the current HTTP request via AbortSignal)           |
| `isAborted()`                              | Check if pipeline was aborted                                                         |
| `pause()`                                  | Pause after the current stage completes                                               |
| `resume()`                                 | Resume a paused pipeline                                                              |
| `isPaused()`                               | Check if pipeline is paused                                                           |
| `exportState()`                            | Serialize stageResults and logs to a plain object                                     |
| `importState(state)`                       | Restore stageResults and logs from a snapshot                                         |
| `getStageResults()`                        | Synchronous snapshot of all stage results                                             |
| `getRunId()`                               | ID of the current/last `run()` or `rerunStep()` — see [Correlating a run](#correlating-a-run-runid) |
| `destroy()`                                | Run cleanup callbacks from all installed plugins                                      |
| `subscribeProgress(listener)`              | Subscribe to progress updates                                                         |
| `subscribeStageResults(listener)`          | Subscribe to stageResults changes                                                     |
| `subscribeStepProgress(stepKey, listener)` | Subscribe to a specific stage's progress                                              |
| `on(eventName, handler)`                   | Subscribe to any event (`step:<key>:start\|success\|error\|skipped\|progress`, `log`) |
| `onStepStart/Finish/Error(handler)`        | Subscribe to stage lifecycle events                                                   |
| `getProgress()`                            | Get current progress snapshot                                                         |
| `getLogs()`                                | Get all pipeline logs                                                                 |
| `clearStageResults()`                      | Reset results and progress                                                            |

### Stage parameters (PipelineStageConfig)

Every hook below also receives `signal: AbortSignal` in its params object — the same signal used by `orchestrator.abort()`. Pass it down to `fetch`/`axios`/etc. inside `request`/`before`/`after` so cancellation actually stops in-flight work, not just the pipeline's bookkeeping.

| Parameter                                             | Description                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `key`                                                  | Unique stage identifier                                                  |
| `request({ prev, allResults, sharedData, signal })`   | Main stage function — return value becomes the stage result              |
| `condition({ prev, allResults, sharedData, signal })` | If returns `false`, stage is skipped with status `"skipped"`             |
| `before({ prev, allResults, sharedData, signal })`    | Pre-processing hook — returned value replaces `prev` passed to `request` |
| `after({ result, allResults, sharedData, signal })`   | Post-processing hook — returned value replaces the stage result          |
| `errorHandler({ error, key, sharedData, signal })`    | Per-stage error handler — see [Error recovery](#error-recovery-errorhandler--recoverstep) below |
| `retryCount`                                           | Override retry count for this stage                                      |
| `timeoutMs`                                            | Override timeout for this stage                                          |
| `pauseBefore`                                          | Delay in ms before executing `request`                                   |
| `pauseAfter`                                           | Delay in ms after executing `request`                                    |

### Error recovery (`errorHandler` + `recoverStep`)

By default, whatever `errorHandler` returns is wrapped into an `ApiError` and the stage stays `"error"` — it can transform/enrich the error but not turn the failure into a success. Return `recoverStep(data)` to recover the stage instead: it's committed exactly like a successful stage (status `"success"`, `afterEach` middleware, metrics, persistence) and the pipeline continues normally.

```js
import { recoverStep } from "rest-pipeline-js";

{
  key: "fetchPrice",
  request: async () => fetchPriceFromApi(),
  errorHandler: ({ error }) => {
    if (isNetworkError(error)) return recoverStep(0); // fall back to a default and continue
    return error; // anything else: keep failing as before
  },
}
```

### Stage execution flow

```
condition? → false → [status: skipped] → next stage
           ↓ true
middleware.beforeEach
           ↓
pauseBefore
           ↓
before() hook
           ↓
request()
           ↓
after() hook
           ↓
pauseAfter
           ↓
middleware.afterEach
           ↓
[status: success] → next stage

On error at any point:
  └─► stage.errorHandler (if set)
        ├─► returns recoverStep(data) → [status: success] → next stage
        └─► otherwise → middleware.onError → [status: error] → stop
```

### Full example

```js
import { PipelineOrchestrator } from "rest-pipeline-js";

const orchestrator = new PipelineOrchestrator({
  config: {
    stages: [
      {
        key: "fetchUser",
        request: async ({ sharedData }) => {
          const res = await fetch(`/api/users/${sharedData.userId}`);
          return res.json();
        },
      },
      {
        key: "processData",
        condition: ({ prev }) => prev !== null,
        before: ({ prev }) => ({ ...prev, processed: true }),
        request: async ({ prev }) => prev,
        after: ({ result }) => ({ ...result, finishedAt: Date.now() }),
      },
    ],
    middleware: {
      beforeEach: ({ stage }) => console.log("Starting:", stage.key),
      afterEach: ({ stage, result }) =>
        console.log("Done:", stage.key, result.data),
      onError: ({ stage, error }) =>
        console.error("Error in", stage.key, error),
    },
  },
  httpConfig: {
    baseURL: "https://api.example.com",
    retry: { attempts: 2, delayMs: 1000, backoffMultiplier: 2 },
    cache: { enabled: true, ttlMs: 60000 },
  },
  sharedData: { userId: 42 },
  options: { autoReset: true },
});

orchestrator.subscribeProgress((progress) => {
  console.log(
    "Stage:",
    progress.currentStage,
    "Statuses:",
    progress.stageStatuses,
  );
});

orchestrator.on("step:fetchUser:success", (payload) => {
  console.log("fetchUser done:", payload.data);
});

const result = await orchestrator.run();
console.log("Pipeline finished:", result.success);
console.log("Stage results:", result.stageResults);
```

---

## Parallel stages

Group stages for concurrent execution using `parallel`:

```js
const orchestrator = new PipelineOrchestrator({
  config: {
    stages: [
      // Sequential stage
      { key: "auth", request: async () => getToken() },

      // Parallel group — all run concurrently
      {
        key: "load-data",
        parallel: [
          { key: "loadUsers", request: async () => fetchUsers() },
          { key: "loadProducts", request: async () => fetchProducts() },
          { key: "loadSettings", request: async () => fetchSettings() },
        ],
      },

      // Sequential stage after the group
      { key: "render", request: async ({ allResults }) => render(allResults) },
    ],
  },
});
```

- All stages in a `parallel` group run simultaneously via `Promise.all` — unless `concurrency` is set (see below).
- If **any** stage in the group fails, the pipeline stops and marks `success: false`.
- Each parallel stage has its own key and result in `stageResults`.
- `rerunStep(key)` works for stages inside parallel groups too.

### Limiting concurrency

For fan-out over many items (e.g. paginated fetches), set `concurrency` on the group to cap how many stages run at once instead of starting all of them immediately:

```js
{
  key: "fetch-all-pages",
  parallel: pageNumbers.map((n) => ({
    key: `page-${n}`,
    request: async () => fetchPage(n),
  })),
  concurrency: 5, // at most 5 requests in flight at a time
}
```

Results land in `stageResults` under their own key regardless of `concurrency`, in the same shape as an unlimited group. With the `pipe()` builder: `.parallel(stages, { concurrency: 5 })`.

---

## Global middleware

Apply hooks to every stage without modifying individual stage configs:

```js
const orchestrator = new PipelineOrchestrator({
  config: {
    stages: [
      /* ... */
    ],
    middleware: {
      beforeEach: async ({ stage, index, sharedData }) => {
        console.log(`[${index}] Starting: ${stage.key}`);
        sharedData.startedAt = Date.now();
      },
      afterEach: async ({ stage, index, result, sharedData }) => {
        const ms = Date.now() - sharedData.startedAt;
        console.log(`[${index}] Done: ${stage.key} in ${ms}ms`, result.data);
      },
      onError: async ({ stage, error, sharedData }) => {
        await reportError({ stage: stage.key, error, context: sharedData });
      },
    },
  },
});
```

Middleware runs in addition to (not instead of) per-stage `errorHandler`.

---

## Pause / Resume

Pause the pipeline after a stage and resume later:

```js
const orchestrator = new PipelineOrchestrator({ config });

// Pause after step1 completes
orchestrator.on("step:step1:success", () => orchestrator.pause());

const runPromise = orchestrator.run();

// At some point later (e.g. after user confirmation):
await showConfirmDialog();
orchestrator.resume();

await runPromise;
```

- `pause()` — pipeline waits after the current stage finishes (including events).
- `resume()` — continues from the next stage.
- `abort()` while paused unblocks the pipeline and terminates it.

---

## Export / Import state

Save and restore the pipeline state across page reloads or sessions:

```js
const orchestrator = new PipelineOrchestrator({ config });
await orchestrator.run();

// Save state
const snapshot = orchestrator.exportState();
localStorage.setItem("pipelineState", JSON.stringify(snapshot));

// Later — restore and inspect without re-running
const saved = JSON.parse(localStorage.getItem("pipelineState"));
const orchestrator2 = new PipelineOrchestrator({ config });
orchestrator2.importState(saved);

console.log(orchestrator2.getProgress()); // restored progress
console.log(orchestrator2.getLogs()); // restored logs (timestamps as Date objects)
```

`exportState()` returns `{ stageResults, logs }` — a plain JSON-serializable object. Timestamps in logs are stored as ISO strings and restored as `Date` objects on `importState`.

---

## Pipeline metrics

Observe pipeline execution without modifying stage logic:

```js
const orchestrator = new PipelineOrchestrator({
  config: {
    stages: [
      /* ... */
    ],
    metrics: {
      onPipelineStart: ({ timestamp, runId }) => {
        console.log(`[${runId}] Pipeline started at`, new Date(timestamp).toISOString());
      },
      onPipelineEnd: ({ durationMs, success, stageResults, runId }) => {
        analytics.track("pipeline_complete", { durationMs, success, runId });
      },
      onStepDuration: ({ stepKey, durationMs, status, runId }) => {
        console.log(`[${runId}] [${stepKey}] ${status} in ${durationMs}ms`);
      },
    },
  },
});
```

| Callback          | Receives                                         | Description                       |
| ----------------- | ------------------------------------------------- | --------------------------------- |
| `onPipelineStart` | `{ timestamp, runId }`                            | Fires at the beginning of `run()` |
| `onPipelineEnd`   | `{ durationMs, success, stageResults, runId }`     | Fires when `run()` completes      |
| `onStepDuration`  | `{ stepKey, durationMs, status, runId }`           | Fires after every executed step   |

### Correlating a run (`runId`)

Every `run()` call generates a fresh `runId` (a UUID, or a timestamp-based fallback in environments without `crypto.randomUUID`), shared by all metrics callbacks, log entries (`getLogs()`), and step events (`PipelineStepEvent.runId`) produced during that run — including all attempts of `pipelineRetry`. `rerunStep()` generates its own separate `runId`. Use `orchestrator.getRunId()` to read the current/last one, or read `runId` off any event/log/metrics callback to correlate everything that happened during one execution in your logging/tracing backend:

```js
orchestrator.on("log", (entry) => sendToLogBackend({ ...entry, runId: orchestrator.getRunId() }));
```

---

## createPipeline() + pipe() builder

### createPipeline() — short factory

```js
import { createPipeline } from "rest-pipeline-js";

const orchestrator = createPipeline(
  [
    { key: "fetchUser", request: async () => fetchUser() },
    { key: "process", request: async ({ prev }) => process(prev) },
  ],
  {
    httpConfig: { baseURL: "https://api.example.com" },
    sharedData: { userId: 42 },
    pipelineOptions: { continueOnError: false },
    metrics: {
      onStepDuration: ({ stepKey, durationMs }) =>
        console.log(stepKey, durationMs),
    },
  },
);
```

### pipe() — fluent builder

```js
import { pipe } from "rest-pipeline-js";

const orchestrator = pipe()
  .step({ key: "auth", request: async () => getToken() })
  .step({ key: "fetchUser", request: async ({ prev }) => fetchUser(prev) })
  .parallel([
    { key: "loadPosts", request: async () => fetchPosts() },
    { key: "loadNotifs", request: async () => fetchNotifications() },
  ])
  .stream({
    key: "liveUpdates",
    stream: async function* () {
      yield* subscribe("/events");
    },
    onChunk: (chunk) => updateUI(chunk),
  })
  .build({ httpConfig: { baseURL: "https://api.example.com" } });
```

| Builder method                | Description                                              |
| ----------------------------- | -------------------------------------------------------- |
| `.step(stage)`                | Add a sequential stage                                   |
| `.parallel(stages, options?)` | Add a parallel group (`key`/`concurrency` optional, see [Limiting concurrency](#limiting-concurrency)) |
| `.subPipeline(item)`          | Embed a sub-pipeline as a stage                          |
| `.stream(stage)`              | Add a stream stage (AsyncIterable)                       |
| `.build(options?)`            | Create and return a `PipelineOrchestrator`               |
| `.toConfig(options?)`         | Return `PipelineConfig` without creating an orchestrator |

#### Typed chaining (TypeScript)

In TypeScript, `pipe().step(...)` tracks the type of `prev` across the chain: each `.step()`'s `prev` is typed as the previous step's return value (`undefined` for the very first step, matching the orchestrator's actual runtime behavior). `.parallel()` / `.subPipeline()` / `.stream()` don't change it — exactly like at runtime, where `prev` for the next step still comes from the last regular `.step()`, not from a parallel group's results:

```ts
const orchestrator = pipe()
  .step({ key: "auth", request: async (): Promise<string> => getToken() })
  .step({ key: "fetchUser", request: async ({ prev }) => fetchUser(prev) }) // prev: string — inferred, autocompletes
  .step({ key: "oops", request: async ({ prev }) => prev.totallyNotAMethod() }) // ✗ compile error: wrong type for prev
  .build();
```

This works whether or not you keep reassigning the chain (`builder.step(...)` without capturing the return value still mutates the same instance, just like before) — the typing is purely additive and doesn't change runtime behavior.

---

## validatePipelineConfig()

Catch configuration errors before runtime:

```js
import { validatePipelineConfig } from "rest-pipeline-js";

const { valid, errors } = validatePipelineConfig({
  stages: [
    { key: "step1", request: async () => data },
    { key: "step1", request: async () => other }, // duplicate!
    { key: "", request: async () => other }, // empty key!
  ],
});

if (!valid) console.error(errors);
// ["[root] duplicate stage key: "step1"", "[root] stage key must be a non-empty string"]
```

Validates: duplicate keys, empty/invalid keys, empty `stages` array, invalid field types (`request`, `condition`, `retryCount`, `timeoutMs`), and recursively validates nested `subPipeline` configs.

---

## Plugin system

Package reusable orchestrator behavior into plugins:

```js
const loggingPlugin = {
  name: "logging",
  install(orchestrator) {
    const off = orchestrator.on("log", (event) => {
      if (event.type === "step:success") console.log("✓", event.stepKey);
      if (event.type === "step:error")
        console.error("✗", event.stepKey, event.error);
    });
    return () => off(); // cleanup on orchestrator.destroy()
  },
};

const orchestrator = new PipelineOrchestrator({
  config: {
    stages: [
      /* ... */
    ],
    options: { plugins: [loggingPlugin, analyticsPlugin] },
  },
});

// Call when the orchestrator is no longer needed:
orchestrator.destroy();
```

- `install(orchestrator)` — receives the orchestrator instance; may subscribe to events, set up middleware, etc.
- If `install` returns a function, it is registered as a cleanup callback and invoked by `destroy()`.

---

## Persist adapter

Automatically save and restore pipeline state across page reloads:

```js
const localStorageAdapter = {
  save: (state) => localStorage.setItem("pipeline", JSON.stringify(state)),
  load: () => {
    const raw = localStorage.getItem("pipeline");
    return raw ? JSON.parse(raw) : null;
  },
};

const orchestrator = new PipelineOrchestrator({
  config: {
    stages: [
      /* ... */
    ],
    options: { persistAdapter: localStorageAdapter },
  },
});

// run() loads saved state at start; saves after each completed step
await orchestrator.run();
```

The adapter interface:

```ts
type PipelineStateAdapter = {
  save(state: PipelineExportedState): void | Promise<void>;
  load(): PipelineExportedState | null | Promise<PipelineExportedState | null>;
};
```

Both methods may be async (useful for IndexedDB or remote storage).

---

## Stream stages (SSE / AsyncIterable)

A stage whose `stream` function returns an `AsyncIterable<T>`. The orchestrator collects all emitted chunks into an array (the stage result). `onChunk` is called for each chunk in real time.

```js
const orchestrator = createPipeline([
  { key: "auth", request: async () => getToken() },
  {
    key: "liveData",
    stream: async function* ({ prev }) {
      const source = new EventSource(`/api/stream?token=${prev}`);
      yield* eventSourceToAsyncIterable(source);
    },
    onChunk: (chunk, sharedData) => {
      sharedData.partial = (sharedData.partial ?? "") + chunk;
      updateUI(sharedData.partial);
    },
  },
  {
    key: "finalize",
    // allResults.liveData.data is the full array of chunks
    request: async ({ allResults }) => allResults.liveData.data.join(""),
  },
]);
```

- Respects `abort()` — checks the abort signal between each chunk.
- Supports `continueOnError` — failed stream stages can be skipped like any other step.
- Emits standard step events: `step:start`, `step:success`, `step:error`.

---

## HTTP Adapter (custom fetch / edge environments)

Replace the built-in axios client with any HTTP implementation:

```js
const fetchAdapter = {
  async request(config) {
    const url = `${config.baseURL ?? ""}${config.url ?? ""}`;
    const res = await fetch(url, {
      method: config.method ?? "GET",
      body: config.data ? JSON.stringify(config.data) : undefined,
      headers: { "Content-Type": "application/json", ...config.headers },
      signal: config.signal,
    });
    const data = await res.json();
    return {
      data,
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
    };
  },
};

const client = createRestClient({
  baseURL: "https://api.example.com",
  adapter: fetchAdapter,
  // Auth, interceptors, sanitizeHeaders, metrics still work on top of the adapter
  auth: { getToken: async () => token },
});
```

```ts
type HttpAdapter = {
  request<T = unknown>(
    config: RestRequestConfig & { baseURL?: string },
  ): Promise<ApiResponse<T>>;
};
```

When `adapter` is set, `createRestClient()` never calls `axios.create()` — the built-in axios instance simply isn't constructed, so adapter-only usage (e.g. in Cloudflare Workers / Deno) doesn't pay for it.

---

## Vue integration

```vue
<script setup>
import {
  PipelineOrchestrator,
  usePipelineProgressVue,
  usePipelineRunVue,
} from "rest-pipeline-js/vue";

const orchestrator = new PipelineOrchestrator({
  config: {
    stages: [
      /* ... */
    ],
  },
});
const progress = usePipelineProgressVue(orchestrator);
const { run, running, result, error, abort, pause, resume, rerunStep } =
  usePipelineRunVue(orchestrator);
</script>

<template>
  <div>
    <div>Current stage: {{ progress.currentStage }}</div>
    <button @click="run()" :disabled="running">Start</button>
    <button @click="abort()" :disabled="!running">Abort</button>
    <button @click="pause()">Pause</button>
    <button @click="resume()">Resume</button>
    <div v-if="result">Done: {{ result }}</div>
    <div v-if="error">Error: {{ error.message }}</div>
  </div>
</template>
```

Composables (import from `rest-pipeline-js/vue`):

| Composable                                                  | Returns                                                                                             | Description                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `usePipelineProgressVue(orchestrator)`                      | `Ref<PipelineProgress>`                                                                             | Reactive progress                      |
| `usePipelineRunVue(orchestrator)`                           | `{ run, running, result, error, stageResults, abort, pause, resume, rerunStep, clearStageResults }` | Run pipeline and get reactive state    |
| `usePipelineStepEventVue(orchestrator, stepKey, eventType)` | `Ref<any>`                                                                                          | Last payload for a specific step event |
| `usePipelineLogsVue(orchestrator)`                          | `Ref<log[]>`                                                                                        | Reactive logs                          |
| `useRerunPipelineStepVue(orchestrator)`                     | `function`                                                                                          | Bound `rerunStep`                      |
| `useRestClientVue(config)`                                  | `ComputedRef<RestClient>`                                                                           | Reactive REST client                   |
| `usePipelineStageResultVue(orchestrator, stepKey)`          | `Ref<PipelineStepResult \| null>`                                                                   | Reactive result of a single stage      |

---

## React integration

```jsx
import { useRef } from "react";
import {
  PipelineOrchestrator,
  usePipelineProgressReact,
  usePipelineRunReact,
} from "rest-pipeline-js/react";

const orchestrator = new PipelineOrchestrator({
  config: {
    stages: [
      /* ... */
    ],
  },
});

export function PipelineComponent() {
  const progress = usePipelineProgressReact(orchestrator);
  const [run, { running, result, error, abort, pause, resume, rerunStep }] =
    usePipelineRunReact(orchestrator);

  return (
    <div>
      <div>Current stage: {progress.currentStage}</div>
      <button onClick={() => run()} disabled={running}>
        Start
      </button>
      <button onClick={() => abort()} disabled={!running}>
        Abort
      </button>
      <button onClick={() => pause()}>Pause</button>
      <button onClick={() => resume()}>Resume</button>
      {result && <div>Done: {JSON.stringify(result)}</div>}
      {error && <div>Error: {error.message}</div>}
    </div>
  );
}
```

Hooks (import from `rest-pipeline-js/react`):

| Hook                                                          | Returns                                                                            | Description                            |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------- |
| `usePipelineProgressReact(orchestrator)`                      | `PipelineProgress`                                                                 | Reactive progress                      |
| `usePipelineRunReact(orchestrator)`                           | `[run, { running, result, error, stageResults, abort, pause, resume, rerunStep }]` | Run pipeline and get state             |
| `usePipelineStepEventReact(orchestrator, stepKey, eventType)` | `any`                                                                              | Last payload for a specific step event |
| `usePipelineLogsReact(orchestrator)`                          | `log[]`                                                                            | Reactive logs                          |
| `useRerunPipelineStepReact(orchestrator)`                     | `function`                                                                         | Bound `rerunStep`                      |
| `useRestClientReact(config)`                                  | `RestClient`                                                                       | Memoized REST client                   |
| `usePipelineStageResultReact(orchestrator, stepKey)`          | `PipelineStepResult \| null`                                                       | Result of a single stage               |

---

## Entry points

| Entry point              | Use for        | Contents                                                                    |
| ------------------------ | -------------- | --------------------------------------------------------------------------- |
| `rest-pipeline-js`       | Core only      | `PipelineOrchestrator`, `createRestClient`, types, utilities. No Vue/React. |
| `rest-pipeline-js/vue`   | Vue projects   | Core + Vue composables                                                      |
| `rest-pipeline-js/react` | React projects | Core + React hooks                                                          |

```js
// Core only
import { createRestClient, PipelineOrchestrator } from "rest-pipeline-js";

// Vue
import { PipelineOrchestrator, usePipelineRunVue } from "rest-pipeline-js/vue";

// React
import {
  PipelineOrchestrator,
  usePipelineRunReact,
} from "rest-pipeline-js/react";
```

`sideEffects: false` — unused entry points are tree-shaken. `react` / `react-dom` are `peerDependencies`.

---

## Architecture

```
rest-pipeline-js
│
├── createRestClient (HttpConfig) → RestClient
│     ├── RequestExecutor      — retry + backoff + Retry-After + AbortController timeout
│     ├── CacheManager         — in-memory TTL cache for GET responses
│     ├── RateLimiter          — concurrency + req/interval sliding window
│     ├── CircuitBreaker       — closed → open → half-open; rejects locally when open
│     ├── AuthProvider         — Bearer injection; 401 refresh + one retry; optional tokenTtlMs cache
│     ├── MetricsCollector     — onRequestStart / onRequestEnd callbacks
│     ├── HeaderSanitizer      — masks sensitive headers before metrics callbacks
│     └── HttpAdapter          — pluggable transport (default: axios; swap for fetch / edge)
│
├── PipelineOrchestrator (config, httpConfig?, sharedData?, options?)
│     ├── StageRunner          — sequential execution loop; parallel via Promise.all
│     │     condition → pauseBefore → before → request → after → pauseAfter
│     ├── MiddlewareRunner     — beforeEach / afterEach / onError across all stages
│     ├── EventBus             — on() / emit(); step:start|success|error|skipped|progress, log
│     ├── ProgressTracker      — subscribeProgress / subscribeStageResults / getProgress
│     ├── AbortController      — abort() cancels current HTTP request via AbortSignal
│     ├── PauseController      — pause() / resume() inter-stage checkpoints
│     ├── MetricsHooks         — onPipelineStart / onPipelineEnd / onStepDuration
│     ├── StateSerializer      — exportState() / importState() (stageResults + logs)
│     ├── PersistAdapter       — pluggable save/load; auto-save after each stage
│     └── PluginManager        — install() + destroy() lifecycle
│
├── PipelineBuilder (pipe())
│     .step() / .parallel() / .subPipeline() / .stream() → .build() / .toConfig()
│
├── createPipeline()           — short factory wrapping new PipelineOrchestrator()
│
├── validatePipelineConfig()   — duplicate keys, empty keys, type checks, recursive
│
├── /vue   (separate entry point)
│     usePipelineRunVue / usePipelineProgressVue / usePipelineLogsVue
│     usePipelineStepEventVue / useRestClientVue / usePipelineStageResultVue
│
└── /react (separate entry point)
      usePipelineRunReact / usePipelineProgressReact / usePipelineLogsReact
      usePipelineStepEventReact / useRestClientReact / usePipelineStageResultReact
```

---

## Bundle size & peer dependencies

| Entry point              | Peer deps                    | Notes                                                            |
| ------------------------ | ---------------------------- | ---------------------------------------------------------------- |
| `rest-pipeline-js`       | —                            | Core — orchestrator, HTTP client, utilities. Depends on `axios`. |
| `rest-pipeline-js/vue`   | `vue ^3.3`                   | Core + Vue composables                                           |
| `rest-pipeline-js/react` | `react ^19`, `react-dom ^19` | Core + React hooks                                               |

The package ships as tree-shakeable ESM (`dist/esm/`) and CommonJS (`dist/cjs/`). The `/vue` and `/react` entry points are code-split — importing one does not bundle the other.

---

## License

MIT

---

## Author

Danil Lisin Vladimirovich aka Macrulez

GitHub: [macrulezru](https://github.com/macrulezru) · Website: [macrulez.ru/en](https://macrulez.ru/en)

Bugs and questions — [issues](https://github.com/macrulezru/pipeline-js/issues)

---

## 💖 Support the project

Open source takes time and effort. If my work saves you time or brings value, consider supporting further development.

<a href="https://donate.cryptocloud.plus/M6O34NIN" target="_blank">
  <img src="https://img.shields.io/badge/Donate-CryptoCloud-8A2BE2?style=for-the-badge&logo=cryptocurrency&logoColor=white" alt="Donate via CryptoCloud">
</a>

Thank you for being part of this journey. ❤️
