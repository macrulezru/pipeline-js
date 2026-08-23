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
export declare function executeSubPipeline(ctx: SubPipelineExecutionContext, stepIndex: number, item: SubPipelineStage, signal: AbortSignal, globalContinueOnError: boolean): Promise<PipelineStepResult>;
