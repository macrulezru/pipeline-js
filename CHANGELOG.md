# Changelog

## [Unreleased]

### Fixed

- **Flaky test in `tests/rest-client.test.ts`** ("при повторном 401 после onUnauthorized — не попадает в бесконечный цикл") — the mock error set `err.isAxiosError = true` *after* `Object.setPrototypeOf(err, axios.AxiosError.prototype)`. `AxiosError.prototype.isAxiosError` is defined as non-writable (`Object.defineProperty(..., { value: true })`), so that assignment threw a `TypeError` in strict mode, which masked the actual 401-retry logic being exercised. Fixed by assigning `isAxiosError` before swapping the prototype, matching the (correct) pattern already used by the other axios-error mocks in the same file. No production code changed.

### Added

#### Pipeline Orchestrator

- **`signal` in stage hooks** — `request`, `condition`, `before`, `after`, `errorHandler`, and `StreamStageConfig.stream` now receive the pipeline's `AbortSignal` in their params object. Pass it down to `fetch`/`axios`/etc. so `abort()` actually cancels custom async work inside stage functions, not just the orchestrator's own bookkeeping.
- **`recoverStep(data)`** (from `types.ts`, re-exported from the root entry point) — `errorHandler` can return `recoverStep(data)` to recover a failed stage back into a successful one (`status: "success"`, `data`), running the same commit path as a normal success (metrics, `persistAdapter.save()`, `middleware.afterEach`, `step:success` event) instead of stopping/continuing-as-error. Returning anything else keeps the previous behavior (error, transformed via `toApiError`).

#### RestClient

- **No `axios.create()` when `adapter` is set** — `createRestClient()` no longer constructs the built-in axios instance if a custom `HttpAdapter` is provided, avoiding unnecessary work in edge/serverless environments that only use the adapter.

### Changed

- Internal: `PipelineOrchestrator.executeStage()` success/error commit logic was extracted into `_commitStepSuccess()` / `_commitStepError()` so the new `errorHandler` recovery path and the normal success path share identical metrics/persist/middleware/event behavior.

#### Pipeline Orchestrator

- **`ParallelStageGroup.concurrency`** — caps how many stages of a parallel group run at once instead of always starting all of them via `Promise.all`. Useful for fan-out over many items (e.g. paginated fetches) without opening hundreds of requests at the same time. Results are still returned/stored in the same shape and order as an unlimited group. Supported by the `pipe()` builder via `.parallel(stages, { concurrency })`.

#### RestClient

- **`AuthProvider.tokenTtlMs`** — caches `getToken()`'s result for the given duration instead of calling it before every request. The cache is invalidated automatically on a `401` (before `onUnauthorized` runs), so the retried request always fetches a fresh token. Without `tokenTtlMs`, behavior is unchanged (`getToken()` called every request).
- **`invalidateCache(matcher)`** — new method on the client returned by `createRestClient()`. Removes only the response-cache entries whose URL matches `matcher` (substring, `RegExp`, or `(info: { method, url }) => boolean`) instead of clearing the whole cache like `clearCache()`. Returns the number of entries removed.
- `TtlCache` gained `keys()` and `deleteWhere(predicate)` to support the above.

### Added (continued)

#### RestClient — Circuit breaker

- **`HttpConfig.circuitBreaker`** (new `CircuitBreakerConfig`: `{ failureThreshold, openMs, successThreshold?, isFailure? }`) — after `failureThreshold` consecutive failures the client rejects requests immediately with `CircuitOpenError` (`code: "CIRCUIT_OPEN"`) for `openMs`, without making a network call. After `openMs` it probes with real requests in a `half-open` state: success (×`successThreshold`, default 1) closes the circuit, failure re-opens it. `isFailure(error)` can exclude certain errors (e.g. 4xx) from counting as failures. Cancelled/aborted requests never count as failures. New module `src/circuit-breaker.ts` exports `CircuitBreaker`, `CircuitOpenError`, and the `CircuitBreakerState` type.
- **`client.getCircuitBreakerState()`** — returns `"closed" | "open" | "half-open"`, or `null` if `circuitBreaker` isn't configured.
- Not set by default — without `circuitBreaker`, behavior is unchanged.

#### Pipeline Orchestrator — run correlation

- **`runId`** — every `run()` call generates a fresh ID (via `crypto.randomUUID()`, falling back to a timestamp-based string), shared by `PipelineMetrics.onPipelineStart/onPipelineEnd/onStepDuration`, every `PipelineStepEvent` (`.runId`), and every entry returned by `getLogs()`/`exportState()`. All attempts within one `run()` (including `pipelineRetry` retries) share the same `runId`. `rerunStep()` generates its own separate `runId`. New `orchestrator.getRunId()` reads the current/last one. `PipelineMetrics`' three callback `info` objects and `PipelineStepEvent` gained a `runId` field (required on the former, optional on the latter for backward compatibility).

#### DX utilities — typed `pipe()` builder

- **`PipelineBuilder<TPrev>`** — the fluent builder is now generic: `.step()` infers and threads the previous step's output type into the next step's `prev`, so TypeScript catches type mismatches across a chain and provides autocomplete. The first step's `prev` is typed `undefined`, matching actual runtime behavior. `.parallel()` / `.subPipeline()` / `.stream()` intentionally don't change the threaded type, since the orchestrator's `prev` for the next step always comes from the last regular `.step()`, never from a parallel group/sub-pipeline/stream. Purely a type-level addition — `PipelineBuilder` still mutates the same instance internally, so existing non-chained usage (calling `.step()` without reassigning the result) keeps working unchanged.
- `ParallelStageGroup.concurrency` is also exposed through `pipe().parallel(stages, { concurrency })`.

---

## [1.3.7] - 2026-04-04

### Added

#### Pipeline Orchestrator

- **Pipeline metrics** — `PipelineConfig.metrics` with three callbacks:
  - `onPipelineStart({ timestamp })` — fires at the beginning of `run()`
  - `onPipelineEnd({ durationMs, success, stageResults })` — fires when `run()` completes
  - `onStepDuration({ stepKey, durationMs, status })` — fires after every executed step
- **Plugin system** — `options.plugins` accepts an array of `PipelinePlugin` objects. Each plugin receives the orchestrator instance in `install(orchestrator)` and can subscribe to events, add middleware hooks, etc. Returning a function from `install()` registers it as a cleanup callback.
- **`destroy()`** — new public method that invokes cleanup functions from all installed plugins.
- **Persist adapter** — `options.persistAdapter` accepts a `PipelineStateAdapter` object with `save` / `load` methods. When set: state is automatically loaded at the start of `run()` (via `importState`) and saved after each successfully completed step.
- **Stream stages** — new `StreamStageConfig` element type for `PipelineItem`. The `stream` function returns an `AsyncIterable<T>`; the orchestrator iterates it and collects chunks into an array (the stage result). The optional `onChunk(chunk, sharedData)` callback fires for each chunk in real time. Stream stages honour `abort()`, `continueOnError`, and emit standard step events.
- **Generic step keys** — `PipelineOrchestrator<TKeys extends string = string>` now accepts a generic type parameter for typed auto-complete in `on()`, `rerunStep()`, and `subscribeStepProgress()`.

#### DX utilities

- **`createPipeline(stages, options?)`** — factory function that creates a `PipelineOrchestrator` without the nested `{ config: { stages } }` boilerplate.
- **`pipe()`** — fluent builder API. Methods: `.step()`, `.parallel()`, `.subPipeline()`, `.stream()`, `.build(options?)`, `.toConfig(options?)`.
- **`validatePipelineConfig(config, context?)`** — validates a `PipelineConfig` before runtime. Checks for duplicate keys, empty keys, empty `stages` array, invalid field types, and recursively validates nested sub-pipelines. Returns `{ valid: boolean; errors: string[] }`.
- **`getStageResults()`** — synchronous snapshot of all stage results (no subscription needed).

#### Vue / React hooks

- **`usePipelineStageResultVue(orchestrator, stepKey)`** — reactive `Ref<PipelineStepResult | null>` for a single step.
- **`usePipelineStageResultReact(orchestrator, stepKey)`** — state hook for a single step, updates on every `stageResults` change.

#### RestClient

- **`HttpAdapter`** — new `adapter` field in `HttpConfig`. When provided, replaces the built-in axios client with a custom implementation (e.g. native `fetch`). All other features (auth, interceptors, retry, sanitization, metrics) continue to work on top of the adapter.

#### Types

- `PipelineMetrics` interface
- `PipelinePlugin` type
- `PipelineStateAdapter` type
- `StreamStageConfig<T>` type; updated `PipelineItem` union to include it
- `HttpAdapter` type
- `PipelineLogEventType` union — exhaustive list of all log event type strings
- Extended `PipelineConfig` with `metrics?`
- Extended `PipelineOptions` with `persistAdapter?` and `plugins?`
- Extended `HttpConfig` with `adapter?`

---

## [1.3.6] - 2026-04-03

### Added

#### Pipeline Orchestrator

- **`continueOnError`** — per-stage and global flag to continue pipeline execution when a step fails. When enabled, failed steps are marked with `status: "error"` but do not stop the pipeline.
- **`next()` function** — DAG (directed acyclic graph) transitions allowing non-linear pipeline flows. After successful step execution, you can dynamically jump to any stage by its key or continue sequentially by returning `null`. Includes protection against infinite loops (max steps = stages.length × 10).
- **Sub-pipelines** — embed a complete `PipelineConfig` as a stage using the `subPipeline` field. Sub-pipelines run with their own context but share the parent's `sharedData` and abort signal. Results are stored under the stage key.
- **`pipelineRetry`** — automatic retry of the entire pipeline on failure. Supports:
  - `attempts` — number of retry attempts
  - `delayMs` — delay between retries
  - `retryFrom` — resume from `"start"` (default, resets all results) or `"failed-step"` (preserves successful stage results)
- **`pipelineTimeoutMs`** — global timeout for the entire pipeline execution. When exceeded, the pipeline is automatically aborted via `abort()`, cancelling any in-flight HTTP requests.

#### RestClient

- **Request interceptors** — modify request configuration before sending. Supports single interceptor or array of interceptors applied in sequence.
- **Response interceptors** — transform response data after receiving. Applied before returning the response to the caller.
- **Error interceptors** — handle or modify errors before they are thrown.
- **Global `onError` handler** — simple callback for centralized error handling. Receives the `ApiError` and the original request configuration.
- **Stale-While-Revalidate cache strategy** — serves stale cached data immediately while fetching fresh data in the background. Configured via:
  - `strategy: "stale-while-revalidate"`
  - `staleMs` — extra time to serve stale data after TTL expires
- **Request deduplication** — prevents duplicate in-flight GET requests. When enabled (`deduplicateRequests: true`), multiple identical requests share the same pending Promise, reducing network traffic.
- **`head()` method** — execute HEAD requests to retrieve headers without the response body.
- **`options()` method** — execute OPTIONS requests to discover allowed HTTP methods and CORS policies.

#### Types

- Added `RequestInterceptor`, `ResponseInterceptor`, `ErrorInterceptor` types
- Added `SubPipelineStage` type and updated `PipelineItem` union
- Extended `CacheConfig` with `strategy` and `staleMs` fields
- Extended `HttpConfig` with `interceptors`, `onError`, `deduplicateRequests`
- Extended `PipelineConfig` with `options` object containing `continueOnError`, `pipelineRetry`, `pipelineTimeoutMs`
- Extended `PipelineStageConfig` with `continueOnError` and `next` fields

#### Cache

- **`TtlCache.getStale()`** — new method that returns cached values even after TTL expiration, as long as they are within the `staleMs` window. Returns an object with `{ value, isStale }` where `isStale: true` indicates the value is beyond TTL but still usable.

### Changed

- `PipelineOrchestrator.run()` now supports retry logic via `pipelineRetry` configuration
- Main `run()` logic extracted to `_runOnce()` private method to enable retry functionality
- `PipelineOrchestrator` constructor now properly handles `config.options` separately from constructor `options`

### Fixed

- Backward compatibility with existing `PipelineConfig` objects that do not include the new `options` field
- `PipelineOrchestrator` constructor no longer conflicts between `config.options` and constructor `params.options`
- Parallel stage groups now correctly handle `continueOnError` behavior
