import type {
  PipelineConfig,
  PipelineResult,
  PipelineStepEvent,
  PipelineStepStatus,
  ApiError,
  HttpConfig,
  ApiResponse,
  ParallelStageGroup,
  PipelineMiddleware,
  PipelineExportedState,
  PipelineItem,
} from "../src/types";

describe("Types", () => {
  it("PipelineConfig принимает обычные шаги", () => {
    const config: PipelineConfig = { stages: [] };
    expect(config.stages).toBeDefined();
  });

  it("PipelineConfig принимает параллельные группы (Feature #13)", () => {
    const group: ParallelStageGroup = {
      key: "group",
      parallel: [
        { key: "a", request: async () => 1 },
        { key: "b", request: async () => 2 },
      ],
    };
    const config: PipelineConfig = { stages: [group] };
    expect(config.stages[0]).toHaveProperty("parallel");
  });

  it("PipelineConfig принимает смешанные шаги и группы", () => {
    const item1: PipelineItem = { key: "s1", request: async () => 1 };
    const item2: PipelineItem = { key: "g1", parallel: [{ key: "p1" }] };
    const config: PipelineConfig = { stages: [item1, item2] };
    expect(config.stages.length).toBe(2);
  });

  it("PipelineConfig принимает middleware (Feature #14)", () => {
    const middleware: PipelineMiddleware = {
      beforeEach: () => {},
      afterEach: () => {},
      onError: () => {},
    };
    const config: PipelineConfig = { stages: [], middleware };
    expect(config.middleware).toBeDefined();
  });

  it("ApiError корректно типизируется", () => {
    const err: ApiError = { message: "fail" };
    expect(err.message).toBe("fail");
  });

  it("PipelineStepEvent теперь экспортируется из types (не из orchestrator)", () => {
    // Тип импортируется из types.ts без ошибок
    const event: PipelineStepEvent = {
      stepIndex: 0,
      stepKey: "test",
      status: "success" as PipelineStepStatus,
      stageResults: {},
    };
    expect(event.stepKey).toBe("test");
  });

  it("PipelineExportedState типизируется корректно (Feature #16)", () => {
    const snap: PipelineExportedState = {
      stageResults: {
        step1: { status: "success", data: 42 },
      },
      logs: [
        { type: "log", message: "test", timestamp: new Date().toISOString() },
      ],
    };
    expect(snap.stageResults.step1.data).toBe(42);
  });

  it("PipelineResult типизируется корректно", () => {
    const result: PipelineResult = {
      stageResults: {},
      success: true,
    };
    expect(result.success).toBe(true);
  });

  it("HttpConfig принимает cache и rateLimit (не только типы)", () => {
    const config: HttpConfig = {
      baseURL: "http://localhost",
      cache: { enabled: true, ttlMs: 5000 },
      rateLimit: { maxConcurrent: 2, maxRequestsPerInterval: 10, intervalMs: 1000 },
    };
    expect(config.cache?.enabled).toBe(true);
    expect(config.rateLimit?.maxConcurrent).toBe(2);
  });

  it("ApiResponse типизируется корректно", () => {
    const resp: ApiResponse<{ id: number }> = {
      data: { id: 1 },
      status: 200,
      statusText: "OK",
      headers: {},
    };
    expect(resp.data.id).toBe(1);
  });
});
