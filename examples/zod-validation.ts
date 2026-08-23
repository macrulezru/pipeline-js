/**
 * `PipelineStageConfig.validateInput`/`validateOutput` let a stage validate
 * (and, since the return value replaces the data, optionally coerce) its
 * input/output — but the library doesn't depend on any particular schema
 * library. This file shows a small `withZodSchema()` helper that adapts a
 * Zod schema (or anything with a structurally compatible `.parse()`, which
 * covers Zod, and is easy to adapt for Yup/Valibot/etc.) into the shape
 * `validateInput`/`validateOutput` expect.
 *
 * Illustrative only — typed against a minimal structural interface instead
 * of importing the real `zod` package, so this file has no extra
 * dependency. Install `zod` in your own project; a real `z.object({...})`
 * schema already satisfies `ZodLikeSchema<T>` below, so `withZodSchema(mySchema)`
 * works unchanged with the real thing.
 */
import { createPipeline, type PipelineStageConfig } from "rest-pipeline-js";

interface ZodLikeSchema<T> {
  parse(data: unknown): T;
}

/**
 * Adapts a schema's `.parse()` into a `validateInput`/`validateOutput`
 * function: throws (with Zod's own `ZodError`, letting `errorHandler`
 * inspect `error.issues` if you need field-level detail) on invalid data,
 * otherwise returns the parsed — and, for schemas with `.transform()`/
 * coercion, possibly modified — value.
 */
function withZodSchema<T>(schema: ZodLikeSchema<T>) {
  return (data: unknown): T => schema.parse(data);
}

// ── Example schemas (in a real project: `import { z } from "zod"`) ──
const userSchema: ZodLikeSchema<{ id: number; name: string }> = {
  parse(data) {
    const record = data as Record<string, unknown> | null;
    if (
      typeof record !== "object" ||
      record === null ||
      typeof record.id !== "number" ||
      typeof record.name !== "string"
    ) {
      throw new Error("Invalid user shape");
    }
    return record as { id: number; name: string };
  },
};

const fetchUserStage: PipelineStageConfig<undefined, { id: number; name: string }> = {
  key: "fetchUser",
  request: async () => {
    // In a real app: return (await client.get("/users/1")).data;
    return { id: 1, name: "Ada" };
  },
  // Validates the response shape before it's stored as this stage's result
  // and handed to the next stage as `prev` — catches a backend contract
  // change or a malformed response at the pipeline boundary instead of
  // downstream, where the error would be harder to trace back here.
  validateOutput: withZodSchema(userSchema),
};

const greetStage: PipelineStageConfig<{ id: number; name: string }, string> = {
  key: "greet",
  // Re-validates the input at this stage's own boundary — useful when a
  // stage might be reached with data from more than one prior stage/path
  // (e.g. after a DAG `next` transition) and can't assume upstream already
  // validated it.
  validateInput: withZodSchema(userSchema),
  request: async ({ prev }) => `Hello, ${prev.name}!`,
};

export const pipeline = createPipeline([fetchUserStage, greetStage]);
