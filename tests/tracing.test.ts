import { createRestClient, generateTraceparent } from "../src/rest-client";
import type { TracingProvider, TracingSpan } from "../src/types";

const TRACEPARENT_RE = /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/;

describe("generateTraceparent()", () => {
  it("генерирует валидный W3C traceparent (версия 00)", () => {
    const tp = generateTraceparent();
    expect(tp).toMatch(TRACEPARENT_RE);
  });

  it("два вызова без traceId дают разные trace-id", () => {
    const a = generateTraceparent();
    const b = generateTraceparent();
    expect(a.split("-")[1]).not.toBe(b.split("-")[1]);
  });

  it("переиспользует валидный 32-hex traceId как есть", () => {
    const traceId = "0af7651916cd43dd8448eb211c80319c";
    const tp = generateTraceparent(traceId);
    expect(tp.split("-")[1]).toBe(traceId);
  });

  it("UUID без дефисов (формат runId) — валидный traceId", () => {
    const uuid = "0af76519-16cd-43dd-8448-eb211c80319c";
    const traceId = uuid.replace(/-/g, "");
    expect(traceId).toHaveLength(32);
    const tp = generateTraceparent(traceId);
    expect(tp.split("-")[1]).toBe(traceId);
  });

  it("игнорирует невалидный traceId и генерирует случайный", () => {
    const tp = generateTraceparent("not-valid-hex");
    expect(tp).toMatch(TRACEPARENT_RE);
    expect(tp.split("-")[1]).not.toBe("not-valid-hex");
  });
});

describe("HttpConfig.tracing.generateTraceparent", () => {
  it("добавляет заголовок traceparent к запросу", async () => {
    let capturedHeaders: Record<string, string> | undefined;
    const client = createRestClient({
      baseURL: "http://localhost",
      tracing: { generateTraceparent: true },
      adapter: {
        request: async (cfg) => {
          capturedHeaders = cfg.headers as Record<string, string>;
          return { data: {}, status: 200, statusText: "OK", headers: {} };
        },
      },
    });

    await client.get("/a");
    expect(capturedHeaders?.traceparent).toMatch(TRACEPARENT_RE);
  });

  it("без tracing.generateTraceparent заголовок не добавляется", async () => {
    let capturedHeaders: Record<string, string> | undefined;
    const client = createRestClient({
      baseURL: "http://localhost",
      adapter: {
        request: async (cfg) => {
          capturedHeaders = cfg.headers as Record<string, string>;
          return { data: {}, status: 200, statusText: "OK", headers: {} };
        },
      },
    });

    await client.get("/a");
    expect(capturedHeaders?.traceparent).toBeUndefined();
  });

  it("не перезаписывает явно заданный заголовок traceparent", async () => {
    let capturedHeaders: Record<string, string> | undefined;
    const client = createRestClient({
      baseURL: "http://localhost",
      tracing: { generateTraceparent: true },
      adapter: {
        request: async (cfg) => {
          capturedHeaders = cfg.headers as Record<string, string>;
          return { data: {}, status: 200, statusText: "OK", headers: {} };
        },
      },
    });

    await client.get("/a", { headers: { traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01" } });
    expect(capturedHeaders?.traceparent).toBe("00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01");
  });

  it("использует req.traceId для корреляции (например, runId пайплайна)", async () => {
    let capturedHeaders: Record<string, string> | undefined;
    const client = createRestClient({
      baseURL: "http://localhost",
      tracing: { generateTraceparent: true },
      adapter: {
        request: async (cfg) => {
          capturedHeaders = cfg.headers as Record<string, string>;
          return { data: {}, status: 200, statusText: "OK", headers: {} };
        },
      },
    });

    const traceId = "0af7651916cd43dd8448eb211c80319c";
    await client.get("/a", { traceId });
    expect(capturedHeaders?.traceparent?.split("-")[1]).toBe(traceId);
  });
});

describe("HttpConfig.tracing.provider", () => {
  class FakeSpan implements TracingSpan {
    ended = false;
    status: { code: "ok" | "error"; message?: string } | undefined;
    exception: unknown;
    end() { this.ended = true; }
    setStatus(status: { code: "ok" | "error"; message?: string }) { this.status = status; }
    recordException(error: unknown) { this.exception = error; }
  }

  it("вызывает startSpan() перед запросом и span.end() после успешного ответа", async () => {
    const spans: FakeSpan[] = [];
    const provider: TracingProvider = {
      startSpan: (name, attributes) => {
        expect(name).toBe("HTTP GET /a");
        expect(attributes).toMatchObject({ "http.method": "GET" });
        const span = new FakeSpan();
        spans.push(span);
        return span;
      },
    };

    const client = createRestClient({
      baseURL: "http://localhost",
      tracing: { provider },
      adapter: {
        request: async () => ({ data: {}, status: 200, statusText: "OK", headers: {} }),
      },
    });

    await client.get("/a");
    expect(spans).toHaveLength(1);
    expect(spans[0].ended).toBe(true);
    expect(spans[0].status).toEqual({ code: "ok" });
  });

  it("вызывает setStatus(error)/recordException()/end() при ошибке запроса", async () => {
    const spans: FakeSpan[] = [];
    const provider: TracingProvider = {
      startSpan: () => {
        const span = new FakeSpan();
        spans.push(span);
        return span;
      },
    };

    const client = createRestClient({
      baseURL: "http://localhost",
      tracing: { provider },
      adapter: {
        request: async () => {
          throw new Error("network down");
        },
      },
    });

    await expect(client.get("/a")).rejects.toBeDefined();
    expect(spans).toHaveLength(1);
    expect(spans[0].ended).toBe(true);
    expect(spans[0].status?.code).toBe("error");
    expect(spans[0].exception).toBeInstanceOf(Error);
  });

  it("не падает, если provider не реализует setStatus/recordException (опциональны)", async () => {
    let ended = false;
    const provider: TracingProvider = {
      startSpan: () => ({ end: () => { ended = true; } }),
    };

    const client = createRestClient({
      baseURL: "http://localhost",
      tracing: { provider },
      adapter: {
        request: async () => ({ data: {}, status: 200, statusText: "OK", headers: {} }),
      },
    });

    await expect(client.get("/a")).resolves.toBeDefined();
    expect(ended).toBe(true);
  });
});
