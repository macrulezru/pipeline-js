import { getRestClient } from './rest-client';

import type { RestRequestConfig, HttpConfig, ApiResponse, RetryConfig } from './types';

/** Небольшой хелпер: sleep с поддержкой AbortSignal */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

/** Объединить два AbortSignal в один */
function mergeSignals(
  a: AbortSignal | undefined,
  b: AbortSignal | undefined,
): AbortSignal | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (a.aborted || b.aborted) {
    controller.abort();
  } else {
    a.addEventListener('abort', abort, { once: true });
    b.addEventListener('abort', abort, { once: true });
  }
  return controller.signal;
}

/**
 * Разбирает значение заголовка Retry-After в миллисекунды.
 * Поддерживает оба формата: число секунд и HTTP-дата.
 * Возвращает значение, ограниченное maxMs сверху и 0 снизу.
 */
function parseRetryAfter(value: string, maxMs: number): number | null {
  // Числовой формат: количество секунд (может быть 0)
  const asNumber = Number(value);
  if (!isNaN(asNumber) && value.trim() !== '') {
    return Math.min(Math.max(asNumber * 1000, 0), maxMs);
  }

  // Формат HTTP-даты: "Wed, 21 Oct 2015 07:28:00 GMT"
  const asDate = new Date(value);
  if (!isNaN(asDate.getTime())) {
    const waitMs = asDate.getTime() - Date.now();
    return Math.min(Math.max(waitMs, 0), maxMs);
  }

  return null;
}

export class RequestExecutor {
  private client;
  private retryCfg: Partial<RetryConfig>;

  constructor(private httpConfig: HttpConfig) {
    this.client = getRestClient(httpConfig);
    this.retryCfg = httpConfig.retry ?? {};
  }

  /**
   * Выполнение одного запроса с поддержкой:
   * - retry с задержкой, экспоненциальным backoff и jitter
   * - фильтрацией retry по HTTP-статусу (retriableStatus)
   * - разбором заголовка Retry-After (приоритет над backoff-задержкой)
   * - потолком maxRetryAfterMs для Retry-After
   * - таймаута через AbortController (реально отменяет HTTP-запрос)
   * - внешнего AbortSignal (от orchestrator.abort())
   */
  async execute<T = any>(
    command: string,
    reqConfig?: RestRequestConfig,
    retryCount?: number,
    timeoutMs = 10_000,
    externalSignal?: AbortSignal,
  ): Promise<ApiResponse<T>> {
    const maxAttempts = retryCount ?? this.retryCfg.attempts ?? 0;
    const baseDelay = this.retryCfg.delayMs ?? 0;
    const backoffMult = this.retryCfg.backoffMultiplier ?? 1;
    const retriableStatus = this.retryCfg.retriableStatus;
    const maxRetryAfterMs = this.retryCfg.maxRetryAfterMs ?? 60_000;

    let attempt = 0;
    let lastError: unknown;

    while (attempt <= maxAttempts) {
      // Проверяем внешний сигнал до каждой попытки
      if (externalSignal?.aborted) {
        throw new DOMException('Pipeline aborted', 'AbortError');
      }

      // Таймаут: создаём AbortController на каждую попытку
      const timeoutController = new AbortController();
      const timeoutId = timeoutMs > 0
        ? setTimeout(() => timeoutController.abort(), timeoutMs)
        : undefined;

      const signal = mergeSignals(externalSignal, timeoutController.signal);

      try {
        const result = await this.client.request<T>(command, {
          ...reqConfig,
          signal,
        });
        return result;
      } catch (err: any) {
        lastError = err;

        // Если это AbortError от таймаута или внешнего сигнала — не повторяем
        const isAbort =
          err?.name === 'AbortError' ||
          err?.code === 'ERR_CANCELED' ||
          externalSignal?.aborted;
        if (isAbort) throw err;

        // Проверяем retriableStatus
        const httpStatus: number | undefined =
          err?.response?.status ?? err?.status;
        if (retriableStatus && httpStatus !== undefined) {
          if (!retriableStatus.includes(httpStatus)) {
            throw err;
          }
        }

        attempt++;
        if (attempt > maxAttempts) break;

        // ── Retry-After: приоритет над backoff-задержкой ─────────────────
        const retryAfterHeader: string | undefined =
          err?.response?.headers?.['retry-after'] ??
          err?.response?.headers?.['Retry-After'];

        let delay: number;
        if (retryAfterHeader !== undefined) {
          const parsed = parseRetryAfter(retryAfterHeader, maxRetryAfterMs);
          // Если не распарсилось — фоллбэк на backoff
          delay = parsed !== null
            ? parsed
            : baseDelay * Math.pow(backoffMult, attempt - 1);
        } else if (baseDelay > 0) {
          delay =
            baseDelay * Math.pow(backoffMult, attempt - 1) +
            Math.random() * baseDelay * 0.1;
        } else {
          delay = 0;
        }

        if (delay > 0) {
          await sleep(Math.round(delay), externalSignal);
        }
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      }
    }

    throw lastError;
  }
}
