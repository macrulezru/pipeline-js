// --- Types for the pipeline orchestrator (stages, config, results, events) ---

import type { ApiError, HttpConfig } from "./http.js";
import type { PipelinePlugin } from "./plugins.js";

/**
 * Config for a single pipeline stage (step)
 * @template Input Type of the step's input data
 * @template Output Type of the step's result
 */
export type PipelineStageConfig<Input = any, Output = any> = {
  /** Unique step key */
  key: string;
  /** Async request function for the step */
  request?: (params: {
    prev: Input;
    allResults: Record<string, PipelineStepResult>;
    sharedData: Record<string, any>;
    /** Pipeline abort signal. Pass it to fetch/axios/etc. so that abort() actually cancels the request. */
    signal: AbortSignal;
  }) => Promise<Output> | Output;
  /** Step execution condition (returning false → the step is skipped with status 'skipped') */
  condition?: (params: {
    prev: Input;
    allResults: Record<string, PipelineStepResult>;
    sharedData: Record<string, any>;
    signal: AbortSignal;
  }) => boolean;
  /**
   * Validates (and optionally transforms/coerces) the step's input data
   * before calling `request` — after the `before` hook, i.e. it sees its
   * result. The returned value replaces the `prev` passed to
   * `request` (the same pattern as `before`). Throw an error on
   * invalid data — it will follow the same path as a regular step
   * error (compatible with `errorHandler`/`recoverStep`).
   *
   * The library does not pull in zod/yup/another schema library as a
   * dependency — wrap your schema in a function with the required
   * signature, e.g. `data => mySchema.parse(data)`. See `examples/zod-validation.ts`.
   */
  validateInput?: (
    data: Input,
    ctx: {
      allResults: Record<string, PipelineStepResult>;
      sharedData: Record<string, any>;
      signal: AbortSignal;
    },
  ) => Input | Promise<Input>;
  /**
   * Validates (and optionally transforms/coerces) the step's result —
   * after `request` and the `after` hook, i.e. it sees the final value
   * that will be recorded as the step result's `data`. The returned
   * value replaces the result (the same pattern as `after`). Throw
   * an error on invalid data — it will follow the same path as a
   * regular step error (compatible with `errorHandler`/`recoverStep`).
   *
   * @example
   * validateOutput: (data) => userSchema.parse(data)
   */
  validateOutput?: (
    data: Output,
    ctx: {
      allResults: Record<string, PipelineStepResult>;
      sharedData: Record<string, any>;
      signal: AbortSignal;
    },
  ) => Output | Promise<Output>;
  /** Number of retry attempts on error */
  retryCount?: number;
  /** Step timeout (ms) */
  timeoutMs?: number;
  /**
   * Step error handler.
   * By default any returned value is converted to an ApiError and the step is marked 'error'.
   * To recover the step as successful (without interrupting the pipeline), return `{ recover: true, data }` —
   * see PipelineStepRecovery.
   */
  errorHandler?: (params: {
    error: any;
    key: string;
    sharedData: Record<string, any>;
    signal: AbortSignal;
  }) => any | PipelineStepRecovery<Output>;
  /**
   * before hook: called before executing the stage's request.
   * Can synchronously or asynchronously modify the input data prev/allResults/sharedData.
   * The returned value will be passed to request instead of prev (if returned !== undefined).
   */
  before?: (params: {
    prev: Input;
    allResults: Record<string, PipelineStepResult>;
    sharedData: Record<string, any>;
    signal: AbortSignal;
  }) => Promise<Input | void> | Input | void;

  /**
   * Post-processing hook: called after receiving the result (before moving to the next stage).
   * Can synchronously or asynchronously modify the step's result.
   * The returned value will be recorded as the step's result (data).
   */
  after?: (params: {
    result: Output;
    allResults: Record<string, PipelineStepResult>;
    sharedData: Record<string, any>;
    signal: AbortSignal;
  }) => Promise<Output> | Output;
  /** Pause (ms) before executing the command */
  pauseBefore?: number;
  /** Pause (ms) after executing the command */
  pauseAfter?: number;
  /**
   * Continue pipeline execution when this step fails.
   * Overrides the global continueOnError flag from PipelineConfig.options.
   * Default: false.
   */
  continueOnError?: boolean;
  /**
   * Function that determines the next step after a successful run (DAG transitions).
   * Returns the key of the next step, or null to continue in order.
   * If the key is not found in stages — the pipeline completes successfully.
   */
  next?: (params: {
    result: Output;
    allResults: Record<string, PipelineStepResult>;
    sharedData: Record<string, any>;
  }) => string | null;
};

/**
 * A group of steps executed in parallel
 */
export type ParallelStageGroup = {
  /** Unique group key (used for progress tracking) */
  key: string;
  /** Steps executed in parallel */
  parallel: PipelineStageConfig[];
  /**
   * Continue pipeline execution when any of the parallel steps fails.
   * Overrides the global continueOnError flag from PipelineConfig.options.
   */
  continueOnError?: boolean;
  /**
   * Maximum number of steps in the group executed simultaneously.
   * Default: no limit (all steps start at once, like Promise.all).
   * Useful for fan-out over a large number of items (e.g. paginated loading),
   * so as not to open hundreds of requests in parallel.
   */
  concurrency?: number;
};

/**
 * A nested pipeline as a separate step.
 * Allows reusing groups of steps inside other pipelines.
 */
export type SubPipelineStage = {
  /** Unique step key */
  key: string;
  /** Config of the nested pipeline */
  subPipeline: PipelineConfig;
  /** HTTP config for the nested pipeline (if different from the parent's) */
  httpConfig?: HttpConfig;
  /** Additional sharedData for the nested pipeline */
  sharedData?: Record<string, any>;
  /**
   * Continue execution of the parent pipeline when the nested one fails.
   * Default: false.
   */
  continueOnError?: boolean;
};

/** A single pipeline item — a regular step, a parallel group, a nested pipeline, a stream step, or a WebSocket step */
export type PipelineItem =
  | PipelineStageConfig
  | ParallelStageGroup
  | SubPipelineStage
  | StreamStageConfig
  | WebSocketStageConfig;

/**
 * Middleware for the entire pipeline (global hooks)
 */
export type PipelineMiddleware = {
  /** Called before each step (before stage.before) */
  beforeEach?: (params: {
    stage: PipelineStageConfig;
    index: number;
    sharedData: Record<string, any>;
  }) => Promise<void> | void;
  /** Called after each successful step (after stage.after) */
  afterEach?: (params: {
    stage: PipelineStageConfig;
    index: number;
    result: PipelineStepResult;
    sharedData: Record<string, any>;
  }) => Promise<void> | void;
  /** Called when a step fails */
  onError?: (params: {
    stage: PipelineStageConfig;
    index: number;
    error: ApiError;
    sharedData: Record<string, any>;
  }) => Promise<void> | void;
};

/**
 * Pipeline step execution status
 */
export type PipelineStepStatus =
  | "pending"
  | "loading"
  | "success"
  | "error"
  | "skipped";

/**
 * Value that a step's errorHandler can return to "recover" the step —
 * the pipeline continues execution as if it had succeeded, with status 'success' and the given data,
 * instead of stopping/taking the continueOnError branch with an error.
 *
 * @example
 * errorHandler: ({ error }) => recoverStep(fallbackValue)
 */
export type PipelineStepRecovery<T = any> = {
  recover: true;
  data: T;
};

/** Helper for errorHandler: marks the step as recovered (status: 'success') with the given data. */
export function recoverStep<T = any>(data: T): PipelineStepRecovery<T> {
  return { recover: true, data };
}

/** Check: is the value returned from errorHandler a sign that the step was recovered. */
export function isStepRecovery(value: unknown): value is PipelineStepRecovery {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).recover === true &&
    "data" in value
  );
}

/**
 * Result of a pipeline step's execution
 */
export type PipelineStepResult<T = any> = {
  /** Step status */
  status: PipelineStepStatus;
  /** Result data (if success) */
  data?: T;
  /** Error (if error) */
  error?: ApiError;
  /** Step command URL (if applicable) */
  url?: string;
};

/**
 * Pipeline configuration options (global behavior settings)
 */
export type PipelineOptions = {
  /**
   * Automatically reset results on every run() call.
   * Default: false.
   */
  autoReset?: boolean;
  /**
   * Continue pipeline execution when any step fails.
   * Can be overridden at the individual step level via stage.continueOnError.
   * Default: false.
   */
  continueOnError?: boolean;
  /**
   * Global timeout for executing the entire pipeline (ms).
   * When exceeded, abort() is called and the pipeline finishes with an error.
   */
  pipelineTimeoutMs?: number;
  /**
   * Config for automatically restarting the pipeline on failure.
   */
  pipelineRetry?: {
    /** Number of restart attempts (not counting the first run) */
    attempts: number;
    /** Delay between attempts (ms) */
    delayMs?: number;
    /**
     * Which step to restart from:
     * - 'start' (default): from the very beginning, resetting all results
     * - 'failed-step': only from the failed step, keeping the results of successful steps
     */
    retryFrom?: "start" | "failed-step";
  };
  /**
   * Maximum number of steps for DAG transitions (protection against infinite loops).
   * Default: stages.length * 10.
   */
  maxSteps?: number;
  /**
   * Adapter for persistent storage of pipeline state.
   * On run(), automatically loads the saved state,
   * and saves the current state after each step.
   */
  persistAdapter?: PipelineStateAdapter;
  /**
   * List of plugins to extend pipeline behavior.
   * Each plugin is invoked when the orchestrator is created.
   */
  plugins?: PipelinePlugin[];
  /**
   * Maximum number of entries in the internal log (getLogs()/exportState().logs).
   * When exceeded, the oldest entries are dropped (FIFO).
   * Default: not set — the log is unbounded and stores all entries for the entire
   * lifetime of the orchestrator (can grow without limit for a long-lived instance
   * reused across many run()/rerunStep() calls without autoReset).
   */
  maxLogs?: number;
};

/**
 * Config for the whole pipeline (an array of stages)
 */
export type PipelineConfig = {
  stages: PipelineItem[];
  /** Global middleware — called for every step */
  middleware?: PipelineMiddleware;
  /** Global pipeline behavior options */
  options?: PipelineOptions;
  /** Callbacks for observing pipeline execution */
  metrics?: PipelineMetrics;
};

/**
 * Pipeline execution progress
 */
export type PipelineProgress = {
  currentStage: number;
  totalStages: number;
  stageStatuses: Array<PipelineStepStatus>;
};

/**
 * Results of all pipeline steps (key — step name)
 */
export type PipelineStageResults = Record<string, PipelineStepResult>;

/**
 * Final result of pipeline execution
 */
export type PipelineResult = {
  /** Results per step */
  stageResults: PipelineStageResults;
  /** true if the pipeline completed successfully */
  success: boolean;
};

/**
 * Pipeline step event
 */
export type PipelineStepEvent = {
  /** Step index */
  stepIndex: number;
  /** Step key */
  stepKey: string;
  /** Step status */
  status: PipelineStepStatus;
  /** Result data (if success) */
  data?: any;
  /** Error (if error) */
  error?: ApiError;
  /** Snapshot of all results at the time of the event */
  stageResults: Record<string, PipelineStepResult>;
  /**
   * Identifier of the current pipeline run (regenerated on each run()/rerunStep()).
   * Use it to correlate events/logs/metrics of a single run across external observability systems.
   */
  runId?: string;
};

/**
 * Callback for subscribing to pipeline stage events
 */
export type PipelineStepEventHandler = (
  event: PipelineStepEvent,
) => void | Promise<void>;

/**
 * Snapshot of pipeline state for export/import
 */
export type PipelineExportedState = {
  stageResults: Record<string, PipelineStepResult>;
  logs: Array<{
    type: string;
    message: string;
    data?: any;
    timestamp: string;
    runId?: string;
  }>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Type-safe log event names
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All possible event types in pipeline logs.
 * Used for type-safe log filtering and handling.
 */
export type PipelineLogEventType =
  | "step:start"
  | "step:success"
  | "step:error"
  | "step:skipped"
  | "rerunStep:start"
  | "rerunStep:success"
  | "rerunStep:error"
  | "pipeline:retry"
  | "pipeline:error"
  | "subPipeline:start"
  | "subPipeline:success"
  | "subPipeline:error"
  | "subPipeline:exception"
  | "stream:start"
  | "stream:success"
  | "stream:error";

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline metrics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Callbacks for observing pipeline execution.
 * Set in PipelineConfig.metrics.
 */
export interface PipelineMetrics {
  /** Called when pipeline.run() starts */
  onPipelineStart?: (info: { timestamp: number; runId: string }) => void;
  /** Called when pipeline.run() finishes */
  onPipelineEnd?: (info: {
    durationMs: number;
    success: boolean;
    stageResults: PipelineStageResults;
    runId: string;
  }) => void;
  /** Called after each executed step with its duration */
  onStepDuration?: (info: {
    stepKey: string;
    durationMs: number;
    status: PipelineStepStatus;
    runId: string;
  }) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistent state adapter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adapter for saving and restoring pipeline state.
 * Passed to PipelineConfig.options.persistAdapter.
 *
 * Generic over the persisted state shape (`T`, defaults to
 * `PipelineExportedState`) so the same interface is reusable for other
 * save/load-shaped persistence needs — e.g. `HttpConfig.offlineQueue.persistAdapter`
 * persists a `QueuedRequest[]` instead of pipeline state.
 *
 * @example
 * const localStorageAdapter: PipelineStateAdapter = {
 *   save: (state) => localStorage.setItem("pipeline", JSON.stringify(state)),
 *   load: () => JSON.parse(localStorage.getItem("pipeline") ?? "null"),
 * };
 */
export type PipelineStateAdapter<T = PipelineExportedState> = {
  /** Save a state snapshot */
  save(state: T): void | Promise<void>;
  /** Load a previously saved snapshot (null if there is none) */
  load(): T | null | Promise<T | null>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Stream steps (SSE / AsyncIterable)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A pipeline step that receives data as a stream (AsyncIterable).
 * Used for SSE, WebSocket streams, or any async iterator.
 * The step's result is an array of all accumulated chunks.
 */
export type StreamStageConfig<T = unknown> = {
  /** Unique step key */
  key: string;
  /**
   * Function returning an AsyncIterable<T>.
   * Called with the same parameters as a regular request.
   */
  stream: (params: {
    prev: any;
    allResults: Record<string, PipelineStepResult>;
    sharedData: Record<string, any>;
    signal: AbortSignal;
  }) => AsyncIterable<T>;
  /**
   * Called for each received chunk in real time.
   * Useful for streaming to a UI.
   */
  onChunk?: (chunk: T, sharedData: Record<string, any>) => void;
  /**
   * Continue pipeline execution when the stream fails.
   * Overrides the global continueOnError flag.
   */
  continueOnError?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket stage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal WebSocket interface required by the orchestrator — structurally
 * matches the browser's native `WebSocket`, so `new WebSocket(url)`
 * (or `new (await import("ws")).WebSocket(url)` from the `ws` package for Node <22)
 * satisfies it without adaptation.
 */
export interface WebSocketLike {
  addEventListener(type: "open" | "message" | "close" | "error", listener: (event: any) => void): void;
  removeEventListener(type: "open" | "message" | "close" | "error", listener: (event: any) => void): void;
  send(data: string | ArrayBufferLike | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
}

/** Parameters for WebSocket step hooks. */
export type WebSocketStageHookParams = {
  prev: any;
  allResults: Record<string, PipelineStepResult>;
  sharedData: Record<string, any>;
  signal: AbortSignal;
};

export type WebSocketStageConfig<T = unknown> = {
  /** Unique step key */
  key: string;
  /** Connection URL — a string or a function of the same parameters as `request` */
  url: string | ((params: WebSocketStageHookParams) => string);
  /** Protocol(s) — the second argument to the WebSocket constructor */
  protocols?: string | string[];
  /**
   * Factory for a WebSocket implementation. Defaults to `globalThis.WebSocket`,
   * if available (browser, Deno, Node ≥22). Set explicitly for Node <22
   * (e.g. `(url, protocols) => new (require("ws"))(url, protocols)`)
   * or any other transport.
   */
  createWebSocket?: (url: string, protocols?: string | string[]) => WebSocketLike;
  /** Called when the connection opens. */
  onOpen?: (params: WebSocketStageHookParams & { event: unknown }) => void | Promise<void>;
  /**
   * Called for every incoming message (`event.data`). The returned
   * value (if not `undefined`) is appended to the step's result array —
   * the same pattern as `StreamStageConfig`'s chunks. Can be async.
   */
  onMessage: (
    data: unknown,
    params: WebSocketStageHookParams & { event: unknown },
  ) => T | void | Promise<T | void>;
  /**
   * Called for each non-`undefined` value returned by
   * `onMessage`, in real time — useful for streaming to a UI
   * (analogous to `StreamStageConfig.onChunk`).
   */
  onChunk?: (chunk: T, sharedData: Record<string, any>) => void;
  /** Called when the connection closes (normally or due to an error). */
  onClose?: (
    params: WebSocketStageHookParams & { code?: number; reason?: string; wasClean?: boolean },
  ) => void | Promise<void>;
  /**
   * Called on the `error` event. Does not by itself finish the step with an error —
   * most WebSocket implementations send `error` immediately before
   * `close`; the "success or error" decision is made based on the `close`
   * event (see `wasClean`/`code` in `onClose`) after `onError` has run.
   */
  onError?: (error: unknown, params: WebSocketStageHookParams) => void | Promise<void>;
  /**
   * Called after every message with the result of `onMessage`. Return
   * `true` to close the connection and finish the step successfully (equivalent to
   * "we got everything we need").
   */
  closeOn?: (data: T, params: WebSocketStageHookParams) => boolean;
  /**
   * Overall step timeout (ms) — from opening the connection to its closing.
   * Not reset by messages. Without a value, the step waits for closing for
   * as long as needed (or until interrupted via `abort()`).
   */
  timeoutMs?: number;
  /**
   * Continue pipeline execution when this step fails (a non-clean
   * close or an explicit error). Overrides the global `continueOnError`.
   */
  continueOnError?: boolean;
};
