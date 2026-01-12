import { getRestClient } from './rest-client';

import type { RestRequestConfig, HttpConfig, ApiResponse } from './types';

export class RequestExecutor {
  private client;

  constructor(httpConfig: HttpConfig) {
    this.client = getRestClient(httpConfig);
  }

  /**
   * Выполнение одного запроса с поддержкой retry и таймаута
   */
  async execute<T = any>(
    command: string,
    reqConfig?: RestRequestConfig,
    retryCount = 0,
    timeoutMs = 10000,
  ): Promise<ApiResponse<T>> {
    let attempt = 0;
    let lastError: any = null;
    while (attempt <= retryCount) {
      try {
        const result = await Promise.race([
          this.client.request<T>(command, reqConfig),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeoutMs),
          ),
        ]);
        return result as ApiResponse<T>;
      } catch (err) {
        lastError = err;
        attempt++;
        if (attempt > retryCount) throw lastError;
      }
    }
    throw lastError;
  }
}
