import type { PipelineConfig } from "./types";
/**
 * Событие шага pipeline (для хуков)
 */
export type PipelineStepEvent = {
    /** Индекс шага */
    stepIndex: number;
    /** Ключ шага */
    stepKey: string;
    /** Статус шага */
    status: import("./types").PipelineStepStatus;
    /** Данные результата (если успех) */
    data?: any;
    /** Ошибка (если error) */
    error?: import("./types").ApiError;
    /** Снимок всех результатов на момент события */
    stageResults: Record<string, import("./types").PipelineStepResult>;
};
/**
 * Callback для подписки на события этапов pipeline
 */
export type PipelineStepEventHandler = (event: PipelineStepEvent) => void | Promise<void>;
export declare class PipelineOrchestrator {
    private progress;
    private errorHandler;
    private executor;
    private sharedData;
    private onStepStartHandlers;
    private onStepFinishHandlers;
    private onStepErrorHandlers;
    /** Универсальные подписчики событий: ключ — имя события */
    private eventHandlers;
    /** Встроенные логи */
    private logs;
    private stageResults;
    private stageResultsListeners;
    private autoReset;
    /** AbortController для отмены пайплайна */
    private abortController;
    private config;
    constructor(params: {
        config: PipelineConfig;
        httpConfig?: import("./types").HttpConfig;
        sharedData?: Record<string, unknown>;
        options?: {
            autoReset?: boolean;
        };
    });
    /**
     * Подписка на изменения stageResults (реактивно)
     */
    subscribeStageResults(listener: (results: Record<string, import("./types").PipelineStepResult>) => void): () => void;
    /**
     * Универсальная подписка на события: step:<key>, progress, log и др.
     */
    on(event: string, handler: (...args: any[]) => void | Promise<void>): () => void;
    /**
     * Вызов всех обработчиков события
     */
    private emit;
    /**
     * Получить логи пайплайна
     */
    getLogs(): {
        type: string;
        message: string;
        data?: any;
        timestamp: Date;
    }[];
    private notifyStageResults;
    /**
     * Повторно выполнить только один шаг пайплайна (без полного рестарта)
     * @param stepKey ключ шага
     * @param options дополнительные опции (например, onStepPause, externalSignal)
     */
    rerunStep(stepKey: string, options?: {
        onStepPause?: (stepIndex: number, stepResult: unknown, stageResults: Record<string, import("./types").PipelineStepResult>) => Promise<unknown> | unknown;
        externalSignal?: AbortSignal;
    }): Promise<import("./types").PipelineStepResult | undefined>;
    /**
     * Отменить выполнение пайплайна (вызывает ошибку AbortError)
     */
    abort(): void;
    /**
     * Проверить, был ли пайплайн отменён
     */
    isAborted(): boolean;
    /**
     * Подписка на событие начала шага
     */
    onStepStart(handler: PipelineStepEventHandler): () => void;
    /**
     * Подписка на событие успешного завершения шага
     */
    onStepFinish(handler: PipelineStepEventHandler): () => void;
    /**
     * Подписка на событие ошибки шага
     */
    onStepError(handler: PipelineStepEventHandler): () => void;
    private emitStepStart;
    private emitStepFinish;
    private emitStepError;
    /**
     * Подписаться на изменения прогресса выполнения pipeline
     * @param listener функция-обработчик изменений
     * @returns функция для отписки
     */
    subscribeProgress(listener: (progress: import("./types").PipelineProgress) => void): () => void;
    /**
     * Подписка на прогресс с фильтрацией по этапу (stepKey) или общий
     */
    subscribeStepProgress(stepKey: string, listener: (status: import("./types").PipelineStepStatus) => void): () => void;
    /**
     * Получить текущий прогресс выполнения pipeline (snapshot, не реактивный)
     */
    getProgress(): {
        currentStage: number;
        totalStages: number;
        stageStatuses: Array<import("./types").PipelineStepStatus>;
    };
    /**
     * Возвращает текущий снимок состояния прогресса (не реактивный).
     * Для отслеживания изменений используйте subscribeProgress.
     */
    getProgressRef(): import("./types").PipelineProgress;
    /**
     * Запустить выполнение пайплайна
     * @param onStepPause callback для пользовательской паузы между шагами
     * @param externalSignal внешний AbortSignal (опционально)
     */
    run(onStepPause?: (stepIndex: number, stepResult: unknown, stageResults: Record<string, import("./types").PipelineStepResult>) => Promise<unknown> | unknown, externalSignal?: AbortSignal): Promise<import("./types").PipelineResult>;
    /**
     * Очистить stageResults и уведомить подписчиков
     */
    clearStageResults(): void;
}
