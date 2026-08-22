import { ErrorHandler } from "../http/error-handler.js";
import { ProgressTracker } from "./progress-tracker.js";
import { RequestExecutor } from "../http/request-executor.js";
import { toApiError } from "../http/rest-client.js";
import { isStepRecovery } from "../types.js";
import { PauseController } from "./orchestrator/pause-resume.js";
import {
  isParallelGroup,
  isSubPipeline,
  isStreamStage,
  isWebSocketStage,
} from "./orchestrator/stage-guards.js";
import {
  exportPipelineState,
  parseImportedPipelineState,
  computeProgressUpdatesFromStageResults,
} from "./orchestrator/state-persistence.js";
import type { InMemoryLogEntry } from "./orchestrator/state-persistence.js";
import { executeSubPipeline as executeSubPipelineImpl } from "./orchestrator/sub-pipeline.js";
import { executeStreamStage as executeStreamStageImpl } from "./orchestrator/stream-stage.js";
import { executeWebSocketStage as executeWebSocketStageImpl } from "./orchestrator/websocket-stage.js";

import type {
  PipelineConfig,
  PipelineResult,
  PipelineStageConfig,
  PipelineStepResult,
  PipelineStepStatus,
  PipelineStepEvent,
  PipelineStepEventHandler,
  PipelineExportedState,
  ParallelStageGroup,
  SubPipelineStage,
  StreamStageConfig,
  WebSocketStageConfig,
} from "../types.js";

// Re-exported because types.ts is now the single source of truth
export type { PipelineStepEvent, PipelineStepEventHandler };

/** Small helper: sleep */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pipeline orchestrator. Manages sequential and parallel execution of stages,
 * pause/resume, abort, events, metrics, and persistent state.
 *
 * @template TKeys — a string union type of stage keys for type-safe events.
 *   Defaults to `string` for backward compatibility.
 * @example
 * const orchestrator = new PipelineOrchestrator<"fetchUser" | "processData">({ ... });
 * orchestrator.on("step:fetchUser:success", (event) => { ... }); // autocomplete!
 */
export class PipelineOrchestrator<TKeys extends string = string> {
  // Note: several fields below that would naturally be `private` are left
  // with no access modifier instead (TS still discourages external use by
  // convention/lack of `private`'s enforcement isn't needed here) — the
  // extracted src/orchestrator/*.ts step-execution modules take `this`
  // (typed to a narrow per-module context interface) as their first
  // argument, and TypeScript's structural typing rejects a `private` class
  // member as satisfying a same-named public interface property. This is a
  // compile-time-only relaxation: TS `private` has zero runtime effect
  // (it's erased entirely, unlike real `#private` fields), so nothing about
  // the class's actual runtime behavior or its public API surface changes.
  progress: ProgressTracker;
  errorHandler: ErrorHandler;
  private executor: RequestExecutor;
  sharedData: Record<string, unknown>;

  private onStepStartHandlers: PipelineStepEventHandler[] = [];
  private onStepFinishHandlers: PipelineStepEventHandler[] = [];
  private onStepErrorHandlers: PipelineStepEventHandler[] = [];

  /** Generic event subscribers: key is the event name */
  private eventHandlers: Record<
    string,
    Array<(...args: any[]) => void | Promise<void>>
  > = {};

  /** Built-in logs */
  private logs: InMemoryLogEntry[] = [];

  stageResults: Record<string, PipelineStepResult> = {};
  private stageResultsListeners: Array<
    (results: Record<string, PipelineStepResult>) => void
  > = [];

  private autoReset: boolean;

  /** AbortController used to cancel the pipeline */
  private abortController: AbortController | null = null;

  /** Pause/resume mechanism */
  _pauseController = new PauseController();

  config: PipelineConfig;

  /** Index of the last failed stage (used by pipelineRetry with retryFrom: 'failed-step') */
  private _lastFailedIndex: number = -1;

  /**
   * Identifier of the current/last run. Regenerated at the start of run() and rerunStep()
   * (all attempts within a single run(), including pipelineRetry, share the same runId).
   * Used to correlate events/logs/metrics of a single run in external systems.
   */
  _runId: string = "";

  /** Plugin cleanup functions */
  private _pluginCleanups: Array<() => void> = [];

  constructor(params: {
    config: PipelineConfig;
    httpConfig?: import("../types.js").HttpConfig;
    sharedData?: Record<string, unknown>;
    /**
     * @deprecated Use params.config.options.autoReset.
     * Kept for backward compatibility; this parameter is still supported.
     */
    options?: { autoReset?: boolean };
  }) {
    this.config = params.config;
    // Count the total number of stages (a parallel group counts as 1 progress item)
    this.progress = new ProgressTracker(params.config.stages.length);
    this.errorHandler = new ErrorHandler();
    this.executor = new RequestExecutor(params.httpConfig ?? {});
    this.sharedData = params.sharedData ?? {};
    // autoReset: first from config.options, then from params.options (backward compatibility)
    this.autoReset =
      params.config.options?.autoReset ?? params.options?.autoReset ?? false;

    // Install plugins
    const plugins = params.config.options?.plugins ?? [];
    for (const plugin of plugins) {
      const cleanup = plugin.install(this);
      if (typeof cleanup === "function") {
        this._pluginCleanups.push(cleanup);
      }
    }
  }

  /**
   * Release plugin resources. Call this when destroying the orchestrator.
   */
  destroy(): void {
    for (const cleanup of this._pluginCleanups) {
      try { cleanup(); } catch { /* ignore */ }
    }
    this._pluginCleanups = [];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pause / Resume
  // ─────────────────────────────────────────────────────────────────────────

  /** Pause the pipeline after the current stage finishes */
  pause(): void {
    this._pauseController.pause();
  }

  /** Resume pipeline execution */
  resume(): void {
    this._pauseController.resume();
  }

  /** Check whether the pipeline is paused */
  isPaused(): boolean {
    return this._pauseController.isPaused;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Subscriptions
  // ─────────────────────────────────────────────────────────────────────────

  subscribeStageResults(
    listener: (results: Record<string, PipelineStepResult>) => void,
  ) {
    this.stageResultsListeners.push(listener);
    listener({ ...this.stageResults });
    return () => {
      this.stageResultsListeners = this.stageResultsListeners.filter(
        (l) => l !== listener,
      );
    };
  }

  on(
    event:
      | `step:${TKeys}:${"start" | "success" | "error" | "progress" | "skipped"}`
      | "log"
      | (string & {}),
    handler: (...args: any[]) => void | Promise<void>,
  ) {
    if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
    this.eventHandlers[event].push(handler);
    return () => {
      this.eventHandlers[event] = this.eventHandlers[event].filter(
        (h) => h !== handler,
      );
    };
  }

  onStepStart(handler: PipelineStepEventHandler) {
    this.onStepStartHandlers.push(handler);
    return () => {
      this.onStepStartHandlers = this.onStepStartHandlers.filter(
        (h) => h !== handler,
      );
    };
  }

  onStepFinish(handler: PipelineStepEventHandler) {
    this.onStepFinishHandlers.push(handler);
    return () => {
      this.onStepFinishHandlers = this.onStepFinishHandlers.filter(
        (h) => h !== handler,
      );
    };
  }

  onStepError(handler: PipelineStepEventHandler) {
    this.onStepErrorHandlers.push(handler);
    return () => {
      this.onStepErrorHandlers = this.onStepErrorHandlers.filter(
        (h) => h !== handler,
      );
    };
  }

  subscribeProgress(
    listener: (progress: import("../types.js").PipelineProgress) => void,
  ) {
    return this.progress.subscribe(listener);
  }

  subscribeStepProgress(
    stepKey: TKeys | (string & {}),
    listener: (status: PipelineStepStatus) => void,
  ) {
    return this.on(`step:${stepKey}:progress`, listener);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // State getters
  // ─────────────────────────────────────────────────────────────────────────

  getProgress() {
    return this.progress.getProgress();
  }

  /** Returns a snapshot of the progress. For reactivity, use subscribeProgress. */
  getProgressRef() {
    return this.progress.getProgressRef();
  }

  getLogs() {
    return [...this.logs];
  }

  /** Returns a synchronous snapshot of the results of all stages. */
  getStageResults(): Record<string, PipelineStepResult> {
    return { ...this.stageResults };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // State management
  // ─────────────────────────────────────────────────────────────────────────

  clearStageResults() {
    this.stageResults = {};
    this.notifyStageResults();
    this.progress.reset();
  }

  /** Export a snapshot of the pipeline state (for saving and restoring) */
  exportState(): PipelineExportedState {
    return exportPipelineState(this.stageResults, this.logs);
  }

  /** Restore pipeline state from a previously saved snapshot */
  importState(state: PipelineExportedState): void {
    const parsed = parseImportedPipelineState(state);
    this.stageResults = parsed.stageResults;
    this.logs = parsed.logs;
    this.notifyStageResults();

    for (const { index, status } of computeProgressUpdatesFromStageResults(
      this.config.stages,
      this.stageResults,
    )) {
      this.progress.updateStage(index, status);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Abort
  // ─────────────────────────────────────────────────────────────────────────

  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
    // If the pipeline was paused, wake it up so it can finish
    if (this._pauseController.isPaused) this.resume();
  }

  isAborted() {
    return this.abortController?.signal.aborted ?? false;
  }

  /** Identifier of the current/last run (run() or rerunStep()). Empty string if nothing has run yet. */
  getRunId(): string {
    return this._runId;
  }

  private _generateRunId(): string {
    const g: any = globalThis as any;
    if (g.crypto?.randomUUID) return g.crypto.randomUUID();
    return `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Emit helpers
  // ─────────────────────────────────────────────────────────────────────────

  async emit(event: string, ...args: any[]) {
    if (this.eventHandlers[event]) {
      for (const handler of this.eventHandlers[event]) {
        await handler(...args);
      }
    }
  }

  notifyStageResults() {
    for (const listener of this.stageResultsListeners) {
      listener({ ...this.stageResults });
    }
  }

  addLog(type: string, message: string, data?: any) {
    this.logs.push({ type, message, data, timestamp: new Date(), runId: this._runId });
    const maxLogs = this.config.options?.maxLogs;
    if (maxLogs !== undefined && this.logs.length > maxLogs) {
      this.logs.splice(0, this.logs.length - maxLogs);
    }
  }

  async emitStepStart(event: PipelineStepEvent) {
    const e = { ...event, runId: this._runId };
    for (const handler of this.onStepStartHandlers) await handler(e);
    await this.emit(`step:${e.stepKey}:start`, e);
    this.addLog("log", `step:${e.stepKey}:start`, e);
    await this.emit("log", { type: "step:start", ...e });
  }

  async emitStepFinish(event: PipelineStepEvent) {
    const e = { ...event, runId: this._runId };
    for (const handler of this.onStepFinishHandlers) await handler(e);
    await this.emit(`step:${e.stepKey}:success`, e);
    this.addLog("log", `step:${e.stepKey}:success`, e);
    await this.emit("log", { type: "step:success", ...e });
  }

  async emitStepError(event: PipelineStepEvent) {
    const e = { ...event, runId: this._runId };
    for (const handler of this.onStepErrorHandlers) await handler(e);
    await this.emit(`step:${e.stepKey}:error`, e);
    this.addLog("error", `step:${e.stepKey}:error`, e);
    await this.emit("log", { type: "step:error", ...e });
  }

  private async emitStepSkipped(event: PipelineStepEvent) {
    const e = { ...event, runId: this._runId };
    await this.emit(`step:${e.stepKey}:skipped`, e);
    this.addLog("log", `step:${e.stepKey}:skipped`, e);
    await this.emit("log", { type: "step:skipped", ...e });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Core: execution of a single stage
  // ─────────────────────────────────────────────────────────────────────────

  /** Get the data of the previous (per config) regular stage */
  _getPrevData(stepIndex: number): unknown {
    const prevItems = this.config.stages
      .slice(0, stepIndex)
      .filter(
        (s) =>
          !isParallelGroup(s) &&
          !isSubPipeline(s) &&
          !isStreamStage(s) &&
          !isWebSocketStage(s),
      ) as PipelineStageConfig[];
    const prevStage = prevItems[prevItems.length - 1];
    return prevStage ? this.stageResults[prevStage.key]?.data : undefined;
  }

  /**
   * Execute a single pipeline stage.
   * The single implementation point for stage logic — used by both run() and rerunStep().
   */
  private async executeStage(
    stepIndex: number,
    stage: PipelineStageConfig,
    signal: AbortSignal,
    onStepPause?: (
      stepIndex: number,
      stepResult: unknown,
      stageResults: Record<string, PipelineStepResult>,
    ) => Promise<unknown> | unknown,
  ): Promise<PipelineStepResult> {
    const key = stage.key;
    const prevData = this._getPrevData(stepIndex);
    const stepStartTs = Date.now();

    // ── Check condition ──────────────────────────────────────────────────
    if (typeof stage.condition === "function") {
      const shouldRun = stage.condition({
        prev: prevData,
        allResults: this.stageResults,
        sharedData: this.sharedData,
        signal,
      });
      if (!shouldRun) {
        const skippedResult: PipelineStepResult = { status: "skipped" };
        this.stageResults[key] = skippedResult;
        this.notifyStageResults();
        this.progress.updateStage(stepIndex, "skipped");
        await this.emit(`step:${key}:progress`, "skipped");
        await this.emitStepSkipped({
          stepIndex,
          stepKey: key,
          status: "skipped",
          stageResults: { ...this.stageResults },
        });
        return skippedResult;
      }
    }

    // ── Initialization ────────────────────────────────────────────────────
    this.stageResults[key] = { status: "pending" };
    this.notifyStageResults();
    this.progress.updateStage(stepIndex, "loading");
    await this.emit(`step:${key}:progress`, "loading");

    await this.emitStepStart({
      stepIndex,
      stepKey: key,
      status: "loading",
      stageResults: { ...this.stageResults },
    });

    try {
      // ── Check abort before execution ──────────────────────────────────
      if (signal.aborted) {
        throw new Error("Pipeline aborted");
      }

      // ── Global middleware: beforeEach ──────────────────────────────────
      if (typeof this.config.middleware?.beforeEach === "function") {
        await this.config.middleware.beforeEach({
          stage,
          index: stepIndex,
          sharedData: this.sharedData,
        });
      }

      // ── pauseBefore ───────────────────────────────────────────────────
      if (typeof stage.pauseBefore === "number" && stage.pauseBefore > 0) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, stage.pauseBefore),
        );
      }

      // ── Check abort after pause ────────────────────────────────────────
      if (signal.aborted) {
        throw new Error("Pipeline aborted");
      }

      // ── before hook ───────────────────────────────────────────────────
      let prevInput = prevData;
      if (typeof stage.before === "function") {
        const beforeResult = await stage.before({
          prev: prevInput,
          allResults: this.stageResults,
          sharedData: this.sharedData,
          signal,
        });
        if (beforeResult !== undefined) prevInput = beforeResult;
      }

      // ── Check abort after the before hook ───────────────────────────────────
      if (signal.aborted) {
        throw new Error("Pipeline aborted");
      }

      // ── validateInput hook ───────────────────────────────────────────────
      if (typeof stage.validateInput === "function") {
        prevInput = await stage.validateInput(prevInput, {
          allResults: this.stageResults,
          sharedData: this.sharedData,
          signal,
        });
      }

      // ── request ────────────────────────────────────────────────────────
      let stepResult: unknown;
      if (typeof stage.request === "function") {
        if (signal.aborted) {
          throw new Error("Pipeline aborted");
        }
        stepResult = await stage.request({
          prev: prevInput,
          allResults: this.stageResults,
          sharedData: this.sharedData,
          signal,
        });
      } else if (stage.key) {
        // No request function — use stage.key as the URL endpoint
        const res = await this.executor.execute(
          stage.key,
          undefined,
          stage.retryCount,
          stage.timeoutMs,
          signal,
        );
        stepResult = res.data;
      } else {
        stepResult = undefined;
      }

      // ── Check abort after request ───────────────────────────────────────
      if (signal.aborted) {
        throw new Error("Pipeline aborted");
      }

      // ── after hook ────────────────────────────────────────────────────
      if (typeof stage.after === "function") {
        stepResult = await stage.after({
          result: stepResult,
          allResults: this.stageResults,
          sharedData: this.sharedData,
          signal,
        });
      }

      // ── pauseAfter ────────────────────────────────────────────────────
      if (typeof stage.pauseAfter === "number" && stage.pauseAfter > 0) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, stage.pauseAfter),
        );
      }

      // ── onStepPause callback ──────────────────────────────────────────
      if (onStepPause) {
        stepResult = await onStepPause(
          stepIndex,
          stepResult,
          this.stageResults,
        );
      }

      // ── validateOutput hook ──────────────────────────────────────────────
      if (typeof stage.validateOutput === "function") {
        stepResult = await stage.validateOutput(stepResult, {
          allResults: this.stageResults,
          sharedData: this.sharedData,
          signal,
        });
      }

      return await this._commitStepSuccess(stepIndex, stage, stepResult, stepStartTs);
    } catch (err) {
      // ── Error handling ─────────────────────────────────────────────
      if (typeof stage.errorHandler === "function") {
        const handled = stage.errorHandler({
          error: err,
          key: stage.key,
          sharedData: this.sharedData,
          signal,
        });
        if (isStepRecovery(handled)) {
          // errorHandler recovered the stage — proceed as if it succeeded
          return await this._commitStepSuccess(
            stepIndex,
            stage,
            handled.data,
            stepStartTs,
          );
        }
        return await this._commitStepError(
          stepIndex,
          stage,
          toApiError(handled ?? err),
          stepStartTs,
        );
      }
      return await this._commitStepError(
        stepIndex,
        stage,
        this.errorHandler.handle(err, stage.key),
        stepStartTs,
      );
    }
  }

  /** Commit a successful stage result: record it in stageResults, metrics, persist, middleware, events. */
  private async _commitStepSuccess(
    stepIndex: number,
    stage: PipelineStageConfig,
    stepResult: unknown,
    stepStartTs: number,
  ): Promise<PipelineStepResult> {
    const key = stage.key;
    const successResult: PipelineStepResult = {
      status: "success",
      data: stepResult,
    };
    this.stageResults[key] = successResult;
    this.notifyStageResults();
    this.progress.updateStage(stepIndex, "success");
    await this.emit(`step:${key}:progress`, "success");

    this.config.metrics?.onStepDuration?.({
      stepKey: key,
      durationMs: Date.now() - stepStartTs,
      status: "success",
      runId: this._runId,
    });

    const persistAdapter = this.config.options?.persistAdapter;
    if (persistAdapter) {
      try {
        await persistAdapter.save(this.exportState());
      } catch { /* don't abort the pipeline due to a persist error */ }
    }

    if (typeof this.config.middleware?.afterEach === "function") {
      await this.config.middleware.afterEach({
        stage,
        index: stepIndex,
        result: successResult,
        sharedData: this.sharedData,
      });
    }

    await this.emitStepFinish({
      stepIndex,
      stepKey: key,
      status: "success",
      data: stepResult,
      stageResults: { ...this.stageResults },
    });

    // ── pause/resume: checked AFTER emitting events ────────────────────
    await this._pauseController.waitIfPaused();

    return successResult;
  }

  /** Commit a stage error: record it in stageResults, metrics, middleware, events. */
  private async _commitStepError(
    stepIndex: number,
    stage: PipelineStageConfig,
    apiError: import("../types.js").ApiError,
    stepStartTs: number,
  ): Promise<PipelineStepResult> {
    const key = stage.key;
    const errorResult: PipelineStepResult = {
      status: "error",
      error: apiError,
    };
    this.stageResults[key] = errorResult;
    this.notifyStageResults();
    this.progress.updateStage(stepIndex, "error");
    await this.emit(`step:${key}:progress`, "error");

    this.config.metrics?.onStepDuration?.({
      stepKey: key,
      durationMs: Date.now() - stepStartTs,
      status: "error",
      runId: this._runId,
    });

    if (typeof this.config.middleware?.onError === "function") {
      await this.config.middleware.onError({
        stage,
        index: stepIndex,
        error: apiError,
        sharedData: this.sharedData,
      });
    }

    await this.emitStepError({
      stepIndex,
      stepKey: key,
      status: "error",
      error: apiError,
      stageResults: { ...this.stageResults },
    });

    return errorResult;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Core: execution of a stream stage (StreamStageConfig)
  // ─────────────────────────────────────────────────────────────────────────

  private executeStreamStage<T>(
    stepIndex: number,
    item: StreamStageConfig<T>,
    signal: AbortSignal,
  ): Promise<PipelineStepResult> {
    return executeStreamStageImpl(this, stepIndex, item, signal);
  }

  private executeWebSocketStage<T>(
    stepIndex: number,
    item: WebSocketStageConfig<T>,
    signal: AbortSignal,
  ): Promise<PipelineStepResult> {
    return executeWebSocketStageImpl(this, stepIndex, item, signal);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Core: execution of a nested pipeline (SubPipelineStage)
  // ─────────────────────────────────────────────────────────────────────────

  private executeSubPipeline(
    stepIndex: number,
    item: SubPipelineStage,
    signal: AbortSignal,
  ): Promise<PipelineStepResult> {
    const globalContinueOnError = this.config.options?.continueOnError ?? false;
    return executeSubPipelineImpl(this, stepIndex, item, signal, globalContinueOnError);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helper method: find a stage by key, returning its index
  // ─────────────────────────────────────────────────────────────────────────

  private findStageByKey(
    key: string,
  ): { stage: PipelineStageConfig; index: number } | undefined {
    for (let i = 0; i < this.config.stages.length; i++) {
      const item = this.config.stages[i];
      if (isParallelGroup(item)) {
        const found = item.parallel.find((s) => s.key === key);
        if (found) return { stage: found, index: i };
      } else if (!isSubPipeline(item)) {
        const stage = item as PipelineStageConfig;
        if (stage.key === key) return { stage, index: i };
      }
    }
    return undefined;
  }

  /**
   * Run a worker for each item in items with a concurrency limit.
   * Without a limit (undefined/0/>= items.length) it behaves like Promise.all — all items start at once.
   * Results are returned in the original order of items regardless of completion order.
   */
  private async _runPooled<T>(
    items: T[],
    limit: number | undefined,
    worker: (item: T, index: number) => Promise<PipelineStepResult>,
  ): Promise<PipelineStepResult[]> {
    if (!limit || limit >= items.length) {
      return Promise.all(items.map((item, index) => worker(item, index)));
    }

    const results: PipelineStepResult[] = new Array(items.length);
    let nextIndex = 0;

    const runNext = async (): Promise<void> => {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
      return runNext();
    };

    const poolSize = Math.max(1, Math.min(limit, items.length));
    await Promise.all(Array.from({ length: poolSize }, () => runNext()));

    return results;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // _runOnce() — a single attempt at running the pipeline
  // ─────────────────────────────────────────────────────────────────────────

  private async _runOnce(
    onStepPause?: (
      stepIndex: number,
      stepResult: unknown,
      stageResults: Record<string, PipelineStepResult>,
    ) => Promise<unknown> | unknown,
    signal?: AbortSignal,
    startFromIndex = 0,
  ): Promise<PipelineResult> {
    const globalContinueOnError = this.config.options?.continueOnError ?? false;
    const maxSteps =
      this.config.options?.maxSteps ?? this.config.stages.length * 10;

    let success = true;
    let stepCount = 0;

    // Use an index variable to support DAG transitions (next)
    let i = startFromIndex;

    while (i < this.config.stages.length) {
      // Guard against infinite loops from DAG transitions
      stepCount++;
      if (stepCount > maxSteps) {
        const loopError = toApiError(
          new Error(
            `Pipeline exceeded maxSteps (${maxSteps}). Possible infinite loop in 'next' transitions.`,
          ),
        );
        this.addLog("error", "pipeline:maxSteps:exceeded", { maxSteps });
        await this.emit("log", { type: "pipeline:error", error: loopError });
        return { stageResults: { ...this.stageResults }, success: false };
      }

      if (signal?.aborted) {
        success = false;
        this.markRemainingAborted(i, signal);
        break;
      }

      const item = this.config.stages[i];

      // ── StreamStage ───────────────────────────────────────────────────
      if (isStreamStage(item)) {
        const streamItem = item as StreamStageConfig;
        const shouldContinue =
          streamItem.continueOnError ?? globalContinueOnError;

        const result = await this.executeStreamStage(i, streamItem, signal!);

        if (result.status === "error") {
          if (!shouldContinue) {
            success = false;
            this._lastFailedIndex = i;
            break;
          }
        }
        i++;
        continue;
      }

      // ── WebSocketStage ───────────────────────────────────────────────────
      if (isWebSocketStage(item)) {
        const wsItem = item as WebSocketStageConfig;
        const shouldContinue = wsItem.continueOnError ?? globalContinueOnError;

        const result = await this.executeWebSocketStage(i, wsItem, signal!);

        if (result.status === "error") {
          if (!shouldContinue) {
            success = false;
            this._lastFailedIndex = i;
            break;
          }
        }
        i++;
        continue;
      }

      // ── SubPipeline ────────────────────────────────────────────────────
      if (isSubPipeline(item)) {
        const subItem = item as SubPipelineStage;
        const shouldContinue = subItem.continueOnError ?? globalContinueOnError;

        try {
          const result = await this.executeSubPipeline(i, subItem, signal!);

          if (result.status === "error") {
            if (!shouldContinue) {
              success = false;
              this._lastFailedIndex = i;
              break;
            }
          }
          i++;
          continue;
        } catch (err) {
          // Error from the sub-pipeline (rethrown from executeSubPipeline)
          const apiError = toApiError(err);

          // Log the error
          this.addLog("error", `subPipeline:${subItem.key}:unhandled_error`, {
            stepIndex: i,
            error: apiError,
          });
          await this.emit("log", {
            type: "subPipeline:unhandled_error",
            stepKey: subItem.key,
            stepIndex: i,
            error: apiError,
          });

          // Important: check shouldContinue and either stop or continue
          if (!shouldContinue) {
            success = false;
            this._lastFailedIndex = i;
            break;
          }
          // If continueOnError = true, keep going
          i++;
          continue;
        }
      }

      // ── Parallel group ────────────────────────────────────────────
      if (isParallelGroup(item)) {
        const group = item as ParallelStageGroup;
        this.progress.updateStage(i, "loading");

        const parallelResults = await this._runPooled(
          group.parallel,
          group.concurrency,
          (stage) => this.executeStage(i, stage, signal!, onStepPause),
        );

        const anyFailed = parallelResults.some(
          (r: PipelineStepResult) => r.status === "error",
        );

        this.progress.updateStage(i, anyFailed ? "error" : "success");

        if (anyFailed) {
          const shouldContinue = group.continueOnError ?? globalContinueOnError;
          if (!shouldContinue) {
            success = false;
            this._lastFailedIndex = i;
            break;
          }
        }
        i++;
        continue;
      }

      // ── Regular stage ───────────────────────────────────────────────────
      const stage = item as PipelineStageConfig;
      const result = await this.executeStage(i, stage, signal!, onStepPause);

      if (result.status === "error") {
        const shouldContinue = stage.continueOnError ?? globalContinueOnError;
        if (!shouldContinue) {
          success = false;
          this._lastFailedIndex = i;
          break;
        }
        i++;
        continue;
      }

      // ── DAG: check next after a successful stage ──────────────────────
      if (typeof stage.next === "function") {
        const nextKey = stage.next({
          result: result.data,
          allResults: this.stageResults,
          sharedData: this.sharedData,
        });

        if (nextKey !== null) {
          const found = this.findStageByKey(nextKey);
          if (found) {
            // Jump to the target index (i++ will happen on the next iteration via continue)
            i = found.index;
            continue;
          } else {
            this.addLog("log", `pipeline:next:key_not_found`, {
              stepKey: stage.key,
              nextKey,
            });
            // Key not found — finish the pipeline successfully
            break;
          }
        }
      }

      i++;
    }

    return { stageResults: { ...this.stageResults }, success };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // run()
  // ─────────────────────────────────────────────────────────────────────────

  async run(
    onStepPause?: (
      stepIndex: number,
      stepResult: unknown,
      stageResults: Record<string, PipelineStepResult>,
    ) => Promise<unknown> | unknown,
    externalSignal?: AbortSignal,
  ): Promise<PipelineResult> {
    if (this.autoReset) {
      this.stageResults = {};
      this.logs = [];
      this.notifyStageResults();
    }

    this._pauseController.reset();
    this._lastFailedIndex = -1;
    this._runId = this._generateRunId();

    this.abortController = new AbortController();
    const signal = externalSignal
      ? this.mergeSignals(externalSignal, this.abortController.signal)
      : this.abortController.signal;

    const retryOpts = this.config.options?.pipelineRetry;
    const maxAttempts = retryOpts?.attempts ?? 0;
    let attempt = 0;
    let lastResult: PipelineResult = { stageResults: {}, success: false };
    const pipelineStartTs = Date.now();

    // ── Persist adapter: load the saved state ─────────────
    const persistAdapter = this.config.options?.persistAdapter;
    if (persistAdapter) {
      try {
        const saved = await persistAdapter.load();
        if (saved) this.importState(saved);
      } catch { /* don't abort the pipeline due to a persist error */ }
    }

    // ── Metrics: pipeline start ───────────────────────────────────────
    this.config.metrics?.onPipelineStart?.({ timestamp: pipelineStartTs, runId: this._runId });

    // ── Timeout for the whole pipeline ─────────────────────────────────────────
    let pipelineTimeoutId: ReturnType<typeof setTimeout> | undefined;
    if (this.config.options?.pipelineTimeoutMs) {
      pipelineTimeoutId = setTimeout(() => {
        this.abort();
      }, this.config.options.pipelineTimeoutMs);
    }

    try {
      do {
        if (attempt > 0) {
          if (retryOpts?.delayMs) await sleep(retryOpts.delayMs);

          const retryFrom = retryOpts?.retryFrom ?? "start";
          const startIndex =
            retryFrom === "failed-step" && this._lastFailedIndex >= 0
              ? this._lastFailedIndex
              : 0;

          if (startIndex === 0) {
            // Full reset
            this.stageResults = {};
            this.notifyStageResults();
            this.progress.reset();
          }
          this._lastFailedIndex = -1;

          this._pauseController.reset();

          this.addLog("log", `pipeline:retry:attempt:${attempt}`, {
            attempt,
            startIndex,
          });
          await this.emit("log", {
            type: "pipeline:retry",
            attempt,
            startIndex,
          });

          lastResult = await this._runOnce(onStepPause, signal, startIndex);
        } else {
          lastResult = await this._runOnce(onStepPause, signal);
        }

        attempt++;
      } while (
        !lastResult.success &&
        attempt <= maxAttempts &&
        !signal.aborted
      );
    } finally {
      if (pipelineTimeoutId !== undefined) clearTimeout(pipelineTimeoutId);
    }

    // ── Metrics: pipeline end ───────────────────────────────────────
    this.config.metrics?.onPipelineEnd?.({
      durationMs: Date.now() - pipelineStartTs,
      success: lastResult.success,
      stageResults: lastResult.stageResults,
      runId: this._runId,
    });

    return lastResult;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // rerunStep()
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Re-run just a single pipeline stage (without a full restart).
   * Fully mirrors the behavior of run(): invokes before/after/condition/middleware.
   */
  async rerunStep(
    stepKey: TKeys | (string & {}),
    options?: {
      onStepPause?: (
        stepIndex: number,
        stepResult: unknown,
        stageResults: Record<string, PipelineStepResult>,
      ) => Promise<unknown> | unknown;
      externalSignal?: AbortSignal;
    },
  ): Promise<PipelineStepResult | undefined> {
    // Search for the stage, including inside parallel groups
    let stage: PipelineStageConfig | undefined;
    let stepIndex = -1;

    for (let i = 0; i < this.config.stages.length; i++) {
      const item = this.config.stages[i];
      if (isParallelGroup(item)) {
        const found = item.parallel.find((s) => s.key === stepKey);
        if (found) {
          stage = found;
          stepIndex = i;
          break;
        }
      } else if (
        !isSubPipeline(item) &&
        (item as PipelineStageConfig).key === stepKey
      ) {
        stage = item as PipelineStageConfig;
        stepIndex = i;
        break;
      }
    }

    if (!stage || stepIndex === -1) return undefined;

    // rerunStep — an independent execution, separate from the current run(); gets its own runId.
    this._runId = this._generateRunId();

    this.addLog("log", `rerunStep:${stepKey}:start`, { stepIndex });
    await this.emit("log", { type: "rerunStep:start", stepKey, stepIndex });

    const signal = options?.externalSignal ?? new AbortController().signal;

    const result = await this.executeStage(
      stepIndex,
      stage,
      signal,
      options?.onStepPause,
    );

    const logType = result.status === "error" ? "error" : "log";
    this.addLog(logType, `rerunStep:${stepKey}:${result.status}`, {
      stepIndex,
      ...(result.status === "error"
        ? { error: result.error }
        : { data: result.data }),
    });
    await this.emit("log", {
      type: `rerunStep:${result.status}`,
      stepKey,
      stepIndex,
      ...(result.status === "error"
        ? { error: result.error }
        : { data: result.data }),
    });

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (a.aborted || b.aborted) {
      controller.abort();
    } else {
      a.addEventListener("abort", abort, { once: true });
      b.addEventListener("abort", abort, { once: true });
    }
    return controller.signal;
  }

  private markRemainingAborted(fromIndex: number, _signal: AbortSignal) {
    const apiError = toApiError({
      message: "Pipeline aborted",
      code: "ABORTED",
    });
    for (let i = fromIndex; i < this.config.stages.length; i++) {
      const item = this.config.stages[i];
      let keys: string[];
      if (isParallelGroup(item)) {
        keys = item.parallel.map((s) => s.key);
      } else if (isSubPipeline(item)) {
        keys = [(item as SubPipelineStage).key];
      } else if (isStreamStage(item)) {
        keys = [(item as StreamStageConfig).key];
      } else {
        keys = [(item as PipelineStageConfig).key];
      }

      for (const key of keys) {
        if (
          !this.stageResults[key] ||
          this.stageResults[key].status === "pending"
        ) {
          this.stageResults[key] = { status: "error", error: apiError };
        }
      }
      this.progress.updateStage(i, "error");
    }
    this.notifyStageResults();
  }
}
