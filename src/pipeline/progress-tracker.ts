import type { PipelineProgress } from "../types.js";

type ProgressListener = (progress: PipelineProgress) => void;

export class ProgressTracker {
  private progress: PipelineProgress;
  private listeners: ProgressListener[] = [];

  constructor(totalStages: number) {
    this.progress = {
      currentStage: 0,
      totalStages,
      stageStatuses: Array(totalStages).fill("pending"),
    };
  }

  reset(): void {
    this.progress.currentStage = 0;
    this.progress.stageStatuses = Array(this.progress.totalStages).fill(
      "pending"
    );
    this.notify();
  }

  /**
   * Returns a snapshot of the current progress.
   * Alias for getProgress() — use subscribeProgress to track changes.
   */
  getProgressRef() {
    return { ...this.progress };
  }

  updateStage(
    stage: number,
    status: PipelineProgress["stageStatuses"][number]
  ) {
    this.progress.stageStatuses[stage] = status;
    this.progress.currentStage = stage;
    this.notify();
  }

  getProgress() {
    return { ...this.progress };
  }

  subscribe(listener: ProgressListener) {
    this.listeners.push(listener);
    // Immediately notify the new subscriber of the current state
    listener({ ...this.progress });
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener({ ...this.progress });
    }
  }
}
