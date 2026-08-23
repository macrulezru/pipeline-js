import { TtlCache } from "../src/http/cache";

describe("TtlCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("get/set", () => {
    it("returns the stored value before ttl expires", () => {
      const cache = new TtlCache<string, number>();
      cache.set("a", 1, 1000);
      expect(cache.get("a")).toBe(1);
    });

    it("returns undefined for a missing key", () => {
      const cache = new TtlCache<string, number>();
      expect(cache.get("missing")).toBeUndefined();
    });

    it("deletes and returns undefined after ttl expires", () => {
      const cache = new TtlCache<string, number>();
      cache.set("a", 1, 1000);
      vi.setSystemTime(1001);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.has("a")).toBe(false);
    });

    it("re-setting the same key updates the value and insertion order", () => {
      const cache = new TtlCache<string, number>(2);
      cache.set("a", 1, 1000);
      cache.set("b", 2, 1000);
      // Update "a" — insertion order is now: b, a
      cache.set("a", 10, 1000);
      // On overflow, "b" (the oldest) should be evicted, not "a"
      cache.set("c", 3, 1000);
      expect(cache.get("a")).toBe(10);
      expect(cache.get("b")).toBeUndefined();
      expect(cache.get("c")).toBe(3);
    });
  });

  describe("eviction (insertion-order LRU) on maxSize overflow", () => {
    it("evicts the oldest entry when maxSize is exceeded", () => {
      const cache = new TtlCache<string, number>(2);
      cache.set("a", 1, 10_000);
      cache.set("b", 2, 10_000);
      cache.set("c", 3, 10_000); // should evict "a"

      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe(2);
      expect(cache.get("c")).toBe(3);
      expect(cache.size).toBe(2);
    });
  });

  describe("has", () => {
    it("true for a fresh entry, false for an expired/missing one", () => {
      const cache = new TtlCache<string, number>();
      cache.set("a", 1, 1000);
      expect(cache.has("a")).toBe(true);
      expect(cache.has("z")).toBe(false);
      vi.setSystemTime(1001);
      expect(cache.has("a")).toBe(false);
    });
  });

  describe("delete / clear / size", () => {
    it("delete removes a specific key", () => {
      const cache = new TtlCache<string, number>();
      cache.set("a", 1, 1000);
      cache.delete("a");
      expect(cache.get("a")).toBeUndefined();
    });

    it("clear removes all entries", () => {
      const cache = new TtlCache<string, number>();
      cache.set("a", 1, 1000);
      cache.set("b", 2, 1000);
      cache.clear();
      expect(cache.size).toBe(0);
    });

    it("size reflects the current number of entries", () => {
      const cache = new TtlCache<string, number>();
      expect(cache.size).toBe(0);
      cache.set("a", 1, 1000);
      cache.set("b", 2, 1000);
      expect(cache.size).toBe(2);
    });
  });

  describe("keys", () => {
    it("returns all keys, including potentially stale ones (not filtered by TTL)", () => {
      const cache = new TtlCache<string, number>();
      cache.set("a", 1, 1000);
      cache.set("b", 2, 1000);
      vi.setSystemTime(1001); // "a" and "b" have expired but are still physically in the Map
      expect([...cache.keys()].sort()).toEqual(["a", "b"]);
    });
  });

  describe("deleteWhere", () => {
    it("deletes only entries for which the predicate returned true, and returns their count", () => {
      const cache = new TtlCache<string, number>();
      cache.set("user:1", 1, 1000);
      cache.set("user:2", 2, 1000);
      cache.set("order:1", 3, 1000);

      const removed = cache.deleteWhere((key) => key.startsWith("user:"));

      expect(removed).toBe(2);
      expect(cache.get("user:1")).toBeUndefined();
      expect(cache.get("user:2")).toBeUndefined();
      expect(cache.get("order:1")).toBe(3);
    });

    it("returns 0 if no key matched", () => {
      const cache = new TtlCache<string, number>();
      cache.set("a", 1, 1000);
      expect(cache.deleteWhere(() => false)).toBe(0);
      expect(cache.size).toBe(1);
    });
  });

  describe("getStale", () => {
    it("returns { isStale: false } for a fresh entry", () => {
      const cache = new TtlCache<string, number>();
      cache.set("a", 1, 1000);
      expect(cache.getStale("a", 5000)).toEqual({ value: 1, isStale: false });
    });

    it("returns undefined for a missing key", () => {
      const cache = new TtlCache<string, number>();
      expect(cache.getStale("missing", 5000)).toBeUndefined();
    });

    it("returns { isStale: true } within the staleMs window after ttl expires", () => {
      const cache = new TtlCache<string, number>();
      cache.set("a", 1, 1000);
      vi.setSystemTime(1500); // ttl expired (1000), but within staleMs=1000
      expect(cache.getStale("a", 1000)).toEqual({ value: 1, isStale: true });
    });

    it("deletes the entry and returns undefined outside the staleMs window", () => {
      const cache = new TtlCache<string, number>();
      cache.set("a", 1, 1000);
      vi.setSystemTime(2001); // ttl (1000) + staleMs (1000) elapsed
      expect(cache.getStale("a", 1000)).toBeUndefined();
      expect(cache.has("a")).toBe(false);
    });

    it("staleMs=0 means \"stale forever\" — the entry stays available indefinitely after ttl expires", () => {
      const cache = new TtlCache<string, number>();
      cache.set("a", 1, 1000);
      vi.setSystemTime(1_000_000); // well after ttl has expired
      expect(cache.getStale("a", 0)).toEqual({ value: 1, isStale: true });
    });
  });
});
