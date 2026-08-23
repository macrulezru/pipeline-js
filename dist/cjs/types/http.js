"use strict";
// --- Types for HTTP and REST ---
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SENSITIVE_HEADERS = void 0;
/**
 * Headers masked in logs by default when sanitizeHeaders: true.
 * Can be extended via HttpConfig.sensitiveHeaders.
 */
exports.DEFAULT_SENSITIVE_HEADERS = [
    "authorization",
    "x-api-key",
    "x-auth-token",
    "cookie",
    "set-cookie",
    "proxy-authorization",
];
