# Changelog

## [2.0.0] - 2026-07-17

Package-quality and reliability pass: fixes a real ESM-loading bug, closes a
security-relevant default, adds distributed-deployment support for the rate
limiter and circuit breaker, adds request tracing and idempotency-key support,
and adds tooling (CI, coverage, bundle-size checks, type-level tests) to catch
regressions in these areas going forward. Four changes are breaking — see below.

### Breaking

- **`sanitizeHeaders` now defaults to `true`** (was `false`). Metrics callbacks (`HttpConfig.metrics.onRequestStart/onRequestEnd`) are commonly forwarded to external observability systems, so `Authorization`/`Cookie`/etc. are now masked by default instead of opt-in. Pass `sanitizeHeaders: false` explicitly to get the old (unmasked) behavior, e.g. for local debugging.
- **`client.invalidateCache()` and `client.clearCache()` are now `async`** (return `Promise<number>` / `Promise<void>` instead of `number` / `void`), to support the new pluggable `cache.store` (see Added) which may be backed by an async store like Redis. Add `await` at call sites; a bare `client.clearCache()` without awaiting still works but no longer guarantees the cache is cleared by the time the next line runs.
- **`useRestClientReact(config)` now recreates the client on `config` reference change instead of `JSON.stringify(config)` change.** Previously, passing a new inline object literal every render didn't recreate the client (by design), but this silently dropped function-valued fields (`auth`, `metrics`, `onError`, `interceptors`, `adapter`) from the comparison — a new inline callback on a later render was never picked up, so the client kept calling the closure captured on the first render. Reference-identity memoization (standard `useMemo` semantics) has no such gap; memoize your config object yourself (`useMemo`, `useState`, or a module-level constant) if you don't want a new client every render.
- **`client.getCircuitBreakerState()` is now `async`** (returns `Promise<CircuitBreakerState | null>` instead of the value directly), and so are all of `CircuitBreaker`'s public methods (`getState`/`canExecute`/`onSuccess`/`onFailure`), to support the new pluggable `circuitBreaker.store` (see Added). Without a `store`, these resolve synchronously (no real async work) — only the call site needs `await` added.

### Fixed

- **ESM build was unloadable by Node's native ESM resolver.** `dist/esm/*.js` had no accompanying `package.json` (`{"type":"module"}`), so Node fell back to parsing them as CommonJS and hit a `MODULE_TYPELESS_PACKAGE_JSON` warning plus a reparse; worse, relative imports/exports (`export * from "./rest-client"`) had no file extension, which bundler-style module resolution (used for the TS build) accepts but Node's native ESM resolver rejects outright (`ERR_MODULE_NOT_FOUND`). `import "rest-pipeline-js"` under plain `node` (no bundler) — including the edge/serverless runtimes the `HttpAdapter` feature is meant for — could not load the package at all; only bundler-mediated consumers (Vite/webpack/Next.js) worked. Fixed by adding explicit `.js` extensions to every relative import/export in `src/*.ts`, and by writing `dist/esm/package.json` (`{"type":"module"}`) / `dist/cjs/package.json` (`{"type":"commonjs"}`) as part of `npm run build`. Verified with `npm run verify:esm`, which now also runs in CI.
- **`useRestClientReact`** — see Breaking above; this was also a correctness fix (stale closures), not just a memoization-key change.
- **`useRestClientReact`'s `JSON.stringify(config)` dependency ran on every render** regardless of whether anything changed — replaced by the reference-identity fix above.

### Added

#### RestClient

- **`HttpConfig.cache.store`** (new `CacheStore<V>` interface) — swap the built-in per-process `TtlCache` for any backend implementing `get`/`set`/`delete`/`clear` (plus optional `getStale`/`deleteWhere`), so cached responses can be shared across multiple server instances instead of living in one process's memory. See `examples/redis-cache-store.ts`. `cache.get`/`set`/`getStale` calls are now always `await`ed internally, whether the store is sync or async.
- **`HttpConfig.rateLimit.store`** (new `RateLimiterStore` interface: `incrementWindow(key, intervalMs)`, `acquireConcurrencySlot(key, maxConcurrent, leaseMs)`) — swap the built-in per-process rate limiter for a distributed backend (e.g. Redis), so `maxRequestsPerInterval`/`maxConcurrent` are enforced across every server instance instead of each instance allowing up to N× the configured limit. New `rateLimit.key` (bucket name for sharing a limit across instances/limiters — default: a random per-instance id, so without an explicit `key` a `store` has no effect on sharing) and `rateLimit.leaseMs` (auto-expiry for a concurrency slot if the holder crashes without releasing, default 30s). `incrementWindow` is a fixed-window counter (same edge-of-window burst trade-off as any fixed-window limiter); `acquireConcurrencySlot` is necessarily best-effort/approximate across processes, same as most distributed semaphores in practice — see the interface's JSDoc. See `examples/redis-rate-limiter-store.ts`.
- **`HttpConfig.circuitBreaker.store`** (new `CircuitBreakerStore` interface: `get`/`set`, optional `incrementCounter`) — swap the built-in per-process circuit breaker state for a distributed backend, so `failureThreshold` consecutive failures across *all* instances open the circuit, instead of each instance needing its own `failureThreshold` before opening (which otherwise lets N× as many failures reach a struggling backend before anything trips). New `circuitBreaker.key` (bucket name, same sharing caveat as `rateLimit.key`). Without `incrementCounter`, falls back to get-compute-set (race-prone under heavy concurrent failures across instances, but still fail-safe). See `examples/redis-circuit-breaker-store.ts`.
- **`HttpConfig.tracing`** — `generateTraceparent: boolean` adds a W3C [Trace Context](https://www.w3.org/TR/trace-context/) `traceparent` header to every request (skipped if the request already sets one explicitly); `RestRequestConfig.traceId` lets you supply an explicit 32-hex trace id to correlate multiple requests (e.g. `orchestrator.getRunId().replace(/-/g, "")` — a UUID without dashes is exactly 32 hex characters) instead of getting a fresh random one per request. `tracing.provider` (new `TracingProvider`/`TracingSpan` interfaces, deliberately duck-typed to a subset of OpenTelemetry's `Span` API — no `@opentelemetry/api` dependency added) wraps every request in a span: `startSpan()` before, `end()`/`setStatus()`/`recordException()` after, so a real OTel SDK (or Sentry/Datadog/etc.) plugs in with a thin adapter. See `examples/opentelemetry-tracing.ts`.
- **`RestRequestConfig.idempotencyKey`** — sends an `Idempotency-Key` header (name configurable via `HttpConfig.idempotencyHeaderName`) so a backend that supports idempotency keys can safely dedupe retried mutating requests (POST/PUT/PATCH/DELETE) instead of double-applying them. The library only sends the header — actual deduplication is the backend's responsibility. New `HttpConfig.autoIdempotencyKey` has `RequestExecutor` (the class that actually implements retry — see the RequestExecutor section of the README) auto-generate one key per logical request, once before its retry loop starts, and reuse it across every attempt; doesn't affect direct `client.post()`/etc. calls made outside `RequestExecutor`. See `examples/idempotent-mutations.ts`.
- **`getRestClient()`'s internal client-instance cache key** now accounts for `cache.store`/`rateLimit.store`/`rateLimit.key`/`circuitBreaker.store`/`circuitBreaker.key`/`circuitBreaker.isFailure`/`tracing`/`autoIdempotencyKey`/`idempotencyHeaderName` (previously, function-valued fields like `store`/`isFailure` were silently dropped by the `JSON.stringify`-based key, since `JSON.stringify` omits function properties — so two configs differing only in *which* store/predicate they passed could incorrectly share one cached client instance).

#### Pipeline Orchestrator

- **`PipelineOptions.maxLogs`** — caps the internal log (`getLogs()`/`exportState().logs`) to the N most recent entries (FIFO eviction). Without it, behavior is unchanged: the log grows without bound for the lifetime of the `orchestrator` instance, which matters for a long-lived instance reused across many `run()`/`rerunStep()` calls without `autoReset`.

#### Vue / React hooks

- **`usePipelineRunReact`** gained `clearStageResults` in its returned object, matching `usePipelineRunVue` (previously only the Vue hook exposed it).

#### Tooling

- **`npm run lint`** — `eslint.config.mjs` (renamed from `.js`) is now actually wired into a script and CI. Switched `no-unused-vars` from the base ESLint rule (which misreports on TS-only constructs like type-literal function signatures) to `@typescript-eslint/no-unused-vars`; turned `@typescript-eslint/no-explicit-any` from fully off to `warn`.
- **`npm run test:coverage`** (`@vitest/coverage-v8`) with enforced thresholds (`vitest.config.ts`), calibrated to current measured coverage (~72% stmts / ~75% branches / ~59% funcs / ~74% lines). Three previously 0%-covered public modules (`pipeline-validator.ts`, `rate-limiter.ts`, and now `circuit-breaker.ts`'s store path) now have dedicated test files.
- **`npm run test:types`** (`vitest --typecheck`) — type-level tests (`tests/pipe.test-d.ts`) asserting the `pipe()` builder's `TPrev` threading actually behaves as documented (first step `undefined`, each `.step()` threads the prior return type, `.parallel()`/`.subPipeline()`/`.stream()` don't change it).
- **`npm run size`** (`size-limit`) — enforces a brotli-compressed size ceiling per entry point (core / `/vue` / `/react`), calibrated to current measured size (~23 KB each).
- **`.github/workflows/ci.yml`** — runs lint, build, the ESM-load regression check, unit tests, type tests, coverage, and bundle-size checks on Node 18/20/22 for every push/PR.
- **`examples/`** — focused, copy-pasteable snippets: paginated fan-out with `concurrency`, a `fetch`-based `HttpAdapter` for edge runtimes, an SSE `StreamStageConfig` step, and a Redis-backed `CacheStore`.

### Changed

- **Vue hook tests** (`tests/vue-hooks.test.ts`) now mount composables inside a real component `setup()` via a `withSetup` helper instead of calling them directly, so `onUnmounted` (used internally to unsubscribe from `stageResults`) has an active component instance to attach to. Previously this logged a Vue lifecycle warning on every run and left the unmount-cleanup path unverified.

---

## [1.4.0] - 2026-06-19

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

## [1.4.1] - 2026-06-20

### Added

- **`LICENSE`** — MIT license file added to the repository and to the published package (`files` already listed it; the file itself was missing).

### Changed

- Cleaned up package metadata: fixed `repository.url`/`bugs.url`/`homepage` to point at the correct GitHub repo (previously partially empty/incorrect), refreshed `description` and `keywords`, and updated the dependency lockfile. No source code changes.

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
