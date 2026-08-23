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
    return this.snapshot();
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
    return this.snapshot();
  }

  subscribe(listener: ProgressListener) {
    this.listeners.push(listener);
    // Immediately notify the new subscriber of the current state
    listener(this.snapshot());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.snapshot());
    }
  }

  /** A shallow copy of `progress` with `stageStatuses` also cloned, so a returned snapshot is a stable point-in-time value — `updateStage()` mutates the live array in place, and without cloning it, every previously-returned snapshot would silently reflect later updates too. */
  private snapshot(): PipelineProgress {
    return { ...this.progress, stageStatuses: [...this.progress.stageStatuses] };
  }
}
