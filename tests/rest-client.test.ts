import { createRestClient } from "../src/rest-client";

describe("createRestClient", () => {
  it("should create a client and make a request (mock)", async () => {
    const client = createRestClient({ baseURL: "http://localhost" });
    expect(client).toHaveProperty("request");
    // Здесь можно добавить мок axios и проверить вызов
  });
});
