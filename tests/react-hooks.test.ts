import {
  PipelineOrchestrator,
  usePipelineProgressReact,
  usePipelineRunReact,
  usePipelineStepEventReact,
  usePipelineLogsReact,
  useRerunPipelineStepReact,
  useRestClientReact,
} from "rest-pipeline-js";
import { renderHook, act } from "@testing-library/react";

describe("React hooks", () => {
  const pipelineConfig = {
    stages: [
      { key: "a", request: async () => 1 },
      { key: "b", request: async (prev) => prev + 1 },
    ],
  };
  const httpConfig = { baseURL: "http://localhost" };
  const orchestrator = new PipelineOrchestrator({
    config: pipelineConfig,
    httpConfig,
  });

  it("usePipelineProgressReact returns progress", () => {
    const { result } = renderHook(() => usePipelineProgressReact(orchestrator));
    expect(result.current).toBeDefined();
  });

  it("usePipelineRunReact returns tuple", () => {
    const { result } = renderHook(() => usePipelineRunReact(orchestrator));
    expect(Array.isArray(result.current)).toBe(true);
    expect(typeof result.current[0]).toBe("function");
  });

  it("usePipelineStepEventReact returns value", () => {
    const { result } = renderHook(() =>
      usePipelineStepEventReact(orchestrator, "a", "success")
    );
    expect(result.current).toBeNull();
  });

  it("usePipelineLogsReact returns array", () => {
    const { result } = renderHook(() => usePipelineLogsReact(orchestrator));
    expect(Array.isArray(result.current)).toBe(true);
  });

  it("useRerunPipelineStepReact returns function", () => {
    const { result } = renderHook(() =>
      useRerunPipelineStepReact(orchestrator)
    );
    expect(typeof result.current).toBe("function");
  });

  it("useRestClientReact returns client", () => {
    const { result } = renderHook(() =>
      useRestClientReact({ baseURL: "http://localhost" })
    );
    expect(result.current).toBeDefined();
  });
});
