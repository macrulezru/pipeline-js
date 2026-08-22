import { PipelineOrchestrator } from "./pipeline-orchestrator.js";
import type { PipelineItem, PipelineStageConfig, SubPipelineStage, StreamStageConfig, WebSocketStageConfig, PipelineConfig, PipelineMiddleware, PipelineOptions, HttpConfig } from "../types.js";
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
export declare function createPipeline(stages: PipelineItem[], options?: CreatePipelineOptions): PipelineOrchestrator;
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
export declare class PipelineBuilder<TPrev = any> {
    private stages;
    /**
     * Add a regular (sequential) stage.
     * `prev` in this stage is typed as the result of the previous `.step()` (or `undefined` for the first).
     * The `TOutput` type is usually inferred automatically from the return value of `request`/`after`.
     */
    step<TOutput = any>(stage: PipelineStageConfig<TPrev, TOutput>): PipelineBuilder<TOutput>;
    /**
     * Add a group of parallel stages.
     * All stages in the group run simultaneously via Promise.all (or through a pool
     * if `concurrency` is set).
     */
    parallel(stages: PipelineStageConfig[], options?: {
        key?: string;
        continueOnError?: boolean;
        concurrency?: number;
    }): PipelineBuilder<TPrev>;
    /**
     * Add a nested pipeline as a stage.
     */
    subPipeline(item: SubPipelineStage): PipelineBuilder<TPrev>;
    /**
     * Add a stream stage (SSE / AsyncIterable).
     */
    stream<T = unknown>(stage: StreamStageConfig<T>): PipelineBuilder<TPrev>;
    /**
     * Add a WebSocket stage.
     */
    websocket<T = unknown>(stage: WebSocketStageConfig<T>): PipelineBuilder<TPrev>;
    /**
     * Create a PipelineOrchestrator from the accumulated stages.
     */
    build(options?: CreatePipelineOptions): PipelineOrchestrator;
    /**
     * Get just the config (without creating an orchestrator).
     * Useful for passing the config somewhere else.
     */
    toConfig(options?: Omit<CreatePipelineOptions, "httpConfig" | "sharedData">): PipelineConfig;
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
export declare function pipe(): PipelineBuilder<undefined>;
