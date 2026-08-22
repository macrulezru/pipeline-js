"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProgressTracker = void 0;
class ProgressTracker {
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
        return { ...this.progress };
    }
    updateStage(stage, status) {
        this.progress.stageStatuses[stage] = status;
        this.progress.currentStage = stage;
        this.notify();
    }
    getProgress() {
        return { ...this.progress };
    }
    subscribe(listener) {
        this.listeners.push(listener);
        // Immediately notify the new subscriber of the current state
        listener({ ...this.progress });
        return () => {
            this.listeners = this.listeners.filter((l) => l !== listener);
        };
    }
    notify() {
        for (const listener of this.listeners) {
            listener({ ...this.progress });
        }
    }
}
exports.ProgressTracker = ProgressTracker;
