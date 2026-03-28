import type { ApiError } from './types';
export declare class ErrorHandler {
    handle(error: any, _stageKey: string): ApiError;
}
