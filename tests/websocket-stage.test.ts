import { PipelineOrchestrator } from "../src/pipeline/pipeline-orchestrator";
import { validatePipelineConfig } from "../src/pipeline/pipeline-validator";
import type { PipelineConfig, WebSocketLike, WebSocketStageConfig } from "../src/types";

const httpConfig = { baseURL: "http://localhost" };

/** Controllable fake WebSocket implementing WebSocketLike for tests. */
class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];

  listeners: Record<string, Array<(event: any) => void>> = {
    open: [],
    message: [],
    close: [],
    error: [],
  };
  sent: unknown[] = [];
  closed = false;
  closeArgs: [number | undefined, string | undefined] | undefined;

  constructor(
    public url: string,
    public protocols?: string | string[],
  ) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closed = true;
    this.closeArgs = [code, reason];
  }

  _emit(type: string, event: any = {}): void {
    for (const l of [...this.listeners[type]]) l(event);
  }

  _open(): void {
    this._emit("open", {});
  }

  _message(data: unknown): void {
    this._emit("message", { data });
  }

  _close(opts: { code?: number; reason?: string; wasClean?: boolean } = {}): void {
    this._emit("close", {
      code: opts.code ?? 1000,
      reason: opts.reason ?? "",
      wasClean: opts.wasClean ?? true,
    });
  }

  _error(error: unknown = new Error("ws error")): void {
    this._emit("error", error);
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
});

/**
 * `o.run()` reaches WebSocket construction only after several internal
 * `await`s (emitStepStart/log/etc.), so the instance doesn't exist yet in
 * the same synchronous tick as the `run()` call — poll microtasks until it does.
 */
async function waitForWs(): Promise<FakeWebSocket> {
  while (FakeWebSocket.instances.length === 0) {
    await Promise.resolve();
  }
  return FakeWebSocket.instances[0];
}

/**
 * Waits for executeWebSocketStage's onMessage handling (serialized through a
 * promise chain, and always async even for a sync `onMessage`) to finish
 * after a synchronous `ws._message(...)`. A fixed count of `Promise.resolve()`
 * calls is brittle — it silently breaks whenever the await-depth inside that
 * chain changes. A macrotask boundary isn't: it always runs after every
 * microtask queued so far has drained, regardless of how many `await`/`.then()`
 * levels are involved.
 */
async function tick(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("WebSocketStageConfig — basic execution", () => {
  it("collects the values returned by onMessage into the step result's data", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "live",
          url: "wss://example.com/ws",
          createWebSocket: (url, protocols) => new FakeWebSocket(url, protocols),
          onMessage: (data) => data,
        } as WebSocketStageConfig,
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const runPromise = o.run();

    const ws = await waitForWs();
    ws._open();
    ws._message("a");
    ws._message("b");
    ws._close();

    const result = await runPromise;
    expect(result.success).toBe(true);
    expect(result.stageResults.live.status).toBe("success");
    expect(result.stageResults.live.data).toEqual(["a", "b"]);
  });

  it("an onMessage that returns undefined is excluded from the result", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "live",
          url: "wss://example.com/ws",
          createWebSocket: (url) => new FakeWebSocket(url),
          onMessage: (data) => (data === "keep" ? data : undefined),
        } as WebSocketStageConfig,
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const runPromise = o.run();

    const ws = await waitForWs();
    ws._open();
    ws._message("skip");
    ws._message("keep");
    ws._close();

    const result = await runPromise;
    expect(result.stageResults.live.data).toEqual(["keep"]);
  });

  it("onMessage can be async", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "live",
          url: "wss://example.com/ws",
          createWebSocket: (url) => new FakeWebSocket(url),
          onMessage: async (data) => {
            await Promise.resolve();
            return `processed:${data}`;
          },
        } as WebSocketStageConfig,
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const runPromise = o.run();

    const ws = await waitForWs();
    ws._open();
    ws._message("x");
    ws._close();

    const result = await runPromise;
    expect(result.stageResults.live.data).toEqual(["processed:x"]);
  });

  it("passes url and protocols to createWebSocket", async () => {
    const capturedArgs: unknown[] = [];
    const config: PipelineConfig = {
      stages: [
        {
          key: "live",
          url: "wss://example.com/ws",
          protocols: ["v1", "v2"],
          createWebSocket: (url, protocols) => {
            capturedArgs.push(url, protocols);
            return new FakeWebSocket(url, protocols);
          },
          onMessage: (data) => data,
        } as WebSocketStageConfig,
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const runPromise = o.run();

    (await waitForWs())._close();
    await runPromise;

    expect(capturedArgs).toEqual(["wss://example.com/ws", ["v1", "v2"]]);
  });

  it("url as a function receives prev/sharedData/allResults", async () => {
    let capturedPrev: unknown;
    const config: PipelineConfig = {
      stages: [
        { key: "step1", request: async () => "room-42" },
        {
          key: "live",
          url: ({ prev }: { prev: unknown }) => {
            capturedPrev = prev;
            return `wss://example.com/ws/${prev}`;
          },
          createWebSocket: (url) => new FakeWebSocket(url),
          onMessage: (data) => data,
        } as WebSocketStageConfig,
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const runPromise = o.run();

    expect((await waitForWs()).url).toBe("wss://example.com/ws/room-42");
    expect(capturedPrev).toBe("room-42");

    (await waitForWs())._close();
    await runPromise;
  });
});

describe("WebSocketStageConfig — onOpen/onChunk/onClose/onError hooks", () => {
  it("calls onOpen when the connection opens", async () => {
    let opened = false;
    const config: PipelineConfig = {
      stages: [
        {
          key: "live",
          url: "wss://example.com/ws",
          createWebSocket: (url) => new FakeWebSocket(url),
          onOpen: () => {
            opened = true;
          },
          onMessage: (data) => data,
        } as WebSocketStageConfig,
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const runPromise = o.run();

    const ws = await waitForWs();
    ws._open();
    expect(opened).toBe(true);
    ws._close();
    await runPromise;
  });

  it("calls onChunk in real time for every non-undefined onMessage value", async () => {
    const chunks: unknown[] = [];
    const config: PipelineConfig = {
      stages: [
        {
          key: "live",
          url: "wss://example.com/ws",
          createWebSocket: (url) => new FakeWebSocket(url),
          onMessage: (data) => data,
          onChunk: (chunk) => {
            chunks.push(chunk);
          },
        } as WebSocketStageConfig,
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const runPromise = o.run();

    const ws = await waitForWs();
    ws._message("first");
    await tick(); // onMessage is now always handled asynchronously (even for sync functions)
    expect(chunks).toEqual(["first"]);
    ws._message("second");
    await tick();
    expect(chunks).toEqual(["first", "second"]);
    ws._close();
    await runPromise;
  });

  it("onClose receives code/reason/wasClean", async () => {
    let closeInfo: { code?: number; reason?: string; wasClean?: boolean } | undefined;
    const config: PipelineConfig = {
      stages: [
        {
          key: "live",
          url: "wss://example.com/ws",
          createWebSocket: (url) => new FakeWebSocket(url),
          onMessage: (data) => data,
          onClose: (params: { code?: number; reason?: string; wasClean?: boolean }) => {
            closeInfo = params;
          },
        } as WebSocketStageConfig,
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const runPromise = o.run();

    (await waitForWs())._close({ code: 1000, reason: "done", wasClean: true });
    await runPromise;

    expect(closeInfo).toMatchObject({ code: 1000, reason: "done", wasClean: true });
  });

  it("onError is called on the error event, but by itself does not fail the step", async () => {
    let errorEvent: unknown;
    const config: PipelineConfig = {
      stages: [
        {
          key: "live",
          url: "wss://example.com/ws",
          createWebSocket: (url) => new FakeWebSocket(url),
          onMessage: (data) => data,
          onError: (err: unknown) => {
            errorEvent = err;
          },
        } as WebSocketStageConfig,
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const runPromise = o.run();

    const ws = await waitForWs();
    const err = new Error("boom");
    ws._error(err);
    // error by itself does not settle the promise — the status is decided by close()
    ws._close({ wasClean: true });

    const result = await runPromise;
    expect(errorEvent).toBe(err);
    expect(result.success).toBe(true); // wasClean: true → success, despite the error event
  });
});

describe("WebSocketStageConfig — closeOn", () => {
  it("closeOn(data) === true closes the connection", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "live",
          url: "wss://example.com/ws",
          createWebSocket: (url) => new FakeWebSocket(url),
          onMessage: (data) => data,
          closeOn: (data: unknown) => data === "done",
        } as WebSocketStageConfig,
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const runPromise = o.run();

    const ws = await waitForWs();
    ws._message("a");
    await tick();
    expect(ws.closed).toBe(false);
    ws._message("done");
    await tick();
    expect(ws.closed).toBe(true);

    // A real WS would respond to our close() with a close event — simulate that
    ws._close({ wasClean: true });

    const result = await runPromise;
    expect(result.stageResults.live.data).toEqual(["a", "done"]);
  });
});

describe("WebSocketStageConfig — errors", () => {
  it("a non-clean close (wasClean: false) marks the step as error", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "live",
          url: "wss://example.com/ws",
          createWebSocket: (url) => new FakeWebSocket(url),
          onMessage: (data) => data,
        } as WebSocketStageConfig,
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const runPromise = o.run();

    (await waitForWs())._close({ code: 1006, wasClean: false });

    const result = await runPromise;
    expect(result.success).toBe(false);
    expect(result.stageResults.live.status).toBe("error");
  });

  it("an error thrown from onMessage fails the step", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "live",
          url: "wss://example.com/ws",
          createWebSocket: (url) => new FakeWebSocket(url),
          onMessage: () => {
            throw new Error("bad payload");
          },
        } as WebSocketStageConfig,
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const runPromise = o.run();

    (await waitForWs())._message("x");

    const result = await runPromise;
    expect(result.success).toBe(false);
    expect(result.stageResults.live.status).toBe("error");
  });

  it("continueOnError: true continues the pipeline after a WS step error", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "live",
          url: "wss://example.com/ws",
          createWebSocket: (url) => new FakeWebSocket(url),
          onMessage: (data) => data,
          continueOnError: true,
        } as WebSocketStageConfig,
        { key: "after", request: async () => "reached" },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const runPromise = o.run();

    (await waitForWs())._close({ wasClean: false });

    const result = await runPromise;
    expect(result.stageResults.live.status).toBe("error");
    expect(result.stageResults.after.status).toBe("success");
  });

  it("timeoutMs closes the connection and fails the step once time runs out", async () => {
    vi.useFakeTimers();
    const config: PipelineConfig = {
      stages: [
        {
          key: "live",
          url: "wss://example.com/ws",
          createWebSocket: (url) => new FakeWebSocket(url),
          onMessage: (data) => data,
          timeoutMs: 1000,
        } as WebSocketStageConfig,
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const runPromise = o.run();

    await vi.advanceTimersByTimeAsync(1000);

    const result = await runPromise;
    expect(result.success).toBe(false);
    expect((await waitForWs()).closed).toBe(true);

    vi.useRealTimers();
  });
});

describe("WebSocketStageConfig — abort()", () => {
  it("abort() after the connection is established closes it and fails the step", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "live",
          url: "wss://example.com/ws",
          createWebSocket: (url) => new FakeWebSocket(url),
          onMessage: (data) => data,
        } as WebSocketStageConfig,
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const runPromise = o.run();

    // Wait for the stage to actually create the WebSocket and subscribe to events
    const ws = await waitForWs();
    o.abort();

    const result = await runPromise;
    expect(result.success).toBe(false);
    expect(ws.closed).toBe(true);
  });

  it("abort() in the narrow window between checking signal.aborted and subscribing to events does not leave the step hanging", async () => {
    // Regression test for a race condition: createWebSocket is called after
    // the initial `if (signal.aborted) throw` check, but BEFORE
    // executeWebSocketStage manages to subscribe to the signal's 'abort'
    // event inside the Promise executor. By calling abort() right from
    // createWebSocket, we deterministically land exactly in that window —
    // without this fix, a missed abort would leave the step hanging forever,
    // waiting for an event that will never come.
    let orchestratorRef!: PipelineOrchestrator;
    const config: PipelineConfig = {
      stages: [
        {
          key: "live",
          url: "wss://example.com/ws",
          createWebSocket: (url) => {
            orchestratorRef.abort();
            return new FakeWebSocket(url);
          },
          onMessage: (data) => data,
        } as WebSocketStageConfig,
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    orchestratorRef = o;

    const result = await o.run();

    expect(result.success).toBe(false);
    expect(result.stageResults.live.status).toBe("error");
  });
});

describe("WebSocketStageConfig — validatePipelineConfig", () => {
  it("requires url and onMessage", () => {
    const { valid, errors } = validatePipelineConfig({
      stages: [{ key: "live", onMessage: undefined } as any],
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("url must be"))).toBe(true);
    expect(errors.some((e) => e.includes("onMessage must be"))).toBe(true);
  });

  it("a valid WebSocket step passes without errors", () => {
    const { valid } = validatePipelineConfig({
      stages: [
        {
          key: "live",
          url: "wss://example.com/ws",
          onMessage: (data: unknown) => data,
        } as WebSocketStageConfig,
      ],
    });
    expect(valid).toBe(true);
  });
});
