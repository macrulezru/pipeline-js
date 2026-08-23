# Changelog

## [Unreleased]

### Changed

- **Grouped `src/` into `src/http/` and `src/pipeline/` by domain — no public
  API or behavior change.** The 11 core files that build `createRestClient()`
  (`rest-client.ts`, `request-executor.ts`, `cache.ts`, `circuit-breaker.ts`,
  `rate-limiter.ts`, `offline-queue.ts`, `error-handler.ts`) and
  `PipelineOrchestrator` (`pipeline-orchestrator.ts`, `pipeline-builder.ts`,
  `pipeline-validator.ts`, `progress-tracker.ts`, plus the existing
  `orchestrator/` extraction modules) sat flat in `src/` — moved into
  `src/http/` and `src/pipeline/` respectively via `git mv` (history
  preserved). `index.ts`, `types.ts`, `pagination.ts`, `testing.ts`, and
  `plugins/` stayed at the top level. Also deleted the long-dead, unwired
  `src/vue-demo/` (a prismjs-based precursor of the live `demo/` app,
  excluded from every build config already) and its now-orphaned `prismjs`
  devDependency. Coverage, test count, lint warnings, and every bundle size
  are byte-for-byte identical to before the move.

## [2.1.0] - 2026-08-22

### Added

- **`HttpConfig.retry.jitterStrategy`** (`"fixed"` (default) | `"full"` |
  `"decorrelated"`) — controls how randomness is added to the computed
  backoff delay. `"fixed"` is the previous (and default) behavior: nominal
  backoff plus up to +10% on top. `"full"` and `"decorrelated"` implement
  AWS's [Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
  algorithms, which spread out retries from many concurrent clients better
  than a fixed jitter window — useful when many instances of an app may
  retry against the same backend at once. Doesn't affect `Retry-After`
  handling, which always takes the server's value as-is. As a minor
  consistency fix, the previously-unjittered fallback path (backoff used
  when a `Retry-After` header is present but fails to parse) now also goes
  through `jitterStrategy`.
- **`HttpConfig.rateLimit.onRateLimitHeaders`** — callback invoked after
  every response (success or error) with the raw response headers, so you
  can throttle proactively from `X-RateLimit-Remaining`/the IETF-draft
  `RateLimit-*`/vendor-specific headers instead of only reacting after an
  actual 429. New `RateLimiter.throttleFor(ms)` / `.asControl()` (the object
  passed to the callback) delay the next `acquire()` call(s) by at least
  `ms`, composing with `maxConcurrent`/`maxRequestsPerInterval` rather than
  replacing them; a later, shorter `throttleFor()` call never shortens an
  already-scheduled longer wait. Applies before delegating to a distributed
  `rateLimit.store`, if one is configured. The library doesn't parse any
  particular header scheme itself — see `examples/proactive-rate-limit-throttling.ts`
  for a few common shapes.
- **`PipelineStageConfig.validateInput`/`validateOutput`** — validate (and,
  since the return value replaces the data, optionally coerce) a stage's
  input and output. `validateInput` runs after the `before` hook, right
  before `request`; `validateOutput` runs after the `after` hook, right
  before the step is committed as successful. Both share the `(data, {
  allResults, sharedData, signal })` signature used by the other stage
  hooks, and a thrown error goes through the exact same path as any other
  stage error — `errorHandler` can inspect it and `recoverStep(fallback)` it,
  same as a failed `request`. Both also apply to stages inside a
  `ParallelStageGroup`, since they share the same execution path as
  top-level stages. The library doesn't depend on any schema library — pass
  any `(data) => T` that throws on invalid data. See
  `examples/zod-validation.ts` for a `withZodSchema()` adapter.
- **`paginate()` / `paginateAll()` / `flattenPages()`** — iterate a paginated
  API as an `AsyncGenerator<T[]>`, hiding the difference between cursor-based
  (`fetchPage` returns `{ items, nextCursor }`) and offset/limit-based
  (`{ items, total? }`) APIs. `paginateAll()` collects every page into one
  flat array; `flattenPages()` turns a stream of pages into a stream of
  individual items, useful as a `StreamStageConfig.stream` source when
  `onChunk` should fire per item rather than per page. Both `paginate()` and
  `fetchPage` accept an optional `signal` for `abort()` support. See
  `examples/pagination-stream.ts`; `examples/pagination-fanout.ts` remains
  the better fit when the page count is known upfront and pages should be
  fetched concurrently rather than sequentially.
- **`createMockAdapter()`** — new `rest-pipeline-js/testing` entry point (a
  separate one, like `/vue`/`/react`, so it never ships in a production
  bundle — 603 B brotli on its own). Produces an `HttpAdapter` backed by
  route definitions (`{ method?, url: string | RegExp, respond }`) instead
  of a real network call, for testing code that uses `createRestClient()`/
  `PipelineOrchestrator`. `respond` can be a static spec, a function of the
  request, or an array consumed one response per matching call (repeating
  the last entry once exhausted) — the array form is aimed at exercising
  retry logic (e.g. two 503s then a 200). A response with `status >= 400`
  rejects by default, matching axios/fetch's own behavior, with `.status`/
  `.response.status` set so `retry.retriableStatus`/`circuitBreaker`/error
  interceptors work against it unmodified; override per-response with an
  explicit `error: true`/`false`. `adapter.calls` records every request
  (matched or not) for assertions; a request matching no route throws
  immediately with a clear message instead of hanging a test. See
  `examples/mock-adapter.ts`.
- **`WebSocketStageConfig`** — a pipeline stage running over a persistent
  WebSocket connection (`onOpen`/`onMessage`/`onClose`/`onError`, `closeOn`),
  alongside `StreamStageConfig`. `onMessage` can be `async`; non-`undefined`
  return values are collected into the stage's `data` array and passed to
  `onChunk` in real time, the same pattern `StreamStageConfig` uses for
  chunks. Success/error is decided by the close event's `wasClean`, not the
  error event directly — most WebSocket implementations fire `error`
  immediately before `close`, so `onError` alone doesn't fail the stage.
  `createWebSocket` defaults to `globalThis.WebSocket` (browsers, Deno,
  Node ≥22); pass it explicitly for Node <22 via the `ws` package or any
  other transport — mirrors `HttpAdapter`'s injection pattern rather than
  hardcoding a dependency. New `pipe().websocket()` builder method, on par
  with `.stream()`. See `examples/websocket-stage.ts`.
- **`HttpConfig.offlineQueue`** — queue mutating requests (POST/PUT/PATCH/DELETE
  by default; override via `shouldQueue`) made while offline instead of
  failing them immediately, and replay them — in order, using the same
  `Idempotency-Key` on every replay attempt — once connectivity returns.
  `client.post()`/etc. reject with the new `OfflineQueuedError` (carrying
  `queueId`) instead of a network error when a request gets queued.
  `persistAdapter` reuses `PipelineStateAdapter` (now generic —
  `PipelineStateAdapter<T = PipelineExportedState>`, backward compatible),
  the same interface `PipelineConfig.options.persistAdapter` already uses,
  rather than a bespoke one. `isOnline`/`onOnlineChange` default to
  `navigator.onLine`/the browser's `"online"` event; provide your own for
  Node/React Native. New `client.getQueuedRequests()`/`client.flushQueue()`.
  `flush()` is a single pass per call, not a backoff loop — a queued request
  that fails with a genuine HTTP error (a `status`) is removed and reported
  via `onFlushError`; one that fails with no `status` at all (indistinguishable
  here from "still offline") is left queued for the next flush.
  `RequestExecutor`'s own `retry`/`jitterStrategy` still own per-attempt
  backoff; a queue flush is a coarser cycle triggered by reconnect events.
  See `examples/offline-queue.ts`.
- **UMD/CDN build (`dist/umd/rest-pipeline.umd.min.js`)** — a single
  `<script>` tag now works, no bundler or Node required. Bundles the core
  module (no Vue/React) as a self-contained IIFE under a `window.RestPipeline`
  global, with `axios` bundled in (it's already a regular, non-peer
  dependency) so nothing else needs to be loaded separately. Built via
  `scripts/build-umd.mjs` (esbuild) from the compiled `dist/esm/index.js`,
  as the last step of `npm run build`; also publishes an unminified build
  with a source map for debugging. New `unpkg`/`jsdelivr` `package.json`
  fields point at the minified file, and `.size-limit.json` enforces the
  same 28 KB brotli budget as the core ESM entry (currently ~25.3 KB). See
  the README's "CDN usage" section.

### Fixed

- **`toApiError()` dropped `.status`/`.code` for a plain (non-axios) thrown
  `Error`.** Only `AxiosError`s had their `status`/`code` extracted; a
  custom `HttpAdapter` throwing a plain `Error` with `.status` attached (the
  exact pattern `examples/edge-fetch-adapter.ts` already used) produced an
  `ApiError` with `status: undefined` everywhere one was needed —
  `CircuitBreakerConfig.isFailure(error)` in particular couldn't do its
  documented job of excluding specific status codes (e.g. "don't open the
  circuit on 4xx") for such adapters. Found while adding the offline queue's
  own status-based error handling, which surfaced the same gap. Fixed by
  duck-typing `.status`/`.code`/`.response.status` off any thrown `Error`,
  matching extraction logic `rest-client.ts` already used elsewhere for
  non-axios errors.
- **A `WebSocketStageConfig` race condition that could hang a stage
  forever.** If `abort()` fired in the narrow window between the initial
  `signal.aborted` check (before the WebSocket is created) and the
  `signal.addEventListener('abort', ...)` registration inside the stage's
  connection-handling promise, the abort event was silently missed — the
  stage would then wait indefinitely for an `open`/`message`/`close`/`error`
  event that was never coming, since nothing else would trigger it. Found via
  a deterministic regression test (`abort()` called from inside
  `createWebSocket`, landing exactly in that window) rather than by
  observation — fixed by re-checking `signal.aborted` immediately after the
  listener is registered.

### Changed

- **`.size-limit.json`'s core/`/vue`/`/react` budget raised from 25 KB to
  28 KB.** The WebSocket stage brought actual brotli size to ~24.3 KB,
  leaving almost no margin under the old limit, with a larger feature
  (offline queue / background sync) still planned. See `CONTRIBUTING.md`'s
  bundle-size guidance for the policy on bumping this again.

### Documented

- **File uploads and `onUploadProgress`/`onDownloadProgress`.** These already
  worked with no code changes needed — `RestRequestConfig` extends axios's
  own `AxiosRequestConfig`, so `data: FormData`/`Blob` and the progress
  callbacks were already typed and passed through to the axios transport
  (and, as raw config fields, to custom `HttpAdapter`s too, which are
  responsible for actually invoking them). They just weren't tested or
  documented. Added `examples/file-upload.ts`, a README section ("File
  uploads & progress"), and tests confirming the passthrough for both the
  axios path and custom adapters.

### Changed (continued)

- **Test coverage pass on the retry engine, cache, and Vue/React hooks.** No
  public API changes. `request-executor.ts` (retry/backoff/Retry-After) went
  from ~54% to ~90% statement coverage; `cache.ts` (`TtlCache`, including
  `getStale`/`deleteWhere`/eviction) from ~46% to 100%; `rest-client.ts`'s
  `cache.strategy: "stale-while-revalidate"` path had no test coverage at all
  before and now does. Coverage thresholds in `vitest.config.ts` raised from
  70/72/55/72% (stmts/branches/funcs/lines) to 82/80/78/83%.
- **Fixed a coverage-attribution (and latent staleness) bug in the Vue/React
  hook tests.** `tests/vue-hooks.test.ts` and `tests/react-hooks.test.ts`
  import via the public package specifier (`"rest-pipeline-js/vue"` /
  `"rest-pipeline-js/react"`), which Vite's self-reference resolution points
  at the built `dist/esm/*.js` rather than `src/*.ts`. This meant v8 coverage
  could never instrument the hook source files (they showed 0% despite the
  tests passing), and — more importantly — the tests were silently exercising
  whatever was last built into `dist`, not the current `src`: editing a hook
  and running `npm test` without `npm run build` first would pass against
  stale compiled output. Fixed via a `resolve.alias` in `vitest.config.ts`
  that redirects those two specifiers to the Vue/React entry-point source
  files (test files themselves are unchanged). This also surfaced a real, separate gap —
  `usePipelineStageResultVue`/`usePipelineStageResultReact` were imported but
  never actually invoked by any test — now covered.
- **Removed `@typescript-eslint/no-explicit-any` warnings from
  `rest-client.ts` and `request-executor.ts`** (11 of the 101 total, both now
  at 0). `globalThis as any` duck-typing (for `crypto.randomUUID` /
  `crypto.getRandomValues`) replaced with narrow local types; `catch (err: any)`
  replaced with `catch (err)` plus one explicit cast per block instead of
  scattering `any` across each property access; `RequestExecutor.execute`'s
  default type parameter changed from `T = any` to `T = unknown`, matching
  `RestClient.request<T = unknown>`'s existing convention (no call-site
  changes needed — the only internal caller already assigns into an
  `unknown`-typed variable).
- **Split the two largest files by domain — no public API or behavior
  change.** `pipeline-orchestrator.ts` (1677 lines) had its pause/resume,
  stream-stage, WebSocket-stage, sub-pipeline, and export/import-state logic
  extracted into `src/pipeline/orchestrator/*.ts` as standalone functions taking a
  narrow, purpose-typed `ctx` parameter, leaving `PipelineOrchestrator`
  itself as a thin facade (1677→1225 lines, -27%). `types.ts` (1276 lines)
  was split by domain into `types/http.ts`, `types/pipeline.ts`, and
  `types/plugins.ts`, with `types.ts` reduced to an 8-line re-export barrel
  so every existing `from "./types.js"` import keeps working unchanged.
  Verified behavior-preserving after each extraction step via the full test
  suite (324→332 tests including type-level), coverage (no regression), and
  bundle size (no growth).
- **Moved the Vue/React integration files into `src/plugins/vue/` and
  `src/plugins/react/` — no public API or behavior change.** The 10
  framework-specific hook files (`usePipelineRun-vue.ts`,
  `useRestClient-react.ts`, etc.) sat flat in `src/` alongside core logic;
  each pair is now grouped under its own folder with the now-redundant
  `-vue`/`-react` filename suffix dropped (e.g. `usePipelineRun-vue.ts` →
  `plugins/vue/usePipelineRun.ts` — the exported `usePipelineRunVue` name is
  unchanged). The `vue.ts`/`react.ts` entry-point barrels moved to
  `plugins/vue/index.ts`/`plugins/react/index.ts` alongside them; the public
  import specifiers (`rest-pipeline-js/vue`, `rest-pipeline-js/react`) and
  `package.json` `exports` map are unaffected — only the `dist/esm/**`/
  `dist/cjs/**` paths they point at shifted to match. Coverage, test count,
  lint warnings, and every bundle size are byte-for-byte identical to before
  the move.

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
- **`.github/workflows/ci.yml`** — runs lint, build, the ESM-load regression check, unit tests, type tests, coverage, and bundle-size checks on Node 20/22/24 for every push/PR. (Node 18 was dropped from the matrix: Vite 7/Vitest 4 require Node ^20.19/22.12+ just to load their own config — unrelated to the package's own `engines: ">=18"`, which is unaffected.)
- **`examples/`** — focused, copy-pasteable snippets: paginated fan-out with `concurrency`, a `fetch`-based `HttpAdapter` for edge runtimes, an SSE `StreamStageConfig` step, and a Redis-backed `CacheStore`.

### Changed

- **Vue hook tests** (`tests/vue-hooks.test.ts`) now mount composables inside a real component `setup()` via a `withSetup` helper instead of calling them directly, so `onUnmounted` (used internally to unsubscribe from `stageResults`) has an active component instance to attach to. Previously this logged a Vue lifecycle warning on every run and left the unmount-cleanup path unverified.

---

## [1.4.0] - 2026-06-19

### Fixed

- **Flaky test in `tests/rest-client.test.ts`** ("on a repeated 401 after onUnauthorized — does not enter an infinite loop") — the mock error set `err.isAxiosError = true` *after* `Object.setPrototypeOf(err, axios.AxiosError.prototype)`. `AxiosError.prototype.isAxiosError` is defined as non-writable (`Object.defineProperty(..., { value: true })`), so that assignment threw a `TypeError` in strict mode, which masked the actual 401-retry logic being exercised. Fixed by assigning `isAxiosError` before swapping the prototype, matching the (correct) pattern already used by the other axios-error mocks in the same file. No production code changed.

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
