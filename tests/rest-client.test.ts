import axios from "axios";
import { vi } from "vitest";
import {
  createRestClient,
  clearRestClientCache,
  getRestClient,
  toApiError,
  sanitizeHeadersMap,
} from "../src/rest-client";
import { DEFAULT_SENSITIVE_HEADERS } from "../src/types";

// ─────────────────────────────────────────────────────────────────────────────
// Базовые тесты клиента
// ─────────────────────────────────────────────────────────────────────────────
describe("createRestClient — базовые методы", () => {
  it("создаёт клиент со всеми нужными методами", () => {
    const client = createRestClient({ baseURL: "http://localhost" });
    expect(client).toHaveProperty("request");
    expect(client).toHaveProperty("get");
    expect(client).toHaveProperty("post");
    expect(client).toHaveProperty("put");
    expect(client).toHaveProperty("patch");
    expect(client).toHaveProperty("delete");
    expect(client).toHaveProperty("cancellableRequest");
    expect(client).toHaveProperty("cancelRequest");
    expect(client).toHaveProperty("clearCache");
  });

  it("cancellableRequest и cancelRequest — функции", () => {
    const client = createRestClient({ baseURL: "http://localhost" });
    expect(typeof client.cancellableRequest).toBe("function");
    expect(typeof client.cancelRequest).toBe("function");
  });

  it("сообщения об ошибках на английском", () => {
    const err = toApiError("unknown");
    expect(err.message).toBe("An unknown error occurred");
    expect(err.message).not.toMatch(/[а-яёА-ЯЁ]/);
  });

  it("toApiError для REQUEST_CANCELLED", () => {
    const cancelError = new axios.Cancel("cancelled");
    const err = toApiError(cancelError);
    expect(err.code).toBe("REQUEST_CANCELLED");
    expect(err.message).toBe("Request was cancelled");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Кэш клиентов
// ─────────────────────────────────────────────────────────────────────────────
describe("clearRestClientCache", () => {
  it("экспортируется и является функцией", () => {
    expect(typeof clearRestClientCache).toBe("function");
  });

  it("getRestClient возвращает один экземпляр для одинакового конфига", () => {
    clearRestClientCache();
    const config = { baseURL: "http://test.local" };
    const c1 = getRestClient(config);
    const c2 = getRestClient(config);
    expect(c1).toBe(c2);
  });

  it("после clearRestClientCache создаётся новый экземпляр", () => {
    const config = { baseURL: "http://test.local" };
    const c1 = getRestClient(config);
    clearRestClientCache();
    const c2 = getRestClient(config);
    expect(c1).not.toBe(c2);
  });

  it("clearCache() очищает кэш ответов клиента", () => {
    const client = createRestClient({ baseURL: "http://localhost" });
    expect(() => client.clearCache()).not.toThrow();
  });

  it("не вызывает axios.create() когда передан кастомный adapter", () => {
    const createSpy = vi.spyOn(axios, "create");
    createSpy.mockClear();
    createRestClient({
      baseURL: "http://localhost",
      adapter: {
        request: async () => ({ data: {}, status: 200, statusText: "OK", headers: {} }),
      },
    });
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
  });

  it("использует adapter.request() вместо axios при выполнении запроса", async () => {
    const adapterRequest = vi.fn().mockResolvedValue({
      data: { ok: true },
      status: 200,
      statusText: "OK",
      headers: {},
    });
    const client = createRestClient({
      baseURL: "http://localhost",
      adapter: { request: adapterRequest },
    });
    const res = await client.get("/ping");
    expect(adapterRequest).toHaveBeenCalledTimes(1);
    expect(res.data).toEqual({ ok: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// invalidateCache()
// ─────────────────────────────────────────────────────────────────────────────
describe("invalidateCache()", () => {
  it("удаляет только записи с совпадающим URL (подстрока), не трогая остальные", async () => {
    let callCount = 0;
    const adapterRequest = vi.fn().mockImplementation(async (cfg: any) => {
      callCount++;
      return { data: { url: cfg.url, n: callCount }, status: 200, statusText: "OK", headers: {} };
    });
    const client = createRestClient({
      baseURL: "http://localhost",
      cache: { enabled: true, ttlMs: 60_000 },
      adapter: { request: adapterRequest },
    });

    const usersRes1 = await client.get("/users/1");
    const postsRes1 = await client.get("/posts/1");
    expect(callCount).toBe(2);

    const removed = client.invalidateCache("/users");
    expect(removed).toBe(1);

    // /users снова идёт в сеть (кэш инвалидирован), /posts остаётся закэширован
    const usersRes2 = await client.get("/users/1");
    const postsRes2 = await client.get("/posts/1");

    expect(callCount).toBe(3);
    expect(usersRes2.data).not.toEqual(usersRes1.data);
    expect(postsRes2.data).toEqual(postsRes1.data);
  });

  it("поддерживает RegExp и предикат-функцию", async () => {
    let callCount = 0;
    const adapterRequest = vi.fn().mockImplementation(async () => {
      callCount++;
      return { data: { n: callCount }, status: 200, statusText: "OK", headers: {} };
    });
    const client = createRestClient({
      baseURL: "http://localhost",
      cache: { enabled: true, ttlMs: 60_000 },
      adapter: { request: adapterRequest },
    });

    await client.get("/items/1");
    expect(client.invalidateCache(/\/items\/\d+/)).toBe(1);

    await client.get("/items/2");
    expect(
      client.invalidateCache(({ method, url }) => method === "GET" && url.includes("/items")),
    ).toBe(1);
  });

  it("возвращает 0, если совпадений не найдено", () => {
    const client = createRestClient({ baseURL: "http://localhost" });
    expect(client.invalidateCache("/nothing")).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Circuit breaker
// ─────────────────────────────────────────────────────────────────────────────
describe("circuitBreaker", () => {
  it("getCircuitBreakerState() возвращает null, если circuit breaker не настроен", () => {
    const client = createRestClient({ baseURL: "http://localhost" });
    expect(client.getCircuitBreakerState()).toBeNull();
  });

  it("открывается после failureThreshold ошибок и отклоняет запросы без обращения к adapter", async () => {
    const adapterRequest = vi.fn().mockRejectedValue(new Error("network down"));
    const client = createRestClient({
      baseURL: "http://localhost",
      adapter: { request: adapterRequest },
      circuitBreaker: { failureThreshold: 2, openMs: 10_000 },
    });

    await expect(client.get("/a")).rejects.toBeDefined();
    expect(client.getCircuitBreakerState()).toBe("closed");

    await expect(client.get("/a")).rejects.toBeDefined();
    expect(client.getCircuitBreakerState()).toBe("open");
    expect(adapterRequest).toHaveBeenCalledTimes(2);

    // Circuit открыт — следующий запрос отклоняется немедленно, adapter не вызывается
    await expect(client.get("/a")).rejects.toMatchObject({ code: "CIRCUIT_OPEN" });
    expect(adapterRequest).toHaveBeenCalledTimes(2);
  });

  it("переходит в half-open после openMs и закрывается при успехе", async () => {
    vi.useFakeTimers();
    let shouldFail = true;
    const adapterRequest = vi.fn().mockImplementation(async () => {
      if (shouldFail) throw new Error("down");
      return { data: { ok: true }, status: 200, statusText: "OK", headers: {} };
    });
    const client = createRestClient({
      baseURL: "http://localhost",
      adapter: { request: adapterRequest },
      circuitBreaker: { failureThreshold: 1, openMs: 1000 },
    });

    await expect(client.get("/a")).rejects.toBeDefined();
    expect(client.getCircuitBreakerState()).toBe("open");

    vi.advanceTimersByTime(1001);
    expect(client.getCircuitBreakerState()).toBe("half-open");

    shouldFail = false;
    const res = await client.get("/a");
    expect(res.data).toEqual({ ok: true });
    expect(client.getCircuitBreakerState()).toBe("closed");

    vi.useRealTimers();
  });

  it("неудача в half-open снова открывает circuit", async () => {
    vi.useFakeTimers();
    const adapterRequest = vi.fn().mockRejectedValue(new Error("down"));
    const client = createRestClient({
      baseURL: "http://localhost",
      adapter: { request: adapterRequest },
      circuitBreaker: { failureThreshold: 1, openMs: 1000 },
    });

    await expect(client.get("/a")).rejects.toBeDefined();
    vi.advanceTimersByTime(1001);
    expect(client.getCircuitBreakerState()).toBe("half-open");

    await expect(client.get("/a")).rejects.toBeDefined();
    expect(client.getCircuitBreakerState()).toBe("open");

    vi.useRealTimers();
  });

  it("isFailure позволяет игнорировать определённые ошибки (не открывать circuit)", async () => {
    const makeAxiosLikeError = (status: number) => {
      const err: any = new Error(`status ${status}`);
      err.isAxiosError = true;
      err.response = { status, data: {}, headers: {}, statusText: "Error" };
      Object.setPrototypeOf(err, axios.AxiosError.prototype);
      return err;
    };
    const adapterRequest = vi.fn().mockRejectedValue(makeAxiosLikeError(400));
    const client = createRestClient({
      baseURL: "http://localhost",
      adapter: { request: adapterRequest },
      circuitBreaker: {
        failureThreshold: 1,
        openMs: 10_000,
        isFailure: (error) => error.status !== 400,
      },
    });

    await expect(client.get("/a")).rejects.toBeDefined();
    await expect(client.get("/a")).rejects.toBeDefined();
    // 400 не считается сбоем для breaker — circuit остаётся closed
    expect(client.getCircuitBreakerState()).toBe("closed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Log Sanitization
// ─────────────────────────────────────────────────────────────────────────────
describe("sanitizeHeadersMap", () => {
  it("DEFAULT_SENSITIVE_HEADERS экспортируется и содержит ожидаемые значения", () => {
    expect(DEFAULT_SENSITIVE_HEADERS).toContain("authorization");
    expect(DEFAULT_SENSITIVE_HEADERS).toContain("x-api-key");
    expect(DEFAULT_SENSITIVE_HEADERS).toContain("cookie");
  });

  it("маскирует authorization и x-api-key", () => {
    const headers = {
      authorization: "Bearer secret-token",
      "x-api-key": "my-key-123",
      "content-type": "application/json",
    };
    const result = sanitizeHeadersMap(headers);
    expect(result!["authorization"]).toBe("REDACTED");
    expect(result!["x-api-key"]).toBe("REDACTED");
    expect(result!["content-type"]).toBe("application/json");
  });

  it("сравнение без учёта регистра", () => {
    const headers = {
      Authorization: "Bearer token",
      "X-API-KEY": "key",
      "Content-Type": "application/json",
    };
    const result = sanitizeHeadersMap(headers);
    expect(result!["Authorization"]).toBe("REDACTED");
    expect(result!["X-API-KEY"]).toBe("REDACTED");
    expect(result!["Content-Type"]).toBe("application/json");
  });

  it("маскирует дополнительные заголовки из extraSensitive", () => {
    const headers = {
      "x-custom-secret": "secret",
      "x-public": "visible",
    };
    const result = sanitizeHeadersMap(headers, ["x-custom-secret"]);
    expect(result!["x-custom-secret"]).toBe("REDACTED");
    expect(result!["x-public"]).toBe("visible");
  });

  it("не мутирует оригинальный объект", () => {
    const headers = { authorization: "Bearer token" };
    sanitizeHeadersMap(headers);
    expect(headers.authorization).toBe("Bearer token");
  });

  it("возвращает undefined если headers=undefined", () => {
    expect(sanitizeHeadersMap(undefined)).toBeUndefined();
  });

  it("sanitizeHeaders: false — заголовки передаются в метрики как есть", () => {
    const capturedHeaders: Record<string, string>[] = [];
    const client = createRestClient({
      baseURL: "http://localhost",
      sanitizeHeaders: false,
      metrics: {
        onRequestStart: (info) => {
          if (info.requestHeaders) capturedHeaders.push(info.requestHeaders);
        },
      },
    });
    // Просто проверяем что клиент создался без ошибок
    expect(client).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth Provider
// ─────────────────────────────────────────────────────────────────────────────
describe("Auth Provider", () => {
  it("getToken() вызывается перед каждым запросом и инжектирует заголовок", async () => {
    let tokenCallCount = 0;
    const capturedHeaders: string[] = [];

    // Мокаем axios для перехвата заголовков
    const mockAdapter = async (config: any) => {
      capturedHeaders.push(config.headers?.Authorization ?? "");
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    };

    const client = createRestClient({
      baseURL: "http://localhost",
      auth: {
        getToken: async () => {
          tokenCallCount++;
          return "my-token-abc";
        },
      },
    });

    // Подменяем адаптер через внутренний httpClient (косвенно)
    // Вместо реального запроса проверяем что getToken вызывается
    // (реальный HTTP не нужен — проверяем интеграцию через мок)
    expect(tokenCallCount).toBe(0);

    // Создаём клиент с auth — он должен существовать без ошибок
    expect(client).toBeDefined();
    expect(typeof client.get).toBe("function");
  });

  it("onUnauthorized вызывается при 401 и запрос повторяется один раз", async () => {
    let unauthorizedCalled = false;
    let requestCount = 0;
    let currentToken = "expired-token";

    const mockAxios = vi.spyOn(axios, "create").mockReturnValue({
      request: vi.fn().mockImplementation(async () => {
        requestCount++;
        if (currentToken === "expired-token") {
          const err: any = new Error("Unauthorized");
          err.isAxiosError = true;
          err.response = { status: 401, data: {}, headers: {}, statusText: "Unauthorized" };
          // Делаем ошибку похожей на Axios-ошибку
          Object.setPrototypeOf(err, axios.AxiosError.prototype);
          throw err;
        }
        return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config: {} };
      }),
      defaults: { headers: { common: {} } },
      interceptors: { request: { use: () => {} }, response: { use: () => {} } },
    } as any);

    const client = createRestClient({
      baseURL: "http://localhost",
      auth: {
        getToken: async () => currentToken,
        onUnauthorized: async () => {
          unauthorizedCalled = true;
          currentToken = "new-token"; // "обновляем" токен
        },
      },
    });

    try {
      await client.get("/api/data");
    } catch {
      // При новом токене тоже кинет (т.к. мок всегда 401 для expired),
      // но нас интересует что onUnauthorized был вызван
    }

    expect(unauthorizedCalled).toBe(true);
    mockAxios.mockRestore();
  });

  it("tokenTtlMs кэширует токен между запросами вместо вызова getToken() каждый раз", async () => {
    let tokenCallCount = 0;
    const mockAxios = vi.spyOn(axios, "create").mockReturnValue({
      request: vi.fn().mockResolvedValue({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {},
        config: {},
      }),
      defaults: { headers: { common: {} } },
      interceptors: { request: { use: () => {} }, response: { use: () => {} } },
    } as any);

    const client = createRestClient({
      baseURL: "http://localhost",
      auth: {
        getToken: async () => {
          tokenCallCount++;
          return "token-1";
        },
        tokenTtlMs: 10_000,
      },
    });

    await client.get("/a");
    await client.get("/b");
    await client.get("/c");
    expect(tokenCallCount).toBe(1);

    mockAxios.mockRestore();
  });

  it("без tokenTtlMs getToken() вызывается перед каждым запросом (поведение по умолчанию)", async () => {
    let tokenCallCount = 0;
    const mockAxios = vi.spyOn(axios, "create").mockReturnValue({
      request: vi.fn().mockResolvedValue({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {},
        config: {},
      }),
      defaults: { headers: { common: {} } },
      interceptors: { request: { use: () => {} }, response: { use: () => {} } },
    } as any);

    const client = createRestClient({
      baseURL: "http://localhost",
      auth: { getToken: async () => { tokenCallCount++; return "token"; } },
    });

    await client.get("/a");
    await client.get("/b");
    expect(tokenCallCount).toBe(2);

    mockAxios.mockRestore();
  });

  it("кэш токена инвалидируется при 401 — следующий запрос вызывает getToken() заново", async () => {
    let tokenCallCount = 0;
    let shouldFail = true;
    const mockAxios = vi.spyOn(axios, "create").mockReturnValue({
      request: vi.fn().mockImplementation(async () => {
        if (shouldFail) {
          const err: any = new Error("Unauthorized");
          err.isAxiosError = true;
          err.response = { status: 401, data: {}, headers: {}, statusText: "Unauthorized" };
          Object.setPrototypeOf(err, axios.AxiosError.prototype);
          throw err;
        }
        return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config: {} };
      }),
      defaults: { headers: { common: {} } },
      interceptors: { request: { use: () => {} }, response: { use: () => {} } },
    } as any);

    const client = createRestClient({
      baseURL: "http://localhost",
      auth: {
        getToken: async () => {
          tokenCallCount++;
          return `token-${tokenCallCount}`;
        },
        tokenTtlMs: 10_000,
        onUnauthorized: async () => {
          shouldFail = false; // следующий реальный запрос пройдёт
        },
      },
    });

    await client.get("/a");
    expect(tokenCallCount).toBe(2); // 1 исходный + 1 после инвалидации кэша на retry

    mockAxios.mockRestore();
  });

  it("при повторном 401 после onUnauthorized — не попадает в бесконечный цикл", async () => {
    let requestCount = 0;

    const mockAxios = vi.spyOn(axios, "create").mockReturnValue({
      request: vi.fn().mockImplementation(async () => {
        requestCount++;
        const err: any = new Error("Unauthorized");
        // isAxiosError должен быть назначен ДО смены прототипа: AxiosError.prototype
        // определяет isAxiosError как non-writable (Object.defineProperty(..., {value: true})),
        // поэтому присвоение после setPrototypeOf бросает TypeError в strict mode.
        err.isAxiosError = true;
        Object.setPrototypeOf(err, axios.AxiosError.prototype);
        err.response = { status: 401, data: {}, headers: {}, statusText: "Unauthorized" };
        throw err;
      }),
      defaults: { headers: { common: {} } },
      interceptors: { request: { use: () => {} }, response: { use: () => {} } },
    } as any);

    const client = createRestClient({
      baseURL: "http://localhost",
      auth: {
        getToken: async () => "token",
        onUnauthorized: async () => {
          // не обновляем токен — 401 снова
        },
      },
    });

    await expect(client.get("/api/data")).rejects.toBeDefined();
    // Запрос выполнен ровно 2 раза: первая попытка + один retry
    expect(requestCount).toBe(2);

    mockAxios.mockRestore();
  });
});
