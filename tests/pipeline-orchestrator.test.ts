import { PipelineOrchestrator } from "../src/pipeline-orchestrator";
import type { PipelineConfig } from "../src/types";

const httpConfig = { baseURL: "http://localhost" };

// ─────────────────────────────────────────────────────────────────────────────
// Базовые тесты (регрессия)
// ─────────────────────────────────────────────────────────────────────────────
describe("PipelineOrchestrator — базовое выполнение", () => {
  const pipelineConfig: PipelineConfig = {
    stages: [
      { key: "step1", request: async () => ({ v: "ok1" }) },
      {
        key: "step2",
        request: async ({ prev }: any) => ({ v: prev.v + "-ok2" }),
      },
    ],
  };

  it("run() — успешное последовательное выполнение", async () => {
    const o = new PipelineOrchestrator({ config: pipelineConfig, httpConfig });
    const result = await o.run();
    expect(result.success).toBe(true);
    expect(result.stageResults.step1.data).toEqual({ v: "ok1" });
    expect(result.stageResults.step2.data).toEqual({ v: "ok1-ok2" });
  });

  it("subscribeProgress() — получает обновления прогресса", async () => {
    const o = new PipelineOrchestrator({ config: pipelineConfig, httpConfig });
    const updates: any[] = [];
    o.subscribeProgress((p) => updates.push(p));
    await o.run();
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0]).toHaveProperty("currentStage");
  });

  it("subscribeStageResults() — получает результаты шагов", async () => {
    const o = new PipelineOrchestrator({ config: pipelineConfig, httpConfig });
    const snapshots: any[] = [];
    o.subscribeStageResults((r) => snapshots.push(r));
    await o.run();
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots[snapshots.length - 1].step2.data).toEqual({
      v: "ok1-ok2",
    });
  });

  it("on() — обрабатывает пользовательские события", async () => {
    const o = new PipelineOrchestrator({ config: pipelineConfig, httpConfig });
    let called = false;
    o.on("step:step1:success", () => {
      called = true;
    });
    await o.run();
    expect(called).toBe(true);
  });

  it("getLogs() — возвращает логи", async () => {
    const o = new PipelineOrchestrator({ config: pipelineConfig, httpConfig });
    await o.run();
    const logs = o.getLogs();
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
  });

  it("getProgress() и getProgressRef() — возвращают снимки (не живую ссылку)", async () => {
    const o = new PipelineOrchestrator({ config: pipelineConfig, httpConfig });
    await o.run();
    const p = o.getProgress();
    const ref = o.getProgressRef();
    expect(p).toHaveProperty("currentStage");
    expect(ref).toHaveProperty("currentStage");
    // Bug #12 fix: getProgressRef() должен возвращать копию, не мутабельную ссылку
    expect(ref).not.toBe((o as any).progress.progress);
  });

  it("clearStageResults() — сбрасывает результаты и прогресс", async () => {
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
  it("пропускает шаг со статусом 'skipped' когда condition возвращает false", async () => {
    const config: PipelineConfig = {
      stages: [
        { key: "step1", request: async () => 42 },
        {
          key: "step2",
          condition: () => false,
          request: async () => {
            throw new Error("не должно вызываться");
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

  it("выполняет шаг когда condition возвращает true", async () => {
    const config: PipelineConfig = {
      stages: [{ key: "step1", request: async () => 1, condition: () => true }],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    expect(result.stageResults.step1.status).toBe("success");
    expect(result.stageResults.step1.data).toBe(1);
  });

  it("condition получает prev и allResults", async () => {
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

  it("emituje событие step:key:skipped", async () => {
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
// Bug #2: request() вызывается один раз
// ─────────────────────────────────────────────────────────────────────────────
describe("Bug #2 fix — request() вызывается ровно один раз", () => {
  it("не вызывает request() дважды (нет двойных побочных эффектов)", async () => {
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
// Bug #3: rerunStep вызывает before/after хуки
// ─────────────────────────────────────────────────────────────────────────────
describe("Bug #3 fix — rerunStep() вызывает before/after хуки", () => {
  it("before хук вызывается при rerunStep", async () => {
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
    beforeCalled = false; // сбрасываем флаг

    await o.rerunStep("step1");
    expect(beforeCalled).toBe(true);
  });

  it("after хук вызывается при rerunStep и трансформирует результат", async () => {
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

  it("condition проверяется при rerunStep", async () => {
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
// Bug #5: нет двойного emit событий
// ─────────────────────────────────────────────────────────────────────────────
describe("Bug #5 fix — нет двойного emit при rerunStep", () => {
  it("step:success эмитируется ровно один раз при rerunStep", async () => {
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

  it("step:start эмитируется ровно один раз при rerunStep", async () => {
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
// Bug #11: autoReset очищает логи
// ─────────────────────────────────────────────────────────────────────────────
describe("Bug #11 fix — autoReset очищает логи", () => {
  it("логи очищаются между запусками когда autoReset=true", async () => {
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
    // Логи должны быть такими же по количеству, не накапливаться
    expect(logsAfterSecond.length).toBe(logsAfterFirst.length);
  });

  it("без autoReset логи накапливаются", async () => {
    const config: PipelineConfig = {
      stages: [{ key: "step1", request: async () => 1 }],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();
    const countAfterFirst = o.getLogs().length;
    await o.run();
    expect(o.getLogs().length).toBeGreaterThan(countAfterFirst);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// before/after хуки (run)
// ─────────────────────────────────────────────────────────────────────────────
describe("before/after хуки", () => {
  it("before модифицирует входные данные для request", async () => {
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
    // before делает prev 10+5=15, request 15*2=30
    expect(result.stageResults.step2.data).toBe(30);
  });

  it("after трансформирует результат шага", async () => {
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
// Abort
// ─────────────────────────────────────────────────────────────────────────────
describe("abort()", () => {
  it("abort() прерывает выполнение pipeline", async () => {
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

  it("isAborted() возвращает false до abort()", () => {
    const config: PipelineConfig = { stages: [] };
    const o = new PipelineOrchestrator({ config, httpConfig });
    expect(o.isAborted()).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rerunStep
// ─────────────────────────────────────────────────────────────────────────────
describe("rerunStep()", () => {
  it("повторно выполняет один шаг", async () => {
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

  it("возвращает undefined для несуществующего ключа", async () => {
    const config: PipelineConfig = { stages: [] };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const res = await o.rerunStep("nonexistent");
    expect(res).toBeUndefined();
  });

  it("находит шаг внутри параллельной группы", async () => {
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
// Параллельные шаги (Feature #13)
// ─────────────────────────────────────────────────────────────────────────────
describe("Параллельные шаги (ParallelStageGroup)", () => {
  it("выполняет шаги группы параллельно", async () => {
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
    // Быстрый шаг должен завершиться первым
    expect(order[0]).toBe("fast");
  });

  it("pipeline завершается с ошибкой если хотя бы один параллельный шаг упал", async () => {
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

  it("последовательные шаги после группы выполняются", async () => {
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
  it("beforeEach вызывается перед каждым шагом", async () => {
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

  it("afterEach вызывается после каждого успешного шага", async () => {
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

  it("onError вызывается при ошибке шага", async () => {
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
  it("pipeline ждёт resume() после паузы", async () => {
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

    // Паузируем после step1
    o.on("step:step1:success", () => o.pause());

    const runPromise = o.run();
    // Даём step1 выполниться
    await new Promise((r) => setTimeout(r, 20));

    expect(o.isPaused()).toBe(true);
    expect(order).toEqual(["step1"]);

    o.resume();
    await runPromise;

    expect(order).toEqual(["step1", "step2"]);
  });

  it("abort() во время паузы разбудит pipeline и завершит его", async () => {
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
    // pipeline завершился (не завис)
    expect(o.isPaused()).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// exportState / importState (Feature #16)
// ─────────────────────────────────────────────────────────────────────────────
describe("exportState() / importState()", () => {
  it("экспортирует и восстанавливает stageResults", async () => {
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

  it("экспортированные логи имеют строковые timestamps", async () => {
    const config: PipelineConfig = {
      stages: [{ key: "step1", request: async () => 1 }],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();

    const snap = o.exportState();
    expect(typeof snap.logs[0].timestamp).toBe("string");
    // ISO формат
    expect(new Date(snap.logs[0].timestamp).toISOString()).toBe(
      snap.logs[0].timestamp,
    );
  });

  it("importState восстанавливает логи с объектами Date", async () => {
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
// Обработка ошибок шага
// ─────────────────────────────────────────────────────────────────────────────
describe("Обработка ошибок", () => {
  it("errorHandler шага перехватывает ошибку", async () => {
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

  it("pipeline останавливается при ошибке без errorHandler", async () => {
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
  it("sharedData доступен всем шагам и можно мутировать", async () => {
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
// continueOnError (Категория 1.3)
// ─────────────────────────────────────────────────────────────────────────────
describe("continueOnError", () => {
  it("глобальный continueOnError — pipeline продолжает выполнение после ошибки", async () => {
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
    // success не изменился (нет ошибки без continueOnError), но оба шага выполнены
    expect(result.stageResults.step1.status).toBe("error");
    expect(result.stageResults.step2.status).toBe("success");
    expect(result.stageResults.step2.data).toBe("done");
  });

  it("локальный continueOnError на шаге — только этот шаг продолжает", async () => {
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

  it("без continueOnError — pipeline останавливается при ошибке (поведение по умолчанию)", async () => {
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

  it("continueOnError для параллельной группы", async () => {
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
// pipelineTimeoutMs (Категория 1.5)
// ─────────────────────────────────────────────────────────────────────────────
describe("pipelineTimeoutMs", () => {
  it("pipeline автоматически прерывается по таймауту", async () => {
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
    // Pipeline должен прерваться до завершения (success: false или шаг в error/pending)
    expect(result.success).toBe(false);
  }, 2000);

  it("pipeline завершается нормально если укладывается в таймаут", async () => {
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
// pipelineRetry (Категория 1.4)
// ─────────────────────────────────────────────────────────────────────────────
describe("pipelineRetry", () => {
  it("pipeline перезапускается при неуспехе", async () => {
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

  it("pipeline возвращает failure если исчерпаны все попытки", async () => {
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
    // 1 первичный запуск + 2 retry = 3 попытки
    expect(attempts).toBe(3);
  });

  it("retryFrom: failed-step — перезапускает только с упавшего шага", async () => {
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
    // step1 выполнен только 1 раз, step2 выполнен 2 раза
    expect(executed.filter((k) => k === "step1").length).toBe(1);
    expect(executed.filter((k) => k === "step2").length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DAG-переходы (next) (Категория 1.1)
// ─────────────────────────────────────────────────────────────────────────────
describe("DAG next transitions", () => {
  it("next() пропускает шаги и переходит к указанному ключу", async () => {
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

  it("next() возвращает null — продолжение по порядку", async () => {
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

  it("next() с несуществующим ключом — pipeline завершается без ошибки", async () => {
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

  it("защита от бесконечного цикла через maxSteps", async () => {
    const config: PipelineConfig = {
      stages: [
        {
          key: "step1",
          request: async () => "loop",
          next: () => "step1", // всегда переходит к себе → бесконечный цикл
        },
      ],
      options: { maxSteps: 5 },
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    const result = await o.run();
    // pipeline должен завершиться с неуспехом из-за превышения maxSteps
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sub-pipeline (Категория 1.2)
// ─────────────────────────────────────────────────────────────────────────────
describe("SubPipeline", () => {
  it("выполняет вложенный pipeline как шаг", async () => {
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
    // data вложенного шага — это PipelineResult
    expect((result.stageResults.sub.data as any).success).toBe(true);
    expect((result.stageResults.sub.data as any).stageResults.inner1.data).toBe(
      "inner-result",
    );
  });

  it("sub-pipeline с ошибкой останавливает родительский pipeline", async () => {
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

  it("sub-pipeline с continueOnError — родительский pipeline продолжает", async () => {
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
// getStageResults() (Категория 3.2)
// ─────────────────────────────────────────────────────────────────────────────
describe("getStageResults()", () => {
  it("возвращает синхронный снимок результатов", async () => {
    const config: PipelineConfig = {
      stages: [{ key: "step1", request: async () => 42 }],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    await o.run();
    const results = o.getStageResults();
    expect(results.step1.status).toBe("success");
    expect(results.step1.data).toBe(42);
  });

  it("возвращает пустой объект до запуска pipeline", () => {
    const config: PipelineConfig = {
      stages: [{ key: "step1", request: async () => 1 }],
    };
    const o = new PipelineOrchestrator({ config, httpConfig });
    expect(o.getStageResults()).toEqual({});
  });
});
