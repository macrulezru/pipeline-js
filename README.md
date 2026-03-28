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
  headers: { Authorization: "Bearer TOKEN" },
  retry: { attempts: 2, delayMs: 500, backoffMultiplier: 2, retriableStatus: [429, 500, 503] },
  cache: { enabled: true, ttlMs: 60000 },
  rateLimit: { maxConcurrent: 3, maxRequestsPerInterval: 10, intervalMs: 1000 },
});

const res = await client.get("/users/1");
console.log(res.data);

// PATCH support
await client.patch("/users/1", { name: "Alice" });

// Cancellable request
const req = client.cancellableRequest("my-key", "/search", { params: { q: "foo" } });
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
      afterEach: ({ stage, result }) => console.log("Done:", stage.key, result.data),
      onError: ({ stage, error }) => console.error("Error in", stage.key, error),
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
  console.log("Stage:", progress.currentStage, "Statuses:", progress.stageStatuses);
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

| Method | Description |
|--------|-------------|
| `get(url, config?)` | GET request |
| `post(url, data?, config?)` | POST request |
| `put(url, data?, config?)` | PUT request |
| `patch(url, data?, config?)` | PATCH request |
| `delete(url, config?)` | DELETE request |
| `request(url, config?)` | Generic request |
| `cancellableRequest(key, url, config?)` | Request cancellable by key |
| `cancelRequest(key)` | Cancel request by key |
| `clearCache()` | Clear this client's response cache |

**HttpConfig options:**

| Option | Description |
|--------|-------------|
| `baseURL` | Base URL for all requests |
| `timeout` | Request timeout in ms |
| `headers` | Default headers |
| `withCredentials` | Include cookies |
| `retry.attempts` | Number of retry attempts |
| `retry.delayMs` | Base delay between retries in ms |
| `retry.backoffMultiplier` | Exponential backoff multiplier |
| `retry.retriableStatus` | HTTP status codes eligible for retry (e.g. `[429, 500, 503]`) |
| `cache.enabled` | Enable response caching for GET requests |
| `cache.ttlMs` | Cache TTL in ms |
| `rateLimit.maxConcurrent` | Max simultaneous requests |
| `rateLimit.maxRequestsPerInterval` | Max requests per time window |
| `rateLimit.intervalMs` | Time window size in ms |
| `metrics.onRequestStart` | Callback on request start |
| `metrics.onRequestEnd` | Callback on request end (includes duration and bytes) |

**Per-request cache override:**

```js
const res = await client.get("/data", {
  useCache: true,
  cacheTtlMs: 30000,
  cacheKey: "my-custom-key",
});
```

---

#### RequestExecutor

Wrapper for REST requests with retry, timeout (via AbortController), and backoff support.

```js
import { RequestExecutor } from "rest-pipeline-js";

const executor = new RequestExecutor({
  baseURL: "https://api.example.com",
  retry: {
    attempts: 3,
    delayMs: 500,
    backoffMultiplier: 2,
    retriableStatus: [500, 502, 503],
  },
});

// 5th arg: external AbortSignal (e.g. from orchestrator.abort())
const res = await executor.execute("/data", undefined, 3, 5000, signal);
```

Timeout is enforced via `AbortController` — the actual HTTP request is cancelled, not just the promise.

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

| Method | Description |
|--------|-------------|
| `run(onStepPause?, externalSignal?)` | Execute all stages. Returns `{ stageResults, success }` |
| `rerunStep(stepKey, options?)` | Re-execute a single stage (respects condition, before, after, middleware) |
| `abort()` | Abort pipeline execution (cancels the current HTTP request via AbortSignal) |
| `isAborted()` | Check if pipeline was aborted |
| `pause()` | Pause after the current stage completes |
| `resume()` | Resume a paused pipeline |
| `isPaused()` | Check if pipeline is paused |
| `exportState()` | Serialize stageResults and logs to a plain object |
| `importState(state)` | Restore stageResults and logs from a snapshot |
| `subscribeProgress(listener)` | Subscribe to progress updates |
| `subscribeStageResults(listener)` | Subscribe to stageResults changes |
| `subscribeStepProgress(stepKey, listener)` | Subscribe to a specific stage's progress |
| `on(eventName, handler)` | Subscribe to any event (`step:<key>:start\|success\|error\|skipped\|progress`, `log`) |
| `onStepStart/Finish/Error(handler)` | Subscribe to stage lifecycle events |
| `getProgress()` | Get current progress snapshot |
| `getLogs()` | Get all pipeline logs |
| `clearStageResults()` | Reset results and progress |

##### Stage parameters (PipelineStageConfig)

| Parameter | Description |
|-----------|-------------|
| `key` | Unique stage identifier |
| `request({ prev, allResults, sharedData })` | Main stage function — return value becomes the stage result |
| `condition({ prev, allResults, sharedData })` | If returns `false`, stage is skipped with status `"skipped"` |
| `before({ prev, allResults, sharedData })` | Pre-processing hook — returned value replaces `prev` passed to `request` |
| `after({ result, allResults, sharedData })` | Post-processing hook — returned value replaces the stage result |
| `errorHandler({ error, key, sharedData })` | Per-stage error handler |
| `retryCount` | Override retry count for this stage |
| `timeoutMs` | Override timeout for this stage |
| `pauseBefore` | Delay in ms before executing `request` |
| `pauseAfter` | Delay in ms after executing `request` |

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
    stages: [ /* ... */ ],
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

console.log(orchestrator2.getProgress());           // restored progress
console.log(orchestrator2.getLogs());               // restored logs (timestamps as Date objects)
```

`exportState()` returns `{ stageResults, logs }` — a plain JSON-serializable object. Timestamps in logs are stored as ISO strings and restored as `Date` objects on `importState`.

---

### Vue integration

#### Example: use in Vue component

```vue
<script setup>
import { PipelineOrchestrator, usePipelineProgressVue, usePipelineRunVue } from "rest-pipeline-js/vue";

const orchestrator = new PipelineOrchestrator({ config: { stages: [/* ... */] } });
const progress = usePipelineProgressVue(orchestrator);
const { run, running, result, error, abort, pause, resume, rerunStep } = usePipelineRunVue(orchestrator);
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

| Function | Returns | Description |
|----------|---------|-------------|
| `usePipelineProgressVue(orchestrator)` | `Ref<PipelineProgress>` | Reactive progress |
| `usePipelineRunVue(orchestrator)` | `{ run, running, result, error, stageResults, abort, pause, resume, rerunStep, clearStageResults }` | Run pipeline and get reactive state |
| `usePipelineStepEventVue(orchestrator, stepKey, eventType)` | `Ref<any>` | Last payload for a specific step event |
| `usePipelineLogsVue(orchestrator)` | `Ref<log[]>` | Reactive logs |
| `useRerunPipelineStepVue(orchestrator)` | `function` | Bound `rerunStep` |
| `useRestClientVue(config)` | `ComputedRef<RestClient>` | Reactive REST client |

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

const orchestrator = new PipelineOrchestrator({ config: { stages: [/* ... */] } });

export function PipelineComponent() {
  const progress = usePipelineProgressReact(orchestrator);
  const [run, { running, result, error, abort, pause, resume, rerunStep }] =
    usePipelineRunReact(orchestrator);

  return (
    <div>
      <div>Current stage: {progress.currentStage}</div>
      <button onClick={() => run()} disabled={running}>Start</button>
      <button onClick={() => abort()} disabled={!running}>Abort</button>
      <button onClick={() => pause()}>Pause</button>
      <button onClick={() => resume()}>Resume</button>
      {result && <div>Done: {JSON.stringify(result)}</div>}
      {error && <div>Error: {error.message}</div>}
    </div>
  );
}
```

Hooks (import from `rest-pipeline-js/react`):

| Hook | Returns | Description |
|------|---------|-------------|
| `usePipelineProgressReact(orchestrator)` | `PipelineProgress` | Reactive progress |
| `usePipelineRunReact(orchestrator)` | `[run, { running, result, error, stageResults, abort, pause, resume, rerunStep }]` | Run pipeline and get state |
| `usePipelineStepEventReact(orchestrator, stepKey, eventType)` | `any` | Last payload for a specific step event |
| `usePipelineLogsReact(orchestrator)` | `log[]` | Reactive logs |
| `useRerunPipelineStepReact(orchestrator)` | `function` | Bound `rerunStep` |
| `useRestClientReact(config)` | `RestClient` | Memoized REST client |

---

## Entry points

| Entry point | Use for | Contents |
|-------------|---------|----------|
| `rest-pipeline-js` | Core only | `PipelineOrchestrator`, `createRestClient`, types, utilities. No Vue/React. |
| `rest-pipeline-js/vue` | Vue projects | Core + Vue composition functions |
| `rest-pipeline-js/react` | React projects | Core + React hooks |

```js
// Core only
import { createRestClient, PipelineOrchestrator } from "rest-pipeline-js";

// Vue
import { PipelineOrchestrator, usePipelineRunVue } from "rest-pipeline-js/vue";

// React
import { PipelineOrchestrator, usePipelineRunReact } from "rest-pipeline-js/react";
```

`sideEffects: false` — unused entry points are tree-shaken. `react`/`react-dom` are `peerDependencies`.

---

## Requirements

- Node.js >= 14.0.0
- Modern browser with ES2019+ support

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

---
---

## Установка

```sh
npm i rest-pipeline-js
```

## Возможности и API

### Базовый модуль (rest-pipeline-js)

#### Пример: создание REST клиента и выполнение запросов

```js
import { createRestClient } from "rest-pipeline-js";

const client = createRestClient({
  baseURL: "https://api.example.com",
  timeout: 5000,
  headers: { Authorization: "Bearer TOKEN" },
  retry: { attempts: 2, delayMs: 500, backoffMultiplier: 2, retriableStatus: [429, 500, 503] },
  cache: { enabled: true, ttlMs: 60000 },
  rateLimit: { maxConcurrent: 3, maxRequestsPerInterval: 10, intervalMs: 1000 },
});

const res = await client.get("/users/1");
console.log(res.data);

// PATCH-запрос
await client.patch("/users/1", { name: "Alice" });

// Отменяемый запрос
client.cancellableRequest("my-key", "/search", { params: { q: "foo" } });
client.cancelRequest("my-key"); // отмена
```

---

#### Пример: запуск pipeline, middleware, паузы, общий пул данных

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
      beforeEach: ({ stage }) => console.log("Старт:", stage.key),
      afterEach: ({ stage, result }) => console.log("Готово:", stage.key, result.data),
      onError: ({ stage, error }) => console.error("Ошибка в", stage.key, error),
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
  console.log("Шаг:", progress.currentStage, "Статусы:", progress.stageStatuses);
});

const result = await orchestrator.run();
console.log("Pipeline завершён:", result.success);
```

---

### Основные классы и функции

#### createRestClient(config: HttpConfig): RestClient

Создаёт REST-клиент с поддержкой кэширования, rate limiting, retry и метрик.

**Методы клиента:**

| Метод | Описание |
|-------|----------|
| `get(url, config?)` | GET-запрос |
| `post(url, data?, config?)` | POST-запрос |
| `put(url, data?, config?)` | PUT-запрос |
| `patch(url, data?, config?)` | PATCH-запрос |
| `delete(url, config?)` | DELETE-запрос |
| `request(url, config?)` | Произвольный запрос |
| `cancellableRequest(key, url, config?)` | Запрос, отменяемый по ключу |
| `cancelRequest(key)` | Отменить запрос по ключу |
| `clearCache()` | Очистить кэш ответов этого клиента |

**Параметры HttpConfig:**

| Параметр | Описание |
|----------|----------|
| `baseURL` | Базовый URL для всех запросов |
| `timeout` | Таймаут запроса в мс |
| `headers` | Заголовки по умолчанию |
| `withCredentials` | Включить cookies |
| `retry.attempts` | Количество повторных попыток |
| `retry.delayMs` | Базовая задержка между попытками в мс |
| `retry.backoffMultiplier` | Множитель экспоненциального backoff |
| `retry.retriableStatus` | HTTP-статусы для повтора (например, `[429, 500, 503]`) |
| `cache.enabled` | Кэшировать GET-ответы |
| `cache.ttlMs` | Время жизни кэша в мс |
| `rateLimit.maxConcurrent` | Максимум одновременных запросов |
| `rateLimit.maxRequestsPerInterval` | Максимум запросов за окно времени |
| `rateLimit.intervalMs` | Размер временного окна в мс |
| `metrics.onRequestStart` | Callback при старте запроса |
| `metrics.onRequestEnd` | Callback при завершении (включает duration и bytes) |

**Переопределение кэша на уровне запроса:**

```js
const res = await client.get("/data", {
  useCache: true,
  cacheTtlMs: 30000,
  cacheKey: "my-key",
});
```

---

#### RequestExecutor

Обёртка для выполнения запросов с поддержкой retry, таймаута и AbortSignal.

```js
import { RequestExecutor } from "rest-pipeline-js";

const executor = new RequestExecutor({
  baseURL: "https://api.example.com",
  retry: {
    attempts: 3,
    delayMs: 500,
    backoffMultiplier: 2,
    retriableStatus: [500, 502, 503],
  },
});

// 5-й аргумент — внешний AbortSignal (например от orchestrator.abort())
const res = await executor.execute("/data", undefined, 3, 5000, signal);
```

Таймаут реализован через `AbortController` — HTTP-запрос реально отменяется, а не просто отклоняется промис.

---

#### PipelineOrchestrator

Основной класс для управления конвейером последовательных и параллельных шагов.

##### Конструктор

```js
new PipelineOrchestrator({
  config,       // PipelineConfig — шаги и опциональный middleware
  httpConfig?,  // HttpConfig — настройки HTTP-клиента
  sharedData?,  // Record<string, any> — общий пул данных для всех шагов
  options?,     // { autoReset?: boolean }
})
```

##### Основные методы

| Метод | Описание |
|-------|----------|
| `run(onStepPause?, externalSignal?)` | Запустить все шаги. Возвращает `{ stageResults, success }` |
| `rerunStep(stepKey, options?)` | Повторно выполнить один шаг (учитывает condition, before, after, middleware) |
| `abort()` | Отменить выполнение (реально отменяет текущий HTTP-запрос через AbortSignal) |
| `isAborted()` | Проверить, был ли pipeline отменён |
| `pause()` | Приостановить после завершения текущего шага |
| `resume()` | Продолжить выполнение после паузы |
| `isPaused()` | Проверить, приостановлен ли pipeline |
| `exportState()` | Экспортировать stageResults и логи в простой объект |
| `importState(state)` | Восстановить состояние из снимка |
| `subscribeProgress(listener)` | Подписаться на изменения прогресса |
| `subscribeStageResults(listener)` | Подписаться на изменения результатов шагов |
| `subscribeStepProgress(stepKey, listener)` | Подписаться на прогресс конкретного шага |
| `on(eventName, handler)` | Подписаться на события (`step:<key>:start\|success\|error\|skipped\|progress`, `log`) |
| `onStepStart/Finish/Error(handler)` | Подписка на жизненный цикл шага |
| `getProgress()` | Получить снимок текущего прогресса |
| `getLogs()` | Получить все логи pipeline |
| `clearStageResults()` | Сбросить результаты и прогресс |

##### Параметры шага (PipelineStageConfig)

| Параметр | Описание |
|----------|----------|
| `key` | Уникальный идентификатор шага |
| `request({ prev, allResults, sharedData })` | Основная функция шага — возвращаемое значение становится результатом |
| `condition({ prev, allResults, sharedData })` | Если возвращает `false` — шаг пропускается со статусом `"skipped"` |
| `before({ prev, allResults, sharedData })` | Pre-processing хук — возвращаемое значение заменяет `prev` в `request` |
| `after({ result, allResults, sharedData })` | Post-processing хук — возвращаемое значение заменяет результат шага |
| `errorHandler({ error, key, sharedData })` | Обработчик ошибок шага |
| `retryCount` | Переопределение количества retry для этого шага |
| `timeoutMs` | Переопределение таймаута для этого шага |
| `pauseBefore` | Пауза в мс перед выполнением `request` |
| `pauseAfter` | Пауза в мс после выполнения `request` |

##### Диаграмма выполнения шага

```
condition? → false → [статус: skipped] → следующий шаг
           ↓ true
middleware.beforeEach
           ↓
pauseBefore
           ↓
before() хук
           ↓
request()
           ↓
after() хук
           ↓
pauseAfter
           ↓
middleware.afterEach
           ↓
[статус: success] → следующий шаг

При ошибке на любом этапе:
  └─► stage.errorHandler (если задан) → middleware.onError → [статус: error] → стоп
```

---

### Параллельные шаги

Группируйте шаги для параллельного выполнения с помощью `parallel`:

```js
const orchestrator = new PipelineOrchestrator({
  config: {
    stages: [
      // Обычный последовательный шаг
      { key: "auth", request: async () => getToken() },

      // Параллельная группа — все шаги выполняются одновременно
      {
        key: "load-data",
        parallel: [
          { key: "loadUsers",    request: async () => fetchUsers() },
          { key: "loadProducts", request: async () => fetchProducts() },
          { key: "loadSettings", request: async () => fetchSettings() },
        ],
      },

      // Последовательный шаг после группы
      {
        key: "render",
        request: async ({ allResults }) => render(allResults),
      },
    ],
  },
});

const result = await orchestrator.run();
console.log(result.stageResults.loadUsers.data);    // результат параллельного шага
console.log(result.stageResults.loadProducts.data);
```

- Все шаги группы выполняются одновременно через `Promise.all`.
- Если **хотя бы один** шаг группы завершился с ошибкой — pipeline останавливается, `success: false`.
- Каждый параллельный шаг имеет собственный ключ и запись в `stageResults`.
- `rerunStep(key)` работает в том числе для шагов внутри параллельных групп.

---

### Global middleware

Применяйте хуки ко всем шагам без изменения их конфигураций:

```js
const orchestrator = new PipelineOrchestrator({
  config: {
    stages: [ /* ... */ ],
    middleware: {
      beforeEach: async ({ stage, index, sharedData }) => {
        console.log(`[${index}] Старт: ${stage.key}`);
        sharedData.startedAt = Date.now();
      },
      afterEach: async ({ stage, index, result, sharedData }) => {
        const ms = Date.now() - sharedData.startedAt;
        console.log(`[${index}] Готово: ${stage.key} за ${ms}мс`, result.data);
      },
      onError: async ({ stage, error, sharedData }) => {
        await reportError({ stage: stage.key, error, context: sharedData });
      },
    },
  },
});
```

Middleware вызывается дополнительно к per-stage `errorHandler`, а не вместо него.

---

### Пауза и возобновление

Останавливайте pipeline после шага и продолжайте по команде:

```js
const orchestrator = new PipelineOrchestrator({ config });

// Пауза после завершения step1
orchestrator.on("step:step1:success", () => orchestrator.pause());

const runPromise = orchestrator.run();

// В любой момент позже (например, после подтверждения пользователем):
await showConfirmDialog();
orchestrator.resume();

await runPromise;
```

- `pause()` — pipeline ждёт после завершения текущего шага (включая все события).
- `resume()` — продолжает выполнение со следующего шага.
- `abort()` во время паузы — разблокирует pipeline и завершает его.

---

### Экспорт и восстановление состояния

Сохраняйте и восстанавливайте состояние pipeline между перезагрузками или сессиями:

```js
const orchestrator = new PipelineOrchestrator({ config });
await orchestrator.run();

// Сохраняем снимок состояния
const snapshot = orchestrator.exportState();
localStorage.setItem("pipelineState", JSON.stringify(snapshot));

// Позже — восстанавливаем
const saved = JSON.parse(localStorage.getItem("pipelineState"));
const orchestrator2 = new PipelineOrchestrator({ config });
orchestrator2.importState(saved);

console.log(orchestrator2.getProgress());  // восстановленный прогресс
console.log(orchestrator2.getLogs());      // восстановленные логи (timestamps — объекты Date)
```

`exportState()` возвращает `{ stageResults, logs }` — обычный JSON-сериализуемый объект. Временны́е метки в логах хранятся как ISO-строки и восстанавливаются как объекты `Date` при `importState`.

---

### Интеграция с Vue

```vue
<script setup>
import { PipelineOrchestrator, usePipelineProgressVue, usePipelineRunVue } from "rest-pipeline-js/vue";

const orchestrator = new PipelineOrchestrator({ config: { stages: [/* ... */] } });
const progress = usePipelineProgressVue(orchestrator);
const { run, running, result, error, abort, pause, resume, rerunStep } = usePipelineRunVue(orchestrator);
</script>

<template>
  <div>
    <div>Текущий шаг: {{ progress.currentStage }}</div>
    <button @click="run()" :disabled="running">Старт</button>
    <button @click="abort()" :disabled="!running">Отмена</button>
    <button @click="pause()">Пауза</button>
    <button @click="resume()">Продолжить</button>
    <div v-if="result">Готово: {{ result }}</div>
    <div v-if="error">Ошибка: {{ error.message }}</div>
  </div>
</template>
```

Composition-функции (импорт из `rest-pipeline-js/vue`):

| Функция | Возвращает | Описание |
|---------|-----------|----------|
| `usePipelineProgressVue(orchestrator)` | `Ref<PipelineProgress>` | Реактивный прогресс |
| `usePipelineRunVue(orchestrator)` | `{ run, running, result, error, stageResults, abort, pause, resume, rerunStep, clearStageResults }` | Запуск и реактивное состояние |
| `usePipelineStepEventVue(orchestrator, stepKey, eventType)` | `Ref<any>` | Последний payload события шага |
| `usePipelineLogsVue(orchestrator)` | `Ref<log[]>` | Реактивные логи |
| `useRerunPipelineStepVue(orchestrator)` | `function` | Привязанный `rerunStep` |
| `useRestClientVue(config)` | `ComputedRef<RestClient>` | Реактивный REST-клиент |

---

### Интеграция с React

```jsx
import {
  PipelineOrchestrator,
  usePipelineProgressReact,
  usePipelineRunReact,
} from "rest-pipeline-js/react";

const orchestrator = new PipelineOrchestrator({ config: { stages: [/* ... */] } });

export function PipelineComponent() {
  const progress = usePipelineProgressReact(orchestrator);
  const [run, { running, result, error, abort, pause, resume, rerunStep }] =
    usePipelineRunReact(orchestrator);

  return (
    <div>
      <div>Текущий шаг: {progress.currentStage}</div>
      <button onClick={() => run()} disabled={running}>Старт</button>
      <button onClick={() => abort()} disabled={!running}>Отмена</button>
      <button onClick={() => pause()}>Пауза</button>
      <button onClick={() => resume()}>Продолжить</button>
      {result && <div>Готово: {JSON.stringify(result)}</div>}
      {error && <div>Ошибка: {error.message}</div>}
    </div>
  );
}
```

Хуки (импорт из `rest-pipeline-js/react`):

| Хук | Возвращает | Описание |
|-----|-----------|----------|
| `usePipelineProgressReact(orchestrator)` | `PipelineProgress` | Реактивный прогресс |
| `usePipelineRunReact(orchestrator)` | `[run, { running, result, error, stageResults, abort, pause, resume, rerunStep }]` | Запуск и состояние |
| `usePipelineStepEventReact(orchestrator, stepKey, eventType)` | `any` | Последний payload события шага |
| `usePipelineLogsReact(orchestrator)` | `log[]` | Реактивные логи |
| `useRerunPipelineStepReact(orchestrator)` | `function` | Привязанный `rerunStep` |
| `useRestClientReact(config)` | `RestClient` | Мемоизированный REST-клиент |

---

## Точки входа

| Точка входа | Назначение | Содержимое |
|-------------|------------|------------|
| `rest-pipeline-js` | Только ядро | `PipelineOrchestrator`, `createRestClient`, типы. Без Vue/React. |
| `rest-pipeline-js/vue` | Vue-проекты | Ядро + Vue composition-функции |
| `rest-pipeline-js/react` | React-проекты | Ядро + React хуки |

```js
// Только ядро
import { createRestClient, PipelineOrchestrator } from "rest-pipeline-js";

// Vue
import { PipelineOrchestrator, usePipelineRunVue } from "rest-pipeline-js/vue";

// React
import { PipelineOrchestrator, usePipelineRunReact } from "rest-pipeline-js/react";
```

`sideEffects: false` — неиспользуемые точки входа удаляются tree-shaking'ом. `react`/`react-dom` — `peerDependencies`.

---

## Требования

- Node.js >= 14.0.0
- Современный браузер с поддержкой ES2019+

---

## Разработка

```bash
git clone https://github.com/macrulezru/pipeline-js.git
cd pipeline-js
npm install
npm test
```

---

## Лицензия

MIT

---

## Автор

Данил Лисин Владимирович aka Macrulez

GitHub: [macrulezru](https://github.com/macrulezru) · Сайт: [macrulez.ru](https://macrulez.ru/)

Вопросы и баги — через [issue](https://github.com/macrulezru/pipeline-js/issues)
