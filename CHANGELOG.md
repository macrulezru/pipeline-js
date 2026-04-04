# Changelog

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
