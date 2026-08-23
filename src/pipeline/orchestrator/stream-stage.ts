import type { ErrorHandler } from "../../http/error-handler.js";
import type { ProgressTracker } from "../progress-tracker.js";
import type {
  PipelineConfig,
  PipelineExportedState,
  PipelineStepEvent,
  PipelineStepResult,
  StreamStageConfig,
} from "../../types.js";

/**
 * Exactly the slice of `PipelineOrchestrator`'s internals `executeStreamStage`
 * touches — passing `this` (typed to this interface) from the orchestrator
 * keeps this a pure extraction with no behavior change: TS `private` is
 * compile-time only, so this costs nothing at runtime.
 */
export interface StreamStageExecutionContext {
  stageResults: Record<string, PipelineStepResult>;
  sharedData: Record<string, unknown>;
  progress: ProgressTracker;
  errorHandler: ErrorHandler;
  config: PipelineConfig;
  _runId: string;
  _pauseController: { waitIfPaused(): Promise<void> };
  notifyStageResults(): void;
  emit(event: string, ...args: any[]): Promise<void>;
  addLog(type: string, message: string, data?: any): void;
  emitStepStart(event: PipelineStepEvent): Promise<void>;
  emitStepFinish(event: PipelineStepEvent): Promise<void>;
  emitStepError(event: PipelineStepEvent): Promise<void>;
  exportState(): PipelineExportedState;
  _getPrevData(stepIndex: number): unknown;
}

/**
 * Runs a `StreamStageConfig` step: consumes its `AsyncIterable`, collecting
 * every chunk into the step's `data` array (calling `onChunk` and emitting a
 * `step:<key>:progress` event per chunk in real time) until the iterable
 * completes, the pipeline is aborted, or the stream throws.
 */
export async function executeStreamStage<T>(
  ctx: StreamStageExecutionContext,
  stepIndex: number,
  item: StreamStageConfig<T>,
  signal: AbortSignal,
): Promise<PipelineStepResult> {
  const key = item.key;
  const prevData = ctx._getPrevData(stepIndex);
  const stepStartTs = Date.now();

  ctx.stageResults[key] = { status: "pending" };
  ctx.notifyStageResults();
  ctx.progress.updateStage(stepIndex, "loading");
  await ctx.emit(`step:${key}:progress`, "loading");

  await ctx.emitStepStart({
    stepIndex,
    stepKey: key,
    status: "loading",
    stageResults: { ...ctx.stageResults },
  });

  ctx.addLog("log", `stream:${key}:start`, { stepIndex });
  await ctx.emit("log", { type: "stream:start", stepKey: key, stepIndex });

  try {
    if (signal.aborted) throw new Error("Pipeline aborted");

    const chunks: T[] = [];
    const asyncIter = item.stream({
      prev: prevData,
      allResults: ctx.stageResults,
      sharedData: ctx.sharedData,
      signal,
    });

    for await (const chunk of asyncIter) {
      if (signal.aborted) throw new Error("Pipeline aborted");
      chunks.push(chunk);
      item.onChunk?.(chunk, ctx.sharedData);
      // Emit chunk progress event so subscribers can render chunks in real time
      await ctx.emit(`step:${key}:progress`, { chunk, chunks: [...chunks] });
    }

    const successResult: PipelineStepResult = { status: "success", data: chunks };
    ctx.stageResults[key] = successResult;
    ctx.notifyStageResults();
    ctx.progress.updateStage(stepIndex, "success");
    await ctx.emit(`step:${key}:progress`, "success");

    ctx.config.metrics?.onStepDuration?.({
      stepKey: key,
      durationMs: Date.now() - stepStartTs,
      status: "success",
      runId: ctx._runId,
    });

    const persistAdapter = ctx.config.options?.persistAdapter;
    if (persistAdapter) {
      try { await persistAdapter.save(ctx.exportState()); } catch { /* ignore */ }
    }

    ctx.addLog("log", `stream:${key}:success`, { stepIndex, chunks: chunks.length });
    await ctx.emit("log", { type: "stream:success", stepKey: key, stepIndex });

    await ctx.emitStepFinish({
      stepIndex,
      stepKey: key,
      status: "success",
      data: chunks,
      stageResults: { ...ctx.stageResults },
    });

    await ctx._pauseController.waitIfPaused();

    return successResult;
  } catch (err) {
    const apiError = ctx.errorHandler.handle(err, key);
    const errorResult: PipelineStepResult = { status: "error", error: apiError };
    ctx.stageResults[key] = errorResult;
    ctx.notifyStageResults();
    ctx.progress.updateStage(stepIndex, "error");
    await ctx.emit(`step:${key}:progress`, "error");

    ctx.config.metrics?.onStepDuration?.({
      stepKey: key,
      durationMs: Date.now() - stepStartTs,
      status: "error",
      runId: ctx._runId,
    });

    ctx.addLog("error", `stream:${key}:error`, { stepIndex, error: apiError });
    await ctx.emit("log", { type: "stream:error", stepKey: key, stepIndex, error: apiError });

    await ctx.emitStepError({
      stepIndex,
      stepKey: key,
      status: "error",
      error: apiError,
      stageResults: { ...ctx.stageResults },
    });

    return errorResult;
  }
}
