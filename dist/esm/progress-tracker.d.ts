import type { PipelineProgress } from "./types";
type ProgressListener = (progress: PipelineProgress) => void;
export declare class ProgressTracker {
    private progress;
    private listeners;
    constructor(totalStages: number);
    reset(): void;
    /**
     * Возвращает текущий снимок состояния прогресса (не реактивный).
     * Для отслеживания изменений используйте subscribeProgress.
     */
    getProgressRef(): PipelineProgress;
    updateStage(stage: number, status: PipelineProgress["stageStatuses"][number]): void;
    getProgress(): {
        currentStage: number;
        totalStages: number;
        stageStatuses: Array<import("./types").PipelineStepStatus>;
    };
    subscribe(listener: ProgressListener): () => void;
    private notify;
}
export {};
