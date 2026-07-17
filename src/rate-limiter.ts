import type { RateLimitConfig } from './types.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateKey(): string {
  const g: any = globalThis as any;
  if (g.crypto?.randomUUID) return `rate-limiter-${g.crypto.randomUUID()}`;
  return `rate-limiter-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Семафор для ограничения параллельных запросов (maxConcurrent)
 * и скользящего окна (maxRequestsPerInterval / intervalMs).
 *
 * Без `config.store` — точный in-memory алгоритм в пределах одного процесса
 * (поведение не изменилось). С `config.store` — делегирует оба примитива
 * распределённому backend'у (см. RateLimiterStore), что позволяет нескольким
 * серверным инстансам делить один лимит.
 */
export class RateLimiter {
  private activeCount = 0;
  private waitQueue: Array<() => void> = [];

  // Sliding-window counters
  private windowTimestamps: number[] = [];

  private readonly key: string;

  constructor(private config: RateLimitConfig) {
    this.key = config.key ?? generateKey();
  }

  /**
   * Захватить слот. Возвращает функцию release — должна быть вызвана после завершения запроса.
   */
  async acquire(): Promise<() => void> {
    if (this.config.store) {
      return this._acquireViaStore();
    }

    await this.waitForWindow();
    await this.waitForSlot();
    this.activeCount++;
    this.windowTimestamps.push(Date.now());

    return () => {
      this.activeCount--;
      this.drainQueue();
    };
  }

  private async _acquireViaStore(): Promise<() => void> {
    const store = this.config.store!;
    const intervalMs = this.config.intervalMs ?? 1000;
    const maxReqs = this.config.maxRequestsPerInterval;

    if (maxReqs) {
      // Fixed-window счётчик: перебираем, пока не окажемся в пределах лимита.
      // "Лишние" инкременты естественно затухают с истечением TTL окна на
      // стороне store — busy-loop не возникает благодаря sleep(intervalMs).
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const count = await store.incrementWindow(this.key, intervalMs);
        if (count <= maxReqs) break;
        await sleep(intervalMs);
      }
    }

    let releaseSlot: (() => void | Promise<void>) | undefined;
    if (this.config.maxConcurrent) {
      const leaseMs = this.config.leaseMs ?? 30_000;
      releaseSlot = await store.acquireConcurrencySlot(
        this.key,
        this.config.maxConcurrent,
        leaseMs,
      );
    }

    return () => {
      void releaseSlot?.();
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
