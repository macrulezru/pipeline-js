## rest-pipeline-js

**Flexible, modular pipeline orchestrator for REST APIs.**

---

## Installation

```sh
npm i rest-pipeline-js
```

## Features & API

### Core module (rest-pipeline-js)

#### Example: Create REST client and make a request

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
  // Auth Provider — token injected automatically, 401 triggers refresh + one retry
  auth: {
    getToken: async () => localStorage.getItem("token") ?? "",
    onUnauthorized: async () => {
      /* refresh token here */
    },
  },
  // Mask sensitive headers in metrics (authorization, x-api-key, cookie, …)
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

#### Example: Run a pipeline, handle errors, track progress, use shared data

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

### Main classes and functions

#### createRestClient(config: HttpConfig): RestClient

Creates a REST client with advanced HTTP features.

**Available methods:**

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
| `clearCache()`                          | Clear this client's response cache |

**HttpConfig options:**

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
| `cache.enabled`                    | Enable response caching for GET requests                                         |
| `cache.ttlMs`                      | Cache TTL in ms                                                                  |
| `rateLimit.maxConcurrent`          | Max simultaneous requests                                                        |
| `rateLimit.maxRequestsPerInterval` | Max requests per time window                                                     |
| `rateLimit.intervalMs`             | Time window size in ms                                                           |
| `metrics.onRequestStart`           | Callback on request start                                                        |
| `metrics.onRequestEnd`             | Callback on request end (includes duration and bytes)                            |
| `auth.getToken`                    | Async function returning a Bearer token (called before every request)            |
| `auth.onUnauthorized`              | Optional async callback on 401 — refresh the token here; request is retried once |
| `sanitizeHeaders`                  | Mask sensitive headers in metrics callbacks (default: `false`)                   |
| `sensitiveHeaders`                 | Additional headers to mask (extends `DEFAULT_SENSITIVE_HEADERS`)                 |
| `retry.maxRetryAfterMs`            | Max wait from `Retry-After` header in ms (default: `60000`)                      |
| `adapter`                          | Custom HTTP adapter (e.g. native `fetch`) — replaces built-in axios              |

**Per-request cache override:**

```js
const res = await client.get("/data", {
  useCache: true,
  cacheTtlMs: 30000,
  cacheKey: "my-custom-key",
});
```

---

### Auth Provider

Automatically inject an `Authorization: Bearer <token>` header before every request. On a `401` response, `onUnauthorized` is called (e.g. to refresh the token) and the request is retried **once** — preventing infinite loops.

```js
const client = createRestClient({
  baseURL: "https://api.example.com",
  auth: {
    getToken: async () => {
      return localStorage.getItem("access_token") ?? "";
    },
    onUnauthorized: async () => {
      // refresh token, update storage
      const newToken = await refreshAccessToken();
      localStorage.setItem("access_token", newToken);
    },
  },
});

// Authorization: Bearer <token> is added automatically to every request
const res = await client.get("/profile");
```

---

### Log Sanitization

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

You can also use `sanitizeHeadersMap` directly:

```js
import { sanitizeHeadersMap } from "rest-pipeline-js";

const safe = sanitizeHeadersMap(
  { authorization: "Bearer abc", "content-type": "application/json" },
  ["x-custom-secret"],
);
// { authorization: "REDACTED", "content-type": "application/json" }
```

---

#### RequestExecutor

Wrapper for REST requests with retry, timeout (via AbortController), Retry-After header support, and backoff.

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

#### PipelineOrchestrator

Main class for building and managing a pipeline of sequential (and parallel) stages.

##### Constructor

```js
new PipelineOrchestrator({
  config,       // PipelineConfig — stages and optional middleware
  httpConfig?,  // HttpConfig — HTTP client settings
  sharedData?,  // Record<string, any> — shared pool across all stages
  options?,     // { autoReset?: boolean }
})
```

##### Key methods

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
| `getStageResults()`                        | Synchronous snapshot of all stage results (no subscription needed)                    |
| `destroy()`                                | Run cleanup callbacks from all installed plugins                                      |
| `subscribeProgress(listener)`              | Subscribe to progress updates                                                         |
| `subscribeStageResults(listener)`          | Subscribe to stageResults changes                                                     |
| `subscribeStepProgress(stepKey, listener)` | Subscribe to a specific stage's progress                                              |
| `on(eventName, handler)`                   | Subscribe to any event (`step:<key>:start\|success\|error\|skipped\|progress`, `log`) |
| `onStepStart/Finish/Error(handler)`        | Subscribe to stage lifecycle events                                                   |
| `getProgress()`                            | Get current progress snapshot                                                         |
| `getLogs()`                                | Get all pipeline logs                                                                 |
| `clearStageResults()`                      | Reset results and progress                                                            |

##### Stage parameters (PipelineStageConfig)

| Parameter                                     | Description                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| `key`                                         | Unique stage identifier                                                  |
| `request({ prev, allResults, sharedData })`   | Main stage function — return value becomes the stage result              |
| `condition({ prev, allResults, sharedData })` | If returns `false`, stage is skipped with status `"skipped"`             |
| `before({ prev, allResults, sharedData })`    | Pre-processing hook — returned value replaces `prev` passed to `request` |
| `after({ result, allResults, sharedData })`   | Post-processing hook — returned value replaces the stage result          |
| `errorHandler({ error, key, sharedData })`    | Per-stage error handler                                                  |
| `retryCount`                                  | Override retry count for this stage                                      |
| `timeoutMs`                                   | Override timeout for this stage                                          |
| `pauseBefore`                                 | Delay in ms before executing `request`                                   |
| `pauseAfter`                                  | Delay in ms after executing `request`                                    |

##### Stage execution flow

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
  └─► stage.errorHandler (if set) → middleware.onError → [status: error] → stop
```

---

### Parallel stages

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

- All stages in a `parallel` group run simultaneously via `Promise.all`.
- If **any** stage in the group fails, the pipeline stops and marks `success: false`.
- Each parallel stage has its own key and result in `stageResults`.
- `rerunStep(key)` works for stages inside parallel groups too.

---

### Global middleware

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

### Pause / Resume

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

### Export / Import state

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

### Pipeline metrics

Observe pipeline execution without modifying stage logic:

```js
const orchestrator = new PipelineOrchestrator({
  config: {
    stages: [ /* ... */ ],
    metrics: {
      onPipelineStart: ({ timestamp }) => {
        console.log("Pipeline started at", new Date(timestamp).toISOString());
      },
      onPipelineEnd: ({ durationMs, success, stageResults }) => {
        analytics.track("pipeline_complete", { durationMs, success });
      },
      onStepDuration: ({ stepKey, durationMs, status }) => {
        console.log(`[${stepKey}] ${status} in ${durationMs}ms`);
      },
    },
  },
});
```

| Callback | Receives | Description |
|----------|----------|-------------|
| `onPipelineStart` | `{ timestamp }` | Fires at the beginning of `run()` |
| `onPipelineEnd` | `{ durationMs, success, stageResults }` | Fires when `run()` completes |
| `onStepDuration` | `{ stepKey, durationMs, status }` | Fires after every executed step |

---

### createPipeline() + pipe() builder

#### createPipeline() — short factory

```js
import { createPipeline } from "rest-pipeline-js";

const orchestrator = createPipeline(
  [
    { key: "fetchUser", request: async () => fetchUser() },
    { key: "process",   request: async ({ prev }) => process(prev) },
  ],
  {
    httpConfig: { baseURL: "https://api.example.com" },
    sharedData: { userId: 42 },
    pipelineOptions: { continueOnError: false },
    metrics: { onStepDuration: ({ stepKey, durationMs }) => console.log(stepKey, durationMs) },
  },
);
```

#### pipe() — fluent builder

```js
import { pipe } from "rest-pipeline-js";

const orchestrator = pipe()
  .step({ key: "auth", request: async () => getToken() })
  .step({ key: "fetchUser", request: async ({ prev }) => fetchUser(prev) })
  .parallel([
    { key: "loadPosts",  request: async () => fetchPosts() },
    { key: "loadNotifs", request: async () => fetchNotifications() },
  ])
  .stream({
    key: "liveUpdates",
    stream: async function* () { yield* subscribe("/events"); },
    onChunk: (chunk) => updateUI(chunk),
  })
  .build({ httpConfig: { baseURL: "https://api.example.com" } });
```

| Builder method | Description |
|----------------|-------------|
| `.step(stage)` | Add a sequential stage |
| `.parallel(stages, options?)` | Add a parallel group (`key` auto-generated if omitted) |
| `.subPipeline(item)` | Embed a sub-pipeline as a stage |
| `.stream(stage)` | Add a stream stage (AsyncIterable) |
| `.build(options?)` | Create and return a `PipelineOrchestrator` |
| `.toConfig(options?)` | Return `PipelineConfig` without creating an orchestrator |

---

### validatePipelineConfig()

Catch configuration errors before runtime:

```js
import { validatePipelineConfig } from "rest-pipeline-js";

const { valid, errors } = validatePipelineConfig({
  stages: [
    { key: "step1", request: async () => data },
    { key: "step1", request: async () => other }, // duplicate!
    { key: "",      request: async () => other }, // empty key!
  ],
});

if (!valid) console.error(errors);
// ["[root] duplicate stage key: "step1"", "[root] stage key must be a non-empty string"]
```

Validates: duplicate keys, empty/invalid keys, empty `stages` array, invalid field types (`request`, `condition`, `retryCount`, `timeoutMs`), and recursively validates nested `subPipeline` configs.

---

### Plugin system

Package reusable orchestrator behavior into plugins:

```js
const loggingPlugin = {
  name: "logging",
  install(orchestrator) {
    const off = orchestrator.on("log", (event) => {
      if (event.type === "step:success") console.log("✓", event.stepKey);
      if (event.type === "step:error")   console.error("✗", event.stepKey, event.error);
    });
    return () => off(); // cleanup on orchestrator.destroy()
  },
};

const orchestrator = new PipelineOrchestrator({
  config: {
    stages: [ /* ... */ ],
    options: {
      plugins: [loggingPlugin, analyticsPlugin],
    },
  },
});

// Call when the orchestrator is no longer needed:
orchestrator.destroy();
```

- `install(orchestrator)` — receives the orchestrator instance; may subscribe to events, set up middleware, etc.
- If `install` returns a function, it is registered as a cleanup callback and invoked by `destroy()`.

---

### Persist adapter

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
    stages: [ /* ... */ ],
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

### Stream stages (SSE / AsyncIterable)

A stage whose `stream` function returns an `AsyncIterable<T>`. The orchestrator collects all emitted chunks into an array (the stage result). `onChunk` is called for each chunk in real time.

```js
const orchestrator = createPipeline([
  { key: "auth", request: async () => getToken() },
  {
    key: "liveData",
    stream: async function* ({ prev }) {
      // prev is the result of "auth"
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

### HTTP Adapter (custom fetch / edge environments)

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
    return { data, status: res.status, statusText: res.statusText,
             headers: Object.fromEntries(res.headers.entries()) };
  },
};

const client = createRestClient({
  baseURL: "https://api.example.com",
  adapter: fetchAdapter,
  // Auth, interceptors, sanitizeHeaders, metrics still work on top of the adapter
  auth: { getToken: async () => token },
  interceptors: { request: [addCorrelationId] },
});
```

```ts
type HttpAdapter = {
  request<T = unknown>(
    config: RestRequestConfig & { baseURL?: string },
  ): Promise<ApiResponse<T>>;
};
```

---

### Vue integration

#### Example: use in Vue component

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

Composition functions (import from `rest-pipeline-js/vue`):

| Function                                                    | Returns                                                                                             | Description                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `usePipelineProgressVue(orchestrator)`                      | `Ref<PipelineProgress>`                                                                             | Reactive progress                      |
| `usePipelineRunVue(orchestrator)`                           | `{ run, running, result, error, stageResults, abort, pause, resume, rerunStep, clearStageResults }` | Run pipeline and get reactive state    |
| `usePipelineStepEventVue(orchestrator, stepKey, eventType)` | `Ref<any>`                                                                                          | Last payload for a specific step event |
| `usePipelineLogsVue(orchestrator)`                          | `Ref<log[]>`                                                                                        | Reactive logs                          |
| `useRerunPipelineStepVue(orchestrator)`                     | `function`                                                                                          | Bound `rerunStep`                      |
| `useRestClientVue(config)`                                  | `ComputedRef<RestClient>`                                                                           | Reactive REST client                   |
| `usePipelineStageResultVue(orchestrator, stepKey)`          | `Ref<PipelineStepResult \| null>`                                                                   | Reactive result of a single stage      |

---

### React integration

#### Example: use in React component

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
| `rest-pipeline-js/vue`   | Vue projects   | Core + Vue composition functions                                            |
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

`sideEffects: false` — unused entry points are tree-shaken. `react`/`react-dom` are `peerDependencies`.

---

## Requirements

- Node.js >= 14.0.0
- Modern browser with ES2019+ support

---

## Vue Demo

A live interactive demo of the pipeline running against a real flight-search API — 4 sequential stages: airport lookup, availability, ancillary services, and seat map.

```bash
git clone https://github.com/macrulezru/pipeline-js.git
cd pipeline-js
npm install
npm run demo:vue
```

Opens at `http://localhost:3000` (or the next available port). Click **Run Pipeline** to execute all stages and watch results appear in real time. A boarding pass is rendered when all stages succeed.

---

## Development

```bash
git clone https://github.com/macrulezru/pipeline-js.git
cd pipeline-js
npm install
npm test
```

---

## License

MIT

---

## Author

Danil Lisin Vladimirovich aka Macrulez

GitHub: [macrulezru](https://github.com/macrulezru) · Website: [macrulez.ru](https://macrulez.ru/)

Questions and bugs — [issues](https://github.com/macrulezru/pipeline-js/issues)
