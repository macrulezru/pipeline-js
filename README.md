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
});

async function fetchUser(id) {
  const res = await client.request(`/users/${id}`);
  if (res.error) {
    console.error(res.error);
  } else {
    console.log(res.data);
  }
}
```

#### Example: Run a pipeline, handle errors, track progress, use shared data

```js
import { PipelineOrchestrator } from "rest-pipeline-js";

const pipelineConfig = {
  stages: [
    { key: "step1", command: "/api/step1", method: "POST" },
    {
      key: "step2",
      command: "/api/step2",
      method: "POST",
      dependsOn: ["step1"],
    },
  ],
};
const httpConfig = {
  baseURL: "https://api.example.com",
  timeout: 7000,
  headers: { Authorization: "Bearer TOKEN" },
  retry: { attempts: 2, delayMs: 1000 },
  cache: { enabled: true, ttlMs: 60000 },
  rateLimit: { maxConcurrent: 2 },
  metrics: {
    onRequestStart: (info) => console.log("Start:", info),
    onRequestEnd: (info) => console.log("End:", info),
  },
};
const sharedData = { sessionId: "abc123" };
const orchestrator = new PipelineOrchestrator(
  pipelineConfig,
  httpConfig,
  sharedData,
  { autoReset: true }
);

orchestrator.subscribeProgress((progress) => {
  console.log(
    "Current stage:",
    progress.currentStage,
    "Statuses:",
    progress.stageStatuses
  );
});
orchestrator.on("step:step1:success", (payload) => {
  console.log("Step 1 success:", payload.data);
});
orchestrator.on("step:step2:error", (payload) => {
  console.error("Step 2 error:", payload.error);
});
orchestrator.on("log", () => {
  console.log("Logs:", orchestrator.getLogs());
});
orchestrator
  .run({ foo: "bar" })
  .then((result) => {
    console.log("Pipeline finished:", result);
    console.log("Stage results:", result.stageResults);
  })
  .catch((err) => {
    console.error("Pipeline error:", err);
  });
// orchestrator.rerunStep('step2');
```

---

The module provides a universal mechanism for building and managing REST API pipelines with progress tracking, error handling, event subscriptions, and extensibility.

### Main classes and functions

#### createRestClient(config: HttpConfig): RestClient

Creates a REST client with advanced HTTP API features.

#### Example

```js
import { createRestClient } from "rest-pipeline-js";
const client = createRestClient({
  baseURL: "https://api.example.com",
  timeout: 5000,
  headers: { Authorization: "Bearer TOKEN" },
  retry: { attempts: 2 },
  cache: { enabled: true, ttlMs: 60000 },
});
async function getUser(id) {
  const res = await client.request(`/users/${id}`);
  if (res.error) {
    console.error("Error:", res.error);
  } else {
    console.log("User:", res.data);
  }
}
```

---

#### RequestExecutor

Wrapper for REST requests with retry and timeout support.

#### Example

```js
import { RequestExecutor } from "rest-pipeline-js";
const executor = new RequestExecutor({ baseURL: "https://api.example.com" });
async function fetchData() {
  try {
    const res = await executor.execute("/data", { method: "GET" }, 3, 3000);
    if (res.error) {
      console.error("Error:", res.error);
    } else {
      console.log("Data:", res.data);
    }
  } catch (err) {
    console.error("Critical error:", err);
  }
}
```

---

#### PipelineOrchestrator

Main class for building and managing a pipeline of sequential stages.

##### Key methods and parameters

- **constructor(pipelineConfig, httpConfig, sharedData?, options?)**
  - `pipelineConfig` — array of stages, their params, conditions, handlers
  - `httpConfig` — HTTP client config
  - `sharedData` — shared data pool between stages
  - `options.autoReset` — whether to reset state after finish
- **run(onStepPause?, externalSignal?)** — run the pipeline
  - `onStepPause(stepIndex, stepResult, stageResults)` — callback for pause/confirmation/modification between stages
  - `externalSignal` — external AbortSignal
  - Returns: `{ stageResults, success }`
- **rerunStep(stepKey, options?)** — rerun a single stage
- **subscribeProgress(listener)** — subscribe to progress updates
- **subscribeStageResults(listener)** — subscribe to stage results
- **subscribeStepProgress(stepKey, listener)** — subscribe to a specific stage's progress
- **on(eventName, handler)** — universal event subscription
- **onStepStart/Finish/Error(handler)** — subscribe to stage events
- **getProgress()** — get current progress snapshot
- **getProgressRef()** — get progress object (for reactivity)
- **getLogs()** — get pipeline logs
- **abort()** — abort pipeline
- **isAborted()** — check if pipeline was aborted

##### Stage parameters

- `key` — unique stage key
- `command` — endpoint/command for request
- `method` — HTTP method
- `dependsOn` — array of stage keys this depends on
- `condition({ prev, allResults, sharedData })` — condition function
- `before({ prev, allResults, sharedData })` — pre-processing hook (called before request; can modify input)
- `request({ prev, allResults, sharedData })` — custom request function. If before returns a value, it will be passed to request as prev.
- `after({ result, allResults, sharedData })` — post-processing hook (called after request, before next stage; can modify result)
- `pauseBefore` — optional pause (in ms) before request execution
- `pauseAfter` — optional pause (in ms) after request execution
- `retryCount`, `timeoutMs` — per-stage retry/timeout
- `errorHandler({ error, key, sharedData })` — custom error handler

##### Step execution flow diagram

```
┌────────────┐
│  before    │
│ (optional) │
└─────┬──────┘
      │
      ▼
┌────────────┐
│  request   │
└─────┬──────┘
      │
      ▼
┌────────────┐
│  after     │
│ (optional) │
└─────┬──────┘
      │
      ▼
┌────────────┐
│ next step  │
└────────────┘

If an error occurs at any stage:
  └─► errorHandler (if defined) → error result
```

#### Example

```js
import { PipelineOrchestrator } from "rest-pipeline-js";
const pipelineConfig = {
  stages: [
    { key: "first", command: "/api/first", method: "POST" },
    {
      key: "second",
      command: "/api/second",
      method: "POST",
      dependsOn: ["first"],
    },
  ],
};
const httpConfig = { baseURL: "https://api.example.com" };
const sharedData = { sessionId: "abc" };
const orchestrator = new PipelineOrchestrator(
  pipelineConfig,
  httpConfig,
  sharedData
);
orchestrator.subscribeProgress((progress) => {
  console.log("Progress:", progress);
});
orchestrator.on("step:first:success", (payload) => {
  console.log("First stage done:", payload.data);
});
orchestrator
  .run(async (i, result) => {
    await new Promise((r) => setTimeout(r, 1000));
    return result;
  })
  .then((result) => console.log("Pipeline finished:", result))
  .catch((err) => console.error("Pipeline error:", err));
```

---

#### ProgressTracker

Internal class for tracking pipeline progress.

#### Example

```js
import { ProgressTracker } from "rest-pipeline-js";
const tracker = new ProgressTracker(3);
tracker.subscribe((progress) => {
  console.log("Current progress:", progress);
});
tracker.updateStage(1, "success");
console.log(tracker.getProgress());
```

---

#### ErrorHandler

Class for handling pipeline stage errors.

#### Example

```js
import { ErrorHandler } from "rest-pipeline-js";
const handler = new ErrorHandler();
const error = handler.handle(new Error("fail"), "step1");
console.log(error); // { type: 'unknown', error: [Error], stageKey: 'step1' }
```

#### Types and interfaces

- **HttpConfig** — REST client config (baseURL, timeout, headers, retry, cache, rateLimit, metrics)
- **ApiError** — API error description
- **ApiResponse<T>** — API response (data, error, status)
- **PipelineConfig, PipelineResult, PipelineStepEvent, PipelineStepStatus** — pipeline and stage types

---

### Vue integration

#### Example: use in Vue component

```js
<script setup>
import { ref } from 'vue';
import { PipelineOrchestrator } from 'rest-pipeline-js';
import { usePipelineProgressVue, usePipelineRunVue } from 'rest-pipeline-js';
const pipelineConfig = { stages: [/* ... */] };
const httpConfig = { baseURL: 'https://api.example.com' };
const orchestrator = new PipelineOrchestrator(pipelineConfig, httpConfig);
const progress = usePipelineProgressVue(orchestrator);
const { run, running, result, error } = usePipelineRunVue(orchestrator);
</script>
<template>
  <div>
    <div>Current stage: {{ progress.value.currentStage }}</div>
    <button @click="run()" :disabled="running">Start</button>
    <div v-if="result">Done: {{ result }}</div>
    <div v-if="error">Error: {{ error.message }}</div>
  </div>
</template>
```

---

Composition functions for Vue 3 (import from 'rest-pipeline-js'):

- **usePipelineProgressVue(orchestrator)** — reactive pipeline progress (Ref<PipelineProgress>)
- **usePipelineRunVue(orchestrator)** — run pipeline and get reactive status (run, running, result, error)
- **usePipelineStepEventVue(orchestrator, stepKey, eventType)** — subscribe to stage events (success, error, progress)
- **usePipelineLogsVue(orchestrator)** — reactive pipeline logs
- **useRerunPipelineStepVue(orchestrator)** — rerun a stage
- **useRestClientVue(config)** — reactive REST client (computed)

---

### React integration

#### Example: use in React component

```jsx
import React from "react";
import { PipelineOrchestrator } from "rest-pipeline-js";
import {
  usePipelineProgressReact,
  usePipelineRunReact,
} from "rest-pipeline-js";
const pipelineConfig = {
  stages: [
    /* ... */
  ],
};
const httpConfig = { baseURL: "https://api.example.com" };
const orchestrator = new PipelineOrchestrator(pipelineConfig, httpConfig);
export function PipelineComponent() {
  const progress = usePipelineProgressReact(orchestrator);
  const [run, { running, result, error }] = usePipelineRunReact(orchestrator);
  return (
    <div>
      <div>Current stage: {progress.currentStage}</div>
      <button onClick={() => run()} disabled={running}>
        Start
      </button>
      {result && <div>Done: {JSON.stringify(result)}</div>}
      {error && <div>Error: {error.message}</div>}
    </div>
  );
}
```

---

Hooks for React (import from 'rest-pipeline-js'):

- **usePipelineProgressReact(orchestrator)** — subscribe to pipeline progress (PipelineProgress)
- **usePipelineRunReact(orchestrator)** — run pipeline and get status ([run, { running, result, error }])
- **usePipelineStepEventReact(orchestrator, stepKey, eventType)** — subscribe to stage events (success/error/progress)
- **usePipelineLogsReact(orchestrator)** — subscribe to pipeline logs
- **useRerunPipelineStepReact(orchestrator)** — rerun a stage
- **useRestClientReact(config)** — memoized REST client

---

## Requirements

- Node.js >= 14.0.0
- Modern browser with ES2020 support

---

## Development & Contribution

```bash
# Clone repository
git clone https://github.com/macrulezru/pipeline-js.git
cd pipeline-js
npm install
npm test
npm run lint
```

---

## License

MIT

---

## Author

Danil Lisin Vladimirovich aka Macrulez
GitHub: [macrulezru](https://github.com/macrulezru)
Website: [macrulez.ru](https://macrulez.ru/)

---

## Support

Questions and bugs — via [issue](https://github.com/macrulezru/pipeline-js/issues)

## Установка

```sh
npm i rest-pipeline-js
```

## Возможности и API

### Базовый модуль (rest-pipeline-js)

#### Пример: создание REST клиента и выполнение запроса

```js
import { createRestClient } from "rest-pipeline-js";

const client = createRestClient({
  baseURL: "https://api.example.com",
  timeout: 5000,
  headers: { Authorization: "Bearer TOKEN" },
});

async function fetchUser(id) {
  const res = await client.request(`/users/${id}`);
  if (res.error) {
    console.error(res.error);
  } else {
    console.log(res.data);
  }
}
```

#### Пример: запуск pipeline, обработка ошибок, отслеживание выполнения и использование общего пула данных

```js
import { PipelineOrchestrator } from "rest-pipeline-js";

const pipelineConfig = {
  stages: [
    {
      key: "step1",
      command: "/api/step1",
      method: "POST",
      // Можно добавить кастомные параметры шага
    },
    {
      key: "step2",
      command: "/api/step2",
      method: "POST",
      dependsOn: ["step1"], // step2 выполнится только после step1
    },
  ],
};

const httpConfig = {
  baseURL: "https://api.example.com",
  timeout: 7000,
  headers: { Authorization: "Bearer TOKEN" },
  retry: { attempts: 2, delayMs: 1000 },
  cache: { enabled: true, ttlMs: 60000 },
  rateLimit: { maxConcurrent: 2 },
  metrics: {
    onRequestStart: (info) => console.log("Start:", info),
    onRequestEnd: (info) => console.log("End:", info),
  },
};

// Общий пул данных между шагами
const sharedData = { sessionId: "abc123" };

const orchestrator = new PipelineOrchestrator(
  pipelineConfig,
  httpConfig,
  sharedData,
  { autoReset: true }
);

// Отслеживание прогресса
orchestrator.subscribeProgress((progress) => {
  console.log(
    "Текущий шаг:",
    progress.currentStage,
    "Статусы:",
    progress.stageStatuses
  );
});

// Подписка на события успеха/ошибки шага
orchestrator.on("step:step1:success", (payload) => {
  console.log("Step 1 завершён успешно:", payload.data);
});
orchestrator.on("step:step2:error", (payload) => {
  console.error("Ошибка на step2:", payload.error);
});

// Подписка на все логи pipeline
orchestrator.on("log", () => {
  console.log("Логи:", orchestrator.getLogs());
});

// Запуск pipeline с передачей параметров
orchestrator
  .run({ foo: "bar" })
  .then((result) => {
    console.log("Pipeline завершён. Итог:", result);
    // Доступ к результатам всех шагов:
    console.log("Результаты шагов:", result.stageResults);
  })
  .catch((err) => {
    // Глобальная обработка ошибок pipeline
    console.error("Pipeline error:", err);
  });

// Повторный запуск шага (например, после ошибки)
// orchestrator.rerunStep('step2');
```

---

---

Модуль предоставляет универсальный механизм для построения и управления REST API pipeline с поддержкой прогресса, обработки ошибок, подписки на события и расширяемости.

#### Основные классы и функции

---

### createRestClient(config: HttpConfig): RestClient

Создаёт REST-клиент с поддержкой расширенных возможностей для работы с HTTP API.

#### Пример

```js
import { createRestClient } from "rest-pipeline-js";

const client = createRestClient({
  baseURL: "https://api.example.com",
  timeout: 5000,
  headers: { Authorization: "Bearer TOKEN" },
  retry: { attempts: 2 },
  cache: { enabled: true, ttlMs: 60000 },
});

async function getUser(id) {
  const res = await client.request(`/users/${id}`);
  if (res.error) {
    console.error("Ошибка:", res.error);
  } else {
    console.log("Пользователь:", res.data);
  }
}
```

---

### RequestExecutor

Обёртка для выполнения REST-запросов с поддержкой автоматического retry и таймаута.

#### Пример

```js
import { RequestExecutor } from "rest-pipeline-js";

const executor = new RequestExecutor({ baseURL: "https://api.example.com" });

async function fetchData() {
  try {
    const res = await executor.execute("/data", { method: "GET" }, 3, 3000);
    if (res.error) {
      console.error("Ошибка:", res.error);
    } else {
      console.log("Данные:", res.data);
    }
  } catch (err) {
    console.error("Критическая ошибка:", err);
  }
}
```

---

### PipelineOrchestrator

Основной класс для построения и управления конвейером (pipeline) из последовательных шагов.

#### Основные методы и параметры

- **constructor(pipelineConfig, httpConfig, sharedData?, options?)** — создание экземпляра:

  - `pipelineConfig` — массив шагов (stages), их параметры, условия, обработчики
  - `httpConfig` — настройки HTTP клиента
  - `sharedData` — общий пул данных между шагами
  - `options.autoReset` — сбрасывать ли состояние после завершения

- **run(onStepPause?, externalSignal?)** — запуск конвейера

  - `onStepPause(stepIndex, stepResult, stageResults)` — callback для паузы/подтверждения/модификации результата между шагами (можно реализовать задержку, диалог, логику)
  - `externalSignal` — внешний AbortSignal для отмены
  - Возвращает: `{ stageResults, success }`

- **rerunStep(stepKey, options?)** — повторно выполнить один шаг

  - `onStepPause` и `externalSignal` аналогично run
  - Возвращает результат шага

- **subscribeProgress(listener)** — подписка на прогресс выполнения (listener получает PipelineProgress)
- **subscribeStageResults(listener)** — подписка на изменения результатов всех шагов
- **subscribeStepProgress(stepKey, listener)** — подписка на прогресс конкретного шага
- **on(eventName, handler)** — универсальная подписка на события:
  - `step:<stepKey>:start|success|error|progress` — события по шагам
  - `log` — новые логи
  - любые кастомные события
- **onStepStart/Finish/Error(handler)** — подписка на начало/успех/ошибку шага (PipelineStepEvent)
- **getProgress()** — получить текущий прогресс (snapshot)
- **getProgressRef()** — получить ссылку на объект прогресса (для реактивности)
- **getLogs()** — получить массив логов pipeline
- **abort()** — отменить выполнение пайплайна
- **isAborted()** — проверить, был ли пайплайн отменён

#### Важные параметры шага (stage):

- `key` — уникальный ключ шага
- `command` — команда/endpoint для запроса
- `method` — HTTP-метод
- `dependsOn` — массив ключей шагов, от которых зависит этот шаг
- `condition({ prev, allResults, sharedData })` — функция-условие для выполнения шага
- `before({ prev, allResults, sharedData })` — before-хук (вызывается перед запросом; может изменить входные данные)
- `request({ prev, allResults, sharedData })` — кастомная функция запроса (альтернатива command). Если before возвращает значение, оно будет передано в request как prev.
- `after({ result, allResults, sharedData })` — post-processing хук (вызывается после запроса, до перехода к следующему этапу; может модифицировать результат)
- `pauseBefore` — опциональная пауза (в миллисекундах) перед выполнением запроса
- `pauseAfter` — опциональная пауза (в миллисекундах) после выполнения запроса
- `retryCount`, `timeoutMs` — индивидуальные настройки повтора и таймаута
- `errorHandler({ error, key, sharedData })` — обработчик ошибок шага

##### Диаграмма выполнения шага

```
┌───────────────┐
│  before       │
│ (опционально) │
└─────┬─────────┘
      │
      ▼
┌────────────┐
│  request   │
└─────┬──────┘
      │
      ▼
┌───────────────┐
│  after        │
│ (опционально) │
└─────┬─────────┘
      │
      ▼
┌────────────┐
│ следующий  │
│   шаг      │
└────────────┘

Если возникает ошибка на любом этапе:
  └─► errorHandler (если определён) → результат с ошибкой
```

#### Пример

```js
import { PipelineOrchestrator } from "rest-pipeline-js";

const pipelineConfig = {
  stages: [
    { key: "first", command: "/api/first", method: "POST" },
    {
      key: "second",
      command: "/api/second",
      method: "POST",
      dependsOn: ["first"],
    },
  ],
};
const httpConfig = { baseURL: "https://api.example.com" };
const sharedData = { sessionId: "abc" };
const orchestrator = new PipelineOrchestrator(
  pipelineConfig,
  httpConfig,
  sharedData
);

orchestrator.subscribeProgress((progress) => {
  console.log("Прогресс:", progress);
});

orchestrator.on("step:first:success", (payload) => {
  console.log("Первый шаг выполнен:", payload.data);
});

// Пауза 1 секунда между шагами
orchestrator
  .run(async (i, result) => {
    await new Promise((r) => setTimeout(r, 1000));
    return result;
  })
  .then((result) => console.log("Pipeline завершён:", result))
  .catch((err) => console.error("Ошибка pipeline:", err));
```

---

### ProgressTracker

Внутренний класс для отслеживания прогресса pipeline.

#### Пример

```js
import { ProgressTracker } from "rest-pipeline-js";

const tracker = new ProgressTracker(3); // 3 шага
tracker.subscribe((progress) => {
  console.log("Текущий прогресс:", progress);
});
tracker.updateStage(1, "success");
console.log(tracker.getProgress());
```

---

### ErrorHandler

Класс для обработки ошибок шагов pipeline.

#### Пример

```js
import { ErrorHandler } from "rest-pipeline-js";

const handler = new ErrorHandler();
const error = handler.handle(new Error("fail"), "step1");
console.log(error); // { type: 'unknown', error: [Error], stageKey: 'step1' }
```

#### Типы и интерфейсы:

- **HttpConfig** — конфигурация REST клиента (baseURL, timeout, headers, retry, cache, rateLimit, metrics)
- **ApiError** — описание ошибки API
- **ApiResponse<T>** — ответ API (данные, ошибка, статус)
- **PipelineConfig, PipelineResult, PipelineStepEvent, PipelineStepStatus** — описание pipeline и стадий

---

### Расширение для Vue

#### Пример: использование во Vue компоненте

```js
<script setup>
import { ref } from 'vue';
import { PipelineOrchestrator } from 'rest-pipeline-js';
import { usePipelineProgressVue, usePipelineRunVue } from 'rest-pipeline-js';

const pipelineConfig = { stages: [/* ... */] };
const httpConfig = { baseURL: 'https://api.example.com' };
const orchestrator = new PipelineOrchestrator(pipelineConfig, httpConfig);

const progress = usePipelineProgressVue(orchestrator);
const { run, running, result, error } = usePipelineRunVue(orchestrator);
</script>

<template>
	<div>
		<div>Текущий шаг: {{ progress.value.currentStage }}</div>
		<button @click="run()" :disabled="running">Старт</button>
		<div v-if="result">Готово: {{ result }}</div>
		<div v-if="error">Ошибка: {{ error.message }}</div>
	</div>
</template>
```

---

Экспортируются composition-функции для интеграции rest-pipeline-js с Vue 3 (импортировать из 'rest-pipeline-js'):

- **usePipelineProgressVue(orchestrator)** — реактивный прогресс pipeline (Ref<PipelineProgress>)
- **usePipelineRunVue(orchestrator)** — запуск pipeline и реактивные статусы (run, running, result, error)
- **usePipelineStepEventVue(orchestrator, stepKey, eventType)** — подписка на события шага (успех, ошибка, прогресс)
- **usePipelineLogsVue(orchestrator)** — реактивные логи pipeline
- **useRerunPipelineStepVue(orchestrator)** — функция для повторного запуска шага
- **useRestClientVue(config)** — реактивный REST клиент (computed)

---

### Расширение для React

#### Пример: использование в React компоненте

```jsx
import React from "react";
import { PipelineOrchestrator } from "rest-pipeline-js";
import {
  usePipelineProgressReact,
  usePipelineRunReact,
} from "rest-pipeline-js";

const pipelineConfig = {
  stages: [
    /* ... */
  ],
};
const httpConfig = { baseURL: "https://api.example.com" };
const orchestrator = new PipelineOrchestrator(pipelineConfig, httpConfig);

export function PipelineComponent() {
  const progress = usePipelineProgressReact(orchestrator);
  const [run, { running, result, error }] = usePipelineRunReact(orchestrator);

  return (
    <div>
      <div>Текущий шаг: {progress.currentStage}</div>
      <button onClick={() => run()} disabled={running}>
        Старт
      </button>
      {result && <div>Готово: {JSON.stringify(result)}</div>}
      {error && <div>Ошибка: {error.message}</div>}
    </div>
  );
}
```

---

Экспортируются хуки для интеграции rest-pipeline-js с React (импортировать из 'rest-pipeline-js'):

- **usePipelineProgressReact(orchestrator)** — подписка на прогресс pipeline (PipelineProgress)
- **usePipelineRunReact(orchestrator)** — запуск pipeline и статусы ([run, { running, result, error }])
- **usePipelineStepEventReact(orchestrator, stepKey, eventType)** — подписка на события шага (success/error/progress)
- **usePipelineLogsReact(orchestrator)** — подписка на логи pipeline
- **useRerunPipelineStepReact(orchestrator)** — функция для повторного запуска шага
- **useRestClientReact(config)** — мемоизированный REST клиент

---

## Требования

- Node.js >= 14.0.0
- Современный браузер с поддержкой ES2020

---

## Разработка и вклад

```bash
# Клонировать репозиторий
git clone https://github.com/macrulezru/pipeline-js.git
cd pipeline-js
npm install
npm test
npm run lint
```

---

## Лицензия

MIT

---

## Автор

Данил Лисин Владимирович aka Macrulez

GitHub: [macrulezru](https://github.com/macrulezru)
Сайт: [macrulez.ru](https://macrulez.ru/)

---

## Поддержка

Вопросы и баги — через [issue](https://github.com/macrulezru/pipeline-js/issues)
