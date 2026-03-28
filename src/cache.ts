/**
 * Простой TTL-кэш с ограничением размера (LRU-eviction при превышении maxSize)
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
