# Changelog

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
