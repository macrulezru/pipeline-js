/**
 * A simple TTL cache with a size limit (LRU eviction when maxSize is exceeded)
 * and stale-while-revalidate support via the getStale() method.
 */
export declare class TtlCache<K, V> {
    private maxSize;
    private store;
    constructor(maxSize?: number);
    set(key: K, value: V, ttlMs: number): void;
    get(key: K): V | undefined;
    /**
     * Returns the value along with an isStale flag.
     * If the entry is fresh — isStale: false.
     * If the entry is stale (TTL expired) but still within staleMs — isStale: true.
     * If the entry is stale and beyond staleMs — deletes it and returns undefined.
     *
     * @param key Cache key
     * @param staleMs Additional time after ttlMs during which the entry is considered stale (0 = indefinitely)
     */
    getStale(key: K, staleMs: number): {
        value: V;
        isStale: boolean;
    } | undefined;
    has(key: K): boolean;
    delete(key: K): void;
    /** Iterator over all cache keys (including potentially stale ones — does not filter by TTL). */
    keys(): IterableIterator<K>;
    /** Deletes all entries for which predicate(key) returned true. Returns the number of deleted entries. */
    deleteWhere(predicate: (key: K) => boolean): number;
    clear(): void;
    get size(): number;
}
