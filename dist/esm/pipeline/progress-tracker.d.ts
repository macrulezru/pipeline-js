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
    getProgressRef(): PipelineProgress;
    updateStage(stage: number, status: PipelineProgress["stageStatuses"][number]): void;
    getProgress(): PipelineProgress;
    subscribe(listener: ProgressListener): () => void;
    private notify;
    /** A shallow copy of `progress` with `stageStatuses` also cloned, so a returned snapshot is a stable point-in-time value — `updateStage()` mutates the live array in place, and without cloning it, every previously-returned snapshot would silently reflect later updates too. */
    private snapshot;
}
export {};
