// This file and pipeline-orchestrator.ts import from each other
// (this one needs the `PipelineOrchestrator` class to construct a nested
// instance; pipeline-orchestrator.ts imports `executeSubPipeline` below).
// Safe as a plain circular import here because `PipelineOrchestrator` is
// only ever referenced inside `executeSubPipeline`'s function body — never
// at module-evaluation time — by which point both modules have finished
// loading. This holds for both build outputs: ESM resolves it via live
// bindings, and TypeScript's CJS output (esModuleInterop) resolves it via a
// retained module-object reference rather than a value copied at import
// time, so either way the binding is fully populated by the time it's used.
import { PipelineOrchestrator } from "../pipeline-orchestrator.js";

import type { ErrorHandler } from "../../http/error-handler.js";
import type { ProgressTracker } from "../progress-tracker.js";
import type { PipelineStepResult, SubPipelineStage } from "../../types.js";

/**
 * Exactly the slice of `PipelineOrchestrator`'s internals `executeSubPipeline`
 * touches — passing `this` (typed to this interface) from the orchestrator
 * keeps this a pure extraction with no behavior change: TS `private` is
 * compile-time only, so this costs nothing at runtime.
 */
export interface SubPipelineExecutionContext {
  stageResults: Record<string, PipelineStepResult>;
  sharedData: Record<string, unknown>;
  progress: ProgressTracker;
  errorHandler: ErrorHandler;
  notifyStageResults(): void;
  emit(event: string, ...args: any[]): Promise<void>;
  addLog(type: string, message: string, data?: any): void;
}

/**
 * Runs a nested pipeline as a single step of the parent. Constructs a fresh
 * `PipelineOrchestrator` for `item.subPipeline` (merging `sharedData`), runs
 * it, and folds its `PipelineResult` into a single `PipelineStepResult` for
 * the parent — `data` holds the full nested result (`{ stageResults, success }`),
 * not just a scalar, so the parent can inspect individual nested stage results.
 */
export async function executeSubPipeline(
  ctx: SubPipelineExecutionContext,
  stepIndex: number,
  item: SubPipelineStage,
  signal: AbortSignal,
  globalContinueOnError: boolean,
): Promise<PipelineStepResult> {
  const key = item.key;
  const shouldContinue = item.continueOnError ?? globalContinueOnError;

  ctx.stageResults[key] = { status: "pending" };
  ctx.notifyStageResults();
  ctx.progress.updateStage(stepIndex, "loading");
  await ctx.emit(`step:${key}:progress`, "loading");

  ctx.addLog("log", `subPipeline:${key}:start`, { stepIndex });
  await ctx.emit("log", {
    type: "subPipeline:start",
    stepKey: key,
    stepIndex,
  });

  let subOrchestrator: PipelineOrchestrator | undefined;
  try {
    subOrchestrator = new PipelineOrchestrator({
      config: item.subPipeline,
      httpConfig: item.httpConfig,
      sharedData: {
        ...ctx.sharedData,
        ...(item.sharedData ?? {}),
      },
    });

    const subResult = await subOrchestrator.run(undefined, signal);

    // If the sub-pipeline finished with an error AND should not continue - throw an error
    if (!subResult.success && !shouldContinue) {
      const error = new Error(`Sub-pipeline "${key}" failed`);
      (error as any).subResult = subResult;
      throw error;
    }

    const resultStatus = subResult.success ? "success" : "error";
    const result: PipelineStepResult = {
      status: resultStatus,
      data: subResult,
    };

    ctx.stageResults[key] = result;
    ctx.notifyStageResults();
    ctx.progress.updateStage(stepIndex, resultStatus);
    await ctx.emit(`step:${key}:progress`, resultStatus);

    if (subResult.success) {
      ctx.addLog("log", `subPipeline:${key}:success`, { stepIndex });
      await ctx.emit("log", {
        type: "subPipeline:success",
        stepKey: key,
        stepIndex,
      });
    } else {
      ctx.addLog("error", `subPipeline:${key}:error`, {
        stepIndex,
        error: subResult,
      });
      await ctx.emit("log", {
        type: "subPipeline:error",
        stepKey: key,
        stepIndex,
        error: subResult,
      });
    }

    return result;
  } catch (err) {
    const apiError = ctx.errorHandler.handle(err, key);
    const errorResult: PipelineStepResult = {
      status: "error",
      error: apiError,
    };
    ctx.stageResults[key] = errorResult;
    ctx.notifyStageResults();
    ctx.progress.updateStage(stepIndex, "error");
    await ctx.emit(`step:${key}:progress`, "error");
    ctx.addLog("error", `subPipeline:${key}:exception`, {
      stepIndex,
      error: apiError,
    });
    await ctx.emit("log", {
      type: "subPipeline:exception",
      stepKey: key,
      stepIndex,
      error: apiError,
    });

    throw err;
  } finally {
    subOrchestrator?.destroy();
  }
}
