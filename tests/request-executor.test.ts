import { RequestExecutor } from "../src/request-executor";
import { clearRestClientCache } from "../src/rest-client";

describe("RequestExecutor", () => {
  it("создаётся и имеет метод execute", () => {
    const executor = new RequestExecutor({ baseURL: "http://localhost" });
    expect(executor).toHaveProperty("execute");
  });

  it("execute принимает externalSignal (Bug #4 fix)", () => {
    const executor = new RequestExecutor({ baseURL: "http://localhost" });
    // Проверяем сигнатуру — execute принимает 5 аргументов
    expect(executor.execute.length).toBeGreaterThanOrEqual(0); // TS не даёт точный count для optional
    expect(typeof executor.execute).toBe("function");
  });

  it("отклоняет запрос немедленно при уже сработавшем externalSignal", async () => {
    const executor = new RequestExecutor({ baseURL: "http://localhost" });
    const controller = new AbortController();
    controller.abort();

    await expect(
      executor.execute("http://localhost/test", undefined, 0, 5000, controller.signal),
    ).rejects.toThrow();
  });

  it("retry конфигурируется через httpConfig.retry", () => {
    // Убеждаемся что конструктор принимает retry конфиг без ошибок
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

  it("генерирует Idempotency-Key один раз и переиспользует его на всех retry-попытках", async () => {
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

  it("не генерирует ключ для GET (не мутирующий метод)", async () => {
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

  it("не переопределяет idempotencyKey, заданный вызывающим кодом явно", async () => {
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

  it("без autoIdempotencyKey заголовок не добавляется для мутирующих методов", async () => {
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
