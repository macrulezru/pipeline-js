import { PipelineOrchestrator } from "./pipeline-orchestrator.js";
import type {
  PipelineItem,
  PipelineStageConfig,
  ParallelStageGroup,
  SubPipelineStage,
  StreamStageConfig,
  WebSocketStageConfig,
  PipelineConfig,
  PipelineMiddleware,
  PipelineOptions,
  HttpConfig,
} from "../types.js";

// ─────────────────────────────────────────────────────────────────────────────
// 4.1 createPipeline() — factory function
// ─────────────────────────────────────────────────────────────────────────────

export interface CreatePipelineOptions {
  /** HTTP config for all stages that use the executor (URL-based stages) */
  httpConfig?: HttpConfig;
  /** Shared data pool, available to all stages via params.sharedData */
  sharedData?: Record<string, any>;
  /** Global middleware hooks (beforeEach / afterEach / onError) */
  middleware?: PipelineMiddleware;
  /** Pipeline behavior options */
  pipelineOptions?: PipelineOptions;
  /** Pipeline metrics (onPipelineStart / onPipelineEnd / onStepDuration) */
  metrics?: PipelineConfig["metrics"];
}

/**
 * Shorthand factory function for creating a PipelineOrchestrator.
 * Avoids the need to write out a nested `{ config: { stages: [...] } }` object.
 *
 * @example
 * const orchestrator = createPipeline([
 *   { key: "fetchUser", request: async () => fetchUser() },
 *   { key: "processData", request: async ({ prev }) => process(prev) },
 * ], {
 *   httpConfig: { baseURL: "https://api.example.com" },
 *   sharedData: { userId: 42 },
 * });
 */
export function createPipeline(
  stages: PipelineItem[],
  options: CreatePipelineOptions = {},
): PipelineOrchestrator {
  return new PipelineOrchestrator({
    config: {
      stages,
      middleware: options.middleware,
      options: options.pipelineOptions,
      metrics: options.metrics,
    },
    httpConfig: options.httpConfig,
    sharedData: options.sharedData,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4.2 pipe() — Fluent builder API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fluent builder for creating a pipeline.
 * Lets you build a pipeline via a chain of calls instead of manually constructing the stages array.
 *
 * `TPrev` — the type of `prev` that the *next* `.step()` will receive (the type of data
 * returned by the current stage). This is a purely type-level (phantom) parameter — at
 * runtime the class always operates on the same stages array, so behavior is unchanged
 * compared to untyped usage (without chaining — via separate calls without reassignment).
 *
 * `.parallel()` / `.subPipeline()` / `.stream()` / `.websocket()` do not change `TPrev` — this matches
 * the orchestrator's actual behavior: the next stage's `prev` is taken from the last regular
 * (`step`) stage, not from a parallel group/sub-pipeline/stream.
 *
 * @example
 * const orchestrator = pipe()
 *   .step({ key: "auth", request: async () => getToken() })            // TPrev for the next step: string
 *   .step({ key: "fetchUser", request: async ({ prev }) => fetchUser(prev) }) // prev: string — autocomplete and type checking
 *   .parallel([
 *     { key: "loadA", request: async () => loadA() },
 *     { key: "loadB", request: async () => loadB() },
 *   ])
 *   .build({ httpConfig: { baseURL: "https://api.example.com" } });
 */
export class PipelineBuilder<TPrev = any> {
  private stages: PipelineItem[] = [];

  /**
   * Add a regular (sequential) stage.
   * `prev` in this stage is typed as the result of the previous `.step()` (or `undefined` for the first).
   * The `TOutput` type is usually inferred automatically from the return value of `request`/`after`.
   */
  step<TOutput = any>(
    stage: PipelineStageConfig<TPrev, TOutput>,
  ): PipelineBuilder<TOutput> {
    this.stages.push(stage as PipelineItem);
    // Safe cast: TPrev/TOutput are purely type-level parameters, not stored on the instance,
    // so changing the phantom type does not require creating a new object.
    return this as unknown as PipelineBuilder<TOutput>;
  }

  /**
   * Add a group of parallel stages.
   * All stages in the group run simultaneously via Promise.all (or through a pool
   * if `concurrency` is set).
   */
  parallel(
    stages: PipelineStageConfig[],
    options?: { key?: string; continueOnError?: boolean; concurrency?: number },
  ): PipelineBuilder<TPrev> {
    const group: ParallelStageGroup = {
      key: options?.key ?? `parallel-${this.stages.length}`,
      parallel: stages,
      ...(options?.continueOnError !== undefined
        ? { continueOnError: options.continueOnError }
        : {}),
      ...(options?.concurrency !== undefined
        ? { concurrency: options.concurrency }
        : {}),
    };
    this.stages.push(group);
    return this;
  }

  /**
   * Add a nested pipeline as a stage.
   */
  subPipeline(item: SubPipelineStage): PipelineBuilder<TPrev> {
    this.stages.push(item);
    return this;
  }

  /**
   * Add a stream stage (SSE / AsyncIterable).
   */
  stream<T = unknown>(stage: StreamStageConfig<T>): PipelineBuilder<TPrev> {
    this.stages.push(stage as PipelineItem);
    return this;
  }

  /**
   * Add a WebSocket stage.
   */
  websocket<T = unknown>(stage: WebSocketStageConfig<T>): PipelineBuilder<TPrev> {
    this.stages.push(stage as PipelineItem);
    return this;
  }

  /**
   * Create a PipelineOrchestrator from the accumulated stages.
   */
  build(options: CreatePipelineOptions = {}): PipelineOrchestrator {
    return createPipeline([...this.stages], options);
  }

  /**
   * Get just the config (without creating an orchestrator).
   * Useful for passing the config somewhere else.
   */
  toConfig(
    options: Omit<CreatePipelineOptions, "httpConfig" | "sharedData"> = {},
  ): PipelineConfig {
    return {
      stages: [...this.stages],
      middleware: options.middleware,
      options: options.pipelineOptions,
      metrics: options.metrics,
    };
  }
}

/**
 * Creates a new PipelineBuilder.
 * Entry point for the fluent API.
 * The first `.step()`'s `prev` is typed as `undefined` — exactly matching the
 * orchestrator's real behavior (the first pipeline stage has no previous result).
 *
 * @example
 * const orchestrator = pipe()
 *   .step({ key: "step1", request: async () => data })
 *   .build();
 */
export function pipe(): PipelineBuilder<undefined> {
  return new PipelineBuilder<undefined>();
}
