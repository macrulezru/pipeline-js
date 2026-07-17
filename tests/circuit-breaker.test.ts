import { CircuitBreaker, CircuitOpenError } from "../src/circuit-breaker";
import type { CircuitBreakerStore, CircuitBreakerSharedState } from "../src/types";

describe("CircuitOpenError", () => {
  it("имеет code CIRCUIT_OPEN", () => {
    const err = new CircuitOpenError();
    expect(err.code).toBe("CIRCUIT_OPEN");
    expect(err.name).toBe("CircuitOpenError");
  });
});

describe("CircuitBreaker (in-memory, без store)", () => {
  it("начинает в состоянии closed и разрешает выполнение", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, openMs: 1000 });
    expect(await cb.getState()).toBe("closed");
    expect(await cb.canExecute()).toBe(true);
  });

  it("открывается после failureThreshold ошибок подряд", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, openMs: 1000 });
    await cb.onFailure({ message: "err" });
    expect(await cb.getState()).toBe("closed");
    await cb.onFailure({ message: "err" });
    expect(await cb.getState()).toBe("open");
    expect(await cb.canExecute()).toBe(false);
  });

  it("успех сбрасывает счётчик ошибок в closed", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, openMs: 1000 });
    await cb.onFailure({ message: "err" });
    await cb.onSuccess();
    await cb.onFailure({ message: "err" });
    // Счётчик был сброшен успехом — второй failure не должен открыть circuit
    expect(await cb.getState()).toBe("closed");
  });

  it("переходит в half-open после openMs", async () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ failureThreshold: 1, openMs: 1000 });
    await cb.onFailure({ message: "err" });
    expect(await cb.getState()).toBe("open");

    vi.advanceTimersByTime(1001);
    expect(await cb.getState()).toBe("half-open");
    vi.useRealTimers();
  });

  it("successThreshold успехов в half-open закрывает circuit", async () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ failureThreshold: 1, openMs: 1000, successThreshold: 2 });
    await cb.onFailure({ message: "err" });
    vi.advanceTimersByTime(1001);
    expect(await cb.getState()).toBe("half-open");

    await cb.onSuccess();
    expect(await cb.getState()).toBe("half-open");
    await cb.onSuccess();
    expect(await cb.getState()).toBe("closed");
    vi.useRealTimers();
  });

  it("неудача в half-open немедленно возвращает в open", async () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ failureThreshold: 1, openMs: 1000 });
    await cb.onFailure({ message: "err" });
    vi.advanceTimersByTime(1001);
    expect(await cb.getState()).toBe("half-open");

    await cb.onFailure({ message: "err" });
    expect(await cb.getState()).toBe("open");
    vi.useRealTimers();
  });

  it("isFailure исключает указанные ошибки из подсчёта", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      openMs: 1000,
      isFailure: (error) => error.status !== 400,
    });
    await cb.onFailure({ message: "bad request", status: 400 });
    expect(await cb.getState()).toBe("closed");
  });
});

describe("CircuitBreaker with store (distributed)", () => {
  /** In-memory fake standing in for a distributed store (e.g. Redis) in tests. */
  class FakeCircuitBreakerStore implements CircuitBreakerStore {
    states = new Map<string, CircuitBreakerSharedState>();
    setCalls: Array<{ key: string; state: CircuitBreakerSharedState }> = [];

    async get(key: string): Promise<CircuitBreakerSharedState | null> {
      return this.states.get(key) ?? null;
    }
    async set(key: string, state: CircuitBreakerSharedState): Promise<void> {
      this.states.set(key, state);
      this.setCalls.push({ key, state });
    }
  }

  it("читает/пишет состояние через store вместо in-memory полей", async () => {
    const store = new FakeCircuitBreakerStore();
    const cb = new CircuitBreaker({ failureThreshold: 2, openMs: 1000, store, key: "svc-a" });

    expect(await cb.getState()).toBe("closed");
    await cb.onFailure({ message: "err" });
    await cb.onFailure({ message: "err" });

    expect(await cb.getState()).toBe("open");
    expect(store.states.get("svc-a")?.state).toBe("open");
  });

  it("два CircuitBreaker с одним key делят состояние через store (распределённый сценарий)", async () => {
    const store = new FakeCircuitBreakerStore();
    const cbA = new CircuitBreaker({ failureThreshold: 2, openMs: 1000, store, key: "shared" });
    const cbB = new CircuitBreaker({ failureThreshold: 2, openMs: 1000, store, key: "shared" });

    await cbA.onFailure({ message: "err" });
    // Второй инстанс "видит" сбой первого через общий store
    await cbB.onFailure({ message: "err" });

    expect(await cbA.getState()).toBe("open");
    expect(await cbB.getState()).toBe("open");
  });

  it("без явного key каждый инстанс получает собственный ключ (не делят состояние)", async () => {
    const store = new FakeCircuitBreakerStore();
    const cbA = new CircuitBreaker({ failureThreshold: 1, openMs: 1000, store });
    const cbB = new CircuitBreaker({ failureThreshold: 1, openMs: 1000, store });

    await cbA.onFailure({ message: "err" });
    expect(await cbA.getState()).toBe("open");
    expect(await cbB.getState()).toBe("closed");
  });

  it("использует store.incrementCounter(), если он реализован, вместо get+set", async () => {
    const store = new FakeCircuitBreakerStore();
    let incrementCalls = 0;
    (store as CircuitBreakerStore).incrementCounter = async (key, field) => {
      incrementCalls++;
      const current = store.states.get(key) ?? { state: "closed", failureCount: 0, successCount: 0, openedAt: 0 };
      const next = { ...current, [field]: current[field] + 1 };
      store.states.set(key, next);
      return next[field];
    };

    const cb = new CircuitBreaker({ failureThreshold: 2, openMs: 1000, store, key: "svc-b" });
    await cb.onFailure({ message: "err" });
    expect(incrementCalls).toBe(1);
    await cb.onFailure({ message: "err" });
    expect(incrementCalls).toBe(2);
    expect(await cb.getState()).toBe("open");
  });

  it("переход open → half-open по таймауту сохраняется в store", async () => {
    vi.useFakeTimers();
    const store = new FakeCircuitBreakerStore();
    const cb = new CircuitBreaker({ failureThreshold: 1, openMs: 1000, store, key: "svc-c" });

    await cb.onFailure({ message: "err" });
    expect(await cb.getState()).toBe("open");

    vi.advanceTimersByTime(1001);
    expect(await cb.getState()).toBe("half-open");
    expect(store.states.get("svc-c")?.state).toBe("half-open");

    vi.useRealTimers();
  });
});
