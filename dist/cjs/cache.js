"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TtlCache = void 0;
/**
 * Простой TTL-кэш с ограничением размера (LRU-eviction при превышении maxSize)
 */
class TtlCache {
    constructor(maxSize = 500) {
        this.maxSize = maxSize;
        this.store = new Map();
    }
    set(key, value, ttlMs) {
        // Если ключ уже есть — удаляем чтобы обновить порядок вставки
        if (this.store.has(key)) {
            this.store.delete(key);
        }
        // Evict старейшую запись при переполнении
        if (this.store.size >= this.maxSize) {
            const oldestKey = this.store.keys().next().value;
            if (oldestKey !== undefined)
                this.store.delete(oldestKey);
        }
        this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    }
    get(key) {
        const entry = this.store.get(key);
        if (!entry)
            return undefined;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        return entry.value;
    }
    has(key) {
        return this.get(key) !== undefined;
    }
    delete(key) {
        this.store.delete(key);
    }
    clear() {
        this.store.clear();
    }
    get size() {
        return this.store.size;
    }
}
exports.TtlCache = TtlCache;
