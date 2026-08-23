import type { ErrorHandler } from "../../http/error-handler.js";
import type { ProgressTracker } from "../progress-tracker.js";
import type { PipelineConfig, PipelineExportedState, PipelineStepEvent, PipelineStepResult, StreamStageConfig } from "../../types.js";
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
    _pauseController: {
        waitIfPaused(): Promise<void>;
    };
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
export declare function executeStreamStage<T>(ctx: StreamStageExecutionContext, stepIndex: number, item: StreamStageConfig<T>, signal: AbortSignal): Promise<PipelineStepResult>;
