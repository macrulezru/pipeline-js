export class ProgressTracker {
    constructor(totalStages) {
        this.listeners = [];
        this.progress = {
            currentStage: 0,
            totalStages,
            stageStatuses: Array(totalStages).fill("pending"),
        };
    }
    reset() {
        this.progress.currentStage = 0;
        this.progress.stageStatuses = Array(this.progress.totalStages).fill("pending");
        this.notify();
    }
    /**
     * Returns a snapshot of the current progress.
     * Alias for getProgress() — use subscribeProgress to track changes.
     */
    getProgressRef() {
        return this.snapshot();
    }
    updateStage(stage, status) {
        this.progress.stageStatuses[stage] = status;
        this.progress.currentStage = stage;
        this.notify();
    }
    getProgress() {
        return this.snapshot();
    }
    subscribe(listener) {
        this.listeners.push(listener);
        // Immediately notify the new subscriber of the current state
        listener(this.snapshot());
        return () => {
            this.listeners = this.listeners.filter((l) => l !== listener);
        };
    }
    notify() {
        for (const listener of this.listeners) {
            listener(this.snapshot());
        }
    }
    /** A shallow copy of `progress` with `stageStatuses` also cloned, so a returned snapshot is a stable point-in-time value — `updateStage()` mutates the live array in place, and without cloning it, every previously-returned snapshot would silently reflect later updates too. */
    snapshot() {
        return { ...this.progress, stageStatuses: [...this.progress.stageStatuses] };
    }
}
