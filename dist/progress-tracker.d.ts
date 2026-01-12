import type { PipelineProgress } from './types';
type ProgressListener = (progress: PipelineProgress) => void;
export declare class ProgressTracker {
    private progress;
    private listeners;
    constructor(totalStages: number);
    updateStage(stage: number, status: PipelineProgress['stageStatuses'][number]): void;
    getProgress(): {
        currentStage: number;
        totalStages: number;
        stageStatuses: Array<"pending" | "in-progress" | "success" | "error" | "skipped">;
    };
    subscribe(listener: ProgressListener): () => void;
    private notify;
}
export {};
