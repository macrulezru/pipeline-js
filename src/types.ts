// --- Типы для HTTP и REST ---

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
export const DEFAULT_SENSITIVE_HEADERS = [
  'authorization',
  'x-api-key',
  'x-auth-token',
  'cookie',
  'set-cookie',
  'proxy-authorization',
] as const;

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

export type RestRequestConfig = import("axios").AxiosRequestConfig & {
  useCache?: boolean;
  cacheTtlMs?: number;
  cacheKey?: string;
  skipRateLimit?: boolean;
  requestId?: string;
};

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
};

/**
 * Группа параллельно выполняемых шагов
 */
export type ParallelStageGroup = {
  /** Уникальный ключ группы (используется для отслеживания прогресса) */
  key: string;
  /** Шаги, выполняемые параллельно */
  parallel: PipelineStageConfig[];
};

/** Один элемент pipeline — либо обычный шаг, либо группа параллельных шагов */
export type PipelineItem = PipelineStageConfig | ParallelStageGroup;

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
export type PipelineStepStatus =
  | "pending"
  | "loading"
  | "success"
  | "error"
  | "skipped";

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
 * Конфиг всего pipeline (массив этапов)
 */
export type PipelineConfig = {
  stages: PipelineItem[];
  /** Глобальные middleware — вызываются для каждого шага */
  middleware?: PipelineMiddleware;
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
export type PipelineStepEventHandler = (
  event: PipelineStepEvent
) => void | Promise<void>;

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
