"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProgressTracker = void 0;
class ProgressTracker {
    constructor(totalStages) {
        this.listeners = [];
        this.progress = {
            currentStage: 0,
            totalStages,
            stageStatuses: Array(totalStages).fill('pending'),
        };
    }
    /**
     * Возвращает текущий снимок состояния прогресса (не реактивный).
     * Для отслеживания изменений используйте subscribeProgress.
     */
    getProgressRef() {
        return this.progress;
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
        // Немедленно уведомляем нового подписчика о текущем состоянии
        listener({ ...this.progress });
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }
    notify() {
        for (const listener of this.listeners) {
            listener({ ...this.progress });
        }
    }
}
exports.ProgressTracker = ProgressTracker;
