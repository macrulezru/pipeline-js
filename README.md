
# pipeline-js

Модуль для работы с REST API, пайплайнами запросов и отслеживанием прогресса. Не зависит от Vue/React, но легко интегрируется в любые проекты.


## Установка

```
npm i rest-pipeline-js
```

## Быстрый старт (чистый JS)

```js
const { createRestClient, PipelineOrchestrator } = require('rest-pipeline-js');

// Создание REST клиента
const client = createRestClient({ baseURL: 'https://api.example.com' });
client.get('/endpoint').then(response => {
  console.log(response.data);
});

// Пример пайплайна
const pipeline = new PipelineOrchestrator({
  stages: [
    {
      key: 'getUser',
      request: async () => client.get('/user'),
    },
    {
      key: 'getPosts',
      request: async (_, results) => client.get(`/posts?userId=${results[0].data.id}`),
    },
  ],
}, { baseURL: 'https://api.example.com' });

// Подписка на прогресс
const unsubscribe = pipeline.subscribeProgress(progress => {
  console.log('Pipeline progress:', progress);
});

// Получить текущий прогресс (snapshot)
console.log(pipeline.getProgress());
```



## React: хуки для интеграции

### usePipelineProgress
```jsx
import { usePipelineProgress } from 'rest-pipeline-js/react';
import { PipelineOrchestrator } from 'rest-pipeline-js';

const pipeline = new PipelineOrchestrator({ stages: [...] }, { baseURL: '...' });
const progress = usePipelineProgress(pipeline);
```

### usePipelineRun
```jsx
import { usePipelineRun } from 'rest-pipeline-js/react';
const [run, { running, result, error }] = usePipelineRun(pipeline);

// В компоненте:
<button onClick={() => run()}>Старт</button>
{running && <span>Выполняется...</span>}
{result && <pre>{JSON.stringify(result)}</pre>}
{error && <span style={{color:'red'}}>{String(error)}</span>}
```

### useRestClient
```jsx
import { useRestClient } from 'rest-pipeline-js/react';
const api = useRestClient({ baseURL: '...' });
```

## Vue: composition-функции для интеграции

### usePipelineProgress
```js
import { usePipelineProgress } from 'rest-pipeline-js/vue';
import { PipelineOrchestrator } from 'rest-pipeline-js';

const pipeline = new PipelineOrchestrator({ stages: [...] }, { baseURL: '...' });
const progress = usePipelineProgress(pipeline);
```

### usePipelineRun
```js
import { usePipelineRun } from 'rest-pipeline-js/vue';
const { run, running, result, error } = usePipelineRun(pipeline);
```

### useRestClient
```js
import { useRestClient } from 'rest-pipeline-js/vue';
const api = useRestClient({ baseURL: '...' });
```

## Использование в Vue 3

```js
import { createRestClient, PipelineOrchestrator } from 'rest-pipeline-js';
import { ref, onUnmounted } from 'vue';

const client = createRestClient({ baseURL: 'https://api.example.com' });
const pipeline = new PipelineOrchestrator({
  stages: [
    // ...
  ],
}, { baseURL: 'https://api.example.com' });

const progress = ref(pipeline.getProgress());
const unsubscribe = pipeline.subscribeProgress(p => {
  progress.value = p;
});
onUnmounted(unsubscribe);
```

## Основные API

### RestClient
- `createRestClient(config)` — создать клиента (axios-like API: get, post, request и др.)

### PipelineOrchestrator
- `new PipelineOrchestrator(pipelineConfig, httpConfig)` — создать пайплайн
- `subscribeProgress(listener)` — подписка на прогресс, возвращает функцию отписки
- `getProgress()` — получить текущий прогресс (snapshot)

### ProgressTracker (внутренний)
- Реактивность реализована через подписки (observer pattern), не зависит от Vue/React

## Структура
- src/rest-client.ts — основной REST клиент
- src/types.ts — типы
- src/request-executor.ts — выполнение запросов
- src/error-handler.ts — обработка ошибок
- src/progress-tracker.ts — отслеживание прогресса
- src/pipeline-orchestrator.ts — оркестрация пайплайна

### POST запрос

```javascript
api.post('/users', {
  name: 'John Doe',
  email: 'john@example.com'
})
  .then(response => {
    console.log('User created:', response.data);
  })
  .catch(error => {
    console.error('Error:', error);
  });
```

### Использование с async/await

```javascript
async function getUsers() {
  try {
    const response = await api.get('/users');
    return response.data;
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
}
```

## API

### Конструктор

```javascript
new Pipeline(config)
```

**Параметры:**
- `config` (Object) - Объект конфигурации
  - `baseURL` (String) - Базовый URL для всех запросов
  - `timeout` (Number) - Таймаут запроса в миллисекундах
  - `headers` (Object) - Заголовки по умолчанию

### Методы

#### `get(url, config)`
Выполняет GET запрос.

#### `post(url, data, config)`
Выполняет POST запрос.

#### `put(url, data, config)`
Выполняет PUT запрос.

#### `delete(url, config)`
Выполняет DELETE запрос.

#### `patch(url, data, config)`
Выполняет PATCH запрос.

## Особенности

- ✅ Поддержка Promise и async/await
- ✅ Автоматическая обработка JSON
- ✅ Настраиваемые заголовки
- ✅ Обработка ошибок
- ✅ Поддержка таймаутов
- ✅ Легковесная библиотека без лишних зависимостей

## Требования

- Node.js >= 12.0.0
- Современный браузер с поддержкой ES6

## Разработка

```bash
# Клонировать репозиторий
git clone https://github.com/macrulezru/pipeline-js.git

# Установить зависимости
npm install

# Запустить тесты
npm test

# Запустить линтер
npm run lint
```

## Вклад в проект

Мы приветствуем вклад в развитие проекта! Пожалуйста:

1. Форкните репозиторий
2. Создайте ветку для вашей функции (`git checkout -b feature/amazing-feature`)
3. Закоммитьте изменения (`git commit -m 'Add some amazing feature'`)
4. Запушьте ветку (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## Лицензия

MIT

## Автор

Git [macrulezru](https://github.com/macrulezru)
Сайт [macrulez.ru](https://macrulez.ru/)

## Поддержка

Если у вас возникли вопросы или проблемы, пожалуйста, создайте [issue](https://github.com/macrulezru/pipeline-js/issues) в репозитории.
