import { pipe, createPipeline, PipelineBuilder } from "../src/pipeline/pipeline-builder";

const httpConfig = { baseURL: "http://localhost" };

describe("pipe() / PipelineBuilder", () => {
  it("builds and runs a pipeline via .step() chaining", async () => {
    const orchestrator = pipe()
      .step({ key: "a", request: async () => "hello" })
      .step({ key: "b", request: async ({ prev }) => `${prev}-world` })
      .build({ httpConfig });

    const result = await orchestrator.run();
    expect(result.success).toBe(true);
    expect(result.stageResults.a.data).toBe("hello");
    expect(result.stageResults.b.data).toBe("hello-world");
  });

  it("supports non-chained calls (without reassigning the .step() result)", async () => {
    // Regression: step()/parallel()/subPipeline()/stream() mutate the same instance
    // and return a typed reference to it rather than a new object — the old usage
    // style (without keeping the return value) must not lose any steps.
    const builder = pipe();
    builder.step({ key: "a", request: async () => 1 });
    builder.step({ key: "b", request: async ({ prev }: any) => prev + 1 });

    const orchestrator = builder.build({ httpConfig });
    const result = await orchestrator.run();
    expect(result.success).toBe(true);
    expect(result.stageResults.a.data).toBe(1);
    expect(result.stageResults.b.data).toBe(2);
  });

  it(".parallel() does not change prev for the following .step() (matches orchestrator behavior)", async () => {
    const orchestrator = pipe()
      .step({ key: "a", request: async () => "from-a" })
      .parallel([
        { key: "p1", request: async () => "p1-result" },
        { key: "p2", request: async () => "p2-result" },
      ])
      .step({ key: "b", request: async ({ prev }) => `${prev}-seen-by-b` })
      .build({ httpConfig });

    const result = await orchestrator.run();
    expect(result.success).toBe(true);
    // prev in "b" is the result of "a", not the parallel group's data
    expect(result.stageResults.b.data).toBe("from-a-seen-by-b");
    expect(result.stageResults.p1.data).toBe("p1-result");
    expect(result.stageResults.p2.data).toBe("p2-result");
  });

  it(".parallel() passes concurrency through to the group", () => {
    const config = pipe()
      .parallel([{ key: "a", request: async () => 1 }], { concurrency: 2 })
      .toConfig();
    expect((config.stages[0] as any).concurrency).toBe(2);
  });

  it(".subPipeline() adds a nested pipeline as a step", async () => {
    const orchestrator = pipe()
      .subPipeline({
        key: "sub",
        subPipeline: { stages: [{ key: "inner", request: async () => "inner-data" }] },
      })
      .build({ httpConfig });

    const result = await orchestrator.run();
    expect(result.success).toBe(true);
    expect((result.stageResults.sub.data as any).stageResults.inner.data).toBe(
      "inner-data",
    );
  });

  it(".stream() adds a stream step", async () => {
    async function* gen() {
      yield 1;
      yield 2;
    }
    const orchestrator = pipe()
      .stream({ key: "s", stream: () => gen() })
      .build({ httpConfig });

    const result = await orchestrator.run();
    expect(result.success).toBe(true);
    expect(result.stageResults.s.data).toEqual([1, 2]);
  });

  it("toConfig() returns a PipelineConfig without creating an orchestrator", () => {
    const config = pipe()
      .step({ key: "a", request: async () => 1 })
      .toConfig();
    expect(config.stages).toHaveLength(1);
    expect((config.stages[0] as any).key).toBe("a");
  });

  it("createPipeline() creates a working orchestrator from a stages array", async () => {
    const orchestrator = createPipeline(
      [{ key: "a", request: async () => "ok" }],
      { httpConfig },
    );
    const result = await orchestrator.run();
    expect(result.stageResults.a.data).toBe("ok");
  });

  it("PipelineBuilder is exported and can be used directly (new PipelineBuilder())", async () => {
    const builder = new PipelineBuilder();
    const orchestrator = builder
      .step({ key: "a", request: async () => 1 })
      .build({ httpConfig });
    const result = await orchestrator.run();
    expect(result.stageResults.a.data).toBe(1);
  });
});
