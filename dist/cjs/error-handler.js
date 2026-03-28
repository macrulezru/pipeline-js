"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = void 0;
class ErrorHandler {
    handle(error, _stageKey) {
        return {
            message: error instanceof Error ? error.message : String(error !== null && error !== void 0 ? error : 'Unknown error'),
            status: typeof (error === null || error === void 0 ? void 0 : error.status) === 'number' ? error.status : undefined,
        };
    }
}
exports.ErrorHandler = ErrorHandler;
