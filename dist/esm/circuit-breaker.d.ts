import type { ApiError, CircuitBreakerConfig } from "./types";
export type CircuitBreakerState = "closed" | "open" | "half-open";
/** Ошибка, бросаемая вместо реального запроса, когда circuit breaker открыт. */
export declare class CircuitOpenError extends Error {
    code: string;
    constructor();
}
/**
 * Простой circuit breaker (closed → open → half-open → closed) для HTTP-клиента.
 * - closed: запросы выполняются как обычно, считаются последовательные ошибки.
 * - open: запросы немедленно отклоняются (CircuitOpenError), без обращения к сети.
 * - half-open: после openMs пропускает запросы "на пробу"; успех закрывает circuit,
 *   неудача снова открывает его.
 */
export declare class CircuitBreaker {
    private config;
    private state;
    private failureCount;
    private successCount;
    private openedAt;
    constructor(config: CircuitBreakerConfig);
    /** Текущее состояние (учитывает автоматический переход open → half-open по таймауту). */
    getState(): CircuitBreakerState;
    /** Можно ли выполнить запрос сейчас (false, если circuit открыт). */
    canExecute(): boolean;
    /** Зарегистрировать успешный запрос. */
    onSuccess(): void;
    /** Зарегистрировать неудачный запрос (error уже приведена к ApiError). */
    onFailure(error: ApiError): void;
    private _maybeTransitionToHalfOpen;
    private _open;
    private _close;
}
