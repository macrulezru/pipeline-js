


## Возможности и API


### Базовый модуль (rest-pipeline-js)

#### Пример: создание REST клиента и выполнение запроса

```js
import { createRestClient } from 'rest-pipeline-js';

const client = createRestClient({
	baseURL: 'https://api.example.com',
	timeout: 5000,
	headers: { Authorization: 'Bearer TOKEN' },
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
import { PipelineOrchestrator } from 'rest-pipeline-js';

const pipelineConfig = {
	steps: [
		{
			key: 'step1',
			command: '/api/step1',
			method: 'POST',
			// Можно добавить кастомные параметры шага
		},
		{
			key: 'step2',
			command: '/api/step2',
			method: 'POST',
			dependsOn: ['step1'], // step2 выполнится только после step1
		},
	],
};

const httpConfig = {
	baseURL: 'https://api.example.com',
	timeout: 7000,
	headers: { Authorization: 'Bearer TOKEN' },
	retry: { attempts: 2, delayMs: 1000 },
	cache: { enabled: true, ttlMs: 60000 },
	rateLimit: { maxConcurrent: 2 },
	metrics: {
		onRequestStart: info => console.log('Start:', info),
		onRequestEnd: info => console.log('End:', info),
	},
};

// Общий пул данных между шагами
const sharedData = { sessionId: 'abc123' };

const orchestrator = new PipelineOrchestrator(pipelineConfig, httpConfig, sharedData, { autoReset: true });

// Отслеживание прогресса
orchestrator.subscribeProgress(progress => {
	console.log('Текущий шаг:', progress.currentStage, 'Статусы:', progress.stageStatuses);
});

// Подписка на события успеха/ошибки шага
orchestrator.on('step:step1:success', payload => {
	console.log('Step 1 завершён успешно:', payload.data);
});
orchestrator.on('step:step2:error', payload => {
	console.error('Ошибка на step2:', payload.error);
});

// Подписка на все логи pipeline
orchestrator.on('log', () => {
	console.log('Логи:', orchestrator.getLogs());
});

// Запуск pipeline с передачей параметров
orchestrator.run({ foo: 'bar' })
	.then(result => {
		console.log('Pipeline завершён. Итог:', result);
		// Доступ к результатам всех шагов:
		console.log('Результаты шагов:', result.stageResults);
	})
	.catch(err => {
		// Глобальная обработка ошибок pipeline
		console.error('Pipeline error:', err);
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
import { createRestClient } from 'rest-pipeline-js';

const client = createRestClient({
	baseURL: 'https://api.example.com',
	timeout: 5000,
	headers: { Authorization: 'Bearer TOKEN' },
	retry: { attempts: 2 },
	cache: { enabled: true, ttlMs: 60000 },
});

async function getUser(id) {
	const res = await client.request(`/users/${id}`);
	if (res.error) {
		console.error('Ошибка:', res.error);
	} else {
		console.log('Пользователь:', res.data);
	}
}
```


---


### RequestExecutor
Обёртка для выполнения REST-запросов с поддержкой автоматического retry и таймаута.

#### Пример
```js
import { RequestExecutor } from 'rest-pipeline-js';

const executor = new RequestExecutor({ baseURL: 'https://api.example.com' });

async function fetchData() {
	try {
		const res = await executor.execute('/data', { method: 'GET' }, 3, 3000);
		if (res.error) {
			console.error('Ошибка:', res.error);
		} else {
			console.log('Данные:', res.data);
		}
	} catch (err) {
		console.error('Критическая ошибка:', err);
	}
}
```


---



### PipelineOrchestrator
Основной класс для построения и управления конвейером (pipeline) из последовательных шагов.

#### Основные методы и параметры

- **constructor(pipelineConfig, httpConfig, sharedData?, options?)** — создание экземпляра:
	- `pipelineConfig` — массив шагов (steps), их параметры, условия, обработчики
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
- `condition(prev, allResults, sharedData)` — функция-условие для выполнения шага
- `request(prev, allResults)` — кастомная функция запроса (альтернатива command)
- `retryCount`, `timeoutMs` — индивидуальные настройки повтора и таймаута
- `errorHandler(error, key, sharedData)` — обработчик ошибок шага

#### Пример
```js
import { PipelineOrchestrator } from 'rest-pipeline-js';

const pipelineConfig = {
	steps: [
		{ key: 'first', command: '/api/first', method: 'POST' },
		{ key: 'second', command: '/api/second', method: 'POST', dependsOn: ['first'] },
	],
};
const httpConfig = { baseURL: 'https://api.example.com' };
const sharedData = { sessionId: 'abc' };
const orchestrator = new PipelineOrchestrator(pipelineConfig, httpConfig, sharedData);

orchestrator.subscribeProgress(progress => {
	console.log('Прогресс:', progress);
});

orchestrator.on('step:first:success', payload => {
	console.log('Первый шаг выполнен:', payload.data);
});

// Пауза 1 секунда между шагами
orchestrator.run(async (i, result) => { await new Promise(r => setTimeout(r, 1000)); return result; })
	.then(result => console.log('Pipeline завершён:', result))
	.catch(err => console.error('Ошибка pipeline:', err));
```


---


### ProgressTracker
Внутренний класс для отслеживания прогресса pipeline.

#### Пример
```js
import { ProgressTracker } from 'rest-pipeline-js';

const tracker = new ProgressTracker(3); // 3 шага
tracker.subscribe(progress => {
	console.log('Текущий прогресс:', progress);
});
tracker.updateStage(1, 'success');
console.log(tracker.getProgress());
```


---


### ErrorHandler
Класс для обработки ошибок шагов pipeline.

#### Пример
```js
import { ErrorHandler } from 'rest-pipeline-js';

const handler = new ErrorHandler();
const error = handler.handle(new Error('fail'), 'step1');
console.log(error); // { type: 'unknown', error: [Error], stageKey: 'step1' }
```

#### Типы и интерфейсы:

- **HttpConfig** — конфигурация REST клиента (baseURL, timeout, headers, retry, cache, rateLimit, metrics)
- **ApiError** — описание ошибки API
- **ApiResponse<T>** — ответ API (данные, ошибка, статус)
- **PipelineConfig, PipelineResult, PipelineStepEvent, PipelineStepStatus** — описание pipeline и шагов

---


### Расширение для Vue

#### Пример: использование во Vue компоненте

```js
<script setup>
import { ref } from 'vue';
import { PipelineOrchestrator } from 'rest-pipeline-js';
import { usePipelineProgress, usePipelineRun } from 'rest-pipeline-js/vue';

const pipelineConfig = { steps: [/* ... */] };
const httpConfig = { baseURL: 'https://api.example.com' };
const orchestrator = new PipelineOrchestrator(pipelineConfig, httpConfig);

const progress = usePipelineProgress(orchestrator);
const { run, running, result, error } = usePipelineRun(orchestrator);
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

Экспортируются composition-функции для интеграции rest-pipeline-js с Vue 3:

- **usePipelineProgress(orchestrator)** — реактивный прогресс pipeline (Ref<PipelineProgress>)
- **usePipelineRun(orchestrator)** — запуск pipeline и реактивные статусы (run, running, result, error)
- **usePipelineStepEvent(orchestrator, stepKey, eventType)** — подписка на события шага (успех, ошибка, прогресс)
- **usePipelineLogs(orchestrator)** — реактивные логи pipeline
- **useRerunPipelineStep(orchestrator)** — функция для повторного запуска шага
- **useRestClient(config)** — реактивный REST клиент (computed)

---


### Расширение для React

#### Пример: использование в React компоненте

```jsx
import React from 'react';
import { PipelineOrchestrator } from 'rest-pipeline-js';
import { usePipelineProgress, usePipelineRun } from 'rest-pipeline-js/react';

const pipelineConfig = { steps: [/* ... */] };
const httpConfig = { baseURL: 'https://api.example.com' };
const orchestrator = new PipelineOrchestrator(pipelineConfig, httpConfig);

export function PipelineComponent() {
	const progress = usePipelineProgress(orchestrator);
	const [run, { running, result, error }] = usePipelineRun(orchestrator);

	return (
		<div>
			<div>Текущий шаг: {progress.currentStage}</div>
			<button onClick={() => run()} disabled={running}>Старт</button>
			{result && <div>Готово: {JSON.stringify(result)}</div>}
			{error && <div>Ошибка: {error.message}</div>}
		</div>
	);
}
```

---

Экспортируются хуки для интеграции rest-pipeline-js с React:

- **usePipelineProgress(orchestrator)** — подписка на прогресс pipeline (PipelineProgress)
- **usePipelineRun(orchestrator)** — запуск pipeline и статусы ([run, { running, result, error }])
- **usePipelineStepEvent(orchestrator, stepKey, eventType)** — подписка на события шага (success/error/progress)
- **usePipelineLogs(orchestrator)** — подписка на логи pipeline
- **useRerunPipelineStep(orchestrator)** — функция для повторного запуска шага
- **useRestClient(config)** — мемоизированный REST клиент

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

GitHub: [macrulezru](https://github.com/macrulezru)
Сайт: [macrulez.ru](https://macrulez.ru/)

---

## Поддержка

Вопросы и баги — через [issue](https://github.com/macrulezru/pipeline-js/issues)
