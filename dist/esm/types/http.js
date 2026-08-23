// --- Types for HTTP and REST ---
/**
 * Headers masked in logs by default when sanitizeHeaders: true.
 * Can be extended via HttpConfig.sensitiveHeaders.
 */
export const DEFAULT_SENSITIVE_HEADERS = [
    "authorization",
    "x-api-key",
    "x-auth-token",
    "cookie",
    "set-cookie",
    "proxy-authorization",
];
