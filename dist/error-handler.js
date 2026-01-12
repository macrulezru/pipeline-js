"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = void 0;
class ErrorHandler {
    handle(error, stageKey) {
        // TODO: реализовать классификацию и обработку ошибок
        return { type: 'unknown', error, stageKey };
    }
}
exports.ErrorHandler = ErrorHandler;
