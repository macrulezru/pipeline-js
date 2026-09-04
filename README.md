# **Rest Pipeline JS**

![Rest Pipeline JS](https://github.com/macrulezru/assets/blob/master/packages-images/rest-pipeline-js.png?raw=true)

Flexible, modular pipeline orchestrator for REST APIs — sequential and parallel stages, retry with backoff, response caching, rate limiting, auth provider, stream stages (SSE / AsyncIterable), plugin system, and Vue / React integrations — all with a single dependency (axios).

---

## Features

- **`createRestClient()`** — full-featured HTTP client built on top of axios: retry with exponential backoff and `Retry-After` support, response caching with a pluggable `CacheStore` backend (incl. targeted `invalidateCache()`), rate limiting (concurrency + req/interval) with a pluggable distributed `RateLimiterStore`, circuit breaker with a pluggable distributed `CircuitBreakerStore`, auth provider with automatic 401 refresh and optional token caching, request cancellation by key, custom HTTP adapters
- **Request tracing** — W3C `traceparent` header generation plus a `TracingProvider` hook (duck-typed against OpenTelemetry's `Span` API) for wiring in a real tracing backend
- **Idempotency keys** — `Idempotency-Key` header on mutating requests, manual or auto-generated per logical request across retry attempts
- **Offline queue** — queue mutating requests made while offline and replay them (same idempotency key on every attempt) once back online; pluggable persistence, `isOnline`/`onOnlineChange` for non-browser environments
- **`PipelineOrchestrator`** — sequential and parallel stage execution; each stage has `condition`, `before`, `request`, `after`, `validateInput`, `validateOutput`, `errorHandler` hooks (all receive the pipeline's `AbortSignal`); `sharedData` pool shared across all stages
- **Error recovery** — `errorHandler` can return `recoverStep(data)` to turn a failed stage back into a successful one and keep the pipeline going, instead of only transforming the error
- **Global middleware** — `beforeEach` / `afterEach` / `onError` hooks that apply to every stage without modifying individual configs
- **Parallel groups** — multiple stages run concurrently via `Promise.all`, or through a bounded pool via `concurrency`; single failure stops the group
- **Pause / Resume / Abort** — `pause()` waits after the current stage; `resume()` continues; `abort()` cancels the current HTTP request and propagates its `AbortSignal` into every stage hook so custom `request`/`before`/`after` functions can cancel their own work too
- **Export / Import state** — serialize `stageResults` + logs to a plain object; restore on the next page load
- **Stream stages** — `stream: async function*` for SSE / any `AsyncIterable`; `onChunk` callback in real time; abort-aware
- **WebSocket stages** — a stage over a persistent connection (`onOpen`/`onMessage`/`onClose`/`onError`, `closeOn`); pluggable `createWebSocket` (defaults to `globalThis.WebSocket`) for Node <22/edge runtimes
- **Pipeline metrics & run correlation** — `onPipelineStart`, `onPipelineEnd`, `onStepDuration` callbacks, plus a `runId` (also on `getRunId()`, log entries, and step events) shared by every callback/event from the same run
- **`createPipeline()` / `pipe()` builder** — short factory and fluent builder API for common patterns; in TypeScript, `pipe().step()` chains infer `prev`'s type from the previous step automatically
- **`validatePipelineConfig()`** — catch duplicate keys, empty keys, type errors before runtime
- **Plugin system** — install reusable behavior (logging, analytics, etc.); cleanup via `destroy()`
- **Persist adapter** — pluggable save/load interface; auto-save after each stage
- **Log sanitization** — mask sensitive headers (`authorization`, `x-api-key`, `cookie`, …) in metrics callbacks, on by default
- **Vue integration** — `usePipelineRunVue`, `usePipelineProgressVue`, and more (import from `rest-pipeline-js/vue`)
- **React integration** — `usePipelineRunReact`, `usePipelineProgressReact`, and more (import from `rest-pipeline-js/react`)
- **`paginate()` / `paginateAll()` / `flattenPages()`** — iterate a paginated API (cursor- or offset/limit-based) as an `AsyncGenerator<T[]>`, standalone or as a `StreamStageConfig` source
- **`createMockAdapter()`** (separate `rest-pipeline-js/testing` entry point) — route-based `HttpAdapter` for testing code that uses this package without a real backend, with call history and sequenced responses for exercising retry
- **Tree-shakeable** — `sideEffects: false`; Vue and React entry points are code-split

---

## Installation

The core package has no required peer dependencies — only `axios` (a regular dependency). Vue and React are optional peers, needed only if you import from the matching entry point (`rest-pipeline-js/vue` / `rest-pipeline-js/react`):

| Environment | Minimum version               |
| ----------- | -------------------------------- |
| Node.js     | `18+`                             |
| Vue         | `3.3+` (optional, for `/vue`)     |
| React       | `18+` (optional, for `/react`)    |
| react-dom   | `18+` (optional, for `/react`)    |

```bash
npm install rest-pipeline-js
```

Peer dependencies for framework integrations:

```bash
# Vue
npm install vue@>=3.3

# React
npm install react@>=18 react-dom@>=18
```

A CDN build is also available — see [installation on the full docs](https://npm.vuecraft.ru/en/packages/rest-pipeline-js/guide/installation.html) for the `<script>` tag setup.

### Quick start

```js
import { createRestClient, PipelineOrchestrator } from 'rest-pipeline-js'

// 1. Create a REST client
const client = createRestClient({
  baseURL: 'https://api.example.com',
  retry: { attempts: 2, delayMs: 500, backoffMultiplier: 2 },
  cache: { enabled: true, ttlMs: 60000 },
  auth: {
    getToken: async () => localStorage.getItem('token') ?? '',
    onUnauthorized: async () => {
      /* refresh token */
    },
  },
})

const res = await client.get('/users/1')

// 2. Run a pipeline
const orchestrator = new PipelineOrchestrator({
  config: {
    stages: [
      {
        key: 'fetchUser',
        request: async ({ sharedData }) => client.get(`/users/${sharedData.userId}`),
      },
      {
        key: 'processData',
        request: async ({ prev }) => ({ ...prev.data, processed: true }),
      },
    ],
  },
  sharedData: { userId: 42 },
})

const result = await orchestrator.run()
console.log(result.success, result.stageResults)
```

---

## Documentation & links

- 📖 **Full documentation:** [npm.vuecraft.ru/en/packages/rest-pipeline-js](https://npm.vuecraft.ru/en/packages/rest-pipeline-js/guide/overview.html)
- 🌐 **VueCraft:** [vuecraft.ru/en](https://vuecraft.ru/en)
- 👤 **Author:** [macrulez.ru/en](https://macrulez.ru/en)
- 💻 **GitHub:** [macrulezru/pipeline-js](https://github.com/macrulezru/pipeline-js)
- 📦 **NPM:** [rest-pipeline-js](https://www.npmjs.com/package/rest-pipeline-js)
- 🐛 **Issues:** [github.com/macrulezru/pipeline-js/issues](https://github.com/macrulezru/pipeline-js/issues)

---

## License

MIT

---

## 💖 Support the project

Open source takes time and effort. If this library saves you time or brings value, consider supporting further development.

<a href="https://donate.cryptocloud.plus/M6O34NIN" target="_blank">
  <img src="https://img.shields.io/badge/Donate-CryptoCloud-8A2BE2?style=for-the-badge&logo=cryptocurrency&logoColor=white" alt="Donate via CryptoCloud">
</a>

Thank you for being part of this journey. ❤️
