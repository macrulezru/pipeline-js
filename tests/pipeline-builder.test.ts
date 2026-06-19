import { pipe, createPipeline, PipelineBuilder } from "../src/pipeline-builder";

const httpConfig = { baseURL: "http://localhost" };

describe("pipe() / PipelineBuilder", () => {
  it("строит и выполняет pipeline через чейнинг .step()", async () => {
    const orchestrator = pipe()
      .step({ key: "a", request: async () => "hello" })
      .step({ key: "b", request: async ({ prev }) => `${prev}-world` })
      .build({ httpConfig });

    const result = await orchestrator.run();
    expect(result.success).toBe(true);
    expect(result.stageResults.a.data).toBe("hello");
    expect(result.stageResults.b.data).toBe("hello-world");
  });

  it("поддерживает нечейн-стиль вызова (без переприсвоения результата .step())", async () => {
    // Регрессия: step()/parallel()/subPipeline()/stream() мутируют тот же экземпляр
    // и возвращают типизированную ссылку на него, а не новый объект — старый стиль
    // использования (без сохранения возвращаемого значения) не должен терять шаги.
    const builder = pipe();
    builder.step({ key: "a", request: async () => 1 });
    builder.step({ key: "b", request: async ({ prev }: any) => prev + 1 });

    const orchestrator = builder.build({ httpConfig });
    const result = await orchestrator.run();
    expect(result.success).toBe(true);
    expect(result.stageResults.a.data).toBe(1);
    expect(result.stageResults.b.data).toBe(2);
  });

  it(".parallel() не меняет prev для следующего .step() (соответствует поведению orchestrator)", async () => {
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
    // prev в "b" — это результат "a", а не данные параллельной группы
    expect(result.stageResults.b.data).toBe("from-a-seen-by-b");
    expect(result.stageResults.p1.data).toBe("p1-result");
    expect(result.stageResults.p2.data).toBe("p2-result");
  });

  it(".parallel() передаёт concurrency в группу", () => {
    const config = pipe()
      .parallel([{ key: "a", request: async () => 1 }], { concurrency: 2 })
      .toConfig();
    expect((config.stages[0] as any).concurrency).toBe(2);
  });

  it(".subPipeline() добавляет вложенный pipeline как шаг", async () => {
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

  it(".stream() добавляет stream-шаг", async () => {
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

  it("toConfig() возвращает PipelineConfig без создания orchestrator", () => {
    const config = pipe()
      .step({ key: "a", request: async () => 1 })
      .toConfig();
    expect(config.stages).toHaveLength(1);
    expect((config.stages[0] as any).key).toBe("a");
  });

  it("createPipeline() создаёт работающий orchestrator из массива stages", async () => {
    const orchestrator = createPipeline(
      [{ key: "a", request: async () => "ok" }],
      { httpConfig },
    );
    const result = await orchestrator.run();
    expect(result.stageResults.a.data).toBe("ok");
  });

  it("PipelineBuilder экспортируется и может использоваться напрямую (new PipelineBuilder())", async () => {
    const builder = new PipelineBuilder();
    const orchestrator = builder
      .step({ key: "a", request: async () => 1 })
      .build({ httpConfig });
    const result = await orchestrator.run();
    expect(result.stageResults.a.data).toBe(1);
  });
});
