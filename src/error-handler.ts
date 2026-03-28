import type { ApiError } from './types';

export class ErrorHandler {
  handle(error: any, _stageKey: string): ApiError {
    return {
      message: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
      status: typeof error?.status === 'number' ? error.status : undefined,
    };
  }
}
