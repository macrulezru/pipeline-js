import { PipelineOrchestrator } from "../src/pipeline-orchestrator";
import type { PipelineConfig } from "../src/types";

describe("PipelineOrchestrator", () => {
  const pipelineConfig: PipelineConfig = {
    stages: [
      { key: "step1", request: async () => "ok1" },
      { key: "step2", request: async (prev) => prev + "-ok2" },
    ],
  };
  const httpConfig = { baseURL: "http://localhost" };

  it("run() - basic pipeline", async () => {
    const orchestrator = new PipelineOrchestrator({
      config: pipelineConfig,
      httpConfig,
    });
    const result = await orchestrator.run();
    expect(result.success).toBe(true);
    expect(result.stageResults.step1.data).toBe("ok1");
    expect(result.stageResults.step2.data).toBe("ok1-ok2");
  });

  it("subscribeProgress() - should receive progress updates", async () => {
    const orchestrator = new PipelineOrchestrator({
      config: pipelineConfig,
      httpConfig,
    });
    const updates: any[] = [];
    orchestrator.subscribeProgress((progress) => updates.push(progress));
    await orchestrator.run();
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0]).toHaveProperty("currentStage");
  });

  it("subscribeStageResults() - should receive stage results", async () => {
    const orchestrator = new PipelineOrchestrator({
      config: pipelineConfig,
      httpConfig,
    });
    const results: any[] = [];
    orchestrator.subscribeStageResults((r) => results.push(r));
    await orchestrator.run();
    expect(results.length).toBeGreaterThan(0);
    expect(results[results.length - 1].step2.data).toBe("ok1-ok2");
  });

  it("on() - should handle custom events", async () => {
    const orchestrator = new PipelineOrchestrator({
      config: pipelineConfig,
      httpConfig,
    });
    let called = false;
    orchestrator.on("step:step1:success", () => {
      called = true;
    });
    await orchestrator.run();
    expect(called).toBe(true);
  });

  it("rerunStep() - should rerun a single step", async () => {
    const orchestrator = new PipelineOrchestrator({
      config: pipelineConfig,
      httpConfig,
    });
    await orchestrator.run();
    const res = await orchestrator.rerunStep("step2");
    expect(res?.status).toBe("success");
    expect(res?.data).toBe("ok1-ok2");
  });

  it("abort() and isAborted()", async () => {
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
    const orchestrator = new PipelineOrchestrator({ config, httpConfig });
    setTimeout(() => orchestrator.abort(), 10);
    const result = await orchestrator.run();
    expect(orchestrator.isAborted()).toBe(true);
    expect(result.success).toBe(false);
  });

  it("clearStageResults() - should reset results and progress", async () => {
    const orchestrator = new PipelineOrchestrator({
      config: pipelineConfig,
      httpConfig,
    });
    await orchestrator.run();
    orchestrator.clearStageResults();
    const progress = orchestrator.getProgress();
    expect(progress.currentStage).toBe(0);
    expect(Object.keys(orchestrator["stageResults"]).length).toBe(0);
  });

  it("getLogs() - should return logs", async () => {
    const orchestrator = new PipelineOrchestrator({
      config: pipelineConfig,
      httpConfig,
    });
    await orchestrator.run();
    const logs = orchestrator.getLogs();
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
  });

  it("getProgress() and getProgressRef()", async () => {
    const orchestrator = new PipelineOrchestrator({
      config: pipelineConfig,
      httpConfig,
    });
    await orchestrator.run();
    const progress = orchestrator.getProgress();
    expect(progress).toHaveProperty("currentStage");
    const progressRef = orchestrator.getProgressRef();
    expect(progressRef).toHaveProperty("currentStage");
  });
});
