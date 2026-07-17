/**
 * Провайдер аутентификации.
 * Вызывается перед каждым запросом для получения токена.
 * При 401-ответе вызывается onUnauthorized (если задан), после чего запрос повторяется один раз.
 */
export interface AuthProvider {
    /** Возвращает токен для заголовка Authorization: Bearer <token> */
    getToken(): Promise<string>;
    /**
     * Вызывается при получении 401 — здесь нужно обновить токен.
     * После возврата из этого метода запрос будет выполнен повторно с новым токеном.
     * Повтор происходит только один раз во избежание бесконечной петли.
     */
    onUnauthorized?(): Promise<void>;
    /**
     * Если задано — результат getToken() кэшируется на это время (мс) и переиспользуется
     * между запросами вместо вызова getToken() перед каждым запросом.
     * Кэш инвалидируется автоматически при 401 (перед вызовом onUnauthorized и повторной попыткой).
     * По умолчанию: не задано — getToken() вызывается перед каждым запросом, как раньше.
     */
    tokenTtlMs?: number;
}
/**
 * Заголовки, которые маскируются в логах по умолчанию при sanitizeHeaders: true.
 * Можно расширить через HttpConfig.sensitiveHeaders.
 */
export declare const DEFAULT_SENSITIVE_HEADERS: readonly ["authorization", "x-api-key", "x-auth-token", "cookie", "set-cookie", "proxy-authorization"];
export interface RetryConfig {
    attempts: number;
    delayMs: number;
    backoffMultiplier: number;
    retriableStatus?: number[];
    /**
     * Максимальное время ожидания из заголовка Retry-After в мс.
     * Если сервер вернул Retry-After больше этого значения — будет использован этот потолок.
     * По умолчанию: 60 000 (1 минута).
     */
    maxRetryAfterMs?: number;
}
export type RetryOptions = Partial<RetryConfig>;
/**
 * Абстрактный backend для кэша ответов. Позволяет заменить встроенный in-memory
 * `TtlCache` на внешнее хранилище (Redis и т.п.) — полезно для серверных
 * многоинстансных развёртываний, где in-memory кэш не разделяется между процессами.
 * Методы могут быть синхронными или асинхронными (возвращать Promise) — клиент
 * всегда обращается к ним через `await`.
 *
 * `getStale`/`deleteWhere`/`keys` опциональны: без них недоступны соответственно
 * стратегия `stale-while-revalidate` и `invalidateCache()` (в этом случае
 * `invalidateCache()` вернёт 0 и ничего не удалит — см. её JSDoc).
 *
 * @example
 * const redisStore: CacheStore = {
 *   async get(key) { const v = await redis.get(key); return v ? JSON.parse(v) : undefined; },
 *   async set(key, value, ttlMs) { await redis.set(key, JSON.stringify(value), "PX", ttlMs); },
 *   async delete(key) { await redis.del(key); },
 *   async clear() { await redis.flushdb(); },
 * };
 */
export interface CacheStore<V = ApiResponse<any>> {
    get(key: string): V | undefined | Promise<V | undefined>;
    set(key: string, value: V, ttlMs: number): void | Promise<void>;
    delete(key: string): void | Promise<void>;
    clear(): void | Promise<void>;
    /** Требуется только для стратегии 'stale-while-revalidate'. */
    getStale?(key: string, staleMs: number): {
        value: V;
        isStale: boolean;
    } | undefined | Promise<{
        value: V;
        isStale: boolean;
    } | undefined>;
    /** Требуется только для точечной инвалидации через invalidateCache(). */
    deleteWhere?(predicate: (key: string) => boolean): number | Promise<number>;
}
export interface CacheConfig {
    enabled: boolean;
    ttlMs: number;
    /**
     * Стратегия кэширования:
     * - 'strict' (по умолчанию): возвращает кэш только до истечения TTL
     * - 'stale-while-revalidate': возвращает устаревший кэш и одновременно обновляет его в фоне
     */
    strategy?: "strict" | "stale-while-revalidate";
    /**
     * Дополнительное время после ttlMs (в мс), в течение которого устаревший ответ
     * ещё может быть отдан при стратегии 'stale-while-revalidate'.
     * По умолчанию: 0 (устаревший ответ отдаётся бесконечно долго, пока не истёк staleMs).
     */
    staleMs?: number;
    /**
     * Кастомный backend кэша (например, Redis) вместо встроенного in-memory TtlCache.
     * По умолчанию: не задан — используется TtlCache в пределах процесса/клиента.
     */
    store?: CacheStore<ApiResponse<any>>;
}
/**
 * Абстрактный backend для распределённого rate limiting (например, Redis) —
 * несколько серверных инстансов делят один лимит вместо того, чтобы каждый
 * процесс считал запросы независимо (что на N инстансов фактически даёт лимит
 * ×N). Аналог `CacheStore`, но для двух примитивов rate limiter'а.
 *
 * Без `store` (по умолчанию) `RateLimiter` использует точный in-memory алгоритм
 * в пределах одного процесса — поведение не меняется.
 *
 * @example
 * const redisStore: RateLimiterStore = {
 *   async incrementWindow(key, intervalMs) {
 *     const n = await redis.incr(key);
 *     if (n === 1) await redis.pexpire(key, intervalMs);
 *     return n;
 *   },
 *   async acquireConcurrencySlot(key, max, leaseMs) {
 *     // см. examples/redis-rate-limiter-store.ts для полной реализации через Lua-скрипт
 *   },
 * };
 */
export interface RateLimiterStore {
    /**
     * Атомарно увеличивает счётчик запросов для `key` в пределах скользящего
     * (fixed-window) окна `intervalMs` — создавая ключ с этим TTL при первом
     * инкременте — и возвращает значение счётчика *после* инкремента.
     * Соответствует `INCR key; PEXPIRE key intervalMs NX` в Redis.
     *
     * Как и любой fixed-window счётчик, допускает всплеск примерно в 2×lim
     * на границе окна (в отличие от sliding-log реализации) — это принятый
     * компромисс ради простоты интерфейса.
     */
    incrementWindow(key: string, intervalMs: number): Promise<number>;
    /**
     * Занимает один из `maxConcurrent` слотов для `key`, ожидая, пока слот
     * освободится, и возвращает функцию освобождения. `leaseMs` ограничивает,
     * как долго слот удерживается, если процесс, занявший его, аварийно
     * завершится, не вызвав release — реализация должна сама снимать такую
     * "протухшую" аренду по истечении `leaseMs`.
     *
     * В отличие от `incrementWindow`, точный распределённый семафор без
     * центрального сервиса блокировок невозможен — считайте это приближённым
     * ограничением, а не строгой гарантией (как и большинство распределённых
     * семафоров на практике).
     */
    acquireConcurrencySlot(key: string, maxConcurrent: number, leaseMs: number): Promise<() => void | Promise<void>>;
}
export interface RateLimitConfig {
    maxConcurrent?: number;
    maxRequestsPerInterval?: number;
    intervalMs?: number;
    /**
     * Кастомный backend для распределённого rate limiting между несколькими
     * серверными инстансами (например, Redis) вместо встроенного in-memory
     * лимитера, который видит только запросы своего процесса.
     * По умолчанию: не задан — используется точный in-memory лимитер.
     */
    store?: RateLimiterStore;
    /**
     * Ключ "бакета" лимита при использовании общего `store` — позволяет
     * нескольким независимым лимитерам делить одно Redis-подключение без
     * коллизий ключей. По умолчанию: случайный id, сгенерированный на инстанс
     * `RateLimiter` (то есть без явного `key` шеринг между инстансами не работает).
     */
    key?: string;
    /**
     * Длительность аренды (мс) для `store.acquireConcurrencySlot()` — время,
     * через которое занятый слот принудительно освобождается, если не был
     * освобождён явно (например, из-за краша процесса). Учитывается только
     * если заданы одновременно `store` и `maxConcurrent`.
     * По умолчанию: 30000 (30с).
     */
    leaseMs?: number;
}
/** Состояние circuit breaker: closed → open → half-open → closed. */
export type CircuitBreakerState = "closed" | "open" | "half-open";
/** Общее (например, хранимое в Redis) состояние circuit breaker для распределённого сценария. */
export type CircuitBreakerSharedState = {
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    /** Timestamp (Date.now()) момента перехода в open. */
    openedAt: number;
};
/**
 * Абстрактный backend для распределённого circuit breaker — несколько
 * серверных инстансов делят одно состояние (closed/open/half-open) вместо
 * того, чтобы каждый процесс открывал/закрывал circuit независимо, что
 * ослабляет защиту (для открытия нужно набрать `failureThreshold` ошибок
 * *на каждом* инстансе, а не суммарно на backend).
 *
 * Без `store` (по умолчанию) `CircuitBreaker` использует in-memory состояние
 * в пределах одного процесса — поведение не меняется.
 *
 * @example
 * const redisStore: CircuitBreakerStore = {
 *   async get(key) {
 *     const raw = await redis.get(key);
 *     return raw ? JSON.parse(raw) : null;
 *   },
 *   async set(key, state, ttlMs) {
 *     await redis.set(key, JSON.stringify(state), "PX", ttlMs);
 *   },
 * };
 */
export interface CircuitBreakerStore {
    /** Возвращает общее состояние, или null, если оно ещё не было записано. */
    get(key: string): Promise<CircuitBreakerSharedState | null>;
    /** Полностью перезаписывает общее состояние. `ttlMs` — на случай желания backend'ом самому истечь запись (не обязателен к использованию). */
    set(key: string, state: CircuitBreakerSharedState, ttlMs: number): Promise<void>;
    /**
     * Опционально: атомарно увеличивает `field` на 1 и возвращает новое значение —
     * убирает гонки при параллельных запросах с разных инстансов (в отличие от
     * `get` + вычислить + `set`). Без неё `CircuitBreaker` использует
     * get+compute+set, что при высокой параллельности может недосчитать часть
     * инкрементов, но остаётся функционально работоспособным (fail-safe
     * механизм, а не точный счётчик).
     */
    incrementCounter?(key: string, field: "failureCount" | "successCount", ttlMs: number): Promise<number>;
}
export interface CircuitBreakerConfig {
    /** Количество последовательных ошибок (в состоянии closed), после которого circuit открывается. */
    failureThreshold: number;
    /** Сколько мс circuit остаётся открытым (запросы отклоняются без обращения к сети), прежде чем перейти в half-open. */
    openMs: number;
    /**
     * Кастомный backend для распределённого circuit breaker между несколькими
     * серверными инстансами (например, Redis) вместо встроенного in-memory
     * состояния, которое видит только запросы своего процесса.
     * По умолчанию: не задан — используется in-memory состояние.
     */
    store?: CircuitBreakerStore;
    /**
     * Ключ "бакета" состояния при использовании общего `store` — позволяет
     * нескольким независимым breaker'ам делить одно Redis-подключение без
     * коллизий ключей. По умолчанию: случайный id, сгенерированный на инстанс
     * `CircuitBreaker` (то есть без явного `key` шеринг между инстансами не работает).
     */
    key?: string;
    /**
     * Количество успешных запросов в состоянии half-open, необходимое для закрытия circuit.
     * Любая неудача в half-open сразу возвращает circuit в open.
     * По умолчанию: 1.
     */
    successThreshold?: number;
    /**
     * Предикат: какие ошибки считать сбоем для circuit breaker.
     * По умолчанию (не задано) — сбоем считается любая ошибка запроса.
     * Полезно, например, чтобы не открывать circuit на 4xx-ошибках валидации.
     */
    isFailure?: (error: ApiError) => boolean;
}
export interface MetricsHandler {
    onRequestStart?: (info: {
        id: string;
        method?: string;
        url?: string;
        timestamp: number;
        requestBody?: unknown;
        requestParams?: unknown;
        requestHeaders?: Record<string, string>;
    }) => void;
    onRequestEnd?: (info: {
        id: string;
        durationMs: number;
        status?: number;
        error?: ApiError;
        bytes?: number;
        responseBody?: unknown;
        responseHeaders?: Record<string, string>;
    }) => void;
}
/**
 * Минимальный интерфейс "спана", намеренно совместимый по форме с
 * OpenTelemetry `Span` (duck-typing — пакет не тянет `@opentelemetry/api` как
 * зависимость). Реализацию на реальном OTel SDK см. в
 * `examples/opentelemetry-tracing.ts`.
 */
export interface TracingSpan {
    end(): void;
    setStatus?(status: {
        code: "ok" | "error";
        message?: string;
    }): void;
    recordException?(error: unknown): void;
}
/**
 * Хук для интеграции с системой трассировки (OpenTelemetry, Sentry, Datadog
 * APM и т.п.). `startSpan()` вызывается перед каждым HTTP-запросом,
 * `span.end()` — после его завершения (успешного или нет); `setStatus`/
 * `recordException` вызываются при ошибке, если реализованы.
 *
 * Не путать с `HttpConfig.tracing.generateTraceparent` — тот лишь добавляет
 * заголовок `traceparent`, этот хук создаёт реальные спаны в вашей системе
 * трассировки.
 */
export interface TracingProvider {
    startSpan(name: string, attributes?: Record<string, string | number | boolean>): TracingSpan;
}
/** Настройки трассировки запросов (см. HttpConfig.tracing). */
export interface TracingConfig {
    /**
     * Автоматически генерировать и добавлять заголовок `traceparent`
     * (W3C Trace Context, https://www.w3.org/TR/trace-context/) к каждому
     * запросу, если он ещё не задан явно в headers запроса.
     * По умолчанию: false.
     */
    generateTraceparent?: boolean;
    /** Хук для создания спанов в вашей системе трассировки — см. TracingProvider. */
    provider?: TracingProvider;
}
export type RestRequestConfig = import("axios").AxiosRequestConfig & {
    useCache?: boolean;
    cacheTtlMs?: number;
    cacheKey?: string;
    skipRateLimit?: boolean;
    requestId?: string;
    /**
     * Значение заголовка идемпотентности (см. HttpConfig.idempotencyHeaderName,
     * по умолчанию "Idempotency-Key") — сигнализирует backend'у, что повторные
     * запросы с этим же значением следует считать одной логической операцией
     * (полезно для мутирующих запросов при retry или сетевой неоднозначности).
     * Библиотека только проставляет заголовок — фактическую дедупликацию должен
     * реализовать backend.
     */
    idempotencyKey?: string;
    /**
     * Явный traceId (32 hex-символа, как в W3C traceparent) для корреляции
     * нескольких запросов в одну трассу — например, `orchestrator.getRunId()`
     * без дефисов (UUID без дефисов — это ровно 32 hex-символа). Используется
     * вместе с `HttpConfig.tracing.generateTraceparent`; если не задан —
     * генерируется случайный traceId на каждый запрос.
     */
    traceId?: string;
};
/**
 * Перехватчик запроса. Может изменить конфиг запроса перед его отправкой.
 */
export type RequestInterceptor = (config: RestRequestConfig) => RestRequestConfig | Promise<RestRequestConfig>;
/**
 * Перехватчик ответа. Может преобразовать ответ после его получения.
 */
export type ResponseInterceptor<T = unknown> = (response: ApiResponse<T>) => ApiResponse<T> | Promise<ApiResponse<T>>;
/**
 * Перехватчик ошибки. Может преобразовать или обогатить ошибку.
 */
export type ErrorInterceptor = (error: ApiError) => ApiError | Promise<ApiError>;
export interface HttpConfig {
    baseURL?: string;
    timeout?: number;
    headers?: Record<string, string>;
    withCredentials?: boolean;
    retry?: RetryOptions;
    cache?: CacheConfig;
    rateLimit?: RateLimitConfig;
    metrics?: MetricsHandler;
    /** Провайдер аутентификации с автоматическим обновлением токена при 401 */
    auth?: AuthProvider;
    /**
     * Маскировать чувствительные заголовки в метриках (onRequestStart/onRequestEnd).
     * По умолчанию: true (secure by default) — задайте false, чтобы получать
     * заголовки в открытом виде (например, для локальной отладки).
     */
    sanitizeHeaders?: boolean;
    /**
     * Дополнительные заголовки для маскирования (дополняют DEFAULT_SENSITIVE_HEADERS).
     * Сравнение без учёта регистра.
     */
    sensitiveHeaders?: string[];
    /**
     * Глобальный обработчик ошибок HTTP-клиента.
     * Вызывается при каждой ошибке запроса (до throw).
     */
    onError?: (error: ApiError, config: RestRequestConfig) => void | Promise<void>;
    /**
     * Перехватчики запросов и ответов.
     * request-перехватчики выполняются в порядке массива перед отправкой.
     * response-перехватчики выполняются в порядке массива после получения ответа.
     * error-перехватчики выполняются в порядке массива при ошибке.
     */
    interceptors?: {
        request?: RequestInterceptor | RequestInterceptor[];
        response?: ResponseInterceptor | ResponseInterceptor[];
        error?: ErrorInterceptor | ErrorInterceptor[];
    };
    /**
     * Дедупликация одинаковых GET-запросов в полёте (in-flight).
     * Если включена — несколько одновременных запросов с одинаковыми параметрами
     * будут объединены в один промис.
     * По умолчанию: false.
     */
    deduplicateRequests?: boolean;
    /**
     * Абстрактный HTTP-адаптер. Заменяет встроенный axios-клиент.
     * Используйте для edge/serverless окружений (Cloudflare Workers, Deno)
     * или для передачи нативного fetch.
     */
    adapter?: HttpAdapter;
    /**
     * Circuit breaker: после failureThreshold последовательных ошибок запросы отклоняются
     * немедленно (без обращения к сети) на время openMs, защищая упавший backend от лишней нагрузки.
     * Не задан по умолчанию — поведение без circuit breaker не меняется.
     */
    circuitBreaker?: CircuitBreakerConfig;
    /**
     * Трассировка запросов: W3C `traceparent` заголовок и/или хук для интеграции
     * с OpenTelemetry/Sentry/Datadog APM и т.п. Не задано по умолчанию —
     * поведение не меняется.
     */
    tracing?: TracingConfig;
    /**
     * Имя заголовка идемпотентности, проставляемого при
     * `RestRequestConfig.idempotencyKey` (или auto-generated — см.
     * `autoIdempotencyKey`). По умолчанию: "Idempotency-Key".
     */
    idempotencyHeaderName?: string;
    /**
     * Если true — `RequestExecutor` (тот, что реально выполняет retry, см.
     * README → RequestExecutor) сам генерирует `idempotencyKey` для мутирующих
     * методов (POST/PUT/PATCH/DELETE), если он не был явно задан вызывающим
     * кодом, один раз перед началом retry-цикла — так что все попытки одного
     * логического запроса используют один и тот же ключ. Не влияет на прямые
     * вызовы `client.post()`/`client.put()` и т.п. в обход RequestExecutor —
     * там `idempotencyKey` нужно задавать явно.
     * По умолчанию: false.
     */
    autoIdempotencyKey?: boolean;
}
export interface ApiError {
    message: string;
    code?: string | number;
    status?: number;
    timestamp?: Date;
}
export interface ApiResponse<T = unknown> {
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, string>;
}
/**
 * Конфиг одного шага (этапа) pipeline
 * @template Input Тип входных данных шага
 * @template Output Тип результата шага
 */
export type PipelineStageConfig<Input = any, Output = any> = {
    /** Уникальный ключ шага */
    key: string;
    /** Асинхронная функция-запрос шага */
    request?: (params: {
        prev: Input;
        allResults: Record<string, PipelineStepResult>;
        sharedData: Record<string, any>;
        /** Сигнал отмены pipeline. Передайте его в fetch/axios/etc., чтобы abort() реально отменял запрос. */
        signal: AbortSignal;
    }) => Promise<Output> | Output;
    /** Условие выполнения шага (возвращает false → шаг пропускается со статусом 'skipped') */
    condition?: (params: {
        prev: Input;
        allResults: Record<string, PipelineStepResult>;
        sharedData: Record<string, any>;
        signal: AbortSignal;
    }) => boolean;
    /** Количество попыток при ошибке */
    retryCount?: number;
    /** Таймаут шага (мс) */
    timeoutMs?: number;
    /**
     * Обработчик ошибок шага.
     * По умолчанию любое возвращённое значение преобразуется в ApiError и шаг помечается 'error'.
     * Чтобы восстановить шаг как успешный (не прерывая pipeline), верните `{ recover: true, data }` —
     * см. PipelineStepRecovery.
     */
    errorHandler?: (params: {
        error: any;
        key: string;
        sharedData: Record<string, any>;
        signal: AbortSignal;
    }) => any | PipelineStepRecovery<Output>;
    /**
     * Хук before: вызывается перед выполнением запроса этапа (request).
     * Может синхронно или асинхронно модифицировать входные данные prev/allResults/sharedData.
     * Возвращаемое значение будет передано в request вместо prev (если возвращено !== undefined).
     */
    before?: (params: {
        prev: Input;
        allResults: Record<string, PipelineStepResult>;
        sharedData: Record<string, any>;
        signal: AbortSignal;
    }) => Promise<Input | void> | Input | void;
    /**
     * Хук post-processing: вызывается после получения результата (до перехода к следующему этапу).
     * Может синхронно или асинхронно модифицировать результат шага.
     * Возвращаемое значение будет записано как результат шага (data).
     */
    after?: (params: {
        result: Output;
        allResults: Record<string, PipelineStepResult>;
        sharedData: Record<string, any>;
        signal: AbortSignal;
    }) => Promise<Output> | Output;
    /** Пауза (мс) перед выполнением команды */
    pauseBefore?: number;
    /** Пауза (мс) после выполнения команды */
    pauseAfter?: number;
    /**
     * Продолжить выполнение pipeline при ошибке этого шага.
     * Переопределяет глобальный флаг continueOnError из PipelineConfig.options.
     * По умолчанию: false.
     */
    continueOnError?: boolean;
    /**
     * Функция определения следующего шага после успешного выполнения (DAG-переходы).
     * Возвращает ключ следующего шага или null для продолжения по порядку.
     * Если ключ не найден в stages — pipeline завершается успешно.
     */
    next?: (params: {
        result: Output;
        allResults: Record<string, PipelineStepResult>;
        sharedData: Record<string, any>;
    }) => string | null;
};
/**
 * Группа параллельно выполняемых шагов
 */
export type ParallelStageGroup = {
    /** Уникальный ключ группы (используется для отслеживания прогресса) */
    key: string;
    /** Шаги, выполняемые параллельно */
    parallel: PipelineStageConfig[];
    /**
     * Продолжить выполнение pipeline при ошибке любого из параллельных шагов.
     * Переопределяет глобальный флаг continueOnError из PipelineConfig.options.
     */
    continueOnError?: boolean;
    /**
     * Максимальное количество шагов группы, выполняемых одновременно.
     * По умолчанию: без ограничения (все шаги запускаются сразу, как Promise.all).
     * Полезно для fan-out по большому числу элементов (например, постраничная загрузка),
     * чтобы не открывать сотни запросов параллельно.
     */
    concurrency?: number;
};
/**
 * Вложенный pipeline как отдельный шаг.
 * Позволяет переиспользовать группы шагов внутри других pipeline.
 */
export type SubPipelineStage = {
    /** Уникальный ключ шага */
    key: string;
    /** Конфиг вложенного pipeline */
    subPipeline: PipelineConfig;
    /** HTTP-конфиг для вложенного pipeline (если отличается от родительского) */
    httpConfig?: HttpConfig;
    /** Дополнительные sharedData для вложенного pipeline */
    sharedData?: Record<string, any>;
    /**
     * Продолжить выполнение родительского pipeline при ошибке вложенного.
     * По умолчанию: false.
     */
    continueOnError?: boolean;
};
/** Один элемент pipeline — обычный шаг, параллельная группа, вложенный pipeline или stream-шаг */
export type PipelineItem = PipelineStageConfig | ParallelStageGroup | SubPipelineStage | StreamStageConfig;
/**
 * Middleware для всего pipeline (глобальные хуки)
 */
export type PipelineMiddleware = {
    /** Вызывается перед каждым шагом (до stage.before) */
    beforeEach?: (params: {
        stage: PipelineStageConfig;
        index: number;
        sharedData: Record<string, any>;
    }) => Promise<void> | void;
    /** Вызывается после каждого успешного шага (после stage.after) */
    afterEach?: (params: {
        stage: PipelineStageConfig;
        index: number;
        result: PipelineStepResult;
        sharedData: Record<string, any>;
    }) => Promise<void> | void;
    /** Вызывается при ошибке шага */
    onError?: (params: {
        stage: PipelineStageConfig;
        index: number;
        error: ApiError;
        sharedData: Record<string, any>;
    }) => Promise<void> | void;
};
/**
 * Статус выполнения шага pipeline
 */
export type PipelineStepStatus = "pending" | "loading" | "success" | "error" | "skipped";
/**
 * Значение, которое errorHandler шага может вернуть, чтобы "восстановить" шаг —
 * pipeline продолжит выполнение как после успеха, со статусом 'success' и указанными data,
 * вместо остановки/continueOnError-ветки с error.
 *
 * @example
 * errorHandler: ({ error }) => recoverStep(fallbackValue)
 */
export type PipelineStepRecovery<T = any> = {
    recover: true;
    data: T;
};
/** Хелпер для errorHandler: помечает шаг как восстановленный (status: 'success') с указанными data. */
export declare function recoverStep<T = any>(data: T): PipelineStepRecovery<T>;
/** Проверка: является ли значение, возвращённое errorHandler, признаком восстановления шага. */
export declare function isStepRecovery(value: unknown): value is PipelineStepRecovery;
/**
 * Результат выполнения шага pipeline
 */
export type PipelineStepResult<T = any> = {
    /** Статус шага */
    status: PipelineStepStatus;
    /** Данные результата (если успех) */
    data?: T;
    /** Ошибка (если error) */
    error?: ApiError;
    /** URL команды шага (если применимо) */
    url?: string;
};
/**
 * Опции конфигурации pipeline (глобальные настройки поведения)
 */
export type PipelineOptions = {
    /**
     * Автоматически сбрасывать результаты при каждом запуске run().
     * По умолчанию: false.
     */
    autoReset?: boolean;
    /**
     * Продолжать выполнение pipeline при ошибке любого шага.
     * Можно переопределить на уровне отдельного шага через stage.continueOnError.
     * По умолчанию: false.
     */
    continueOnError?: boolean;
    /**
     * Глобальный таймаут выполнения всего pipeline (мс).
     * При превышении вызывается abort() и pipeline завершается с ошибкой.
     */
    pipelineTimeoutMs?: number;
    /**
     * Конфиг автоматического перезапуска pipeline при неуспехе.
     */
    pipelineRetry?: {
        /** Количество попыток перезапуска (не считая первого запуска) */
        attempts: number;
        /** Задержка между попытками (мс) */
        delayMs?: number;
        /**
         * С какого шага перезапускать:
         * - 'start' (по умолчанию): с самого начала, сбрасывая все результаты
         * - 'failed-step': только с упавшего шага, сохраняя результаты успешных шагов
         */
        retryFrom?: "start" | "failed-step";
    };
    /**
     * Максимальное количество шагов при DAG-переходах (защита от бесконечных циклов).
     * По умолчанию: stages.length * 10.
     */
    maxSteps?: number;
    /**
     * Адаптер для персистентного хранения состояния pipeline.
     * При запуске run() автоматически загружает сохранённое состояние,
     * после каждого шага сохраняет текущее.
     */
    persistAdapter?: PipelineStateAdapter;
    /**
     * Список плагинов для расширения поведения pipeline.
     * Каждый плагин вызывается при создании orchestrator.
     */
    plugins?: PipelinePlugin[];
    /**
     * Максимальное количество записей во внутреннем логе (getLogs()/exportState().logs).
     * При превышении самые старые записи отбрасываются (FIFO).
     * По умолчанию: не задано — лог не ограничен и хранит все записи за всё время
     * жизни orchestrator (может расти неограниченно для долгоживущего instance,
     * переиспользуемого через много run()/rerunStep() без autoReset).
     */
    maxLogs?: number;
};
/**
 * Конфиг всего pipeline (массив этапов)
 */
export type PipelineConfig = {
    stages: PipelineItem[];
    /** Глобальные middleware — вызываются для каждого шага */
    middleware?: PipelineMiddleware;
    /** Глобальные опции поведения pipeline */
    options?: PipelineOptions;
    /** Коллбэки для наблюдения за выполнением pipeline */
    metrics?: PipelineMetrics;
};
/**
 * Прогресс выполнения pipeline
 */
export type PipelineProgress = {
    currentStage: number;
    totalStages: number;
    stageStatuses: Array<PipelineStepStatus>;
};
/**
 * Результаты всех шагов pipeline (ключ — имя шага)
 */
export type PipelineStageResults = Record<string, PipelineStepResult>;
/**
 * Итоговый результат выполнения pipeline
 */
export type PipelineResult = {
    /** Результаты по шагам */
    stageResults: PipelineStageResults;
    /** true, если pipeline завершился успешно */
    success: boolean;
};
/**
 * Событие шага pipeline
 */
export type PipelineStepEvent = {
    /** Индекс шага */
    stepIndex: number;
    /** Ключ шага */
    stepKey: string;
    /** Статус шага */
    status: PipelineStepStatus;
    /** Данные результата (если успех) */
    data?: any;
    /** Ошибка (если error) */
    error?: ApiError;
    /** Снимок всех результатов на момент события */
    stageResults: Record<string, PipelineStepResult>;
    /**
     * Идентификатор текущего запуска pipeline (генерируется заново на каждый run()/rerunStep()).
     * Используйте для корреляции событий/логов/метрик одного запуска во внешних системах наблюдаемости.
     */
    runId?: string;
};
/**
 * Callback для подписки на события этапов pipeline
 */
export type PipelineStepEventHandler = (event: PipelineStepEvent) => void | Promise<void>;
/**
 * Снимок состояния pipeline для экспорта/импорта
 */
export type PipelineExportedState = {
    stageResults: Record<string, PipelineStepResult>;
    logs: Array<{
        type: string;
        message: string;
        data?: any;
        timestamp: string;
        runId?: string;
    }>;
};
/**
 * Все возможные типы событий в логах pipeline.
 * Используется для типобезопасной фильтрации и обработки логов.
 */
export type PipelineLogEventType = "step:start" | "step:success" | "step:error" | "step:skipped" | "rerunStep:start" | "rerunStep:success" | "rerunStep:error" | "pipeline:retry" | "pipeline:error" | "subPipeline:start" | "subPipeline:success" | "subPipeline:error" | "subPipeline:exception" | "stream:start" | "stream:success" | "stream:error";
/**
 * Коллбэки для наблюдения за выполнением pipeline.
 * Задаются в PipelineConfig.metrics.
 */
export interface PipelineMetrics {
    /** Вызывается при старте pipeline.run() */
    onPipelineStart?: (info: {
        timestamp: number;
        runId: string;
    }) => void;
    /** Вызывается при завершении pipeline.run() */
    onPipelineEnd?: (info: {
        durationMs: number;
        success: boolean;
        stageResults: PipelineStageResults;
        runId: string;
    }) => void;
    /** Вызывается после каждого выполненного шага с его длительностью */
    onStepDuration?: (info: {
        stepKey: string;
        durationMs: number;
        status: PipelineStepStatus;
        runId: string;
    }) => void;
}
/**
 * Адаптер для сохранения и восстановления состояния pipeline.
 * Передаётся в PipelineConfig.options.persistAdapter.
 *
 * @example
 * const localStorageAdapter: PipelineStateAdapter = {
 *   save: (state) => localStorage.setItem("pipeline", JSON.stringify(state)),
 *   load: () => JSON.parse(localStorage.getItem("pipeline") ?? "null"),
 * };
 */
export type PipelineStateAdapter = {
    /** Сохранить снимок состояния */
    save(state: PipelineExportedState): void | Promise<void>;
    /** Загрузить ранее сохранённый снимок (null если ничего нет) */
    load(): PipelineExportedState | null | Promise<PipelineExportedState | null>;
};
/**
 * Плагин для PipelineOrchestrator.
 * `install()` получает экземпляр orchestrator и может подписываться на события,
 * добавлять middleware-логику и т.д. Если возвращает функцию — она вызывается при cleanup.
 */
export type PipelinePlugin = {
    /** Уникальное имя плагина */
    name: string;
    /** Устанавливает плагин. Получает orchestrator, возвращает опциональную cleanup-функцию. */
    install(orchestrator: any): void | (() => void);
};
/**
 * Абстрактный HTTP-адаптер. Позволяет использовать fetch или любой другой
 * HTTP-клиент вместо встроенного axios. Если не указан — используется axios.
 *
 * @example
 * const fetchAdapter: HttpAdapter = {
 *   async request(config) {
 *     const res = await fetch(`${config.baseURL ?? ""}${config.url ?? ""}`, {
 *       method: config.method ?? "GET",
 *       body: config.data ? JSON.stringify(config.data) : undefined,
 *       headers: { "Content-Type": "application/json", ...config.headers },
 *       signal: config.signal,
 *     });
 *     const data = await res.json();
 *     return { data, status: res.status, statusText: res.statusText, headers: {} };
 *   },
 * };
 */
export type HttpAdapter = {
    request<T = unknown>(config: RestRequestConfig & {
        baseURL?: string;
    }): Promise<ApiResponse<T>>;
};
/**
 * Шаг pipeline, получающий данные в виде потока (AsyncIterable).
 * Используется для SSE, WebSocket-стримов или любого асинхронного итератора.
 * Результатом шага является массив всех накопленных чанков.
 */
export type StreamStageConfig<T = unknown> = {
    /** Уникальный ключ шага */
    key: string;
    /**
     * Функция, возвращающая AsyncIterable<T>.
     * Вызывается с теми же параметрами, что и обычный request.
     */
    stream: (params: {
        prev: any;
        allResults: Record<string, PipelineStepResult>;
        sharedData: Record<string, any>;
        signal: AbortSignal;
    }) => AsyncIterable<T>;
    /**
     * Вызывается для каждого полученного чанка в реальном времени.
     * Полезно для потоковой передачи в UI.
     */
    onChunk?: (chunk: T, sharedData: Record<string, any>) => void;
    /**
     * Продолжить выполнение pipeline при ошибке стрима.
     * Переопределяет глобальный флаг continueOnError.
     */
    continueOnError?: boolean;
};
