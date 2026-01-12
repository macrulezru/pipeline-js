# pipeline-js

Библиотека для работы с REST API запросами в Node.js и браузере.

## Описание

`pipeline-js` - это легковесная библиотека для упрощения работы с REST API. Она предоставляет удобный интерфейс для выполнения HTTP запросов с поддержкой цепочек обработки (pipeline pattern).

## Установка

```bash
npm install pipeline-js
```

или с использованием yarn:

```bash
yarn add pipeline-js
```

## Использование

### Базовый пример

```javascript
const Pipeline = require('pipeline-js');

// Создание экземпляра pipeline
const api = new Pipeline({
  baseURL: 'https://api.example.com'
});

// Выполнение GET запроса
api.get('/users')
  .then(response => {
    console.log(response.data);
  })
  .catch(error => {
    console.error(error);
  });
```

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

[macrulezru](https://github.com/macrulezru)

## Поддержка

Если у вас возникли вопросы или проблемы, пожалуйста, создайте [issue](https://github.com/macrulezru/pipeline-js/issues) в репозитории.