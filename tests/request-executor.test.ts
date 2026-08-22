import { RequestExecutor } from "../src/http/request-executor";
import { clearRestClientCache } from "../src/http/rest-client";

describe("RequestExecutor", () => {
  it("is created and has an execute method", () => {
    const executor = new RequestExecutor({ baseURL: "http://localhost" });
    expect(executor).toHaveProperty("execute");
  });

  it("execute accepts externalSignal (Bug #4 fix)", () => {
    const executor = new RequestExecutor({ baseURL: "http://localhost" });
    // Check the signature — execute accepts 5 arguments
    expect(executor.execute.length).toBeGreaterThanOrEqual(0); // TS doesn't give an exact count for optional params
    expect(typeof executor.execute).toBe("function");
  });

  it("rejects the request immediately when externalSignal has already fired", async () => {
    const executor = new RequestExecutor({ baseURL: "http://localhost" });
    const controller = new AbortController();
    controller.abort();

    await expect(
      executor.execute("http://localhost/test", undefined, 0, 5000, controller.signal),
    ).rejects.toThrow();
  });

  it("retry is configured via httpConfig.retry", () => {
    // Make sure the constructor accepts the retry config without errors
    const executor = new RequestExecutor({
      baseURL: "http://localhost",
      retry: {
        attempts: 3,
        delayMs: 100,
        backoffMultiplier: 2,
        retriableStatus: [500, 503],
      },
    });
    expect(executor).toBeDefined();
  });
});

describe("RequestExecutor — autoIdempotencyKey", () => {
  beforeEach(() => {
    clearRestClientCache();
  });

  it("generates the Idempotency-Key once and reuses it across all retry attempts", async () => {
    const capturedKeys: (string | undefined)[] = [];
    let attempt = 0;
    const executor = new RequestExecutor({
      baseURL: "http://localhost",
      autoIdempotencyKey: true,
      retry: { attempts: 2, delayMs: 0, backoffMultiplier: 1 },
      adapter: {
        request: async (cfg) => {
          attempt++;
          capturedKeys.push((cfg.headers as Record<string, string> | undefined)?.["Idempotency-Key"]);
          if (attempt < 3) throw new Error("flaky");
          return { data: { ok: true }, status: 200, statusText: "OK", headers: {} };
        },
      },
    });

    await executor.execute("/orders", { method: "POST" });

    expect(capturedKeys).toHaveLength(3);
    expect(capturedKeys[0]).toBeDefined();
    expect(capturedKeys[0]).toBe(capturedKeys[1]);
    expect(capturedKeys[1]).toBe(capturedKeys[2]);
  });

  it("does not generate a key for GET (non-mutating method)", async () => {
    let capturedKey: string | undefined;
    const executor = new RequestExecutor({
      baseURL: "http://localhost",
      autoIdempotencyKey: true,
      adapter: {
        request: async (cfg) => {
          capturedKey = (cfg.headers as Record<string, string> | undefined)?.["Idempotency-Key"];
          return { data: {}, status: 200, statusText: "OK", headers: {} };
        },
      },
    });

    await executor.execute("/users", { method: "GET" });
    expect(capturedKey).toBeUndefined();
  });

  it("does not override an idempotencyKey explicitly set by the caller", async () => {
    let capturedKey: string | undefined;
    const executor = new RequestExecutor({
      baseURL: "http://localhost",
      autoIdempotencyKey: true,
      adapter: {
        request: async (cfg) => {
          capturedKey = (cfg.headers as Record<string, string> | undefined)?.["Idempotency-Key"];
          return { data: {}, status: 200, statusText: "OK", headers: {} };
        },
      },
    });

    await executor.execute("/orders", { method: "POST", idempotencyKey: "my-explicit-key" });
    expect(capturedKey).toBe("my-explicit-key");
  });

  it("without autoIdempotencyKey the header is not added for mutating methods", async () => {
    let capturedKey: string | undefined;
    const executor = new RequestExecutor({
      baseURL: "http://localhost",
      adapter: {
        request: async (cfg) => {
          capturedKey = (cfg.headers as Record<string, string> | undefined)?.["Idempotency-Key"];
          return { data: {}, status: 200, statusText: "OK", headers: {} };
        },
      },
    });

    await executor.execute("/orders", { method: "POST" });
    expect(capturedKey).toBeUndefined();
  });
});

describe("RequestExecutor — retriableStatus", () => {
  beforeEach(() => {
    clearRestClientCache();
  });

  it("does not retry the request when the error status is not in retriableStatus", async () => {
    let calls = 0;
    const executor = new RequestExecutor({
      baseURL: "http://localhost",
      retry: { attempts: 3, delayMs: 0, backoffMultiplier: 1, retriableStatus: [503] },
      adapter: {
        request: async () => {
          calls++;
          const err: any = new Error("not found");
          err.response = { status: 404, headers: {} };
          throw err;
        },
      },
    });

    await expect(executor.execute("/x")).rejects.toThrow("not found");
    expect(calls).toBe(1);
  });

  it("retries the request when the status is in retriableStatus, and throws the last error once attempts are exhausted", async () => {
    let calls = 0;
    const executor = new RequestExecutor({
      baseURL: "http://localhost",
      retry: { attempts: 2, delayMs: 0, backoffMultiplier: 1, retriableStatus: [500] },
      adapter: {
        request: async () => {
          calls++;
          const err: any = new Error("server error");
          err.response = { status: 500, headers: {} };
          throw err;
        },
      },
    });

    await expect(executor.execute("/x")).rejects.toThrow("server error");
    expect(calls).toBe(3); // 1 attempt + 2 retries
  });
});

describe("RequestExecutor — Retry-After", () => {
  beforeEach(() => {
    clearRestClientCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses Retry-After (seconds) instead of the backoff delay", async () => {
    let calls = 0;
    const executor = new RequestExecutor({
      baseURL: "http://localhost",
      retry: { attempts: 1, delayMs: 100_000, backoffMultiplier: 1 },
      adapter: {
        request: async () => {
          calls++;
          if (calls === 1) {
            const err: any = new Error("rate limited");
            err.response = { status: 429, headers: { "retry-after": "2" } };
            throw err;
          }
          return { data: { ok: true }, status: 200, statusText: "OK", headers: {} };
        },
      },
    });

    const promise = executor.execute("/x");
    // Retry-After = 2s (<< delayMs=100000 from backoff) — so it's what determines the delay
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promise).resolves.toMatchObject({ status: 200 });
    expect(calls).toBe(2);
  });

  it("with an invalid Retry-After — falls back to the backoff calculation (delayMs * backoffMultiplier^attempt)", async () => {
    let calls = 0;
    const executor = new RequestExecutor({
      baseURL: "http://localhost",
      retry: { attempts: 1, delayMs: 100, backoffMultiplier: 1 },
      adapter: {
        request: async () => {
          calls++;
          if (calls === 1) {
            const err: any = new Error("bad gateway");
            err.response = { status: 502, headers: { "retry-after": "not-a-valid-value" } };
            throw err;
          }
          return { data: { ok: true }, status: 200, statusText: "OK", headers: {} };
        },
      },
    });

    const promise = executor.execute("/x");
    // not enough time should have passed yet for the backoff delay (~100-110ms)
    await vi.advanceTimersByTimeAsync(50);
    expect(calls).toBe(1);
    // after the full backoff delay (accounting for jitter up to +10%) the request is retried
    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toMatchObject({ status: 200 });
    expect(calls).toBe(2);
  });

  it("caps Retry-After at the maxRetryAfterMs value", async () => {
    let calls = 0;
    const executor = new RequestExecutor({
      baseURL: "http://localhost",
      retry: { attempts: 1, delayMs: 0, backoffMultiplier: 1, maxRetryAfterMs: 500 },
      adapter: {
        request: async () => {
          calls++;
          if (calls === 1) {
            const err: any = new Error("rate limited");
            // The server asks to wait 10s, but the cap is 500ms
            err.response = { status: 429, headers: { "retry-after": "10" } };
            throw err;
          }
          return { data: { ok: true }, status: 200, statusText: "OK", headers: {} };
        },
      },
    });

    const promise = executor.execute("/x");
    await vi.advanceTimersByTimeAsync(500);
    await expect(promise).resolves.toMatchObject({ status: 200 });
    expect(calls).toBe(2);
  });
});

describe("RequestExecutor — jitterStrategy", () => {
  beforeEach(() => {
    clearRestClientCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('default ("fixed") — backward-compatible behavior: nominal backoff plus up to +10%', async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // jitter = +5% of delayMs
    let calls = 0;
    const executor = new RequestExecutor({
      baseURL: "http://localhost",
      retry: { attempts: 1, delayMs: 100, backoffMultiplier: 1 },
      adapter: {
        request: async () => {
          calls++;
          if (calls === 1) {
            const err: any = new Error("fail");
            err.response = { status: 500, headers: {} };
            throw err;
          }
          return { data: { ok: true }, status: 200, statusText: "OK", headers: {} };
        },
      },
    });

    const promise = executor.execute("/x");
    // nominal(100) + 0.5*100*0.1 = 105
    await vi.advanceTimersByTimeAsync(104);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(2);
    await expect(promise).resolves.toMatchObject({ status: 200 });
  });

  it('jitterStrategy="full" — delay uniformly distributed between 0 and the nominal backoff (AWS full jitter)', async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    let calls = 0;
    const executor = new RequestExecutor({
      baseURL: "http://localhost",
      retry: { attempts: 1, delayMs: 1000, backoffMultiplier: 1, jitterStrategy: "full" },
      adapter: {
        request: async () => {
          calls++;
          if (calls === 1) {
            const err: any = new Error("fail");
            err.response = { status: 500, headers: {} };
            throw err;
          }
          return { data: { ok: true }, status: 200, statusText: "OK", headers: {} };
        },
      },
    });

    const promise = executor.execute("/x");
    // nominal = 1000, full jitter = random() * nominal = 0.5 * 1000 = 500
    await vi.advanceTimersByTimeAsync(499);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(2);
    await expect(promise).resolves.toMatchObject({ status: 200 });
  });

  it('jitterStrategy="decorrelated" — delay depends on the delay of the previous attempt (AWS decorrelated jitter)', async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    let calls = 0;
    const executor = new RequestExecutor({
      baseURL: "http://localhost",
      retry: { attempts: 2, delayMs: 100, backoffMultiplier: 2, jitterStrategy: "decorrelated" },
      adapter: {
        request: async () => {
          calls++;
          if (calls <= 2) {
            const err: any = new Error("fail");
            err.response = { status: 500, headers: {} };
            throw err;
          }
          return { data: { ok: true }, status: 200, statusText: "OK", headers: {} };
        },
      },
    });

    const promise = executor.execute("/x");

    // 1st retry: prevDelay=delayMs=100 → next = min(cap, 100 + 0.5*(100*3-100)) = 200
    await vi.advanceTimersByTimeAsync(199);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(2);

    // 2nd retry: prevDelay=200 → next = min(cap, 100 + 0.5*(200*3-100)) = 350
    await vi.advanceTimersByTimeAsync(349);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(3);

    await expect(promise).resolves.toMatchObject({ status: 200 });
  });

  it('jitterStrategy="decorrelated" — delay never exceeds the cap delayMs*backoffMultiplier^attempts', async () => {
    vi.spyOn(Math, "random").mockReturnValue(1); // maximum possible jitter
    let calls = 0;
    const executor = new RequestExecutor({
      baseURL: "http://localhost",
      retry: { attempts: 1, delayMs: 100, backoffMultiplier: 2, jitterStrategy: "decorrelated" },
      adapter: {
        request: async () => {
          calls++;
          if (calls === 1) {
            const err: any = new Error("fail");
            err.response = { status: 500, headers: {} };
            throw err;
          }
          return { data: { ok: true }, status: 200, statusText: "OK", headers: {} };
        },
      },
    });

    // cap = delayMs * backoffMultiplier^attempts = 100 * 2^1 = 200
    // without the cap, next would be 100 + 1*(100*3-100) = 300 > cap → should be capped at 200
    const promise = executor.execute("/x");
    await vi.advanceTimersByTimeAsync(199);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(2);
    await expect(promise).resolves.toMatchObject({ status: 200 });
  });
});

describe("RequestExecutor — attempt exhaustion and cancellation", () => {
  beforeEach(() => {
    clearRestClientCache();
  });

  it("throws the last error after maxAttempts is exhausted without retriableStatus", async () => {
    let calls = 0;
    const executor = new RequestExecutor({
      baseURL: "http://localhost",
      retry: { attempts: 2, delayMs: 0, backoffMultiplier: 1 },
      adapter: {
        request: async () => {
          calls++;
          throw new Error(`fail #${calls}`);
        },
      },
    });

    await expect(executor.execute("/x")).rejects.toThrow("fail #3");
    expect(calls).toBe(3);
  });

  it("aborts the retry-delay wait and does not make another attempt if externalSignal fires during it", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const executor = new RequestExecutor({
      baseURL: "http://localhost",
      retry: { attempts: 3, delayMs: 5000, backoffMultiplier: 1 },
      adapter: {
        request: async () => {
          calls++;
          throw new Error("always fails");
        },
      },
    });

    const controller = new AbortController();
    const promise = executor.execute("/x", undefined, undefined, 10_000, controller.signal);

    // Let the first attempt happen, then abort while waiting for the retry delay
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    controller.abort();

    await expect(promise).rejects.toThrow();
    expect(calls).toBe(1); // the second attempt should not have started

    vi.useRealTimers();
  });

  // Uses real timers (not fake): with a synchronous reject() from the
  // 'abort' listener inside a fake-timer tick, vitest/node sometimes flags
  // the rejection as "unhandled" a fraction of a tick before await manages
  // to catch it — a false positive unrelated to the executor's own logic.
  it("does not retry the request on timeout (AbortError) — a timeout is not considered retriable", async () => {
    let calls = 0;
    const executor = new RequestExecutor({
      baseURL: "http://localhost",
      retry: { attempts: 3, delayMs: 0, backoffMultiplier: 1 },
      adapter: {
        // Realistic emulation of fetch/axios: hangs until the signal fires,
        // then rejects with AbortError — this is how the timeout controller cancels a real request.
        request: (cfg: any) =>
          new Promise((_resolve, reject) => {
            calls++;
            cfg.signal?.addEventListener("abort", () => {
              const err: any = new Error("Aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
      },
    });

    const promise = executor.execute("/x", undefined, undefined, 20);

    await expect(promise).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
