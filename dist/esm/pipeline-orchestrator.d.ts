import type { PipelineConfig, PipelineResult, PipelineStepResult, PipelineStepStatus, PipelineStepEvent, PipelineStepEventHandler, PipelineExportedState } from "./types";
export type { PipelineStepEvent, PipelineStepEventHandler };
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
    /** Механизм pause/resume */
    private _paused;
    private _resumePromise;
    private _resumeResolve;
    private config;
    /** Индекс последнего упавшего шага (для pipelineRetry с retryFrom: 'failed-step') */
    private _lastFailedIndex;
    constructor(params: {
        config: PipelineConfig;
        httpConfig?: import("./types").HttpConfig;
        sharedData?: Record<string, unknown>;
        /**
         * @deprecated Используйте params.config.options.autoReset.
         * Для обратной совместимости этот параметр также поддерживается.
         */
        options?: {
            autoReset?: boolean;
        };
    });
    /** Приостановить pipeline после завершения текущего шага */
    pause(): void;
    /** Возобновить выполнение pipeline */
    resume(): void;
    /** Проверить, приостановлен ли pipeline */
    isPaused(): boolean;
    subscribeStageResults(listener: (results: Record<string, PipelineStepResult>) => void): () => void;
    on(event: string, handler: (...args: any[]) => void | Promise<void>): () => void;
    onStepStart(handler: PipelineStepEventHandler): () => void;
    onStepFinish(handler: PipelineStepEventHandler): () => void;
    onStepError(handler: PipelineStepEventHandler): () => void;
    subscribeProgress(listener: (progress: import("./types").PipelineProgress) => void): () => void;
    subscribeStepProgress(stepKey: string, listener: (status: PipelineStepStatus) => void): () => void;
    getProgress(): {
        currentStage: number;
        totalStages: number;
        stageStatuses: Array<PipelineStepStatus>;
    };
    /** Возвращает снимок прогресса. Для реактивности используйте subscribeProgress. */
    getProgressRef(): {
        currentStage: number;
        totalStages: number;
        stageStatuses: Array<PipelineStepStatus>;
    };
    getLogs(): {
        type: string;
        message: string;
        data?: any;
        timestamp: Date;
    }[];
    /** Возвращает синхронный снимок результатов всех шагов. */
    getStageResults(): Record<string, PipelineStepResult>;
    clearStageResults(): void;
    /** Экспортировать снимок состояния pipeline (для сохранения и восстановления) */
    exportState(): PipelineExportedState;
    /** Восстановить состояние pipeline из ранее сохранённого снимка */
    importState(state: PipelineExportedState): void;
    abort(): void;
    isAborted(): boolean;
    private emit;
    private notifyStageResults;
    private addLog;
    private emitStepStart;
    private emitStepFinish;
    private emitStepError;
    private emitStepSkipped;
    /**
     * Выполнить один шаг pipeline.
     * Единственная точка реализации логики шага — используется и в run(), и в rerunStep().
     */
    private executeStage;
    private executeSubPipeline;
    private findStageByKey;
    private _runOnce;
    run(onStepPause?: (stepIndex: number, stepResult: unknown, stageResults: Record<string, PipelineStepResult>) => Promise<unknown> | unknown, externalSignal?: AbortSignal): Promise<PipelineResult>;
    /**
     * Повторно выполнить только один шаг pipeline (без полного рестарта).
     * Полностью зеркалирует поведение run(): вызывает before/after/condition/middleware.
     */
    rerunStep(stepKey: string, options?: {
        onStepPause?: (stepIndex: number, stepResult: unknown, stageResults: Record<string, PipelineStepResult>) => Promise<unknown> | unknown;
        externalSignal?: AbortSignal;
    }): Promise<PipelineStepResult | undefined>;
    private mergeSignals;
    private markRemainingAborted;
}
