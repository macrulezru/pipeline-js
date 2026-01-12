import type { PipelineConfig, PipelineResult } from './types';
export declare class PipelineOrchestrator {
    private config;
    private progress;
    private errorHandler;
    private executor;
    private sharedData;
    constructor(config: PipelineConfig, httpConfig: import('./types').HttpConfig, sharedData?: Record<string, unknown>);
    /**
     * Подписаться на изменения прогресса выполнения pipeline
     * @param listener функция-обработчик изменений
     * @returns функция для отписки
     */
    subscribeProgress(listener: (progress: import('./types').PipelineProgress) => void): () => void;
    /**
     * Получить текущий прогресс выполнения pipeline (snapshot, не реактивный)
     */
    getProgress(): {
        currentStage: number;
        totalStages: number;
        stageStatuses: Array<"pending" | "in-progress" | "success" | "error" | "skipped">;
    };
    /**
     * @param onStepPause
     *   Необязательный callback, вызывается после каждого шага (до перехода к следующему).
     *   Позволяет приостановить выполнение, запросить подтверждение пользователя или изменить результат шага.
     *   Должен вернуть (optionally изменённый) результат шага или промис с ним.
     *   Если не передан — пайплайн работает как раньше.
     */
    run(onStepPause?: (stepIndex: number, stepResult: unknown, results: unknown[]) => Promise<unknown> | unknown): Promise<PipelineResult>;
}
