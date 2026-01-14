import { ref } from "vue";
import {
  PipelineOrchestrator,
  usePipelineProgressVue,
  usePipelineRunVue,
  usePipelineStepEventVue,
  usePipelineLogsVue,
  useRerunPipelineStepVue,
  useRestClientVue,
} from "rest-pipeline-js";

describe("Vue hooks", () => {
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

  it("usePipelineProgressVue returns ref", () => {
    const progress = usePipelineProgressVue(orchestrator);
    expect(progress.value).toBeDefined();
  });

  it("usePipelineRunVue returns correct structure", () => {
    const run = usePipelineRunVue(orchestrator);
    expect(run).toHaveProperty("run");
    expect(run).toHaveProperty("running");
    expect(run).toHaveProperty("result");
    expect(run).toHaveProperty("error");
  });

  it("usePipelineStepEventVue returns ref", () => {
    const event = usePipelineStepEventVue(orchestrator, "a", "success");
    expect(event.value).toBeNull();
  });

  it("usePipelineLogsVue returns ref", () => {
    const logs = usePipelineLogsVue(orchestrator);
    expect(logs.value).toBeInstanceOf(Array);
  });

  it("useRerunPipelineStepVue returns function", () => {
    const rerun = useRerunPipelineStepVue(orchestrator);
    expect(typeof rerun).toBe("function");
  });

  it("useRestClientVue returns computed", () => {
    const client = useRestClientVue({ baseURL: "http://localhost" });
    expect(client.value).toBeDefined();
  });
});
