import type { PipelineProgress } from "./types.js";
type ProgressListener = (progress: PipelineProgress) => void;
export declare class ProgressTracker {
    private progress;
    private listeners;
    constructor(totalStages: number);
    reset(): void;
    /**
     * Возвращает снимок текущего прогресса.
     * Алиас для getProgress() — для отслеживания изменений используйте subscribeProgress.
     */
    getProgressRef(): {
        currentStage: number;
        totalStages: number;
        stageStatuses: Array<import("./types.js").PipelineStepStatus>;
    };
    updateStage(stage: number, status: PipelineProgress["stageStatuses"][number]): void;
    getProgress(): {
        currentStage: number;
        totalStages: number;
        stageStatuses: Array<import("./types.js").PipelineStepStatus>;
    };
    subscribe(listener: ProgressListener): () => void;
    private notify;
}
export {};
