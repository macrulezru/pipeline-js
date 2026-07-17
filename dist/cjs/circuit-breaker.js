"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreaker = exports.CircuitOpenError = void 0;
/** Safety-net TTL for store-backed state so an abandoned key doesn't linger forever in Redis etc. */
const STORE_STATE_TTL_MS = 24 * 60 * 60 * 1000;
/** Ошибка, бросаемая вместо реального запроса, когда circuit breaker открыт. */
class CircuitOpenError extends Error {
    constructor() {
        super("Circuit breaker is open — request rejected without calling the network");
        this.code = "CIRCUIT_OPEN";
        this.name = "CircuitOpenError";
    }
}
exports.CircuitOpenError = CircuitOpenError;
function initialState() {
    return { state: "closed", failureCount: 0, successCount: 0, openedAt: 0 };
}
function generateKey() {
    var _a;
    const g = globalThis;
    if ((_a = g.crypto) === null || _a === void 0 ? void 0 : _a.randomUUID)
        return `circuit-breaker-${g.crypto.randomUUID()}`;
    return `circuit-breaker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
class CircuitBreaker {
    constructor(config) {
        var _a;
        this.config = config;
        // --- In-memory путь (используется, если config.store не задан) ---
        this.state = "closed";
        this.failureCount = 0;
        this.successCount = 0;
        this.openedAt = 0;
        this.key = (_a = config.key) !== null && _a !== void 0 ? _a : generateKey();
    }
    /** Текущее состояние (учитывает автоматический переход open → half-open по таймауту). */
    async getState() {
        if (this.config.store) {
            const shared = await this._readShared();
            return shared.state;
        }
        this._maybeTransitionToHalfOpen();
        return this.state;
    }
    /** Можно ли выполнить запрос сейчас (false, если circuit открыт). */
    async canExecute() {
        const state = await this.getState();
        return state !== "open";
    }
    /** Зарегистрировать успешный запрос. */
    async onSuccess() {
        var _a, _b;
        if (this.config.store) {
            const shared = await this._readShared();
            if (shared.state === "half-open") {
                const needed = (_a = this.config.successThreshold) !== null && _a !== void 0 ? _a : 1;
                const successCount = await this._incrementShared(shared, "successCount");
                if (successCount >= needed) {
                    await this._writeShared({ ...shared, state: "closed", failureCount: 0, successCount: 0 });
                }
            }
            else if (shared.failureCount !== 0) {
                await this._writeShared({ ...shared, failureCount: 0 });
            }
            return;
        }
        if (this.state === "half-open") {
            this.successCount++;
            const needed = (_b = this.config.successThreshold) !== null && _b !== void 0 ? _b : 1;
            if (this.successCount >= needed) {
                this._close();
            }
        }
        else {
            this.failureCount = 0;
        }
    }
    /** Зарегистрировать неудачный запрос (error уже приведена к ApiError). */
    async onFailure(error) {
        if (this.config.isFailure && !this.config.isFailure(error))
            return;
        if (this.config.store) {
            const shared = await this._readShared();
            if (shared.state === "half-open") {
                await this._writeShared({ ...shared, state: "open", openedAt: Date.now(), failureCount: 0, successCount: 0 });
                return;
            }
            const failureCount = await this._incrementShared(shared, "failureCount");
            if (failureCount >= this.config.failureThreshold) {
                await this._writeShared({ ...shared, state: "open", openedAt: Date.now(), failureCount: 0, successCount: 0 });
            }
            return;
        }
        if (this.state === "half-open") {
            this._open();
            return;
        }
        this.failureCount++;
        if (this.failureCount >= this.config.failureThreshold) {
            this._open();
        }
    }
    // ── Store-backed helpers ──────────────────────────────────────────────
    /** Reads shared state, applying the open→half-open timeout transition (and persisting it) if due. */
    async _readShared() {
        var _a;
        const store = this.config.store;
        const current = (_a = (await store.get(this.key))) !== null && _a !== void 0 ? _a : initialState();
        if (current.state === "open" && Date.now() - current.openedAt >= this.config.openMs) {
            const transitioned = { ...current, state: "half-open", successCount: 0 };
            await store.set(this.key, transitioned, STORE_STATE_TTL_MS);
            return transitioned;
        }
        return current;
    }
    async _writeShared(state) {
        await this.config.store.set(this.key, state, STORE_STATE_TTL_MS);
    }
    /** Increments `field` either atomically (if the store supports it) or via read-modify-write. */
    async _incrementShared(current, field) {
        const store = this.config.store;
        if (store.incrementCounter) {
            return store.incrementCounter(this.key, field, STORE_STATE_TTL_MS);
        }
        const next = current[field] + 1;
        await this._writeShared({ ...current, [field]: next });
        return next;
    }
    // ── In-memory путь ────────────────────────────────────────────────────
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
exports.CircuitBreaker = CircuitBreaker;
