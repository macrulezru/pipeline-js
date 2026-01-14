import { RequestExecutor } from "../src/request-executor";

describe("RequestExecutor", () => {
  it("should create an executor and have execute method", () => {
    const executor = new RequestExecutor({ baseURL: "http://localhost" });
    expect(executor).toHaveProperty("execute");
    // Для реальных запросов нужен мок axios
  });
});
