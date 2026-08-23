import type { ErrorHandler } from "../../http/error-handler.js";
import type { ProgressTracker } from "../progress-tracker.js";
import type { PipelineConfig, PipelineExportedState, PipelineStepEvent, PipelineStepResult, WebSocketStageConfig } from "../../types.js";
/**
 * Exactly the slice of `PipelineOrchestrator`'s internals `executeWebSocketStage`
 * touches — passing `this` (typed to this interface) from the orchestrator
 * keeps this a pure extraction with no behavior change: TS `private` is
 * compile-time only, so this costs nothing at runtime.
 */
export interface WebSocketStageExecutionContext {
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
 * Runs a `WebSocketStageConfig` step: opens a connection, collects every
 * non-`undefined` value returned by `onMessage` into the step's `data`
 * array (calling `onChunk` and emitting a `step:<key>:progress` event per
 * message in real time), and resolves once the connection closes cleanly
 * (or `closeOn` says to close it), times out, or the pipeline aborts.
 *
 * Success/error is decided by the close event's `wasClean`, not the error
 * event directly — most WebSocket implementations fire `error` immediately
 * before `close`, so `onError` alone doesn't fail the stage.
 */
export declare function executeWebSocketStage<T>(ctx: WebSocketStageExecutionContext, stepIndex: number, item: WebSocketStageConfig<T>, signal: AbortSignal): Promise<PipelineStepResult>;
