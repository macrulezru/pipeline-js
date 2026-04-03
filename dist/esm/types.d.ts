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
}
export interface RateLimitConfig {
    maxConcurrent?: number;
    maxRequestsPerInterval?: number;
    intervalMs?: number;
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
export type RestRequestConfig = import("axios").AxiosRequestConfig & {
    useCache?: boolean;
    cacheTtlMs?: number;
    cacheKey?: string;
    skipRateLimit?: boolean;
    requestId?: string;
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
     * По умолчанию: false. В production рекомендуется включить.
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
    }) => Promise<Output> | Output;
    /** Условие выполнения шага (возвращает false → шаг пропускается со статусом 'skipped') */
    condition?: (params: {
        prev: Input;
        allResults: Record<string, PipelineStepResult>;
        sharedData: Record<string, any>;
    }) => boolean;
    /** Количество попыток при ошибке */
    retryCount?: number;
    /** Таймаут шага (мс) */
    timeoutMs?: number;
    /** Обработчик ошибок шага */
    errorHandler?: (params: {
        error: any;
        key: string;
        sharedData: Record<string, any>;
    }) => any;
    /**
     * Хук before: вызывается перед выполнением запроса этапа (request).
     * Может синхронно или асинхронно модифицировать входные данные prev/allResults/sharedData.
     * Возвращаемое значение будет передано в request вместо prev (если возвращено !== undefined).
     */
    before?: (params: {
        prev: Input;
        allResults: Record<string, PipelineStepResult>;
        sharedData: Record<string, any>;
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
/** Один элемент pipeline — либо обычный шаг, либо группа параллельных шагов, либо вложенный pipeline */
export type PipelineItem = PipelineStageConfig | ParallelStageGroup | SubPipelineStage;
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
    }>;
};
