"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineOrchestrator = void 0;
const error_handler_1 = require("./error-handler");
const progress_tracker_1 = require("./progress-tracker");
const request_executor_1 = require("./request-executor");
const rest_client_1 = require("./rest-client");
/** Проверка: является ли элемент группой параллельных шагов */
function isParallelGroup(item) {
    return typeof item === "object" && item !== null && "parallel" in item;
}
/** Проверка: является ли элемент вложенным pipeline */
function isSubPipeline(item) {
    return typeof item === "object" && item !== null && "subPipeline" in item;
}
/** Небольшой хелпер: sleep */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
class PipelineOrchestrator {
    constructor(params) {
        var _a, _b, _c, _d, _e, _f;
        this.onStepStartHandlers = [];
        this.onStepFinishHandlers = [];
        this.onStepErrorHandlers = [];
        /** Универсальные подписчики событий: ключ — имя события */
        this.eventHandlers = {};
        /** Встроенные логи */
        this.logs = [];
        this.stageResults = {};
        this.stageResultsListeners = [];
        /** AbortController для отмены пайплайна */
        this.abortController = null;
        /** Механизм pause/resume */
        this._paused = false;
        this._resumePromise = null;
        this._resumeResolve = null;
        /** Индекс последнего упавшего шага (для pipelineRetry с retryFrom: 'failed-step') */
        this._lastFailedIndex = -1;
        this.config = params.config;
        // Считаем общее кол-во шагов (параллельная группа = 1 элемент прогресса)
        this.progress = new progress_tracker_1.ProgressTracker(params.config.stages.length);
        this.errorHandler = new error_handler_1.ErrorHandler();
        this.executor = new request_executor_1.RequestExecutor((_a = params.httpConfig) !== null && _a !== void 0 ? _a : {});
        this.sharedData = (_b = params.sharedData) !== null && _b !== void 0 ? _b : {};
        // autoReset: сначала из config.options, потом из params.options (обратная совместимость)
        this.autoReset =
            (_f = (_d = (_c = params.config.options) === null || _c === void 0 ? void 0 : _c.autoReset) !== null && _d !== void 0 ? _d : (_e = params.options) === null || _e === void 0 ? void 0 : _e.autoReset) !== null && _f !== void 0 ? _f : false;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Pause / Resume
    // ─────────────────────────────────────────────────────────────────────────
    /** Приостановить pipeline после завершения текущего шага */
    pause() {
        if (!this._paused) {
            this._paused = true;
            this._resumePromise = new Promise((resolve) => {
                this._resumeResolve = resolve;
            });
        }
    }
    /** Возобновить выполнение pipeline */
    resume() {
        var _a;
        if (this._paused) {
            this._paused = false;
            (_a = this._resumeResolve) === null || _a === void 0 ? void 0 : _a.call(this);
            this._resumeResolve = null;
            this._resumePromise = null;
        }
    }
    /** Проверить, приостановлен ли pipeline */
    isPaused() {
        return this._paused;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Подписки
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
    // Геттеры состояния
    // ─────────────────────────────────────────────────────────────────────────
    getProgress() {
        return this.progress.getProgress();
    }
    /** Возвращает снимок прогресса. Для реактивности используйте subscribeProgress. */
    getProgressRef() {
        return this.progress.getProgressRef();
    }
    getLogs() {
        return [...this.logs];
    }
    /** Возвращает синхронный снимок результатов всех шагов. */
    getStageResults() {
        return { ...this.stageResults };
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Управление состоянием
    // ─────────────────────────────────────────────────────────────────────────
    clearStageResults() {
        this.stageResults = {};
        this.notifyStageResults();
        this.progress.reset();
    }
    /** Экспортировать снимок состояния pipeline (для сохранения и восстановления) */
    exportState() {
        return {
            stageResults: JSON.parse(JSON.stringify(this.stageResults)),
            logs: this.logs.map((l) => ({
                ...l,
                timestamp: l.timestamp.toISOString(),
            })),
        };
    }
    /** Восстановить состояние pipeline из ранее сохранённого снимка */
    importState(state) {
        var _a, _b;
        this.stageResults = JSON.parse(JSON.stringify(state.stageResults));
        this.logs = state.logs.map((l) => ({
            ...l,
            timestamp: new Date(l.timestamp),
        }));
        this.notifyStageResults();
        // Восстанавливаем прогресс из stageResults
        const stages = this.config.stages;
        for (let i = 0; i < stages.length; i++) {
            const item = stages[i];
            if (isParallelGroup(item)) {
                // Для параллельной группы берём первый статус из sub-шагов
                const subStatus = item.parallel
                    .map((s) => { var _a; return (_a = this.stageResults[s.key]) === null || _a === void 0 ? void 0 : _a.status; })
                    .find((s) => s !== undefined);
                if (subStatus)
                    this.progress.updateStage(i, subStatus);
            }
            else if (isSubPipeline(item)) {
                const status = (_a = this.stageResults[item.key]) === null || _a === void 0 ? void 0 : _a.status;
                if (status)
                    this.progress.updateStage(i, status);
            }
            else {
                const status = (_b = this.stageResults[item.key]) === null || _b === void 0 ? void 0 : _b.status;
                if (status)
                    this.progress.updateStage(i, status);
            }
        }
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Abort
    // ─────────────────────────────────────────────────────────────────────────
    abort() {
        if (this.abortController) {
            this.abortController.abort();
        }
        // Если pipeline был на паузе — разбудить его, чтобы он мог завершиться
        if (this._paused)
            this.resume();
    }
    isAborted() {
        var _a, _b;
        return (_b = (_a = this.abortController) === null || _a === void 0 ? void 0 : _a.signal.aborted) !== null && _b !== void 0 ? _b : false;
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
        this.logs.push({ type, message, data, timestamp: new Date() });
    }
    async emitStepStart(event) {
        for (const handler of this.onStepStartHandlers)
            await handler(event);
        await this.emit(`step:${event.stepKey}:start`, event);
        this.addLog("log", `step:${event.stepKey}:start`, event);
        await this.emit("log", { type: "step:start", ...event });
    }
    async emitStepFinish(event) {
        for (const handler of this.onStepFinishHandlers)
            await handler(event);
        await this.emit(`step:${event.stepKey}:success`, event);
        this.addLog("log", `step:${event.stepKey}:success`, event);
        await this.emit("log", { type: "step:success", ...event });
    }
    async emitStepError(event) {
        for (const handler of this.onStepErrorHandlers)
            await handler(event);
        await this.emit(`step:${event.stepKey}:error`, event);
        this.addLog("error", `step:${event.stepKey}:error`, event);
        await this.emit("log", { type: "step:error", ...event });
    }
    async emitStepSkipped(event) {
        await this.emit(`step:${event.stepKey}:skipped`, event);
        this.addLog("log", `step:${event.stepKey}:skipped`, event);
        await this.emit("log", { type: "step:skipped", ...event });
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Ядро: выполнение одного шага
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * Выполнить один шаг pipeline.
     * Единственная точка реализации логики шага — используется и в run(), и в rerunStep().
     */
    async executeStage(stepIndex, stage, signal, onStepPause) {
        var _a, _b, _c, _d;
        const key = stage.key;
        // Получаем prev из предыдущего шага (по порядку в конфиге)
        const prevStageIndex = this.config.stages
            .slice(0, stepIndex)
            .map((s) => (isParallelGroup(s) || isSubPipeline(s) ? null : s))
            .filter(Boolean);
        const prevStage = prevStageIndex[prevStageIndex.length - 1];
        const prevData = prevStage
            ? (_a = this.stageResults[prevStage.key]) === null || _a === void 0 ? void 0 : _a.data
            : undefined;
        // ── Проверка condition ──────────────────────────────────────────────────
        if (typeof stage.condition === "function") {
            const shouldRun = stage.condition({
                prev: prevData,
                allResults: this.stageResults,
                sharedData: this.sharedData,
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
        // ── Инициализация ────────────────────────────────────────────────────
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
            // ── Проверка abort перед выполнением ──────────────────────────────────
            if (signal.aborted) {
                throw new Error("Pipeline aborted");
            }
            // ── Global middleware: beforeEach ──────────────────────────────────
            if (typeof ((_b = this.config.middleware) === null || _b === void 0 ? void 0 : _b.beforeEach) === "function") {
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
            // ── Проверка abort после паузы ────────────────────────────────────────
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
                });
                if (beforeResult !== undefined)
                    prevInput = beforeResult;
            }
            // ── Проверка abort после before hook ───────────────────────────────────
            if (signal.aborted) {
                throw new Error("Pipeline aborted");
            }
            // ── request ────────────────────────────────────────────────────────
            let stepResult;
            if (typeof stage.request === "function") {
                // Для функций request нужно передать сигнал, чтобы они могли его учесть
                // Но текущий API не поддерживает signal. Добавляем проверку перед вызовом
                if (signal.aborted) {
                    throw new Error("Pipeline aborted");
                }
                stepResult = await stage.request({
                    prev: prevInput,
                    allResults: this.stageResults,
                    sharedData: this.sharedData,
                });
            }
            else if (stage.key) {
                // Нет функции request — используем stage.key как URL endpoint
                const res = await this.executor.execute(stage.key, undefined, stage.retryCount, stage.timeoutMs, signal);
                stepResult = res.data;
            }
            else {
                stepResult = undefined;
            }
            // ── Проверка abort после request ───────────────────────────────────────
            if (signal.aborted) {
                throw new Error("Pipeline aborted");
            }
            // ── after hook ────────────────────────────────────────────────────
            if (typeof stage.after === "function") {
                stepResult = await stage.after({
                    result: stepResult,
                    allResults: this.stageResults,
                    sharedData: this.sharedData,
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
            // ── Сохраняем результат ───────────────────────────────────────────
            const successResult = {
                status: "success",
                data: stepResult,
            };
            this.stageResults[key] = successResult;
            this.notifyStageResults();
            this.progress.updateStage(stepIndex, "success");
            await this.emit(`step:${key}:progress`, "success");
            // ── Global middleware: afterEach ───────────────────────────────────
            if (typeof ((_c = this.config.middleware) === null || _c === void 0 ? void 0 : _c.afterEach) === "function") {
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
            // ── pause/resume: проверяем ПОСЛЕ emit событий ────────────────────
            if (this._paused && this._resumePromise) {
                await this._resumePromise;
            }
            return successResult;
        }
        catch (err) {
            // ── Обработка ошибки ─────────────────────────────────────────────
            let apiError;
            if (typeof stage.errorHandler === "function") {
                const handled = stage.errorHandler({
                    error: err,
                    key: stage.key,
                    sharedData: this.sharedData,
                });
                apiError = (0, rest_client_1.toApiError)(handled !== null && handled !== void 0 ? handled : err);
            }
            else {
                apiError = this.errorHandler.handle(err, stage.key);
            }
            const errorResult = {
                status: "error",
                error: apiError,
            };
            this.stageResults[key] = errorResult;
            this.notifyStageResults();
            this.progress.updateStage(stepIndex, "error");
            await this.emit(`step:${key}:progress`, "error");
            // ── Global middleware: onError ─────────────────────────────────────
            if (typeof ((_d = this.config.middleware) === null || _d === void 0 ? void 0 : _d.onError) === "function") {
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
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Ядро: выполнение вложенного pipeline (SubPipelineStage)
    // ─────────────────────────────────────────────────────────────────────────
    async executeSubPipeline(stepIndex, item, signal) {
        var _a, _b, _c, _d;
        const key = item.key;
        const globalContinueOnError = (_b = (_a = this.config.options) === null || _a === void 0 ? void 0 : _a.continueOnError) !== null && _b !== void 0 ? _b : false;
        const shouldContinue = (_c = item.continueOnError) !== null && _c !== void 0 ? _c : globalContinueOnError;
        this.stageResults[key] = { status: "pending" };
        this.notifyStageResults();
        this.progress.updateStage(stepIndex, "loading");
        await this.emit(`step:${key}:progress`, "loading");
        this.addLog("log", `subPipeline:${key}:start`, { stepIndex });
        await this.emit("log", {
            type: "subPipeline:start",
            stepKey: key,
            stepIndex,
        });
        try {
            const subOrchestrator = new PipelineOrchestrator({
                config: item.subPipeline,
                httpConfig: item.httpConfig,
                sharedData: {
                    ...this.sharedData,
                    ...((_d = item.sharedData) !== null && _d !== void 0 ? _d : {}),
                },
            });
            const subResult = await subOrchestrator.run(undefined, signal);
            // Если sub-pipeline завершился с ошибкой И не должен продолжать - выбрасываем ошибку
            if (!subResult.success && !shouldContinue) {
                const error = new Error(`Sub-pipeline "${key}" failed`);
                error.subResult = subResult;
                throw error;
            }
            const resultStatus = subResult.success ? "success" : "error";
            const result = {
                status: resultStatus,
                data: subResult,
            };
            this.stageResults[key] = result;
            this.notifyStageResults();
            this.progress.updateStage(stepIndex, resultStatus);
            await this.emit(`step:${key}:progress`, resultStatus);
            if (subResult.success) {
                this.addLog("log", `subPipeline:${key}:success`, { stepIndex });
                await this.emit("log", {
                    type: "subPipeline:success",
                    stepKey: key,
                    stepIndex,
                });
            }
            else {
                this.addLog("error", `subPipeline:${key}:error`, {
                    stepIndex,
                    error: subResult,
                });
                await this.emit("log", {
                    type: "subPipeline:error",
                    stepKey: key,
                    stepIndex,
                    error: subResult,
                });
            }
            return result;
        }
        catch (err) {
            const apiError = this.errorHandler.handle(err, key);
            const errorResult = {
                status: "error",
                error: apiError,
            };
            this.stageResults[key] = errorResult;
            this.notifyStageResults();
            this.progress.updateStage(stepIndex, "error");
            await this.emit(`step:${key}:progress`, "error");
            this.addLog("error", `subPipeline:${key}:exception`, {
                stepIndex,
                error: apiError,
            });
            await this.emit("log", {
                type: "subPipeline:exception",
                stepKey: key,
                stepIndex,
                error: apiError,
            });
            throw err;
        }
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Вспомогательный метод: найти шаг по ключу с возвратом индекса
    // ─────────────────────────────────────────────────────────────────────────
    findStageByKey(key) {
        for (let i = 0; i < this.config.stages.length; i++) {
            const item = this.config.stages[i];
            if (isParallelGroup(item)) {
                const found = item.parallel.find((s) => s.key === key);
                if (found)
                    return { stage: found, index: i };
            }
            else if (!isSubPipeline(item)) {
                const stage = item;
                if (stage.key === key)
                    return { stage, index: i };
            }
        }
        return undefined;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // _runOnce() — одна попытка выполнения pipeline
    // ─────────────────────────────────────────────────────────────────────────
    async _runOnce(onStepPause, signal, startFromIndex = 0) {
        var _a, _b, _c, _d, _e, _f, _g;
        const globalContinueOnError = (_b = (_a = this.config.options) === null || _a === void 0 ? void 0 : _a.continueOnError) !== null && _b !== void 0 ? _b : false;
        const maxSteps = (_d = (_c = this.config.options) === null || _c === void 0 ? void 0 : _c.maxSteps) !== null && _d !== void 0 ? _d : this.config.stages.length * 10;
        let success = true;
        let stepCount = 0;
        // Используем индекс через переменную для поддержки DAG-переходов (next)
        let i = startFromIndex;
        while (i < this.config.stages.length) {
            // Защита от бесконечных циклов при DAG-переходах
            stepCount++;
            if (stepCount > maxSteps) {
                const loopError = (0, rest_client_1.toApiError)(new Error(`Pipeline exceeded maxSteps (${maxSteps}). Possible infinite loop in 'next' transitions.`));
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
            // ── SubPipeline ────────────────────────────────────────────────────
            if (isSubPipeline(item)) {
                const subItem = item;
                const shouldContinue = (_e = subItem.continueOnError) !== null && _e !== void 0 ? _e : globalContinueOnError;
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
                    // Ошибка из sub-pipeline (проброшена из executeSubPipeline)
                    const apiError = (0, rest_client_1.toApiError)(err);
                    // Логируем ошибку
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
                    // Важно: проверяем shouldContinue и либо останавливаем, либо продолжаем
                    if (!shouldContinue) {
                        success = false;
                        this._lastFailedIndex = i;
                        break;
                    }
                    // Если continueOnError = true, продолжаем выполнение
                    i++;
                    continue;
                }
            }
            // ── Параллельная группа ────────────────────────────────────────────
            if (isParallelGroup(item)) {
                const group = item;
                this.progress.updateStage(i, "loading");
                const parallelResults = await Promise.all(group.parallel.map((stage) => this.executeStage(i, stage, signal, onStepPause)));
                const anyFailed = parallelResults.some((r) => r.status === "error");
                this.progress.updateStage(i, anyFailed ? "error" : "success");
                if (anyFailed) {
                    const shouldContinue = (_f = group.continueOnError) !== null && _f !== void 0 ? _f : globalContinueOnError;
                    if (!shouldContinue) {
                        success = false;
                        this._lastFailedIndex = i;
                        break;
                    }
                }
                i++;
                continue;
            }
            // ── Обычный шаг ───────────────────────────────────────────────────
            const stage = item;
            const result = await this.executeStage(i, stage, signal, onStepPause);
            if (result.status === "error") {
                const shouldContinue = (_g = stage.continueOnError) !== null && _g !== void 0 ? _g : globalContinueOnError;
                if (!shouldContinue) {
                    success = false;
                    this._lastFailedIndex = i;
                    break;
                }
                i++;
                continue;
            }
            // ── DAG: проверяем next после успешного шага ──────────────────────
            if (typeof stage.next === "function") {
                const nextKey = stage.next({
                    result: result.data,
                    allResults: this.stageResults,
                    sharedData: this.sharedData,
                });
                if (nextKey !== null) {
                    const found = this.findStageByKey(nextKey);
                    if (found) {
                        // Перепрыгиваем к нужному индексу (i++ будет в следующей итерации через continue)
                        i = found.index;
                        continue;
                    }
                    else {
                        this.addLog("log", `pipeline:next:key_not_found`, {
                            stepKey: stage.key,
                            nextKey,
                        });
                        // Ключ не найден — завершаем pipeline успешно
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
        var _a, _b, _c, _d;
        if (this.autoReset) {
            this.stageResults = {};
            this.logs = [];
            this.notifyStageResults();
        }
        this._paused = false;
        this._resumePromise = null;
        this._resumeResolve = null;
        this._lastFailedIndex = -1;
        this.abortController = new AbortController();
        const signal = externalSignal
            ? this.mergeSignals(externalSignal, this.abortController.signal)
            : this.abortController.signal;
        const retryOpts = (_a = this.config.options) === null || _a === void 0 ? void 0 : _a.pipelineRetry;
        const maxAttempts = (_b = retryOpts === null || retryOpts === void 0 ? void 0 : retryOpts.attempts) !== null && _b !== void 0 ? _b : 0;
        let attempt = 0;
        let lastResult = { stageResults: {}, success: false };
        // ── Таймаут всего pipeline ─────────────────────────────────────────
        let pipelineTimeoutId;
        if ((_c = this.config.options) === null || _c === void 0 ? void 0 : _c.pipelineTimeoutMs) {
            pipelineTimeoutId = setTimeout(() => {
                this.abort();
            }, this.config.options.pipelineTimeoutMs);
        }
        try {
            do {
                if (attempt > 0) {
                    if (retryOpts === null || retryOpts === void 0 ? void 0 : retryOpts.delayMs)
                        await sleep(retryOpts.delayMs);
                    const retryFrom = (_d = retryOpts === null || retryOpts === void 0 ? void 0 : retryOpts.retryFrom) !== null && _d !== void 0 ? _d : "start";
                    const startIndex = retryFrom === "failed-step" && this._lastFailedIndex >= 0
                        ? this._lastFailedIndex
                        : 0;
                    if (startIndex === 0) {
                        // Полный сброс
                        this.stageResults = {};
                        this.notifyStageResults();
                        this.progress.reset();
                    }
                    this._lastFailedIndex = -1;
                    this._paused = false;
                    this._resumePromise = null;
                    this._resumeResolve = null;
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
        return lastResult;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // rerunStep()
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * Повторно выполнить только один шаг pipeline (без полного рестарта).
     * Полностью зеркалирует поведение run(): вызывает before/after/condition/middleware.
     */
    async rerunStep(stepKey, options) {
        var _a;
        // Ищем шаг в том числе внутри параллельных групп
        let stage;
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
            }
            else if (!isSubPipeline(item) &&
                item.key === stepKey) {
                stage = item;
                stepIndex = i;
                break;
            }
        }
        if (!stage || stepIndex === -1)
            return undefined;
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
        const apiError = (0, rest_client_1.toApiError)({
            message: "Pipeline aborted",
            code: "ABORTED",
        });
        for (let i = fromIndex; i < this.config.stages.length; i++) {
            const item = this.config.stages[i];
            let keys;
            if (isParallelGroup(item)) {
                keys = item.parallel.map((s) => s.key);
            }
            else if (isSubPipeline(item)) {
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
