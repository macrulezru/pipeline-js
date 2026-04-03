/**
 * Простой TTL-кэш с ограничением размера (LRU-eviction при превышении maxSize)
 * и поддержкой stale-while-revalidate через метод getStale().
 */
export declare class TtlCache<K, V> {
    private maxSize;
    private store;
    constructor(maxSize?: number);
    set(key: K, value: V, ttlMs: number): void;
    get(key: K): V | undefined;
    /**
     * Возвращает значение с флагом isStale.
     * Если запись свежая — isStale: false.
     * Если запись устарела (TTL истёк), но находится в пределах staleMs — isStale: true.
     * Если запись устарела и за пределами staleMs — удаляет и возвращает undefined.
     *
     * @param key Ключ кэша
     * @param staleMs Дополнительное время после ttlMs, в течение которого запись считается stale (0 = бессрочно)
     */
    getStale(key: K, staleMs: number): {
        value: V;
        isStale: boolean;
    } | undefined;
    has(key: K): boolean;
    delete(key: K): void;
    clear(): void;
    get size(): number;
}
