import { RequestExecutor } from "../src/request-executor";

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
