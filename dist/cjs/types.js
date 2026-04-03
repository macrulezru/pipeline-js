"use strict";
// --- Типы для HTTP и REST ---
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SENSITIVE_HEADERS = void 0;
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
