
import type { PipelineProgress } from './types';

type ProgressListener = (progress: PipelineProgress) => void;

export class ProgressTracker {
  private progress: PipelineProgress;
  private listeners: ProgressListener[] = [];

  constructor(totalStages: number) {
    this.progress = {
      currentStage: 0,
      totalStages,
      stageStatuses: Array(totalStages).fill('pending'),
    };
  }

  updateStage(stage: number, status: PipelineProgress['stageStatuses'][number]) {
    this.progress.stageStatuses[stage] = status;
    this.progress.currentStage = stage;
    this.notify();
  }

  getProgress() {
    return { ...this.progress };
  }

  subscribe(listener: ProgressListener) {
    this.listeners.push(listener);
    // Немедленно уведомляем нового подписчика о текущем состоянии
    listener({ ...this.progress });
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener({ ...this.progress });
    }
  }
}
