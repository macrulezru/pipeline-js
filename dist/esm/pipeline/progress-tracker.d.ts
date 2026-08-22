import type { PipelineProgress } from "../types.js";
type ProgressListener = (progress: PipelineProgress) => void;
export declare class ProgressTracker {
    private progress;
    private listeners;
    constructor(totalStages: number);
    reset(): void;
    /**
     * Returns a snapshot of the current progress.
     * Alias for getProgress() — use subscribeProgress to track changes.
     */
    getProgressRef(): {
        currentStage: number;
        totalStages: number;
        stageStatuses: Array<import("../types.js").PipelineStepStatus>;
    };
    updateStage(stage: number, status: PipelineProgress["stageStatuses"][number]): void;
    getProgress(): {
        currentStage: number;
        totalStages: number;
        stageStatuses: Array<import("../types.js").PipelineStepStatus>;
    };
    subscribe(listener: ProgressListener): () => void;
    private notify;
}
export {};
