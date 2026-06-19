/** Ошибка, бросаемая вместо реального запроса, когда circuit breaker открыт. */
export class CircuitOpenError extends Error {
    constructor() {
        super("Circuit breaker is open — request rejected without calling the network");
        this.code = "CIRCUIT_OPEN";
        this.name = "CircuitOpenError";
    }
}
/**
 * Простой circuit breaker (closed → open → half-open → closed) для HTTP-клиента.
 * - closed: запросы выполняются как обычно, считаются последовательные ошибки.
 * - open: запросы немедленно отклоняются (CircuitOpenError), без обращения к сети.
 * - half-open: после openMs пропускает запросы "на пробу"; успех закрывает circuit,
 *   неудача снова открывает его.
 */
export class CircuitBreaker {
    constructor(config) {
        this.config = config;
        this.state = "closed";
        this.failureCount = 0;
        this.successCount = 0;
        this.openedAt = 0;
    }
    /** Текущее состояние (учитывает автоматический переход open → half-open по таймауту). */
    getState() {
        this._maybeTransitionToHalfOpen();
        return this.state;
    }
    /** Можно ли выполнить запрос сейчас (false, если circuit открыт). */
    canExecute() {
        this._maybeTransitionToHalfOpen();
        return this.state !== "open";
    }
    /** Зарегистрировать успешный запрос. */
    onSuccess() {
        var _a;
        if (this.state === "half-open") {
            this.successCount++;
            const needed = (_a = this.config.successThreshold) !== null && _a !== void 0 ? _a : 1;
            if (this.successCount >= needed) {
                this._close();
            }
        }
        else {
            this.failureCount = 0;
        }
    }
    /** Зарегистрировать неудачный запрос (error уже приведена к ApiError). */
    onFailure(error) {
        if (this.config.isFailure && !this.config.isFailure(error))
            return;
        if (this.state === "half-open") {
            this._open();
            return;
        }
        this.failureCount++;
        if (this.failureCount >= this.config.failureThreshold) {
            this._open();
        }
    }
    _maybeTransitionToHalfOpen() {
        if (this.state === "open" &&
            Date.now() - this.openedAt >= this.config.openMs) {
            this.state = "half-open";
            this.successCount = 0;
        }
    }
    _open() {
        this.state = "open";
        this.openedAt = Date.now();
        this.failureCount = 0;
        this.successCount = 0;
    }
    _close() {
        this.state = "closed";
        this.failureCount = 0;
        this.successCount = 0;
    }
}
