"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineBuilder = void 0;
exports.createPipeline = createPipeline;
exports.pipe = pipe;
const pipeline_orchestrator_js_1 = require("./pipeline-orchestrator.js");
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
function createPipeline(stages, options = {}) {
    return new pipeline_orchestrator_js_1.PipelineOrchestrator({
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
class PipelineBuilder {
    constructor() {
        this.stages = [];
    }
    /**
     * Add a regular (sequential) stage.
     * `prev` in this stage is typed as the result of the previous `.step()` (or `undefined` for the first).
     * The `TOutput` type is usually inferred automatically from the return value of `request`/`after`.
     */
    step(stage) {
        this.stages.push(stage);
        // Safe cast: TPrev/TOutput are purely type-level parameters, not stored on the instance,
        // so changing the phantom type does not require creating a new object.
        return this;
    }
    /**
     * Add a group of parallel stages.
     * All stages in the group run simultaneously via Promise.all (or through a pool
     * if `concurrency` is set).
     */
    parallel(stages, options) {
        var _a;
        const group = {
            key: (_a = options === null || options === void 0 ? void 0 : options.key) !== null && _a !== void 0 ? _a : `parallel-${this.stages.length}`,
            parallel: stages,
            ...((options === null || options === void 0 ? void 0 : options.continueOnError) !== undefined
                ? { continueOnError: options.continueOnError }
                : {}),
            ...((options === null || options === void 0 ? void 0 : options.concurrency) !== undefined
                ? { concurrency: options.concurrency }
                : {}),
        };
        this.stages.push(group);
        return this;
    }
    /**
     * Add a nested pipeline as a stage.
     */
    subPipeline(item) {
        this.stages.push(item);
        return this;
    }
    /**
     * Add a stream stage (SSE / AsyncIterable).
     */
    stream(stage) {
        this.stages.push(stage);
        return this;
    }
    /**
     * Add a WebSocket stage.
     */
    websocket(stage) {
        this.stages.push(stage);
        return this;
    }
    /**
     * Create a PipelineOrchestrator from the accumulated stages.
     */
    build(options = {}) {
        return createPipeline([...this.stages], options);
    }
    /**
     * Get just the config (without creating an orchestrator).
     * Useful for passing the config somewhere else.
     */
    toConfig(options = {}) {
        return {
            stages: [...this.stages],
            middleware: options.middleware,
            options: options.pipelineOptions,
            metrics: options.metrics,
        };
    }
}
exports.PipelineBuilder = PipelineBuilder;
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
function pipe() {
    return new PipelineBuilder();
}
