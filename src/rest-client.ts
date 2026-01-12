import axios from 'axios';

import type { HttpConfig, ApiError, ApiResponse, RestRequestConfig } from './types';
import type { AxiosInstance, AxiosResponse } from 'axios';

type RestClient = ReturnType<typeof createRestClient>;

export function toApiError(error: unknown): ApiError {
  if (axios.isCancel(error)) {
    return {
      message: 'Запрос был отменен',
      code: 'REQUEST_CANCELLED',
    };
  }
  if (axios.isAxiosError(error)) {
    const axiosError = error;
    return {
      message: axiosError.message,
      code: axiosError.code,
      status: axiosError.response?.status,
      timestamp: new Date(),
    };
  }
  if (error instanceof Error) {
    return {
      message: error.message,
      timestamp: new Date(),
    };
  }
  return {
    message: 'Произошла неизвестная ошибка',
    timestamp: new Date(),
  };
}

const restClientCache: Map<string, RestClient> = new Map();

export function createRestClient(config: HttpConfig) {
  const httpClient: AxiosInstance = axios.create({
    baseURL: config.baseURL,
    timeout: config.timeout,
    headers: config.headers,
    withCredentials: config.withCredentials,
  });
  // ...реализация rate limit, cache, interceptors, request, etc. (скопировать из rest.ts при необходимости)
  // Для краткости: реализуйте полный функционал по мере необходимости.
  async function request<T = unknown>(
    command: string,
    req?: RestRequestConfig,
  ): Promise<ApiResponse<T>> {
    const reqId = req?.requestId ?? Math.random().toString(36).slice(2);
    const methodUpper = (req?.method ?? 'GET').toUpperCase();
    const fullUrl = `${config.baseURL}${command}`;
    config.metrics?.onRequestStart?.({
      id: reqId,
      method: methodUpper,
      url: fullUrl,
      timestamp: Date.now(),
      requestBody: req?.data,
      requestParams: req?.params,
      requestHeaders: req?.headers as Record<string, string>,
    });
    const startTs = Date.now();
    try {
      const response: AxiosResponse<T> = await httpClient.request<T>({
        url: command,
        ...req,
      });
      const payload: ApiResponse<T> = {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as Record<string, string>,
      };
      const duration = Date.now() - startTs;
      // --- вычисление размера ответа ---
      let responseBytes: number | undefined = undefined;
      const headers = response.headers as Record<string, string>;
      const contentLengthHeader =
        headers['content-length'] || headers['Content-Length'] || undefined;
      const parsedLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;
      if (Number.isFinite(parsedLength) && parsedLength !== 0) {
        responseBytes = parsedLength;
      } else {
        try {
          const raw = response.data;
          if (typeof raw === 'string') {
            responseBytes = new TextEncoder().encode(raw).length;
          } else if (raw !== undefined) {
            const str = JSON.stringify(raw);
            responseBytes = new TextEncoder().encode(str).length;
          }
        } catch {
          // ignore sizing errors
        }
      }
      config.metrics?.onRequestEnd?.({
        id: reqId,
        durationMs: duration,
        status: response.status,
        bytes: responseBytes,
        responseBody: response.data,
        responseHeaders: response.headers as Record<string, string>,
      });
      return payload;
    } catch (error) {
      const duration = Date.now() - startTs;
      config.metrics?.onRequestEnd?.({
        id: reqId,
        durationMs: duration,
        error: toApiError(error),
      });
      throw error;
    }
  }
  // --- Реализация cancellableRequest ---
  const cancelTokenSources: Map<string, any> = new Map();
  function cancelRequest(key: string): void {
    const source = cancelTokenSources.get(key);
    if (source) {
      source.cancel(`Запрос отменен по ключу: ${key}`);
      cancelTokenSources.delete(key);
    }
  }
  async function cancellableRequest<T = unknown>(
    key: string,
    command: string,
    config?: any,
  ): Promise<ApiResponse<T>> {
    cancelRequest(key);
    const axios = await import('axios');
    const source = axios.default.CancelToken.source();
    cancelTokenSources.set(key, source);
    try {
      return await request<T>(command, {
        ...config,
        cancelToken: source.token,
      });
    } finally {
      cancelTokenSources.delete(key);
    }
  }
  return {
    request,
    get: <T = unknown>(command: string, config?: Omit<RestRequestConfig, 'method'>) =>
      request<T>(command, { ...config, method: 'GET' }),
    post: <T = unknown>(
      command: string,
      data?: unknown,
      config?: Omit<RestRequestConfig, 'method' | 'data'>,
    ) => request<T>(command, { ...config, method: 'POST', data }),
    put: <T = unknown>(
      command: string,
      data?: unknown,
      config?: Omit<RestRequestConfig, 'method' | 'data'>,
    ) => request<T>(command, { ...config, method: 'PUT', data }),
    delete: <T = unknown>(command: string, config?: Omit<RestRequestConfig, 'method'>) =>
      request<T>(command, { ...config, method: 'DELETE' }),
    cancellableRequest,
    cancelRequest,
  };
}

export function getRestClient(config: HttpConfig): RestClient {
  const key = JSON.stringify({
    baseURL: config.baseURL,
    timeout: config.timeout,
    withCredentials: config.withCredentials,
    headers: config.headers ?? {},
    retry: config.retry ?? {},
    metrics: !!config.metrics,
  });
  const cachedClient = restClientCache.get(key);
  if (cachedClient) return cachedClient;
  const client = createRestClient(config);
  restClientCache.set(key, client);
  return client;
}
