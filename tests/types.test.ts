import type {
  PipelineConfig,
  PipelineResult,
  PipelineStepEvent,
  PipelineStepStatus,
  ApiError,
  HttpConfig,
  ApiResponse,
} from "../src/types";

describe("Types", () => {
  it("should allow to create PipelineConfig", () => {
    const config: PipelineConfig = { stages: [] };
    expect(config.stages).toBeDefined();
  });
  it("should allow to create ApiError", () => {
    const err: ApiError = { message: "fail" };
    expect(err.message).toBe("fail");
  });
});
