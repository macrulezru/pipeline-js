import { createRestClient, toApiError } from "../src/http/rest-client";
import {
  OfflineQueue,
  OfflineQueuedError,
  defaultShouldQueue,
  defaultIsOnline,
  defaultOnOnlineChange,
} from "../src/http/offline-queue";
import type { ApiResponse, PipelineStateAdapter, QueuedRequest } from "../src/types";

/** Simple in-memory PipelineStateAdapter<QueuedRequest[]> fake for tests. */
function createMemoryPersistAdapter(): PipelineStateAdapter<QueuedRequest[]> & { data: QueuedRequest[] | null } {
  return {
    data: null,
    async save(state) {
      this.data = state;
    },
    async load() {
      return this.data;
    },
  };
}

describe("defaultShouldQueue", () => {
  it("queues mutating methods, not GET", () => {
    expect(defaultShouldQueue({ method: "POST", url: "/x" })).toBe(true);
    expect(defaultShouldQueue({ method: "put", url: "/x" })).toBe(true);
    expect(defaultShouldQueue({ method: "PATCH", url: "/x" })).toBe(true);
    expect(defaultShouldQueue({ method: "DELETE", url: "/x" })).toBe(true);
    expect(defaultShouldQueue({ method: "GET", url: "/x" })).toBe(false);
    expect(defaultShouldQueue({ method: "HEAD", url: "/x" })).toBe(false);
  });
});

describe("defaultIsOnline / defaultOnOnlineChange", () => {
  it("defaultIsOnline reflects navigator.onLine when present", () => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    expect(defaultIsOnline()).toBe(false);
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
    expect(defaultIsOnline()).toBe(true);
    if (original) Object.defineProperty(window.navigator, "onLine", original);
  });

  it("defaultOnOnlineChange subscribes to window's 'online' event and returns an unsubscribe function", () => {
    const callback = vi.fn();
    const unsubscribe = defaultOnOnlineChange(callback);
    expect(typeof unsubscribe).toBe("function");

    window.dispatchEvent(new Event("online"));
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe?.();
    window.dispatchEvent(new Event("online"));
    expect(callback).toHaveBeenCalledTimes(1); // no further calls after unsubscribe
  });
});

describe("OfflineQueuedError", () => {
  it("carries queueId/method/url and a descriptive message", () => {
    const err = new OfflineQueuedError("q1", "POST", "/orders");
    expect(err.name).toBe("OfflineQueuedError");
    expect(err.queueId).toBe("q1");
    expect(err.method).toBe("POST");
    expect(err.url).toBe("/orders");
    expect(err.message).toContain("POST");
    expect(err.message).toContain("/orders");
  });

  it("toApiError() maps it to code: OFFLINE_QUEUED", () => {
    const apiError = toApiError(new OfflineQueuedError("q1", "POST", "/orders"));
    expect(apiError.code).toBe("OFFLINE_QUEUED");
  });
});

describe("OfflineQueue (engine, framework-agnostic)", () => {
  const okResponse: ApiResponse<unknown> = { data: { ok: true }, status: 200, statusText: "OK", headers: {} };

  it("enqueue() persists the queue and generates id + idempotencyKey", async () => {
    const persistAdapter = createMemoryPersistAdapter();
    const queue = new OfflineQueue(
      { enabled: true, persistAdapter, onOnlineChange: () => undefined },
      async () => okResponse,
      toApiError,
    );

    const entry = await queue.enqueue({ method: "post", url: "/orders", data: { item: 1 } });

    expect(entry.id).toBeTruthy();
    expect(entry.idempotencyKey).toBeTruthy();
    expect(entry.method).toBe("POST");
    expect(persistAdapter.data).toEqual([entry]);
  });

  it("enqueue() reuses an explicitly provided idempotencyKey instead of generating one", async () => {
    const persistAdapter = createMemoryPersistAdapter();
    const queue = new OfflineQueue(
      { enabled: true, persistAdapter, onOnlineChange: () => undefined },
      async () => okResponse,
      toApiError,
    );

    const entry = await queue.enqueue({ method: "POST", url: "/orders", idempotencyKey: "my-key" });
    expect(entry.idempotencyKey).toBe("my-key");
  });

  it("hydrates the in-memory queue from persistAdapter.load() on construction", async () => {
    const existing: QueuedRequest[] = [
      { id: "1", method: "POST", url: "/a", idempotencyKey: "k1", queuedAt: 1 },
    ];
    const persistAdapter = createMemoryPersistAdapter();
    persistAdapter.data = existing;

    const queue = new OfflineQueue(
      { enabled: true, persistAdapter, onOnlineChange: () => undefined },
      async () => okResponse,
      toApiError,
    );

    expect(await queue.getAll()).toEqual(existing);
  });

  it("maxQueueSize evicts the oldest entry once exceeded", async () => {
    const persistAdapter = createMemoryPersistAdapter();
    const queue = new OfflineQueue(
      { enabled: true, persistAdapter, maxQueueSize: 2, onOnlineChange: () => undefined },
      async () => okResponse,
      toApiError,
    );

    await queue.enqueue({ method: "POST", url: "/a" });
    await queue.enqueue({ method: "POST", url: "/b" });
    await queue.enqueue({ method: "POST", url: "/c" });

    const all = await queue.getAll();
    expect(all.map((r) => r.url)).toEqual(["/b", "/c"]);
  });

  describe("flush()", () => {
    it("replays queued requests oldest-first, removing each on success and firing onFlushSuccess", async () => {
      const persistAdapter = createMemoryPersistAdapter();
      const sent: string[] = [];
      const onFlushSuccess = vi.fn();
      const queue = new OfflineQueue(
        { enabled: true, persistAdapter, onOnlineChange: () => undefined, onFlushSuccess },
        async (req) => {
          sent.push(req.url);
          return okResponse;
        },
        toApiError,
      );

      await queue.enqueue({ method: "POST", url: "/a" });
      await queue.enqueue({ method: "POST", url: "/b" });

      await queue.flush();

      expect(sent).toEqual(["/a", "/b"]);
      expect(await queue.getAll()).toEqual([]);
      expect(onFlushSuccess).toHaveBeenCalledTimes(2);
      expect(persistAdapter.data).toEqual([]);
    });

    it("does nothing if isOnline() is false", async () => {
      const persistAdapter = createMemoryPersistAdapter();
      const sendReplay = vi.fn(async () => okResponse);
      const queue = new OfflineQueue(
        { enabled: true, persistAdapter, isOnline: () => false, onOnlineChange: () => undefined },
        sendReplay,
        toApiError,
      );

      await queue.enqueue({ method: "POST", url: "/a" });
      await queue.flush();

      expect(sendReplay).not.toHaveBeenCalled();
      expect(await queue.getAll()).toHaveLength(1);
    });

    it("stops mid-flush if isOnline() flips to false between entries, leaving the rest queued", async () => {
      const persistAdapter = createMemoryPersistAdapter();
      let online = true;
      const sent: string[] = [];
      const queue = new OfflineQueue(
        { enabled: true, persistAdapter, isOnline: () => online, onOnlineChange: () => undefined },
        async (req) => {
          sent.push(req.url);
          online = false; // connectivity drops right after the first successful send
          return okResponse;
        },
        toApiError,
      );

      await queue.enqueue({ method: "POST", url: "/a" });
      await queue.enqueue({ method: "POST", url: "/b" });

      await queue.flush();

      expect(sent).toEqual(["/a"]);
      const remaining = await queue.getAll();
      expect(remaining.map((r) => r.url)).toEqual(["/b"]);
    });

    it("a real HTTP error (has status) removes the entry and calls onFlushError, then continues to the next entry", async () => {
      const persistAdapter = createMemoryPersistAdapter();
      const onFlushError = vi.fn();
      const sent: string[] = [];
      const queue = new OfflineQueue(
        { enabled: true, persistAdapter, onOnlineChange: () => undefined, onFlushError },
        async (req) => {
          sent.push(req.url);
          if (req.url === "/a") {
            const err: any = new Error("Validation failed");
            err.status = 422;
            throw err;
          }
          return okResponse;
        },
        toApiError,
      );

      await queue.enqueue({ method: "POST", url: "/a" });
      await queue.enqueue({ method: "POST", url: "/b" });

      await queue.flush();

      expect(sent).toEqual(["/a", "/b"]); // /a failed but didn't block /b
      expect(await queue.getAll()).toEqual([]);
      expect(onFlushError).toHaveBeenCalledTimes(1);
      expect(onFlushError.mock.calls[0][0]).toMatchObject({ url: "/a" });
      expect(onFlushError.mock.calls[0][1]).toMatchObject({ status: 422 });
    });

    it("a network-level error (no status) leaves the entry queued and stops the flush", async () => {
      const persistAdapter = createMemoryPersistAdapter();
      const sent: string[] = [];
      const queue = new OfflineQueue(
        { enabled: true, persistAdapter, onOnlineChange: () => undefined },
        async (req) => {
          sent.push(req.url);
          throw new Error("Network Error"); // no .status — indistinguishable from "still offline"
        },
        toApiError,
      );

      await queue.enqueue({ method: "POST", url: "/a" });
      await queue.enqueue({ method: "POST", url: "/b" });

      await queue.flush();

      expect(sent).toEqual(["/a"]); // stopped after the first failure, didn't try /b
      const remaining = await queue.getAll();
      expect(remaining.map((r) => r.url)).toEqual(["/a", "/b"]);
    });
  });

  describe("auto-flush on reconnect", () => {
    it("calls flush() when onOnlineChange fires its callback", async () => {
      const persistAdapter = createMemoryPersistAdapter();
      let reconnectCallback: (() => void) | undefined;
      const sendReplay = vi.fn(async () => okResponse);

      const queue = new OfflineQueue(
        {
          enabled: true,
          persistAdapter,
          onOnlineChange: (cb) => {
            reconnectCallback = cb;
            return () => {
              reconnectCallback = undefined;
            };
          },
        },
        sendReplay,
        toApiError,
      );

      await queue.enqueue({ method: "POST", url: "/a" });
      expect(sendReplay).not.toHaveBeenCalled();

      reconnectCallback?.();
      await vi.waitFor(() => expect(sendReplay).toHaveBeenCalledTimes(1));
    });

    it("destroy() unsubscribes from onOnlineChange", () => {
      const unsubscribe = vi.fn();
      const onOnlineChange = vi.fn(() => unsubscribe);
      const persistAdapter = createMemoryPersistAdapter();

      const queue = new OfflineQueue(
        { enabled: true, persistAdapter, onOnlineChange },
        async () => okResponse,
        toApiError,
      );

      queue.destroy();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });
});

describe("createRestClient — offlineQueue integration", () => {
  it("client.post() while offline throws OfflineQueuedError and queues the request instead of hitting the network", async () => {
    const persistAdapter = createMemoryPersistAdapter();
    const adapterRequest = vi.fn();
    const client = createRestClient({
      baseURL: "https://api.example.com",
      adapter: { request: adapterRequest },
      offlineQueue: {
        enabled: true,
        persistAdapter,
        isOnline: () => false,
        onOnlineChange: () => undefined,
      },
    });

    await expect(client.post("/orders", { item: 1 })).rejects.toBeInstanceOf(OfflineQueuedError);
    expect(adapterRequest).not.toHaveBeenCalled();

    const queued = await client.getQueuedRequests();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ method: "POST", url: "/orders", data: { item: 1 } });
    expect(queued[0].idempotencyKey).toBeTruthy();
  });

  it("client.get() while offline is not queued by default (GET isn't a mutating method)", async () => {
    const persistAdapter = createMemoryPersistAdapter();
    const adapterRequest = vi.fn().mockResolvedValue({ data: { ok: true }, status: 200, statusText: "OK", headers: {} });
    const client = createRestClient({
      baseURL: "https://api.example.com",
      adapter: { request: adapterRequest },
      offlineQueue: {
        enabled: true,
        persistAdapter,
        isOnline: () => false,
        onOnlineChange: () => undefined,
      },
    });

    await expect(client.get("/users/1")).resolves.toMatchObject({ status: 200 });
    expect(adapterRequest).toHaveBeenCalledTimes(1);
    expect(await client.getQueuedRequests()).toEqual([]);
  });

  it("flushQueue() sends everything queued once back online, using the original idempotencyKey", async () => {
    const persistAdapter = createMemoryPersistAdapter();
    let online = false;
    const capturedHeaders: Array<Record<string, string> | undefined> = [];
    const adapterRequest = vi.fn().mockImplementation(async (cfg: any) => {
      capturedHeaders.push(cfg.headers);
      return { data: { id: 42 }, status: 201, statusText: "Created", headers: {} };
    });
    const client = createRestClient({
      baseURL: "https://api.example.com",
      adapter: { request: adapterRequest },
      offlineQueue: {
        enabled: true,
        persistAdapter,
        isOnline: () => online,
        onOnlineChange: () => undefined,
      },
    });

    await expect(client.post("/orders", { item: 1 })).rejects.toBeInstanceOf(OfflineQueuedError);
    const [queuedBefore] = await client.getQueuedRequests();

    online = true;
    await client.flushQueue();

    expect(adapterRequest).toHaveBeenCalledTimes(1);
    expect(capturedHeaders[0]?.["Idempotency-Key"]).toBe(queuedBefore.idempotencyKey);
    expect(await client.getQueuedRequests()).toEqual([]);
  });

  it("getQueuedRequests()/flushQueue() are safe no-ops when offlineQueue isn't configured", async () => {
    const client = createRestClient({ baseURL: "https://api.example.com" });
    await expect(client.getQueuedRequests()).resolves.toEqual([]);
    await expect(client.flushQueue()).resolves.toBeUndefined();
  });

  it("emits metrics.onRequestStart/onRequestEnd and calls onError when a request is queued", async () => {
    const persistAdapter = createMemoryPersistAdapter();
    const onRequestStart = vi.fn();
    const onRequestEnd = vi.fn();
    const onError = vi.fn();
    const client = createRestClient({
      baseURL: "https://api.example.com",
      adapter: { request: vi.fn() },
      metrics: { onRequestStart, onRequestEnd },
      onError,
      offlineQueue: {
        enabled: true,
        persistAdapter,
        isOnline: () => false,
        onOnlineChange: () => undefined,
      },
    });

    await expect(client.post("/orders", { item: 1 })).rejects.toBeInstanceOf(OfflineQueuedError);

    expect(onRequestStart).toHaveBeenCalledTimes(1);
    expect(onRequestEnd).toHaveBeenCalledTimes(1);
    expect(onRequestEnd.mock.calls[0][0].error).toMatchObject({ code: "OFFLINE_QUEUED" });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatchObject({ code: "OFFLINE_QUEUED" });
  });

  it("a custom shouldQueue overrides the mutating-methods default", async () => {
    const persistAdapter = createMemoryPersistAdapter();
    const adapterRequest = vi.fn().mockResolvedValue({ data: {}, status: 200, statusText: "OK", headers: {} });
    const client = createRestClient({
      baseURL: "https://api.example.com",
      adapter: { request: adapterRequest },
      offlineQueue: {
        enabled: true,
        persistAdapter,
        isOnline: () => false,
        onOnlineChange: () => undefined,
        shouldQueue: (info) => info.url === "/queue-me",
      },
    });

    // Not matched by shouldQueue -> reaches the adapter instead of being queued
    await expect(client.post("/other", {})).resolves.toMatchObject({ status: 200 });
    expect(adapterRequest).toHaveBeenCalledTimes(1);
    await expect(client.get("/queue-me")).rejects.toBeInstanceOf(OfflineQueuedError); // queued despite being GET
  });
});
