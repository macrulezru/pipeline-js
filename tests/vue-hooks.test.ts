import { createApp, type App } from "vue";
import {
  PipelineOrchestrator,
  usePipelineProgressVue,
  usePipelineRunVue,
  usePipelineStepEventVue,
  usePipelineLogsVue,
  useRerunPipelineStepVue,
  useRestClientVue,
} from "rest-pipeline-js/vue";

/**
 * Runs `composable` inside a real component `setup()` and mounts it, so lifecycle
 * hooks used by the composable (e.g. `onUnmounted` for unsubscribing) have an
 * active component instance to attach to — matching how the composable actually
 * runs in application code. Without this, Vue logs
 * "onUnmounted is called when there is no active component instance" warnings
 * and the unmount-cleanup path is never exercised.
 */
function withSetup<T>(composable: () => T): [T, App] {
  let result!: T;
  const app = createApp({
    setup() {
      result = composable();
      return () => null;
    },
  });
  app.mount(document.createElement("div"));
  return [result, app];
}

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
    const [progress, app] = withSetup(() => usePipelineProgressVue(orchestrator));
    expect(progress.value).toBeDefined();
    app.unmount();
  });

  it("usePipelineRunVue returns correct structure", () => {
    const [run, app] = withSetup(() => usePipelineRunVue(orchestrator));
    expect(run).toHaveProperty("run");
    expect(run).toHaveProperty("running");
    expect(run).toHaveProperty("result");
    expect(run).toHaveProperty("error");
    app.unmount();
  });

  it("usePipelineStepEventVue returns ref", () => {
    const [event, app] = withSetup(() =>
      usePipelineStepEventVue(orchestrator, "a", "success"),
    );
    expect(event.value).toBeNull();
    app.unmount();
  });

  it("usePipelineLogsVue returns ref", () => {
    const [logs, app] = withSetup(() => usePipelineLogsVue(orchestrator));
    expect(logs.value).toBeInstanceOf(Array);
    app.unmount();
  });

  it("useRerunPipelineStepVue returns function", () => {
    const [rerun, app] = withSetup(() => useRerunPipelineStepVue(orchestrator));
    expect(typeof rerun).toBe("function");
    app.unmount();
  });

  it("useRestClientVue returns computed", () => {
    const [client, app] = withSetup(() =>
      useRestClientVue({ baseURL: "http://localhost" }),
    );
    expect(client.value).toBeDefined();
    app.unmount();
  });

  it("unsubscribes from stageResults on unmount without warnings", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const [, app] = withSetup(() => usePipelineRunVue(orchestrator));
    app.unmount();
    const lifecycleWarning = warnSpy.mock.calls.some((call) =>
      String(call[0]).includes("onUnmounted is called when there is no active component instance"),
    );
    expect(lifecycleWarning).toBe(false);
    warnSpy.mockRestore();
  });
});
