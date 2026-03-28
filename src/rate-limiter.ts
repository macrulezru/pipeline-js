import type { RateLimitConfig } from './types';

/**
 * Семафор для ограничения параллельных запросов (maxConcurrent)
 * и скользящего окна (maxRequestsPerInterval / intervalMs)
 */
export class RateLimiter {
  private activeCount = 0;
  private waitQueue: Array<() => void> = [];

  // Sliding-window counters
  private windowTimestamps: number[] = [];

  constructor(private config: RateLimitConfig) {}

  /**
   * Захватить слот. Возвращает функцию release — должна быть вызвана после завершения запроса.
   */
  async acquire(): Promise<() => void> {
    await this.waitForWindow();
    await this.waitForSlot();
    this.activeCount++;
    this.windowTimestamps.push(Date.now());

    return () => {
      this.activeCount--;
      this.drainQueue();
    };
  }

  private async waitForSlot(): Promise<void> {
    const max = this.config.maxConcurrent;
    if (!max) return;

    if (this.activeCount < max) return;

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  private async waitForWindow(): Promise<void> {
    const maxReqs = this.config.maxRequestsPerInterval;
    const intervalMs = this.config.intervalMs ?? 1000;
    if (!maxReqs) return;

    // Удаляем устаревшие метки
    const now = Date.now();
    this.windowTimestamps = this.windowTimestamps.filter(
      (ts) => now - ts < intervalMs
    );

    if (this.windowTimestamps.length < maxReqs) return;

    // Ждём до конца текущего окна
    const oldest = this.windowTimestamps[0];
    const waitMs = intervalMs - (now - oldest) + 1;
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));

    // Повторная очистка после ожидания
    const now2 = Date.now();
    this.windowTimestamps = this.windowTimestamps.filter(
      (ts) => now2 - ts < intervalMs
    );
  }

  private drainQueue(): void {
    const max = this.config.maxConcurrent;
    if (!max) return;

    while (this.activeCount < max && this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      next?.();
    }
  }
}
