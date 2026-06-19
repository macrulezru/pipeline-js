// --- Типы для HTTP и REST ---
/**
 * Заголовки, которые маскируются в логах по умолчанию при sanitizeHeaders: true.
 * Можно расширить через HttpConfig.sensitiveHeaders.
 */
export const DEFAULT_SENSITIVE_HEADERS = [
    "authorization",
    "x-api-key",
    "x-auth-token",
    "cookie",
    "set-cookie",
    "proxy-authorization",
];
/** Хелпер для errorHandler: помечает шаг как восстановленный (status: 'success') с указанными data. */
export function recoverStep(data) {
    return { recover: true, data };
}
/** Проверка: является ли значение, возвращённое errorHandler, признаком восстановления шага. */
export function isStepRecovery(value) {
    return (typeof value === "object" &&
        value !== null &&
        value.recover === true &&
        "data" in value);
}
