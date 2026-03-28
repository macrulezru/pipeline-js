/**
 * Простой TTL-кэш с ограничением размера (LRU-eviction при превышении maxSize)
 */
export declare class TtlCache<K, V> {
    private maxSize;
    private store;
    constructor(maxSize?: number);
    set(key: K, value: V, ttlMs: number): void;
    get(key: K): V | undefined;
    has(key: K): boolean;
    delete(key: K): void;
    clear(): void;
    get size(): number;
}
