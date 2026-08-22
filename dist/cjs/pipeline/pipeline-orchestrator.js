"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineOrchestrator = void 0;
const error_handler_js_1 = require("../http/error-handler.js");
const progress_tracker_js_1 = require("./progress-tracker.js");
const request_executor_js_1 = require("../http/request-executor.js");
const rest_client_js_1 = require("../http/rest-client.js");
const types_js_1 = require("../types.js");
const pause_resume_js_1 = require("./orchestrator/pause-resume.js");
const stage_guards_js_1 = require("./orchestrator/stage-guards.js");
const state_persistence_js_1 = require("./orchestrator/state-persistence.js");
const sub_pipeline_js_1 = require("./orchestrator/sub-pipeline.js");
const stream_stage_js_1 = require("./orchestrator/stream-stage.js");
const websocket_stage_js_1 = require("./orchestrator/websocket-stage.js");
/** Small helper: sleep */
function sleep(ms) {
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
class PipelineOrchestrator {
    constructor(params) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        this.onStepStartHandlers = [];
        this.onStepFinishHandlers = [];
        this.onStepErrorHandlers = [];
        /** Generic event subscribers: key is the event name */
        this.eventHandlers = {};
        /** Built-in logs */
        this.logs = [];
        this.stageResults = {};
        this.stageResultsListeners = [];
        /** AbortController used to cancel the pipeline */
        this.abortController = null;
        /** Pause/resume mechanism */
        this._pauseController = new pause_resume_js_1.PauseController();
        /** Index of the last failed stage (used by pipelineRetry with retryFrom: 'failed-step') */
        this._lastFailedIndex = -1;
        /**
         * Identifier of the current/last run. Regenerated at the start of run() and rerunStep()
         * (all attempts within a single run(), including pipelineRetry, share the same runId).
         * Used to correlate events/logs/metrics of a single run in external systems.
         */
        this._runId = "";
        /** Plugin cleanup functions */
        this._pluginCleanups = [];
        this.config = params.config;
        // Count the total number of stages (a parallel group counts as 1 progress item)
        this.progress = new progress_tracker_js_1.ProgressTracker(params.config.stages.length);
        this.errorHandler = new error_handler_js_1.ErrorHandler();
        this.executor = new request_executor_js_1.RequestExecutor((_a = params.httpConfig) !== null && _a !== void 0 ? _a : {});
        this.sharedData = (_b = params.sharedData) !== null && _b !== void 0 ? _b : {};
        // autoReset: first from config.options, then from params.options (backward compatibility)
        this.autoReset =
            (_f = (_d = (_c = params.config.options) === null || _c === void 0 ? void 0 : _c.autoReset) !== null && _d !== void 0 ? _d : (_e = params.options) === null || _e === void 0 ? void 0 : _e.autoReset) !== null && _f !== void 0 ? _f : false;
        // Install plugins
        const plugins = (_h = (_g = params.config.options) === null || _g === void 0 ? void 0 : _g.plugins) !== null && _h !== void 0 ? _h : [];
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
    destroy() {
        for (const cleanup of this._pluginCleanups) {
            try {
                cleanup();
            }
            catch { /* ignore */ }
        }
        this._pluginCleanups = [];
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Pause / Resume
    // ─────────────────────────────────────────────────────────────────────────
    /** Pause the pipeline after the current stage finishes */
    pause() {
        this._pauseController.pause();
    }
    /** Resume pipeline execution */
    resume() {
        this._pauseController.resume();
    }
    /** Check whether the pipeline is paused */
    isPaused() {
        return this._pauseController.isPaused;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Subscriptions
    // ─────────────────────────────────────────────────────────────────────────
    subscribeStageResults(listener) {
        this.stageResultsListeners.push(listener);
        listener({ ...this.stageResults });
        return () => {
            this.stageResultsListeners = this.stageResultsListeners.filter((l) => l !== listener);
        };
    }
    on(event, handler) {
        if (!this.eventHandlers[event])
            this.eventHandlers[event] = [];
        this.eventHandlers[event].push(handler);
        return () => {
            this.eventHandlers[event] = this.eventHandlers[event].filter((h) => h !== handler);
        };
    }
    onStepStart(handler) {
        this.onStepStartHandlers.push(handler);
        return () => {
            this.onStepStartHandlers = this.onStepStartHandlers.filter((h) => h !== handler);
        };
    }
    onStepFinish(handler) {
        this.onStepFinishHandlers.push(handler);
        return () => {
            this.onStepFinishHandlers = this.onStepFinishHandlers.filter((h) => h !== handler);
        };
    }
    onStepError(handler) {
        this.onStepErrorHandlers.push(handler);
        return () => {
            this.onStepErrorHandlers = this.onStepErrorHandlers.filter((h) => h !== handler);
        };
    }
    subscribeProgress(listener) {
        return this.progress.subscribe(listener);
    }
    subscribeStepProgress(stepKey, listener) {
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
    getStageResults() {
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
    exportState() {
        return (0, state_persistence_js_1.exportPipelineState)(this.stageResults, this.logs);
    }
    /** Restore pipeline state from a previously saved snapshot */
    importState(state) {
        const parsed = (0, state_persistence_js_1.parseImportedPipelineState)(state);
        this.stageResults = parsed.stageResults;
        this.logs = parsed.logs;
        this.notifyStageResults();
        for (const { index, status } of (0, state_persistence_js_1.computeProgressUpdatesFromStageResults)(this.config.stages, this.stageResults)) {
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
        if (this._pauseController.isPaused)
            this.resume();
    }
    isAborted() {
        var _a, _b;
        return (_b = (_a = this.abortController) === null || _a === void 0 ? void 0 : _a.signal.aborted) !== null && _b !== void 0 ? _b : false;
    }
    /** Identifier of the current/last run (run() or rerunStep()). Empty string if nothing has run yet. */
    getRunId() {
        return this._runId;
    }
    _generateRunId() {
        var _a;
        const g = globalThis;
        if ((_a = g.crypto) === null || _a === void 0 ? void 0 : _a.randomUUID)
            return g.crypto.randomUUID();
        return `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Emit helpers
    // ─────────────────────────────────────────────────────────────────────────
    async emit(event, ...args) {
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
    addLog(type, message, data) {
        var _a;
        this.logs.push({ type, message, data, timestamp: new Date(), runId: this._runId });
        const maxLogs = (_a = this.config.options) === null || _a === void 0 ? void 0 : _a.maxLogs;
        if (maxLogs !== undefined && this.logs.length > maxLogs) {
            this.logs.splice(0, this.logs.length - maxLogs);
        }
    }
    async emitStepStart(event) {
        const e = { ...event, runId: this._runId };
        for (const handler of this.onStepStartHandlers)
            await handler(e);
        await this.emit(`step:${e.stepKey}:start`, e);
        this.addLog("log", `step:${e.stepKey}:start`, e);
        await this.emit("log", { type: "step:start", ...e });
    }
    async emitStepFinish(event) {
        const e = { ...event, runId: this._runId };
        for (const handler of this.onStepFinishHandlers)
            await handler(e);
        await this.emit(`step:${e.stepKey}:success`, e);
        this.addLog("log", `step:${e.stepKey}:success`, e);
        await this.emit("log", { type: "step:success", ...e });
    }
    async emitStepError(event) {
        const e = { ...event, runId: this._runId };
        for (const handler of this.onStepErrorHandlers)
            await handler(e);
        await this.emit(`step:${e.stepKey}:error`, e);
        this.addLog("error", `step:${e.stepKey}:error`, e);
        await this.emit("log", { type: "step:error", ...e });
    }
    async emitStepSkipped(event) {
        const e = { ...event, runId: this._runId };
        await this.emit(`step:${e.stepKey}:skipped`, e);
        this.addLog("log", `step:${e.stepKey}:skipped`, e);
        await this.emit("log", { type: "step:skipped", ...e });
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Core: execution of a single stage
    // ─────────────────────────────────────────────────────────────────────────
    /** Get the data of the previous (per config) regular stage */
    _getPrevData(stepIndex) {
        var _a;
        const prevItems = this.config.stages
            .slice(0, stepIndex)
            .filter((s) => !(0, stage_guards_js_1.isParallelGroup)(s) &&
            !(0, stage_guards_js_1.isSubPipeline)(s) &&
            !(0, stage_guards_js_1.isStreamStage)(s) &&
            !(0, stage_guards_js_1.isWebSocketStage)(s));
        const prevStage = prevItems[prevItems.length - 1];
        return prevStage ? (_a = this.stageResults[prevStage.key]) === null || _a === void 0 ? void 0 : _a.data : undefined;
    }
    /**
     * Execute a single pipeline stage.
     * The single implementation point for stage logic — used by both run() and rerunStep().
     */
    async executeStage(stepIndex, stage, signal, onStepPause) {
        var _a;
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
                const skippedResult = { status: "skipped" };
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
            if (typeof ((_a = this.config.middleware) === null || _a === void 0 ? void 0 : _a.beforeEach) === "function") {
                await this.config.middleware.beforeEach({
                    stage,
                    index: stepIndex,
                    sharedData: this.sharedData,
                });
            }
            // ── pauseBefore ───────────────────────────────────────────────────
            if (typeof stage.pauseBefore === "number" && stage.pauseBefore > 0) {
                await new Promise((resolve) => setTimeout(resolve, stage.pauseBefore));
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
                if (beforeResult !== undefined)
                    prevInput = beforeResult;
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
            let stepResult;
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
            }
            else if (stage.key) {
                // No request function — use stage.key as the URL endpoint
                const res = await this.executor.execute(stage.key, undefined, stage.retryCount, stage.timeoutMs, signal);
                stepResult = res.data;
            }
            else {
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
                await new Promise((resolve) => setTimeout(resolve, stage.pauseAfter));
            }
            // ── onStepPause callback ──────────────────────────────────────────
            if (onStepPause) {
                stepResult = await onStepPause(stepIndex, stepResult, this.stageResults);
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
        }
        catch (err) {
            // ── Error handling ─────────────────────────────────────────────
            if (typeof stage.errorHandler === "function") {
                const handled = stage.errorHandler({
                    error: err,
                    key: stage.key,
                    sharedData: this.sharedData,
                    signal,
                });
                if ((0, types_js_1.isStepRecovery)(handled)) {
                    // errorHandler recovered the stage — proceed as if it succeeded
                    return await this._commitStepSuccess(stepIndex, stage, handled.data, stepStartTs);
                }
                return await this._commitStepError(stepIndex, stage, (0, rest_client_js_1.toApiError)(handled !== null && handled !== void 0 ? handled : err), stepStartTs);
            }
            return await this._commitStepError(stepIndex, stage, this.errorHandler.handle(err, stage.key), stepStartTs);
        }
    }
    /** Commit a successful stage result: record it in stageResults, metrics, persist, middleware, events. */
    async _commitStepSuccess(stepIndex, stage, stepResult, stepStartTs) {
        var _a, _b, _c, _d;
        const key = stage.key;
        const successResult = {
            status: "success",
            data: stepResult,
        };
        this.stageResults[key] = successResult;
        this.notifyStageResults();
        this.progress.updateStage(stepIndex, "success");
        await this.emit(`step:${key}:progress`, "success");
        (_b = (_a = this.config.metrics) === null || _a === void 0 ? void 0 : _a.onStepDuration) === null || _b === void 0 ? void 0 : _b.call(_a, {
            stepKey: key,
            durationMs: Date.now() - stepStartTs,
            status: "success",
            runId: this._runId,
        });
        const persistAdapter = (_c = this.config.options) === null || _c === void 0 ? void 0 : _c.persistAdapter;
        if (persistAdapter) {
            try {
                await persistAdapter.save(this.exportState());
            }
            catch { /* don't abort the pipeline due to a persist error */ }
        }
        if (typeof ((_d = this.config.middleware) === null || _d === void 0 ? void 0 : _d.afterEach) === "function") {
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
    async _commitStepError(stepIndex, stage, apiError, stepStartTs) {
        var _a, _b, _c;
        const key = stage.key;
        const errorResult = {
            status: "error",
            error: apiError,
        };
        this.stageResults[key] = errorResult;
        this.notifyStageResults();
        this.progress.updateStage(stepIndex, "error");
        await this.emit(`step:${key}:progress`, "error");
        (_b = (_a = this.config.metrics) === null || _a === void 0 ? void 0 : _a.onStepDuration) === null || _b === void 0 ? void 0 : _b.call(_a, {
            stepKey: key,
            durationMs: Date.now() - stepStartTs,
            status: "error",
            runId: this._runId,
        });
        if (typeof ((_c = this.config.middleware) === null || _c === void 0 ? void 0 : _c.onError) === "function") {
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
    executeStreamStage(stepIndex, item, signal) {
        return (0, stream_stage_js_1.executeStreamStage)(this, stepIndex, item, signal);
    }
    executeWebSocketStage(stepIndex, item, signal) {
        return (0, websocket_stage_js_1.executeWebSocketStage)(this, stepIndex, item, signal);
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Core: execution of a nested pipeline (SubPipelineStage)
    // ─────────────────────────────────────────────────────────────────────────
    executeSubPipeline(stepIndex, item, signal) {
        var _a, _b;
        const globalContinueOnError = (_b = (_a = this.config.options) === null || _a === void 0 ? void 0 : _a.continueOnError) !== null && _b !== void 0 ? _b : false;
        return (0, sub_pipeline_js_1.executeSubPipeline)(this, stepIndex, item, signal, globalContinueOnError);
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Helper method: find a stage by key, returning its index
    // ─────────────────────────────────────────────────────────────────────────
    findStageByKey(key) {
        for (let i = 0; i < this.config.stages.length; i++) {
            const item = this.config.stages[i];
            if ((0, stage_guards_js_1.isParallelGroup)(item)) {
                const found = item.parallel.find((s) => s.key === key);
                if (found)
                    return { stage: found, index: i };
            }
            else if (!(0, stage_guards_js_1.isSubPipeline)(item)) {
                const stage = item;
                if (stage.key === key)
                    return { stage, index: i };
            }
        }
        return undefined;
    }
    /**
     * Run a worker for each item in items with a concurrency limit.
     * Without a limit (undefined/0/>= items.length) it behaves like Promise.all — all items start at once.
     * Results are returned in the original order of items regardless of completion order.
     */
    async _runPooled(items, limit, worker) {
        if (!limit || limit >= items.length) {
            return Promise.all(items.map((item, index) => worker(item, index)));
        }
        const results = new Array(items.length);
        let nextIndex = 0;
        const runNext = async () => {
            const index = nextIndex++;
            if (index >= items.length)
                return;
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
    async _runOnce(onStepPause, signal, startFromIndex = 0) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const globalContinueOnError = (_b = (_a = this.config.options) === null || _a === void 0 ? void 0 : _a.continueOnError) !== null && _b !== void 0 ? _b : false;
        const maxSteps = (_d = (_c = this.config.options) === null || _c === void 0 ? void 0 : _c.maxSteps) !== null && _d !== void 0 ? _d : this.config.stages.length * 10;
        let success = true;
        let stepCount = 0;
        // Use an index variable to support DAG transitions (next)
        let i = startFromIndex;
        while (i < this.config.stages.length) {
            // Guard against infinite loops from DAG transitions
            stepCount++;
            if (stepCount > maxSteps) {
                const loopError = (0, rest_client_js_1.toApiError)(new Error(`Pipeline exceeded maxSteps (${maxSteps}). Possible infinite loop in 'next' transitions.`));
                this.addLog("error", "pipeline:maxSteps:exceeded", { maxSteps });
                await this.emit("log", { type: "pipeline:error", error: loopError });
                return { stageResults: { ...this.stageResults }, success: false };
            }
            if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
                success = false;
                this.markRemainingAborted(i, signal);
                break;
            }
            const item = this.config.stages[i];
            // ── StreamStage ───────────────────────────────────────────────────
            if ((0, stage_guards_js_1.isStreamStage)(item)) {
                const streamItem = item;
                const shouldContinue = (_e = streamItem.continueOnError) !== null && _e !== void 0 ? _e : globalContinueOnError;
                const result = await this.executeStreamStage(i, streamItem, signal);
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
            if ((0, stage_guards_js_1.isWebSocketStage)(item)) {
                const wsItem = item;
                const shouldContinue = (_f = wsItem.continueOnError) !== null && _f !== void 0 ? _f : globalContinueOnError;
                const result = await this.executeWebSocketStage(i, wsItem, signal);
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
            if ((0, stage_guards_js_1.isSubPipeline)(item)) {
                const subItem = item;
                const shouldContinue = (_g = subItem.continueOnError) !== null && _g !== void 0 ? _g : globalContinueOnError;
                try {
                    const result = await this.executeSubPipeline(i, subItem, signal);
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
                catch (err) {
                    // Error from the sub-pipeline (rethrown from executeSubPipeline)
                    const apiError = (0, rest_client_js_1.toApiError)(err);
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
            if ((0, stage_guards_js_1.isParallelGroup)(item)) {
                const group = item;
                this.progress.updateStage(i, "loading");
                const parallelResults = await this._runPooled(group.parallel, group.concurrency, (stage) => this.executeStage(i, stage, signal, onStepPause));
                const anyFailed = parallelResults.some((r) => r.status === "error");
                this.progress.updateStage(i, anyFailed ? "error" : "success");
                if (anyFailed) {
                    const shouldContinue = (_h = group.continueOnError) !== null && _h !== void 0 ? _h : globalContinueOnError;
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
            const stage = item;
            const result = await this.executeStage(i, stage, signal, onStepPause);
            if (result.status === "error") {
                const shouldContinue = (_j = stage.continueOnError) !== null && _j !== void 0 ? _j : globalContinueOnError;
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
                    }
                    else {
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
    async run(onStepPause, externalSignal) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
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
        const retryOpts = (_a = this.config.options) === null || _a === void 0 ? void 0 : _a.pipelineRetry;
        const maxAttempts = (_b = retryOpts === null || retryOpts === void 0 ? void 0 : retryOpts.attempts) !== null && _b !== void 0 ? _b : 0;
        let attempt = 0;
        let lastResult = { stageResults: {}, success: false };
        const pipelineStartTs = Date.now();
        // ── Persist adapter: load the saved state ─────────────
        const persistAdapter = (_c = this.config.options) === null || _c === void 0 ? void 0 : _c.persistAdapter;
        if (persistAdapter) {
            try {
                const saved = await persistAdapter.load();
                if (saved)
                    this.importState(saved);
            }
            catch { /* don't abort the pipeline due to a persist error */ }
        }
        // ── Metrics: pipeline start ───────────────────────────────────────
        (_e = (_d = this.config.metrics) === null || _d === void 0 ? void 0 : _d.onPipelineStart) === null || _e === void 0 ? void 0 : _e.call(_d, { timestamp: pipelineStartTs, runId: this._runId });
        // ── Timeout for the whole pipeline ─────────────────────────────────────────
        let pipelineTimeoutId;
        if ((_f = this.config.options) === null || _f === void 0 ? void 0 : _f.pipelineTimeoutMs) {
            pipelineTimeoutId = setTimeout(() => {
                this.abort();
            }, this.config.options.pipelineTimeoutMs);
        }
        try {
            do {
                if (attempt > 0) {
                    if (retryOpts === null || retryOpts === void 0 ? void 0 : retryOpts.delayMs)
                        await sleep(retryOpts.delayMs);
                    const retryFrom = (_g = retryOpts === null || retryOpts === void 0 ? void 0 : retryOpts.retryFrom) !== null && _g !== void 0 ? _g : "start";
                    const startIndex = retryFrom === "failed-step" && this._lastFailedIndex >= 0
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
                }
                else {
                    lastResult = await this._runOnce(onStepPause, signal);
                }
                attempt++;
            } while (!lastResult.success &&
                attempt <= maxAttempts &&
                !signal.aborted);
        }
        finally {
            if (pipelineTimeoutId !== undefined)
                clearTimeout(pipelineTimeoutId);
        }
        // ── Metrics: pipeline end ───────────────────────────────────────
        (_j = (_h = this.config.metrics) === null || _h === void 0 ? void 0 : _h.onPipelineEnd) === null || _j === void 0 ? void 0 : _j.call(_h, {
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
    async rerunStep(stepKey, options) {
        var _a;
        // Search for the stage, including inside parallel groups
        let stage;
        let stepIndex = -1;
        for (let i = 0; i < this.config.stages.length; i++) {
            const item = this.config.stages[i];
            if ((0, stage_guards_js_1.isParallelGroup)(item)) {
                const found = item.parallel.find((s) => s.key === stepKey);
                if (found) {
                    stage = found;
                    stepIndex = i;
                    break;
                }
            }
            else if (!(0, stage_guards_js_1.isSubPipeline)(item) &&
                item.key === stepKey) {
                stage = item;
                stepIndex = i;
                break;
            }
        }
        if (!stage || stepIndex === -1)
            return undefined;
        // rerunStep — an independent execution, separate from the current run(); gets its own runId.
        this._runId = this._generateRunId();
        this.addLog("log", `rerunStep:${stepKey}:start`, { stepIndex });
        await this.emit("log", { type: "rerunStep:start", stepKey, stepIndex });
        const signal = (_a = options === null || options === void 0 ? void 0 : options.externalSignal) !== null && _a !== void 0 ? _a : new AbortController().signal;
        const result = await this.executeStage(stepIndex, stage, signal, options === null || options === void 0 ? void 0 : options.onStepPause);
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
    mergeSignals(a, b) {
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (a.aborted || b.aborted) {
            controller.abort();
        }
        else {
            a.addEventListener("abort", abort, { once: true });
            b.addEventListener("abort", abort, { once: true });
        }
        return controller.signal;
    }
    markRemainingAborted(fromIndex, _signal) {
        const apiError = (0, rest_client_js_1.toApiError)({
            message: "Pipeline aborted",
            code: "ABORTED",
        });
        for (let i = fromIndex; i < this.config.stages.length; i++) {
            const item = this.config.stages[i];
            let keys;
            if ((0, stage_guards_js_1.isParallelGroup)(item)) {
                keys = item.parallel.map((s) => s.key);
            }
            else if ((0, stage_guards_js_1.isSubPipeline)(item)) {
                keys = [item.key];
            }
            else if ((0, stage_guards_js_1.isStreamStage)(item)) {
                keys = [item.key];
            }
            else {
                keys = [item.key];
            }
            for (const key of keys) {
                if (!this.stageResults[key] ||
                    this.stageResults[key].status === "pending") {
                    this.stageResults[key] = { status: "error", error: apiError };
                }
            }
            this.progress.updateStage(i, "error");
        }
        this.notifyStageResults();
    }
}
exports.PipelineOrchestrator = PipelineOrchestrator;
