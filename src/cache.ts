/**
 * Простой TTL-кэш с ограничением размера (LRU-eviction при превышении maxSize)
 * и поддержкой stale-while-revalidate через метод getStale().
 */
export class TtlCache<K, V> {
  private store = new Map<K, { value: V; expiresAt: number }>();

  constructor(private maxSize = 500) {}

  set(key: K, value: V, ttlMs: number): void {
    // Если ключ уже есть — удаляем чтобы обновить порядок вставки
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    // Evict старейшую запись при переполнении
    if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
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
  getStale(
    key: K,
    staleMs: number,
  ): { value: V; isStale: boolean } | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
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

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
