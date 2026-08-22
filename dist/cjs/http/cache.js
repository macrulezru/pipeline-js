"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TtlCache = void 0;
/**
 * A simple TTL cache with a size limit (LRU eviction when maxSize is exceeded)
 * and stale-while-revalidate support via the getStale() method.
 */
class TtlCache {
    constructor(maxSize = 500) {
        this.maxSize = maxSize;
        this.store = new Map();
    }
    set(key, value, ttlMs) {
        // If the key already exists — delete it to refresh insertion order
        if (this.store.has(key)) {
            this.store.delete(key);
        }
        // Evict the oldest entry on overflow
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
     * Returns the value along with an isStale flag.
     * If the entry is fresh — isStale: false.
     * If the entry is stale (TTL expired) but still within staleMs — isStale: true.
     * If the entry is stale and beyond staleMs — deletes it and returns undefined.
     *
     * @param key Cache key
     * @param staleMs Additional time after ttlMs during which the entry is considered stale (0 = indefinitely)
     */
    getStale(key, staleMs) {
        const entry = this.store.get(key);
        if (!entry)
            return undefined;
        const now = Date.now();
        if (now <= entry.expiresAt) {
            return { value: entry.value, isStale: false };
        }
        // The entry is stale. Check staleMs: 0 means "stale indefinitely"
        if (staleMs === 0 || now <= entry.expiresAt + staleMs) {
            return { value: entry.value, isStale: true };
        }
        // Beyond staleMs — delete it
        this.store.delete(key);
        return undefined;
    }
    has(key) {
        return this.get(key) !== undefined;
    }
    delete(key) {
        this.store.delete(key);
    }
    /** Iterator over all cache keys (including potentially stale ones — does not filter by TTL). */
    keys() {
        return this.store.keys();
    }
    /** Deletes all entries for which predicate(key) returned true. Returns the number of deleted entries. */
    deleteWhere(predicate) {
        let count = 0;
        for (const key of [...this.store.keys()]) {
            if (predicate(key)) {
                this.store.delete(key);
                count++;
            }
        }
        return count;
    }
    clear() {
        this.store.clear();
    }
    get size() {
        return this.store.size;
    }
}
exports.TtlCache = TtlCache;
