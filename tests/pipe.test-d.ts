// Type-level tests for the `pipe()` fluent builder's TPrev threading.
// These assertions are checked by `npm run test:types` (vitest --typecheck);
// they run zero real assertions at runtime — a wrong inferred type here is a
// *type* error, not a test failure caught by `npm test`. See pipeline-builder.ts
// for the TPrev phantom-type mechanics being verified.
import { test, expectTypeOf } from "vitest";
import { pipe } from "../src/pipeline-builder";
import { PipelineOrchestrator } from "../src/pipeline-orchestrator";
import type { PipelineConfig } from "../src/types";

test("first .step()'s prev is typed undefined", () => {
  pipe().step({
    key: "first",
    request: async ({ prev }) => {
      expectTypeOf(prev).toEqualTypeOf<undefined>();
      return 42;
    },
  });
});

test("second .step()'s prev is typed as the first step's return type", () => {
  pipe()
    .step({
      key: "first",
      request: async () => 42,
    })
    .step({
      key: "second",
      request: async ({ prev }) => {
        expectTypeOf(prev).toEqualTypeOf<number>();
        return prev.toFixed(2);
      },
    });
});

test("a chain of three .step()s threads each return type into the next prev", () => {
  pipe()
    .step({ key: "a", request: async () => "hello" })
    .step({
      key: "b",
      request: async ({ prev }) => {
        expectTypeOf(prev).toEqualTypeOf<string>();
        return prev.length;
      },
    })
    .step({
      key: "c",
      request: async ({ prev }) => {
        expectTypeOf(prev).toEqualTypeOf<number>();
        return prev > 0;
      },
    });
});

test(".parallel() does not change TPrev for the next .step()", () => {
  pipe()
    .step({ key: "first", request: async () => 42 })
    .parallel([
      { key: "p1", request: async () => "x" },
      { key: "p2", request: async () => true },
    ])
    .step({
      key: "afterParallel",
      request: async ({ prev }) => {
        // prev still comes from "first" (last regular .step()), not the
        // parallel group — matching actual orchestrator runtime behavior.
        expectTypeOf(prev).toEqualTypeOf<number>();
        return prev;
      },
    });
});

test(".subPipeline() does not change TPrev for the next .step()", () => {
  pipe()
    .step({ key: "first", request: async () => "seed" })
    .subPipeline({
      key: "sub",
      subPipeline: { stages: [{ key: "inner", request: async () => 1 }] },
    })
    .step({
      key: "afterSub",
      request: async ({ prev }) => {
        expectTypeOf(prev).toEqualTypeOf<string>();
        return prev;
      },
    });
});

test(".stream() does not change TPrev for the next .step()", () => {
  pipe()
    .step({ key: "first", request: async () => 7 })
    .stream({
      key: "chunks",
      stream: async function* () {
        yield "chunk";
      },
    })
    .step({
      key: "afterStream",
      request: async ({ prev }) => {
        expectTypeOf(prev).toEqualTypeOf<number>();
        return prev;
      },
    });
});

test(".build() returns a PipelineOrchestrator, .toConfig() returns a PipelineConfig", () => {
  const orchestrator = pipe()
    .step({ key: "a", request: async () => 1 })
    .build();
  expectTypeOf(orchestrator).toEqualTypeOf<PipelineOrchestrator>();

  const config = pipe()
    .step({ key: "a", request: async () => 1 })
    .toConfig();
  expectTypeOf(config).toEqualTypeOf<PipelineConfig>();
});
