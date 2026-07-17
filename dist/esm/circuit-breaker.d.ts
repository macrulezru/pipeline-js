import type { ApiError, CircuitBreakerConfig, CircuitBreakerState } from "./types.js";
export type { CircuitBreakerState };
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
 *
 * Все публичные методы асинхронны (возвращают Promise), даже когда `config.store`
 * не задан и состояние держится в памяти — это единый интерфейс независимо от
 * backend'а. Без `config.store` поведение и производительность не отличаются от
 * синхронной версии (просто обёрнуты в мгновенно резолвящийся промис).
 */
export declare class CircuitBreaker {
    private config;
    private readonly key;
    private state;
    private failureCount;
    private successCount;
    private openedAt;
    constructor(config: CircuitBreakerConfig);
    /** Текущее состояние (учитывает автоматический переход open → half-open по таймауту). */
    getState(): Promise<CircuitBreakerState>;
    /** Можно ли выполнить запрос сейчас (false, если circuit открыт). */
    canExecute(): Promise<boolean>;
    /** Зарегистрировать успешный запрос. */
    onSuccess(): Promise<void>;
    /** Зарегистрировать неудачный запрос (error уже приведена к ApiError). */
    onFailure(error: ApiError): Promise<void>;
    /** Reads shared state, applying the open→half-open timeout transition (and persisting it) if due. */
    private _readShared;
    private _writeShared;
    /** Increments `field` either atomically (if the store supports it) or via read-modify-write. */
    private _incrementShared;
    private _maybeTransitionToHalfOpen;
    private _open;
    private _close;
}
