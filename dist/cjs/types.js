"use strict";
// --- Типы для HTTP и REST ---
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SENSITIVE_HEADERS = void 0;
exports.recoverStep = recoverStep;
exports.isStepRecovery = isStepRecovery;
/**
 * Заголовки, которые маскируются в логах по умолчанию при sanitizeHeaders: true.
 * Можно расширить через HttpConfig.sensitiveHeaders.
 */
exports.DEFAULT_SENSITIVE_HEADERS = [
    "authorization",
    "x-api-key",
    "x-auth-token",
    "cookie",
    "set-cookie",
    "proxy-authorization",
];
/** Хелпер для errorHandler: помечает шаг как восстановленный (status: 'success') с указанными data. */
function recoverStep(data) {
    return { recover: true, data };
}
/** Проверка: является ли значение, возвращённое errorHandler, признаком восстановления шага. */
function isStepRecovery(value) {
    return (typeof value === "object" &&
        value !== null &&
        value.recover === true &&
        "data" in value);
}
