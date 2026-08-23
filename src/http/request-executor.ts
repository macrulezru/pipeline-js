import { getRestClient } from './rest-client.js';

import type { RestRequestConfig, HttpConfig, ApiResponse, RetryConfig } from '../types.js';

/** Small helper: sleep with AbortSignal support */
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

/** Merge two AbortSignals into one */
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

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function generateIdempotencyKey(): string {
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Parses the Retry-After header value into milliseconds.
 * Supports both formats: a number of seconds and an HTTP date.
 * Returns a value clamped to maxMs at the top and 0 at the bottom.
 */
function parseRetryAfter(value: string, maxMs: number): number | null {
  // Numeric format: number of seconds (can be 0)
  const asNumber = Number(value);
  if (!isNaN(asNumber) && value.trim() !== '') {
    return Math.min(Math.max(asNumber * 1000, 0), maxMs);
  }

  // HTTP date format: "Wed, 21 Oct 2015 07:28:00 GMT"
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
   * Executes a single request with support for:
   * - retry with delay, exponential backoff, and jitter
   * - filtering retries by HTTP status (retriableStatus)
   * - parsing the Retry-After header (takes priority over the backoff delay)
   * - a maxRetryAfterMs ceiling for Retry-After
   * - a timeout via AbortController (actually cancels the HTTP request)
   * - an external AbortSignal (from orchestrator.abort())
   */
  async execute<T = unknown>(
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
    const jitterStrategy = this.retryCfg.jitterStrategy ?? 'fixed';
    // Ceiling for "decorrelated": the largest nominal backoff delay that
    // this series of attempts could produce without jitter.
    const decorrelatedCap = baseDelay * Math.pow(backoffMult, maxAttempts);
    // "Decorrelated" jitter state — the delay of the previous attempt of this call.
    let prevDelay = baseDelay;

    /** Backoff delay for attempt number `n`, according to jitterStrategy. */
    function computeBackoffDelay(n: number): number {
      if (baseDelay <= 0) return 0;
      const nominal = baseDelay * Math.pow(backoffMult, n - 1);
      switch (jitterStrategy) {
        case 'full':
          // AWS "full jitter": uniformly between 0 and the nominal backoff.
          return Math.random() * nominal;
        case 'decorrelated': {
          // AWS "decorrelated jitter": depends on the previous attempt's delay —
          // less synchronization between parallel clients than "full".
          const next = Math.min(
            decorrelatedCap,
            baseDelay + Math.random() * (prevDelay * 3 - baseDelay),
          );
          prevDelay = next;
          return next;
        }
        case 'fixed':
        default:
          // Backward compatible: nominal backoff plus up to +10% on top.
          return nominal + Math.random() * baseDelay * 0.1;
      }
    }

    // --- autoIdempotencyKey: generate it ONCE before the retry loop starts,
    // so that all attempts of one logical request carry the same key ---
    let effectiveReqConfig = reqConfig;
    if (this.httpConfig.autoIdempotencyKey && !reqConfig?.idempotencyKey) {
      const method = (reqConfig?.method ?? 'GET').toString().toUpperCase();
      if (MUTATING_METHODS.has(method)) {
        effectiveReqConfig = { ...reqConfig, idempotencyKey: generateIdempotencyKey() };
      }
    }

    let attempt = 0;
    let lastError: unknown;

    while (attempt <= maxAttempts) {
      // Check the external signal before each attempt
      if (externalSignal?.aborted) {
        throw new DOMException('Pipeline aborted', 'AbortError');
      }

      // Timeout: create an AbortController for each attempt
      const timeoutController = new AbortController();
      const timeoutId = timeoutMs > 0
        ? setTimeout(() => timeoutController.abort(), timeoutMs)
        : undefined;

      const signal = mergeSignals(externalSignal, timeoutController.signal);

      try {
        const result = await this.client.request<T>(command, {
          ...effectiveReqConfig,
          signal,
        });
        return result;
      } catch (err) {
        lastError = err;

        const e = err as {
          name?: string;
          code?: string;
          status?: number;
          response?: { status?: number; headers?: Record<string, string> };
        } | undefined;

        // If this is an AbortError from the timeout or the external signal — don't retry
        const isAbort =
          e?.name === 'AbortError' ||
          e?.code === 'ERR_CANCELED' ||
          externalSignal?.aborted;
        if (isAbort) throw err;

        // Check retriableStatus
        const httpStatus: number | undefined =
          e?.response?.status ?? e?.status;
        if (retriableStatus && httpStatus !== undefined) {
          if (!retriableStatus.includes(httpStatus)) {
            throw err;
          }
        }

        attempt++;
        if (attempt > maxAttempts) break;

        // ── Retry-After: takes priority over the backoff delay ─────────────────
        const retryAfterHeader: string | undefined =
          e?.response?.headers?.['retry-after'] ??
          e?.response?.headers?.['Retry-After'];

        let delay: number;
        if (retryAfterHeader !== undefined) {
          const parsed = parseRetryAfter(retryAfterHeader, maxRetryAfterMs);
          // If parsing failed — fall back to backoff (with the same jitterStrategy)
          delay = parsed !== null ? parsed : computeBackoffDelay(attempt);
        } else {
          delay = computeBackoffDelay(attempt);
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
