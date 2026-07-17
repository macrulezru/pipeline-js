import type { ApiError } from './types.js';
export declare class ErrorHandler {
    handle(error: any, _stageKey: string): ApiError;
}
