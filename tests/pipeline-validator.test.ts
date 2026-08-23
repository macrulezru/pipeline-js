import { validatePipelineConfig } from "../src/pipeline/pipeline-validator";
import type { PipelineConfig } from "../src/types";

describe("validatePipelineConfig", () => {
  it("a valid config passes without errors", () => {
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

  it("config is not an object -> error", () => {
    const result = validatePipelineConfig(null as any);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/must be an object/);
  });

  it("stages is not an array -> error", () => {
    const result = validatePipelineConfig({ stages: "nope" } as any);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/must be an array/);
  });

  it("empty stages -> error", () => {
    const result = validatePipelineConfig({ stages: [] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/must not be empty/);
  });

  it("empty/invalid step key -> error", () => {
    const result = validatePipelineConfig({
      stages: [{ key: "", request: async () => 1 }],
    } as PipelineConfig);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/non-empty string/);
  });

  it("duplicate keys -> error", () => {
    const result = validatePipelineConfig({
      stages: [
        { key: "a", request: async () => 1 },
        { key: "a", request: async () => 2 },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate stage key: "a"'))).toBe(true);
  });

  it("request is not a function -> error", () => {
    const result = validatePipelineConfig({
      stages: [{ key: "a", request: "nope" as any }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/request must be a function/);
  });

  it("condition is not a function -> error", () => {
    const result = validatePipelineConfig({
      stages: [{ key: "a", request: async () => 1, condition: "nope" as any }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/condition must be a function/);
  });

  it("negative retryCount -> error", () => {
    const result = validatePipelineConfig({
      stages: [{ key: "a", request: async () => 1, retryCount: -1 }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/retryCount must be a non-negative number/);
  });

  it("timeoutMs <= 0 -> error", () => {
    const result = validatePipelineConfig({
      stages: [{ key: "a", request: async () => 1, timeoutMs: 0 }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/timeoutMs must be a positive number/);
  });

  it("parallel group: valid key and non-empty parallel[]", () => {
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

  it("parallel group: empty parallel[] -> error", () => {
    const result = validatePipelineConfig({
      stages: [{ key: "grp", parallel: [] }],
    } as any);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/must have at least one stage/);
  });

  it("parallel group: duplicate key within the group -> error", () => {
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

  it("stream step: valid stream function", () => {
    const result = validatePipelineConfig({
      stages: [{ key: "s", stream: async function* () { yield 1; } }],
    } as any);
    expect(result.valid).toBe(true);
  });

  it("stream step: stream is not a function -> error", () => {
    const result = validatePipelineConfig({
      stages: [{ key: "s", stream: "nope" }],
    } as any);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/stream must be a function/);
  });

  it("sub-pipeline: recursively validates the nested config", () => {
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

  it("sub-pipeline: a valid nested config passes", () => {
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

  it("collects multiple errors at once, without stopping at the first one", () => {
    const result = validatePipelineConfig({
      stages: [
        { key: "", request: async () => 1 },
        { key: "b", retryCount: -5 },
      ],
    } as any);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
