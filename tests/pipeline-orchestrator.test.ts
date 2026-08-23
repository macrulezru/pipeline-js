import { PipelineOrchestrator } from "../src/pipeline/pipeline-orchestrator";
import { recoverStep } from "../src/types";
import type { PipelineConfig } from "../src/types";

const httpConfig = { baseURL: "http://localhost" };

// ─────────────────────────────────────────────────────────────────────────────
// Basic tests (regression)
// ─────────────────────────────────────────────────────────────────────────────
describe("PipelineOrchestrator — basic execution", () => {
  const pipelineConfig: PipelineConfig = {
    stages: [
      { key: "step1", request: async () => ({ v: "ok1" }) },
      {
        key: "step2",
        request: async ({ prev }: any) => ({ v: prev.v + "-ok2" }),
      },
    ],
  };

  it("run() — successful sequential execution", async () => {
    const o = new PipelineOrchestrator({ config: pipelineConfig, httpConfig });
    const result = await o.run();
    expect(result.success).toBe(true);
    expect(result.stageResults.step1.data).toEqual({ v: "ok1" });
    expect(result.stageResults.step2.data).toEqual({ v: "ok1-ok2" });
  });

  it("subscribeProgress() — receives progress updates", async () => {
    const o = new PipelineOrchestrator({ config: pipelineConfig, httpConfig });
    const updates: any[] = [];
    o.subscribeProgress((p) => updates.push(p));
    await o.run();
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0]).toHaveProperty("currentStage");
  });

  it("subscribeStageResults() — receives stage results", async () => {
    const o = new PipelineOrchestrator({ config: pipelineConfig, httpConfig });
    const snapshots: any[] = [];
    o.subscribeStageResults((r) => snapshots.push(r));
    await o.run();
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots[snapshots.length - 1].step2.data).toEqual({
      v: "ok1-ok2",
    });
  });

  it("on() — handles custom events", async () => {
    const o = new PipelineOrchestrator({ config: pipelineConfig, httpConfig });
    let called = false;
    o.on("step:step1:success", () => {
      called = true;
    });
    await o.run();
    expect(called).toBe(true);
  });

  it("getLogs() — returns logs", async () => {
    const o = new PipelineOrchestrator({ config: pipelineConfig, httpConfig });
    await o.run();
    const logs = o.getLogs();
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
  });

  it("getProgress() and getProgressRef() — return snapshots (not a live reference)", async () => {
    const o = new PipelineOrchestrator({ config: pipelineConfig, httpConfig });
    await o.run();
    const p = o.getProgress();
    const ref = o.getProgressRef();
    expect(p).toHaveProperty("currentStage");
    expect(ref).toHaveProperty("currentStage");
    // Bug #12 fix: getProgressRef() should return a copy, not a mutable reference
    expect(ref).not.toBe((o as any).progress.progress);
  });

  it("clearStageResults() — resets results and progress", async () => {
    const o = new PipelineOrchestrator({ config: pipelineConfig, httpConfig });
    await o.run();
    o.clearStageResults();
    const progress = o.getProgress();
    expect(progress.currentStage).toBe(0);
    expect(Object.keys((o as any).stageResults).length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug #1: condition
// ─────────────────────────────────────────────────────────────────────────────
describe("Bug #1 fix — condition", () => {
  it("skips a step with status 'skipped' when condition returns false", async () => {
    const config: PipelineConfig = {
      stages: [
        { key: "step1", request: async () => 42 },
        {
          key: "step2",
          condition: () => false,
          request: async () => {
            throw new Error("should not be called");
          },
        },
        { key: "step3", request: async () => 99 },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.success).toBe(true);
    expect(result.stageResults.step2.status).toBe("skipped");
    expect(result.stageResults.step3.data).toBe(99);
  });

  it("executes a step when condition returns true", async () => {
    const config: PipelineConfig = {
      stages: [{ key: "step1", request: async () => 1, condition: () => true }],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.stageResults.step1.status).toBe("success");
    expect(result.stageResults.step1.data).toBe(1);
  });

  it("condition receives prev and allResults", async () => {
    let capturedPrev: any;
    const config: PipelineConfig = {
      stages: [
        { key: "step1", request: async () => "hello" },
        {
          key: "step2",
          condition: ({ prev }) => {
            capturedPrev = prev;
            return true;
          },
          request: async () => "world",
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();
    expect(capturedPrev).toBe("hello");
  });

  it("emits the step:key:skipped event", async () => {
    const config: PipelineConfig = {
      stages: [
        { key: "step1", condition: () => false, request: async () => 1 },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    let skippedEvent: any = null;
    o.on("step:step1:skipped", (e) => {
      skippedEvent = e;
    });
    await o.run();
    expect(skippedEvent).not.toBeNull();
    expect(skippedEvent.status).toBe("skipped");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug #2: request() is called exactly once
// ─────────────────────────────────────────────────────────────────────────────
describe("Bug #2 fix — request() is called exactly once", () => {
  it("does not call request() twice (no duplicate side effects)", async () => {
    let callCount = 0;
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => {
            callCount++;
            return { count: callCount };
          },
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(callCount).toBe(1);
    expect(result.stageResults.step1.data).toEqual({ count: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug #3: rerunStep calls before/after hooks
// ─────────────────────────────────────────────────────────────────────────────
describe("Bug #3 fix — rerunStep() calls before/after hooks", () => {
  it("before hook is called on rerunStep", async () => {
    let beforeCalled = false;
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          before: async () => {
            beforeCalled = true;
          },
          request: async () => "result",
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();
    beforeCalled = false; // reset the flag

    await o.rerunStep("step1");
    expect(beforeCalled).toBe(true);
  });

  it("after hook is called on rerunStep and transforms the result", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => 10,
          after: async ({ result }) => (result as number) * 2,
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();
    const res = await o.rerunStep("step1");
    expect(res?.data).toBe(20);
  });

  it("condition is checked on rerunStep", async () => {
    let shouldRun = true;
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          condition: () => shouldRun,
          request: async () => "done",
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();
    shouldRun = false;

    const res = await o.rerunStep("step1");
    expect(res?.status).toBe("skipped");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug #5: no duplicate event emit
// ─────────────────────────────────────────────────────────────────────────────
describe("Bug #5 fix — no duplicate emit on rerunStep", () => {
  it("step:success is emitted exactly once on rerunStep", async () => {
    const config: PipelineConfig = {
      stages: [{ key: "step1", request: async () => 1 }],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();

    let successCount = 0;
    o.on("step:step1:success", () => {
      successCount++;
    });
    await o.rerunStep("step1");
    expect(successCount).toBe(1);
  });

  it("step:start is emitted exactly once on rerunStep", async () => {
    const config: PipelineConfig = {
      stages: [{ key: "step1", request: async () => 1 }],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();

    let startCount = 0;
    o.on("step:step1:start", () => {
      startCount++;
    });
    await o.rerunStep("step1");
    expect(startCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug #11: autoReset clears logs
// ─────────────────────────────────────────────────────────────────────────────
describe("Bug #11 fix — autoReset clears logs", () => {
  it("logs are cleared between runs when autoReset=true", async () => {
    const config: PipelineConfig = {
      stages: [{ key: "step1", request: async () => 1 }],
    };
    const o = new PipelineOrchestrator({
      config,
      httpConfig,
      options: { autoReset: true },
    });
    await o.run();
    const logsAfterFirst = o.getLogs();
    expect(logsAfterFirst.length).toBeGreaterThan(0);

    await o.run();
    const logsAfterSecond = o.getLogs();
    // Logs should have the same count, not accumulate
    expect(logsAfterSecond.length).toBe(logsAfterFirst.length);
  });

  it("without autoReset logs accumulate", async () => {
    const config: PipelineConfig = {
      stages: [{ key: "step1", request: async () => 1 }],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();
    const countAfterFirst = o.getLogs().length;
    await o.run();
    expect(o.getLogs().length).toBeGreaterThan(countAfterFirst);
  });

  it("options.maxLogs limits the log size (FIFO)", async () => {
    const config: PipelineConfig = {
      stages: [{ key: "step1", request: async () => 1 }],
      options: { maxLogs: 3 },
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();
    await o.run();
    await o.run();
    const logs = o.getLogs();
    expect(logs.length).toBe(3);
    // The most recent entries are kept — the last one should be about the last run
    expect(logs[logs.length - 1].message).toContain("step1");
  });

  it("without maxLogs the log is unbounded (backward compatibility)", async () => {
    const config: PipelineConfig = {
      stages: [{ key: "step1", request: async () => 1 }],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    for (let i = 0; i < 5; i++) await o.run();
    // 5 runs × 2 entries ("start" + "success") = 10, nothing dropped
    expect(o.getLogs().length).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// before/after hooks (run)
// ─────────────────────────────────────────────────────────────────────────────
describe("before/after hooks", () => {
  it("before modifies the input data for request", async () => {
    const config: PipelineConfig = {
      stages: [
        { key: "step1", request: async () => 10 },
        {
          key: "step2",
          before: async ({ prev }) => (prev as number) + 5,
          request: async ({ prev }) => (prev as number) * 2,
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    // before makes prev 10+5=15, request 15*2=30
    expect(result.stageResults.step2.data).toBe(30);
  });

  it("after transforms the step result", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => [1, 2, 3],
          after: async ({ result }) => (result as number[]).map((x) => x * 10),
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.stageResults.step1.data).toEqual([10, 20, 30]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateInput / validateOutput
// ─────────────────────────────────────────────────────────────────────────────
describe("validateInput / validateOutput", () => {
  it("validateInput sees the before-hook result and can transform the value before request", async () => {
    const seen: unknown[] = [];
    const config: PipelineConfig = {
      stages: [
        { key: "step1", request: async () => 10 },
        {
          key: "step2",
          before: async ({ prev }) => (prev as number) + 5, // 10 → 15
          validateInput: (data) => {
            seen.push(data);
            return (data as number) * 2; // 15 → 30
          },
          request: async ({ prev }) => prev, // sees the already validated/transformed value
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();

    expect(seen).toEqual([15]);
    expect(result.stageResults.step2.data).toBe(30);
  });

  it("validateInput throws an error → request is not called, error is handled as a regular step error", async () => {
    let requestCalled = false;
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          validateInput: () => {
            throw new Error("invalid input");
          },
          request: async () => {
            requestCalled = true;
            return "unreachable";
          },
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();

    expect(requestCalled).toBe(false);
    expect(result.success).toBe(false);
    expect(result.stageResults.step1.status).toBe("error");
  });

  it("validateOutput sees the result after the after-hook and can transform the final value", async () => {
    const seen: unknown[] = [];
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => [1, 2, 3],
          after: async ({ result }) => (result as number[]).map((x) => x * 10), // [10,20,30]
          validateOutput: (data) => {
            seen.push(data);
            return (data as number[]).length; // replace with the array length
          },
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();

    expect(seen).toEqual([[10, 20, 30]]);
    expect(result.stageResults.step1.data).toBe(3);
  });

  it("validateOutput throws an error → step is marked error, but the stepResult before it is not committed", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => ({ ok: true }),
          validateOutput: () => {
            throw new Error("schema mismatch");
          },
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();

    expect(result.success).toBe(false);
    expect(result.stageResults.step1.status).toBe("error");
  });

  it("errorHandler + recoverStep recovers the step after a validateOutput error", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => "bad-data",
          validateOutput: (data) => {
            if (data === "bad-data") throw new Error("invalid");
            return data;
          },
          errorHandler: () => recoverStep("fallback-value"),
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();

    expect(result.success).toBe(true);
    expect(result.stageResults.step1.status).toBe("success");
    expect(result.stageResults.step1.data).toBe("fallback-value");
  });

  it("also applies to stages inside a ParallelStageGroup (uses the same executeStage)", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          parallel: [
            {
              key: "a",
              request: async () => 1,
              validateOutput: (data) => (data as number) + 100,
            },
            { key: "b", request: async () => 2 },
          ],
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();

    expect(result.stageResults.a.data).toBe(101);
    expect(result.stageResults.b.data).toBe(2);
  });

  it("validateInput/validateOutput receive signal, sharedData and allResults in ctx", async () => {
    let capturedCtx: any;
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => 1,
          validateOutput: (data, ctx) => {
            capturedCtx = ctx;
            return data;
          },
        },
      ],
    };
    const o = new PipelineOrchestrator({
      config,
      httpConfig,
      sharedData: { foo: "bar" },
    });
    await o.run();

    expect(capturedCtx.sharedData).toEqual({ foo: "bar" });
    expect(capturedCtx.signal).toBeInstanceOf(AbortSignal);
    expect(capturedCtx.allResults).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Abort
// ─────────────────────────────────────────────────────────────────────────────
describe("abort()", () => {
  it("abort() interrupts pipeline execution", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "a",
          request: async () => {
            await new Promise((r) => setTimeout(r, 100));
            return 1;
          },
        },
        { key: "b", request: async () => 2 },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    setTimeout(() => o.abort(), 10);
    const result = await o.run();
    expect(o.isAborted()).toBe(true);
    expect(result.success).toBe(false);
  });

  it("isAborted() returns false before abort()", () => {
    const config: PipelineConfig = { stages: [] };
    const o = new PipelineOrchestrator({ config, httpConfig });
    expect(o.isAborted()).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rerunStep
// ─────────────────────────────────────────────────────────────────────────────
describe("rerunStep()", () => {
  it("re-executes a single step", async () => {
    const config: PipelineConfig = {
      stages: [
        { key: "step1", request: async () => ({ v: "ok1" }) },
        {
          key: "step2",
          request: async ({ prev }: any) => ({ v: prev.v + "-ok2" }),
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();
    const res = await o.rerunStep("step2");
    expect(res?.status).toBe("success");
    expect(res?.data).toEqual({ v: "ok1-ok2" });
  });

  it("returns undefined for a non-existent key", async () => {
    const config: PipelineConfig = { stages: [] };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const res = await o.rerunStep("nonexistent");
    expect(res).toBeUndefined();
  });

  it("finds a step inside a parallel group", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "group1",
          parallel: [
            { key: "a", request: async () => 1 },
            { key: "b", request: async () => 2 },
          ],
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();
    const res = await o.rerunStep("a");
    expect(res?.status).toBe("success");
    expect(res?.data).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Parallel steps (Feature #13)
// ─────────────────────────────────────────────────────────────────────────────
describe("Parallel steps (ParallelStageGroup)", () => {
  it("executes the group's steps in parallel", async () => {
    const order: string[] = [];
    const config: PipelineConfig = {
      stages: [
        {
          key: "group",
          parallel: [
            {
              key: "slow",
              request: async () => {
                await new Promise((r) => setTimeout(r, 30));
                order.push("slow");
                return "slow";
              },
            },
            {
              key: "fast",
              request: async () => {
                order.push("fast");
                return "fast";
              },
            },
          ],
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.success).toBe(true);
    expect(result.stageResults.slow.data).toBe("slow");
    expect(result.stageResults.fast.data).toBe("fast");
    // The fast step should finish first
    expect(order[0]).toBe("fast");
  });

  it("pipeline fails if at least one parallel step throws", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "group",
          parallel: [
            { key: "ok", request: async () => 1 },
            {
              key: "fail",
              request: async () => {
                throw new Error("oops");
              },
            },
          ],
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.success).toBe(false);
    expect(result.stageResults.fail.status).toBe("error");
    expect(result.stageResults.ok.status).toBe("success");
  });

  it("sequential steps after the group execute", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "group",
          parallel: [
            { key: "p1", request: async () => 1 },
            { key: "p2", request: async () => 2 },
          ],
        },
        { key: "after", request: async () => "done" },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.success).toBe(true);
    expect(result.stageResults.after.data).toBe("done");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Global middleware (Feature #14)
// ─────────────────────────────────────────────────────────────────────────────
describe("Global middleware", () => {
  it("beforeEach is called before every step", async () => {
    const called: string[] = [];
    const config: PipelineConfig = {
      stages: [
        { key: "step1", request: async () => 1 },
        { key: "step2", request: async () => 2 },
      ],
      middleware: {
        beforeEach: ({ stage }) => {
          called.push(stage.key);
        },
      },
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();
    expect(called).toEqual(["step1", "step2"]);
  });

  it("afterEach is called after every successful step", async () => {
    const results: any[] = [];
    const config: PipelineConfig = {
      stages: [{ key: "step1", request: async () => 42 }],
      middleware: {
        afterEach: ({ result }) => {
          results.push(result.data);
        },
      },
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();
    expect(results).toEqual([42]);
  });

  it("onError is called when a step errors", async () => {
    let errorKey = "";
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => {
            throw new Error("boom");
          },
        },
      ],
      middleware: {
        onError: ({ stage, error }) => {
          errorKey = stage.key;
          expect(error.message).toBe("boom");
        },
      },
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();
    expect(errorKey).toBe("step1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// pause/resume (Feature #15)
// ─────────────────────────────────────────────────────────────────────────────
describe("pause() / resume()", () => {
  it("pipeline waits for resume() after pausing", async () => {
    const order: string[] = [];
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => {
            order.push("step1");
            return 1;
          },
        },
        {
          key: "step2",
          request: async () => {
            order.push("step2");
            return 2;
          },
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });

    // Pause after step1
    o.on("step:step1:success", () => o.pause());

    const runPromise = o.run();
    // Let step1 finish
    await new Promise((r) => setTimeout(r, 20));

    expect(o.isPaused()).toBe(true);
    expect(order).toEqual(["step1"]);

    o.resume();
    await runPromise;

    expect(order).toEqual(["step1", "step2"]);
  });

  it("abort() during pause wakes up the pipeline and finishes it", async () => {
    const config: PipelineConfig = {
      stages: [
        { key: "step1", request: async () => 1 },
        { key: "step2", request: async () => 2 },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    o.on("step:step1:success", () => o.pause());

    const runPromise = o.run();
    await new Promise((r) => setTimeout(r, 20));
    expect(o.isPaused()).toBe(true);

    o.abort();
    await runPromise;
    // pipeline finished (did not hang)
    expect(o.isPaused()).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// exportState / importState (Feature #16)
// ─────────────────────────────────────────────────────────────────────────────
describe("exportState() / importState()", () => {
  it("exports and restores stageResults", async () => {
    const config: PipelineConfig = {
      stages: [
        { key: "step1", request: async () => ({ value: 42 }) },
        { key: "step2", request: async () => "done" },
      ],
    };
    const o1 = new PipelineOrchestrator({ config, httpConfig });
    await o1.run();

    const snapshot = o1.exportState();

    const o2 = new PipelineOrchestrator({ config, httpConfig });
    o2.importState(snapshot);

    expect(o2.getProgress().stageStatuses).toEqual(
      o1.getProgress().stageStatuses,
    );
    const { stageResults } = o2.exportState();
    expect(stageResults.step1.data).toEqual({ value: 42 });
    expect(stageResults.step2.data).toBe("done");
  });

  it("exported logs have string timestamps", async () => {
    const config: PipelineConfig = {
      stages: [{ key: "step1", request: async () => 1 }],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();

    const snap = o.exportState();
    expect(typeof snap.logs[0].timestamp).toBe("string");
    // ISO format
    expect(new Date(snap.logs[0].timestamp).toISOString()).toBe(
      snap.logs[0].timestamp,
    );
  });

  it("importState restores logs with Date objects", async () => {
    const config: PipelineConfig = {
      stages: [{ key: "step1", request: async () => 1 }],
    };
    const o1 = new PipelineOrchestrator({ config, httpConfig });
    await o1.run();
    const snap = o1.exportState();

    const o2 = new PipelineOrchestrator({ config, httpConfig });
    o2.importState(snap);
    const logs = o2.getLogs();
    expect(logs[0].timestamp).toBeInstanceOf(Date);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Step error handling
// ─────────────────────────────────────────────────────────────────────────────
describe("Error handling", () => {
  it("the step's errorHandler catches the error", async () => {
    let handled = false;
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => {
            throw new Error("fail");
          },
          errorHandler: ({ error }) => {
            handled = true;
            return { message: `handled: ${(error as Error).message}` };
          },
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(handled).toBe(true);
    expect(result.stageResults.step1.status).toBe("error");
  });

  it("pipeline stops on error without an errorHandler", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => {
            throw new Error("boom");
          },
        },
        { key: "step2", request: async () => "unreachable" },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.success).toBe(false);
    expect(result.stageResults.step2).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sharedData
// ─────────────────────────────────────────────────────────────────────────────
describe("sharedData", () => {
  it("sharedData is accessible to all steps and can be mutated", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async ({ sharedData }) => {
            sharedData.token = "abc";
            return 1;
          },
        },
        {
          key: "step2",
          request: async ({ sharedData }) => sharedData.token,
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig, sharedData: {} });
    const result = await o.run();
    expect(result.stageResults.step2.data).toBe("abc");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// continueOnError (Category 1.3)
// ─────────────────────────────────────────────────────────────────────────────
describe("continueOnError", () => {
  it("global continueOnError — pipeline continues execution after an error", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => {
            throw new Error("fail");
          },
        },
        { key: "step2", request: async () => "done" },
      ],
      options: { continueOnError: true },
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    // success is unchanged (no error without continueOnError), but both steps ran
    expect(result.stageResults.step1.status).toBe("error");
    expect(result.stageResults.step2.status).toBe("success");
    expect(result.stageResults.step2.data).toBe("done");
  });

  it("local continueOnError on a step — only that step continues", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => {
            throw new Error("fail");
          },
          continueOnError: true,
        },
        { key: "step2", request: async () => "done" },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.stageResults.step1.status).toBe("error");
    expect(result.stageResults.step2.status).toBe("success");
  });

  it("without continueOnError — pipeline stops on error (default behavior)", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => {
            throw new Error("fail");
          },
        },
        { key: "step2", request: async () => "unreachable" },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.success).toBe(false);
    expect(result.stageResults.step2).toBeUndefined();
  });

  it("continueOnError for a parallel group", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "group1",
          parallel: [
            {
              key: "a",
              request: async () => {
                throw new Error("fail-a");
              },
            },
            { key: "b", request: async () => "ok-b" },
          ],
          continueOnError: true,
        },
        { key: "step3", request: async () => "after-group" },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.stageResults.a.status).toBe("error");
    expect(result.stageResults.b.status).toBe("success");
    expect(result.stageResults.step3.status).toBe("success");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// pipelineTimeoutMs (Category 1.5)
// ─────────────────────────────────────────────────────────────────────────────
describe("pipelineTimeoutMs", () => {
  it("pipeline is automatically aborted on timeout", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "slow",
          request: async () => {
            await new Promise((resolve) => setTimeout(resolve, 500));
            return "done";
          },
        },
      ],
      options: { pipelineTimeoutMs: 50 },
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    // The pipeline should abort before completing (success: false or a step in error/pending)
    expect(result.success).toBe(false);
  }, 2000);

  it("pipeline finishes normally if it stays within the timeout", async () => {
    const config: PipelineConfig = {
      stages: [{ key: "fast", request: async () => "quick" }],
      options: { pipelineTimeoutMs: 5000 },
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.success).toBe(true);
    expect(result.stageResults.fast.data).toBe("quick");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// pipelineRetry (Category 1.4)
// ─────────────────────────────────────────────────────────────────────────────
describe("pipelineRetry", () => {
  it("pipeline restarts on failure", async () => {
    let attempt = 0;
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => {
            attempt++;
            if (attempt < 3) throw new Error("not ready yet");
            return "ok";
          },
        },
      ],
      options: {
        pipelineRetry: { attempts: 3, delayMs: 0 },
      },
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.success).toBe(true);
    expect(attempt).toBe(3);
  });

  it("pipeline returns failure if all attempts are exhausted", async () => {
    let attempts = 0;
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => {
            attempts++;
            throw new Error("always fails");
          },
        },
      ],
      options: {
        pipelineRetry: { attempts: 2, delayMs: 0 },
      },
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.success).toBe(false);
    // 1 initial run + 2 retries = 3 attempts
    expect(attempts).toBe(3);
  });

  it("retryFrom: failed-step — restarts only from the failed step", async () => {
    const executed: string[] = [];
    let step2Attempts = 0;
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => {
            executed.push("step1");
            return "data1";
          },
        },
        {
          key: "step2",
          request: async () => {
            executed.push("step2");
            step2Attempts++;
            if (step2Attempts < 2) throw new Error("fail once");
            return "data2";
          },
        },
      ],
      options: {
        pipelineRetry: { attempts: 1, delayMs: 0, retryFrom: "failed-step" },
      },
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.success).toBe(true);
    // step1 ran only once, step2 ran twice
    expect(executed.filter((k) => k === "step1").length).toBe(1);
    expect(executed.filter((k) => k === "step2").length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DAG transitions (next) (Category 1.1)
// ─────────────────────────────────────────────────────────────────────────────
describe("DAG next transitions", () => {
  it("next() skips steps and jumps to the specified key", async () => {
    const executed: string[] = [];
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => {
            executed.push("step1");
            return "a";
          },
          next: ({ result }) => (result === "a" ? "step3" : null),
        },
        {
          key: "step2",
          request: async () => {
            executed.push("step2");
            return "b";
          },
        },
        {
          key: "step3",
          request: async () => {
            executed.push("step3");
            return "c";
          },
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.success).toBe(true);
    expect(executed).toEqual(["step1", "step3"]);
    expect(result.stageResults.step2).toBeUndefined();
  });

  it("next() returns null — continues in order", async () => {
    const executed: string[] = [];
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => {
            executed.push("step1");
            return "x";
          },
          next: () => null,
        },
        {
          key: "step2",
          request: async () => {
            executed.push("step2");
            return "y";
          },
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.success).toBe(true);
    expect(executed).toEqual(["step1", "step2"]);
  });

  it("next() with a non-existent key — pipeline finishes without an error", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => "val",
          next: () => "nonexistent",
        },
        {
          key: "step2",
          request: async () => "should not run",
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.success).toBe(true);
    expect(result.stageResults.step2).toBeUndefined();
  });

  it("guards against an infinite loop via maxSteps", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => "loop",
          next: () => "step1", // always jumps to itself → infinite loop
        },
      ],
      options: { maxSteps: 5 },
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    // the pipeline should fail because maxSteps was exceeded
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sub-pipeline (Category 1.2)
// ─────────────────────────────────────────────────────────────────────────────
describe("SubPipeline", () => {
  it("executes a nested pipeline as a step", async () => {
    const config: PipelineConfig = {
      stages: [
        { key: "pre", request: async () => "before" },
        {
          key: "sub",
          subPipeline: {
            stages: [{ key: "inner1", request: async () => "inner-result" }],
          },
        },
        { key: "post", request: async () => "after" },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.success).toBe(true);
    expect(result.stageResults.pre.status).toBe("success");
    expect(result.stageResults.sub.status).toBe("success");
    expect(result.stageResults.post.status).toBe("success");
    // the nested step's data is a PipelineResult
    expect((result.stageResults.sub.data as any).success).toBe(true);
    expect((result.stageResults.sub.data as any).stageResults.inner1.data).toBe(
      "inner-result",
    );
  });

  it("a sub-pipeline error stops the parent pipeline", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "sub",
          subPipeline: {
            stages: [
              {
                key: "fail",
                request: async () => {
                  throw new Error("inner fail");
                },
              },
            ],
          },
        },
        { key: "post", request: async () => "after" },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.success).toBe(false);
    expect(result.stageResults.post).toBeUndefined();
  });

  it("sub-pipeline with continueOnError — the parent pipeline continues", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "sub",
          subPipeline: {
            stages: [
              {
                key: "fail",
                request: async () => {
                  throw new Error("inner fail");
                },
              },
            ],
          },
          continueOnError: true,
        },
        { key: "post", request: async () => "continues" },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.stageResults.post.status).toBe("success");
    expect(result.stageResults.post.data).toBe("continues");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getStageResults() (Category 3.2)
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// AbortSignal in step hooks
// ─────────────────────────────────────────────────────────────────────────────
describe("signal in step hooks", () => {
  it("request/before/after/condition receive an AbortSignal", async () => {
    const seen: AbortSignal[] = [];
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          condition: ({ signal }) => {
            seen.push(signal);
            return true;
          },
          before: ({ signal }) => {
            seen.push(signal);
          },
          request: async ({ signal }) => {
            seen.push(signal);
            return "ok";
          },
          after: ({ result, signal }) => {
            seen.push(signal);
            return result;
          },
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();
    expect(seen.length).toBe(4);
    expect(seen.every((s) => s instanceof AbortSignal)).toBe(true);
    expect(new Set(seen).size).toBe(1); // the same signal in every hook
  });

  it("signal.aborted becomes true after abort() inside a long-running request", async () => {
    let abortedSeenInRequest = false;
    const config: PipelineConfig = {
      stages: [
        {
          key: "slow",
          request: async ({ signal }) => {
            await new Promise((r) => setTimeout(r, 50));
            abortedSeenInRequest = signal.aborted;
            return "done";
          },
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    setTimeout(() => o.abort(), 10);
    await o.run();
    expect(abortedSeenInRequest).toBe(true);
  });

  it("errorHandler receives the signal", async () => {
    let receivedSignal: AbortSignal | undefined;
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => {
            throw new Error("fail");
          },
          errorHandler: ({ signal }) => {
            receivedSignal = signal;
            return new Error("handled");
          },
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// errorHandler recovery (recoverStep)
// ─────────────────────────────────────────────────────────────────────────────
describe("errorHandler recovery (recoverStep)", () => {
  it("errorHandler with recoverStep() recovers the step as success", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => {
            throw new Error("boom");
          },
          errorHandler: () => recoverStep("fallback-value"),
        },
        { key: "step2", request: async ({ prev }) => `${prev}-next` },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.success).toBe(true);
    expect(result.stageResults.step1.status).toBe("success");
    expect(result.stageResults.step1.data).toBe("fallback-value");
    expect(result.stageResults.step2.data).toBe("fallback-value-next");
  });

  it("a recovered step emits step:success, not step:error", async () => {
    const events: string[] = [];
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => {
            throw new Error("boom");
          },
          errorHandler: () => recoverStep(0),
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    o.on("step:step1:success", () => events.push("success"));
    o.on("step:step1:error", () => events.push("error"));
    await o.run();
    expect(events).toEqual(["success"]);
  });

  it("errorHandler without the recover form still treats the step as an error (backward compatibility)", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => {
            throw new Error("boom");
          },
          errorHandler: ({ error }) => new Error(`wrapped: ${(error as Error).message}`),
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.success).toBe(false);
    expect(result.stageResults.step1.status).toBe("error");
    expect(result.stageResults.step1.error?.message).toBe("wrapped: boom");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// concurrency limit for ParallelStageGroup
// ─────────────────────────────────────────────────────────────────────────────
describe("ParallelStageGroup.concurrency", () => {
  it("without concurrency runs all steps at once (as before)", async () => {
    let maxActive = 0;
    let active = 0;
    const make = (key: string) => ({
      key,
      request: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
        return key;
      },
    });
    const config: PipelineConfig = {
      stages: [
        { key: "group", parallel: [make("a"), make("b"), make("c"), make("d")] },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();
    expect(maxActive).toBe(4);
  });

  it("with concurrency limits the number of simultaneous executions", async () => {
    let maxActive = 0;
    let active = 0;
    const make = (key: string) => ({
      key,
      request: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
        return key;
      },
    });
    const config: PipelineConfig = {
      stages: [
        {
          key: "group",
          parallel: [make("a"), make("b"), make("c"), make("d")],
          concurrency: 2,
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(result.success).toBe(true);
    expect(result.stageResults.a.data).toBe("a");
    expect(result.stageResults.d.data).toBe("d");
  });

  it("preserves result order regardless of completion order under limited concurrency", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "group",
          parallel: [
            { key: "slow", request: async () => { await new Promise((r) => setTimeout(r, 30)); return "slow"; } },
            { key: "fast", request: async () => "fast" },
          ],
          concurrency: 1,
        },
      ],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.stageResults.slow.data).toBe("slow");
    expect(result.stageResults.fast.data).toBe("fast");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runId (tracing)
// ─────────────────────────────────────────────────────────────────────────────
describe("runId", () => {
  it("getRunId() is empty before the first run", () => {
    const config: PipelineConfig = { stages: [{ key: "a", request: async () => 1 }] };
    const o = new PipelineOrchestrator({ config, httpConfig });
    expect(o.getRunId()).toBe("");
  });

  it("run() generates a runId available via getRunId() and in metrics", async () => {
    const seenRunIds: string[] = [];
    const config: PipelineConfig = {
      stages: [{ key: "a", request: async () => 1 }],
      metrics: {
        onPipelineStart: ({ runId }) => seenRunIds.push(runId),
        onPipelineEnd: ({ runId }) => seenRunIds.push(runId),
        onStepDuration: ({ runId }) => seenRunIds.push(runId),
      },
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();
    expect(o.getRunId()).not.toBe("");
    expect(seenRunIds.every((id) => id === o.getRunId())).toBe(true);
  });

  it("different run() calls give different runIds", async () => {
    const config: PipelineConfig = { stages: [{ key: "a", request: async () => 1 }] };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();
    const first = o.getRunId();
    await o.run();
    const second = o.getRunId();
    expect(first).not.toBe(second);
  });

  it("PipelineStepEvent and logs contain the current runId", async () => {
    let eventRunId: string | undefined;
    const config: PipelineConfig = {
      stages: [{ key: "a", request: async () => 1 }],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    o.on("step:a:success", (e) => { eventRunId = e.runId; });
    await o.run();
    expect(eventRunId).toBe(o.getRunId());
    expect(o.getLogs().every((l) => (l as any).runId === o.getRunId())).toBe(true);
  });

  it("rerunStep() generates its own runId, different from the original run()", async () => {
    const config: PipelineConfig = { stages: [{ key: "a", request: async () => 1 }] };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();
    const runRunId = o.getRunId();
    await o.rerunStep("a");
    expect(o.getRunId()).not.toBe(runRunId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("getStageResults()", () => {
  it("returns a synchronous snapshot of the results", async () => {
    const config: PipelineConfig = {
      stages: [{ key: "step1", request: async () => 42 }],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();
    const results = o.getStageResults();
    expect(results.step1.status).toBe("success");
    expect(results.step1.data).toBe(42);
  });

  it("returns an empty object before the pipeline runs", () => {
    const config: PipelineConfig = {
      stages: [{ key: "step1", request: async () => 1 }],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    expect(o.getStageResults()).toEqual({});
  });
});
