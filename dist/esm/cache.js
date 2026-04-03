/**
 * Простой TTL-кэш с ограничением размера (LRU-eviction при превышении maxSize)
 * и поддержкой stale-while-revalidate через метод getStale().
 */
export class TtlCache {
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
    /**
     * Возвращает значение с флагом isStale.
     * Если запись свежая — isStale: false.
     * Если запись устарела (TTL истёк), но находится в пределах staleMs — isStale: true.
     * Если запись устарела и за пределами staleMs — удаляет и возвращает undefined.
     *
     * @param key Ключ кэша
     * @param staleMs Дополнительное время после ttlMs, в течение которого запись считается stale (0 = бессрочно)
     */
    getStale(key, staleMs) {
        const entry = this.store.get(key);
        if (!entry)
            return undefined;
        const now = Date.now();
        if (now <= entry.expiresAt) {
            return { value: entry.value, isStale: false };
        }
        // Запись устарела. Проверяем staleMs: 0 означает "бессрочно stale"
        if (staleMs === 0 || now <= entry.expiresAt + staleMs) {
            return { value: entry.value, isStale: true };
        }
        // За пределами staleMs — удаляем
        this.store.delete(key);
        return undefined;
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
