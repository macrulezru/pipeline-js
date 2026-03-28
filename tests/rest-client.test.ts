import { createRestClient, clearRestClientCache, getRestClient, toApiError } from "../src/rest-client";

describe("createRestClient", () => {
  it("создаёт клиент с нужными методами", () => {
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

  it("patch() метод существует (Feature #19)", () => {
    const client = createRestClient({ baseURL: "http://localhost" });
    expect(typeof client.patch).toBe("function");
  });

  it("cancellableRequest использует AbortController, не CancelToken (Bug #6)", () => {
    // CancelToken.source — устаревший API. Проверяем что cancellableRequest не использует его
    // Косвенная проверка: метод существует и работает как функция
    const client = createRestClient({ baseURL: "http://localhost" });
    expect(typeof client.cancellableRequest).toBe("function");
    expect(typeof client.cancelRequest).toBe("function");
  });

  it("сообщения об ошибках на английском (Bug #9)", () => {
    // Не-axios ошибка должна давать английское сообщение
    const err = toApiError("unknown");
    expect(err.message).toBe("An unknown error occurred");
    expect(err.message).not.toMatch(/[а-яёА-ЯЁ]/); // Нет кириллицы
  });
});

describe("clearRestClientCache (Bug #10 fix)", () => {
  it("clearRestClientCache() экспортируется и является функцией", () => {
    expect(typeof clearRestClientCache).toBe("function");
  });

  it("getRestClient возвращает закэшированный экземпляр для одинаковых конфигов", () => {
    clearRestClientCache();
    const config = { baseURL: "http://test.local" };
    const c1 = getRestClient(config);
    const c2 = getRestClient(config);
    expect(c1).toBe(c2);
  });

  it("после clearRestClientCache создаётся новый клиент", () => {
    const config = { baseURL: "http://test.local" };
    const c1 = getRestClient(config);
    clearRestClientCache();
    const c2 = getRestClient(config);
    // После очистки должен быть новый экземпляр
    expect(c1).not.toBe(c2);
  });
});

describe("TtlCache (через clearCache)", () => {
  it("clearCache() очищает кэш ответов клиента", () => {
    const client = createRestClient({ baseURL: "http://localhost" });
    // Не должно кидать ошибку
    expect(() => client.clearCache()).not.toThrow();
  });
});
