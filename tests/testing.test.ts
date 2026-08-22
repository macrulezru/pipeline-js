import { createRestClient } from "../src/http/rest-client";
import { createMockAdapter } from "../src/testing";

describe("createMockAdapter", () => {
  it("responds via the matched route (method + URL substring)", async () => {
    const adapter = createMockAdapter([
      { method: "GET", url: "/users/1", respond: { data: { id: 1, name: "Ada" } } },
    ]);
    const client = createRestClient({ baseURL: "https://api.example.com", adapter });

    const res = await client.get("/users/1");

    expect(res.status).toBe(200);
    expect(res.statusText).toBe("OK");
    expect(res.data).toEqual({ id: 1, name: "Ada" });
  });

  it("matches the URL via RegExp", async () => {
    const adapter = createMockAdapter([
      { method: "GET", url: /^\/users\/\d+$/, respond: { data: { ok: true } } },
    ]);
    const client = createRestClient({ baseURL: "https://api.example.com", adapter });

    await expect(client.get("/users/42")).resolves.toMatchObject({ data: { ok: true } });
  });

  it("without a method in the route, matches any method", async () => {
    const adapter = createMockAdapter([{ url: "/ping", respond: { data: "pong" } }]);
    const client = createRestClient({ baseURL: "https://api.example.com", adapter });

    await expect(client.get("/ping")).resolves.toMatchObject({ data: "pong" });
    await expect(client.post("/ping")).resolves.toMatchObject({ data: "pong" });
  });

  it("respond as a function receives MockRequestInfo and can respond dynamically", async () => {
    const adapter = createMockAdapter([
      {
        method: "POST",
        url: "/echo",
        respond: (info) => ({ data: { received: info.data, url: info.fullUrl } }),
      },
    ]);
    const client = createRestClient({ baseURL: "https://api.example.com", adapter });

    const res = await client.post("/echo", { hello: "world" });

    expect(res.data).toEqual({
      received: { hello: "world" },
      url: "https://api.example.com/echo",
    });
  });

  it("status >= 400 rejects the request by default (like axios/fetch defaults)", async () => {
    const adapter = createMockAdapter([
      { method: "GET", url: "/broken", respond: { status: 500, data: { message: "oops" } } },
    ]);
    const client = createRestClient({ baseURL: "https://api.example.com", adapter });

    await expect(client.get("/broken")).rejects.toMatchObject({ status: 500 });
  });

  it("error: false forces a resolve even when status >= 400", async () => {
    const adapter = createMockAdapter([
      { method: "GET", url: "/soft-404", respond: { status: 404, error: false, data: null } },
    ]);
    const client = createRestClient({ baseURL: "https://api.example.com", adapter });

    await expect(client.get("/soft-404")).resolves.toMatchObject({ status: 404 });
  });

  it("error: true forces a reject even when status < 400", async () => {
    const adapter = createMockAdapter([
      { method: "GET", url: "/weird", respond: { status: 200, error: true } },
    ]);
    const client = createRestClient({ baseURL: "https://api.example.com", adapter });

    await expect(client.get("/weird")).rejects.toThrow();
  });

  it("an array of responds is consumed one per request; the last one repeats once exhausted", async () => {
    const adapter = createMockAdapter([
      {
        method: "GET",
        url: "/flaky",
        respond: [
          { error: true, status: 503 },
          { error: true, status: 503 },
          { data: { ok: true }, status: 200 },
        ],
      },
    ]);
    const client = createRestClient({ baseURL: "https://api.example.com", adapter });

    await expect(client.get("/flaky")).rejects.toMatchObject({ status: 503 });
    await expect(client.get("/flaky")).rejects.toMatchObject({ status: 503 });
    await expect(client.get("/flaky")).resolves.toMatchObject({ data: { ok: true } });
    // Array is exhausted — the last element repeats
    await expect(client.get("/flaky")).resolves.toMatchObject({ data: { ok: true } });
  });

  it("works with RequestExecutor retry — a flaky array combined with retriableStatus", async () => {
    const { RequestExecutor } = await import("../src/http/request-executor");
    const adapter = createMockAdapter([
      {
        method: "GET",
        url: "/retry-me",
        respond: [
          { error: true, status: 503 },
          { data: { ok: true } },
        ],
      },
    ]);
    const executor = new RequestExecutor({
      baseURL: "https://api.example.com",
      adapter,
      retry: { attempts: 2, delayMs: 0, backoffMultiplier: 1, retriableStatus: [503] },
    });

    const res = await executor.execute("/retry-me");
    expect(res.data).toEqual({ ok: true });
    expect(adapter.calls).toHaveLength(2);
  });

  it("throws a clear error if no route matched", async () => {
    const adapter = createMockAdapter([{ method: "GET", url: "/known", respond: { data: {} } }]);
    const client = createRestClient({ baseURL: "https://api.example.com", adapter });

    await expect(client.get("/unknown")).rejects.toThrow(/no route matched GET \/unknown/);
  });

  it("delayMs simulates network latency", async () => {
    vi.useFakeTimers();
    const adapter = createMockAdapter([
      { method: "GET", url: "/slow", respond: { data: "ok", delayMs: 200 } },
    ]);
    const client = createRestClient({ baseURL: "https://api.example.com", adapter });

    let resolved = false;
    client.get("/slow").then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(199);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);

    vi.useRealTimers();
  });

  describe("calls (request history)", () => {
    it("records every request in call order, including unmatched ones", async () => {
      const adapter = createMockAdapter([
        { method: "GET", url: "/a", respond: { data: 1 } },
      ]);
      const client = createRestClient({ baseURL: "https://api.example.com", adapter });

      await client.get("/a");
      await client.get("/a", { params: { x: 1 } });
      await client.get("/unmatched").catch(() => {});

      expect(adapter.calls).toHaveLength(3);
      expect(adapter.calls[0]).toMatchObject({ method: "GET", url: "/a", matched: true });
      expect(adapter.calls[1]).toMatchObject({ params: { x: 1 }, matched: true });
      expect(adapter.calls[2]).toMatchObject({ url: "/unmatched", matched: false });
    });

    it("reset() clears the history and the position within respond arrays", async () => {
      const adapter = createMockAdapter([
        { method: "GET", url: "/seq", respond: [{ data: 1 }, { data: 2 }] },
      ]);
      const client = createRestClient({ baseURL: "https://api.example.com", adapter });

      await client.get("/seq"); // data: 1
      const second = await client.get("/seq"); // data: 2
      expect(second.data).toBe(2);

      adapter.reset();
      expect(adapter.calls).toHaveLength(0);

      const afterReset = await client.get("/seq"); // back to the start of the array
      expect(afterReset.data).toBe(1);
    });
  });
});
