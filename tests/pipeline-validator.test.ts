import { validatePipelineConfig } from "../src/pipeline-validator";
import type { PipelineConfig } from "../src/types";

describe("validatePipelineConfig", () => {
  it("валидный конфиг проходит без ошибок", () => {
    const config: PipelineConfig = {
      stages: [
        { key: "a", request: async () => 1 },
        { key: "b", request: async () => 2 },
      ],
    };
    const result = validatePipelineConfig(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("config не объект — ошибка", () => {
    const result = validatePipelineConfig(null as any);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/must be an object/);
  });

  it("stages не массив — ошибка", () => {
    const result = validatePipelineConfig({ stages: "nope" } as any);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/must be an array/);
  });

  it("пустой stages — ошибка", () => {
    const result = validatePipelineConfig({ stages: [] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/must not be empty/);
  });

  it("пустой/некорректный key шага — ошибка", () => {
    const result = validatePipelineConfig({
      stages: [{ key: "", request: async () => 1 }],
    } as PipelineConfig);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/non-empty string/);
  });

  it("дублирующиеся ключи — ошибка", () => {
    const result = validatePipelineConfig({
      stages: [
        { key: "a", request: async () => 1 },
        { key: "a", request: async () => 2 },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate stage key: "a"'))).toBe(true);
  });

  it("request не функция — ошибка", () => {
    const result = validatePipelineConfig({
      stages: [{ key: "a", request: "nope" as any }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/request must be a function/);
  });

  it("condition не функция — ошибка", () => {
    const result = validatePipelineConfig({
      stages: [{ key: "a", request: async () => 1, condition: "nope" as any }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/condition must be a function/);
  });

  it("отрицательный retryCount — ошибка", () => {
    const result = validatePipelineConfig({
      stages: [{ key: "a", request: async () => 1, retryCount: -1 }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/retryCount must be a non-negative number/);
  });

  it("timeoutMs <= 0 — ошибка", () => {
    const result = validatePipelineConfig({
      stages: [{ key: "a", request: async () => 1, timeoutMs: 0 }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/timeoutMs must be a positive number/);
  });

  it("параллельная группа: валидный key и непустой parallel[]", () => {
    const result = validatePipelineConfig({
      stages: [
        {
          key: "grp",
          parallel: [
            { key: "a", request: async () => 1 },
            { key: "b", request: async () => 2 },
          ],
        },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it("параллельная группа: пустой parallel[] — ошибка", () => {
    const result = validatePipelineConfig({
      stages: [{ key: "grp", parallel: [] }],
    } as any);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/must have at least one stage/);
  });

  it("параллельная группа: дублирующийся key внутри группы — ошибка", () => {
    const result = validatePipelineConfig({
      stages: [
        {
          key: "grp",
          parallel: [
            { key: "a", request: async () => 1 },
            { key: "a", request: async () => 2 },
          ],
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate stage key: "a"'))).toBe(true);
  });

  it("stream-шаг: валидная функция stream", () => {
    const result = validatePipelineConfig({
      stages: [{ key: "s", stream: async function* () { yield 1; } }],
    } as any);
    expect(result.valid).toBe(true);
  });

  it("stream-шаг: stream не функция — ошибка", () => {
    const result = validatePipelineConfig({
      stages: [{ key: "s", stream: "nope" }],
    } as any);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/stream must be a function/);
  });

  it("sub-pipeline: рекурсивная валидация вложенного конфига", () => {
    const result = validatePipelineConfig({
      stages: [
        {
          key: "sub",
          subPipeline: { stages: [] },
        },
      ],
    } as any);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("subPipeline:sub"))).toBe(true);
  });

  it("sub-pipeline: валидный вложенный конфиг проходит", () => {
    const result = validatePipelineConfig({
      stages: [
        {
          key: "sub",
          subPipeline: { stages: [{ key: "inner", request: async () => 1 }] },
        },
      ],
    } as any);
    expect(result.valid).toBe(true);
  });

  it("собирает несколько ошибок одновременно, не останавливаясь на первой", () => {
    const result = validatePipelineConfig({
      stages: [
        { key: "", request: async () => 1 },
        { key: "b", retryCount: -5 },
      ],
    } as any);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
