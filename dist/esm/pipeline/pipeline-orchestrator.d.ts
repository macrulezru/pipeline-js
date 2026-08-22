import { ErrorHandler } from "../http/error-handler.js";
import { ProgressTracker } from "./progress-tracker.js";
import { PauseController } from "./orchestrator/pause-resume.js";
import type { InMemoryLogEntry } from "./orchestrator/state-persistence.js";
import type { PipelineConfig, PipelineResult, PipelineStepResult, PipelineStepStatus, PipelineStepEvent, PipelineStepEventHandler, PipelineExportedState } from "../types.js";
export type { PipelineStepEvent, PipelineStepEventHandler };
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
export declare class PipelineOrchestrator<TKeys extends string = string> {
    progress: ProgressTracker;
    errorHandler: ErrorHandler;
    private executor;
    sharedData: Record<string, unknown>;
    private onStepStartHandlers;
    private onStepFinishHandlers;
    private onStepErrorHandlers;
    /** Generic event subscribers: key is the event name */
    private eventHandlers;
    /** Built-in logs */
    private logs;
    stageResults: Record<string, PipelineStepResult>;
    private stageResultsListeners;
    private autoReset;
    /** AbortController used to cancel the pipeline */
    private abortController;
    /** Pause/resume mechanism */
    _pauseController: PauseController;
    config: PipelineConfig;
    /** Index of the last failed stage (used by pipelineRetry with retryFrom: 'failed-step') */
    private _lastFailedIndex;
    /**
     * Identifier of the current/last run. Regenerated at the start of run() and rerunStep()
     * (all attempts within a single run(), including pipelineRetry, share the same runId).
     * Used to correlate events/logs/metrics of a single run in external systems.
     */
    _runId: string;
    /** Plugin cleanup functions */
    private _pluginCleanups;
    constructor(params: {
        config: PipelineConfig;
        httpConfig?: import("../types.js").HttpConfig;
        sharedData?: Record<string, unknown>;
        /**
         * @deprecated Use params.config.options.autoReset.
         * Kept for backward compatibility; this parameter is still supported.
         */
        options?: {
            autoReset?: boolean;
        };
    });
    /**
     * Release plugin resources. Call this when destroying the orchestrator.
     */
    destroy(): void;
    /** Pause the pipeline after the current stage finishes */
    pause(): void;
    /** Resume pipeline execution */
    resume(): void;
    /** Check whether the pipeline is paused */
    isPaused(): boolean;
    subscribeStageResults(listener: (results: Record<string, PipelineStepResult>) => void): () => void;
    on(event: `step:${TKeys}:${"start" | "success" | "error" | "progress" | "skipped"}` | "log" | (string & {}), handler: (...args: any[]) => void | Promise<void>): () => void;
    onStepStart(handler: PipelineStepEventHandler): () => void;
    onStepFinish(handler: PipelineStepEventHandler): () => void;
    onStepError(handler: PipelineStepEventHandler): () => void;
    subscribeProgress(listener: (progress: import("../types.js").PipelineProgress) => void): () => void;
    subscribeStepProgress(stepKey: TKeys | (string & {}), listener: (status: PipelineStepStatus) => void): () => void;
    getProgress(): {
        currentStage: number;
        totalStages: number;
        stageStatuses: Array<PipelineStepStatus>;
    };
    /** Returns a snapshot of the progress. For reactivity, use subscribeProgress. */
    getProgressRef(): {
        currentStage: number;
        totalStages: number;
        stageStatuses: Array<PipelineStepStatus>;
    };
    getLogs(): InMemoryLogEntry[];
    /** Returns a synchronous snapshot of the results of all stages. */
    getStageResults(): Record<string, PipelineStepResult>;
    clearStageResults(): void;
    /** Export a snapshot of the pipeline state (for saving and restoring) */
    exportState(): PipelineExportedState;
    /** Restore pipeline state from a previously saved snapshot */
    importState(state: PipelineExportedState): void;
    abort(): void;
    isAborted(): boolean;
    /** Identifier of the current/last run (run() or rerunStep()). Empty string if nothing has run yet. */
    getRunId(): string;
    private _generateRunId;
    emit(event: string, ...args: any[]): Promise<void>;
    notifyStageResults(): void;
    addLog(type: string, message: string, data?: any): void;
    emitStepStart(event: PipelineStepEvent): Promise<void>;
    emitStepFinish(event: PipelineStepEvent): Promise<void>;
    emitStepError(event: PipelineStepEvent): Promise<void>;
    private emitStepSkipped;
    /** Get the data of the previous (per config) regular stage */
    _getPrevData(stepIndex: number): unknown;
    /**
     * Execute a single pipeline stage.
     * The single implementation point for stage logic — used by both run() and rerunStep().
     */
    private executeStage;
    /** Commit a successful stage result: record it in stageResults, metrics, persist, middleware, events. */
    private _commitStepSuccess;
    /** Commit a stage error: record it in stageResults, metrics, middleware, events. */
    private _commitStepError;
    private executeStreamStage;
    private executeWebSocketStage;
    private executeSubPipeline;
    private findStageByKey;
    /**
     * Run a worker for each item in items with a concurrency limit.
     * Without a limit (undefined/0/>= items.length) it behaves like Promise.all — all items start at once.
     * Results are returned in the original order of items regardless of completion order.
     */
    private _runPooled;
    private _runOnce;
    run(onStepPause?: (stepIndex: number, stepResult: unknown, stageResults: Record<string, PipelineStepResult>) => Promise<unknown> | unknown, externalSignal?: AbortSignal): Promise<PipelineResult>;
    /**
     * Re-run just a single pipeline stage (without a full restart).
     * Fully mirrors the behavior of run(): invokes before/after/condition/middleware.
     */
    rerunStep(stepKey: TKeys | (string & {}), options?: {
        onStepPause?: (stepIndex: number, stepResult: unknown, stageResults: Record<string, PipelineStepResult>) => Promise<unknown> | unknown;
        externalSignal?: AbortSignal;
    }): Promise<PipelineStepResult | undefined>;
    private mergeSignals;
    private markRemainingAborted;
}
