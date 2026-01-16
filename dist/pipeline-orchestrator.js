import { ErrorHandler } from "./error-handler";
import { ProgressTracker } from "./progress-tracker";
import { RequestExecutor } from "./request-executor";
import { toApiError } from "./rest-client";
export class PipelineOrchestrator {
    constructor(params) {
        var _a, _b, _c, _d;
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
        this.config = params.config;
        this.progress = new ProgressTracker(params.config.stages.length);
        this.errorHandler = new ErrorHandler();
        this.executor = new RequestExecutor((_a = params.httpConfig) !== null && _a !== void 0 ? _a : {});
        this.sharedData = (_b = params.sharedData) !== null && _b !== void 0 ? _b : {};
        this.autoReset = (_d = (_c = params.options) === null || _c === void 0 ? void 0 : _c.autoReset) !== null && _d !== void 0 ? _d : false;
    }
    /**
     * Подписка на изменения stageResults (реактивно)
     */
    subscribeStageResults(listener) {
        this.stageResultsListeners.push(listener);
        // Немедленно уведомляем нового подписчика о текущем состоянии
        listener({ ...this.stageResults });
        return () => {
            this.stageResultsListeners = this.stageResultsListeners.filter((l) => l !== listener);
        };
    }
    /**
     * Универсальная подписка на события: step:<key>, progress, log и др.
     */
    on(event, handler) {
        if (!this.eventHandlers[event])
            this.eventHandlers[event] = [];
        this.eventHandlers[event].push(handler);
        return () => {
            this.eventHandlers[event] = this.eventHandlers[event].filter((h) => h !== handler);
        };
    }
    /**
     * Вызов всех обработчиков события
     */
    async emit(event, ...args) {
        if (this.eventHandlers[event]) {
            for (const handler of this.eventHandlers[event]) {
                await handler(...args);
            }
        }
    }
    /**
     * Получить логи пайплайна
     */
    getLogs() {
        return [...this.logs];
    }
    notifyStageResults() {
        for (const listener of this.stageResultsListeners) {
            listener({ ...this.stageResults });
        }
    }
    /**
     * Повторно выполнить только один шаг пайплайна (без полного рестарта)
     * @param stepKey ключ шага
     * @param options дополнительные опции (например, onStepPause, externalSignal)
     */
    async rerunStep(stepKey, options) {
        var _a, _b;
        const i = this.config.stages.findIndex((s) => s.key === stepKey);
        if (i === -1)
            return undefined;
        const stage = this.config.stages[i];
        const key = stage.key;
        const signal = options === null || options === void 0 ? void 0 : options.externalSignal;
        this.logs.push({
            type: "log",
            message: `rerunStep:${key}:start`,
            timestamp: new Date(),
            data: { stepIndex: i },
        });
        await this.emit("log", {
            type: "rerunStep:start",
            stepKey: key,
            stepIndex: i,
        });
        // Получаем url для шага, аналогично run
        let stepUrl = undefined;
        if (typeof stage.request === "string") {
            stepUrl = stage.request;
        }
        else if (typeof stage.request === "function") {
            try {
                const reqResult = await stage.request({
                    prev: i > 0
                        ? (_a = this.stageResults[this.config.stages[i - 1].key]) === null || _a === void 0 ? void 0 : _a.data
                        : undefined,
                    allResults: this.stageResults,
                    sharedData: this.sharedData,
                });
                if (typeof reqResult === "string") {
                    stepUrl = reqResult;
                }
            }
            catch {
                // ignore errors here, url не обязателен
            }
        }
        else {
            stepUrl = key;
        }
        this.stageResults[key] = { status: "pending", url: stepUrl };
        this.notifyStageResults();
        this.progress.updateStage(i, "loading");
        await this.emitStepStart({
            stepIndex: i,
            stepKey: key,
            status: "loading",
            stageResults: { ...this.stageResults },
        });
        await this.emit(`step:${key}:start`, {
            stepIndex: i,
            stepKey: key,
            status: "loading",
            stageResults: { ...this.stageResults },
        });
        try {
            let stepResult;
            if (typeof stage.request === "function") {
                stepResult = await stage.request({
                    prev: i > 0
                        ? (_b = this.stageResults[this.config.stages[i - 1].key]) === null || _b === void 0 ? void 0 : _b.data
                        : undefined,
                    allResults: this.stageResults,
                    sharedData: this.sharedData,
                });
            }
            else {
                const res = await this.executor.execute(stage.key, undefined, stage.retryCount, stage.timeoutMs);
                stepResult = res.data;
            }
            if (options === null || options === void 0 ? void 0 : options.onStepPause) {
                stepResult = await options.onStepPause(i, stepResult, this.stageResults);
            }
            this.stageResults[key] = {
                status: "success",
                url: stepUrl,
                data: stepResult,
            };
            this.notifyStageResults();
            this.progress.updateStage(i, "success");
            await this.emitStepFinish({
                stepIndex: i,
                stepKey: key,
                status: "success",
                data: stepResult,
                stageResults: { ...this.stageResults },
            });
            await this.emit(`step:${key}:success`, {
                stepIndex: i,
                stepKey: key,
                status: "success",
                data: stepResult,
                stageResults: { ...this.stageResults },
            });
            this.logs.push({
                type: "log",
                message: `rerunStep:${key}:success`,
                timestamp: new Date(),
                data: { stepIndex: i, data: stepResult },
            });
            await this.emit("log", {
                type: "rerunStep:success",
                stepKey: key,
                stepIndex: i,
                data: stepResult,
            });
            return this.stageResults[key];
        }
        catch (err) {
            let handled;
            if (stage && typeof stage.errorHandler === "function") {
                handled = stage.errorHandler({
                    error: err,
                    key: stage.key,
                    sharedData: this.sharedData,
                });
            }
            else if (stage) {
                handled = this.errorHandler.handle(err, stage.key);
            }
            else {
                handled = this.errorHandler.handle(err, "unknown");
            }
            if (!handled && stage) {
                handled = this.errorHandler.handle(err, stage.key);
            }
            const apiError = toApiError(handled !== null && handled !== void 0 ? handled : err);
            this.stageResults[key] = {
                status: "error",
                url: stepUrl,
                error: apiError,
            };
            this.notifyStageResults();
            this.progress.updateStage(i, "error");
            await this.emitStepError({
                stepIndex: i,
                stepKey: key,
                status: "error",
                error: apiError,
                stageResults: { ...this.stageResults },
            });
            await this.emit(`step:${key}:error`, {
                stepIndex: i,
                stepKey: key,
                status: "error",
                error: apiError,
                stageResults: { ...this.stageResults },
            });
            this.logs.push({
                type: "error",
                message: `rerunStep:${key}:error`,
                timestamp: new Date(),
                data: { stepIndex: i, error: apiError },
            });
            await this.emit("log", {
                type: "rerunStep:error",
                stepKey: key,
                stepIndex: i,
                error: apiError,
            });
            return this.stageResults[key];
        }
    }
    /**
     * Отменить выполнение пайплайна (вызывает ошибку AbortError)
     */
    abort() {
        if (this.abortController) {
            this.abortController.abort();
        }
    }
    /**
     * Проверить, был ли пайплайн отменён
     */
    isAborted() {
        var _a, _b;
        return (_b = (_a = this.abortController) === null || _a === void 0 ? void 0 : _a.signal.aborted) !== null && _b !== void 0 ? _b : false;
    }
    /**
     * Подписка на событие начала шага
     */
    onStepStart(handler) {
        this.onStepStartHandlers.push(handler);
        return () => {
            this.onStepStartHandlers = this.onStepStartHandlers.filter((h) => h !== handler);
        };
    }
    /**
     * Подписка на событие успешного завершения шага
     */
    onStepFinish(handler) {
        this.onStepFinishHandlers.push(handler);
        return () => {
            this.onStepFinishHandlers = this.onStepFinishHandlers.filter((h) => h !== handler);
        };
    }
    /**
     * Подписка на событие ошибки шага
     */
    onStepError(handler) {
        this.onStepErrorHandlers.push(handler);
        return () => {
            this.onStepErrorHandlers = this.onStepErrorHandlers.filter((h) => h !== handler);
        };
    }
    async emitStepStart(event) {
        for (const handler of this.onStepStartHandlers) {
            await handler(event);
        }
        // Гибкая подписка на step:<key>:start
        await this.emit(`step:${event.stepKey}:start`, event);
        // Логирование
        this.logs.push({
            type: "log",
            message: `step:${event.stepKey}:start`,
            timestamp: new Date(),
            data: event,
        });
        await this.emit("log", { type: "step:start", ...event });
    }
    async emitStepFinish(event) {
        for (const handler of this.onStepFinishHandlers) {
            await handler(event);
        }
        await this.emit(`step:${event.stepKey}:success`, event);
        this.logs.push({
            type: "log",
            message: `step:${event.stepKey}:success`,
            timestamp: new Date(),
            data: event,
        });
        await this.emit("log", { type: "step:success", ...event });
    }
    async emitStepError(event) {
        for (const handler of this.onStepErrorHandlers) {
            await handler(event);
        }
        await this.emit(`step:${event.stepKey}:error`, event);
        this.logs.push({
            type: "error",
            message: `step:${event.stepKey}:error`,
            timestamp: new Date(),
            data: event,
        });
        await this.emit("log", { type: "step:error", ...event });
    }
    /**
     * Подписаться на изменения прогресса выполнения pipeline
     * @param listener функция-обработчик изменений
     * @returns функция для отписки
     */
    subscribeProgress(listener) {
        return this.progress.subscribe(listener);
    }
    /**
     * Подписка на прогресс с фильтрацией по этапу (stepKey) или общий
     */
    subscribeStepProgress(stepKey, listener) {
        return this.on(`step:${stepKey}:progress`, listener);
    }
    /**
     * Получить текущий прогресс выполнения pipeline (snapshot, не реактивный)
     */
    getProgress() {
        return this.progress.getProgress();
    }
    /**
     * Возвращает текущий снимок состояния прогресса (не реактивный).
     * Для отслеживания изменений используйте subscribeProgress.
     */
    getProgressRef() {
        return this.progress.getProgressRef();
    }
    /**
     * Запустить выполнение пайплайна
     * @param onStepPause callback для пользовательской паузы между шагами
     * @param externalSignal внешний AbortSignal (опционально)
     */
    async run(onStepPause, externalSignal) {
        var _a, _b, _c, _d, _e;
        if (this.autoReset) {
            this.stageResults = {};
            this.notifyStageResults();
        }
        let success = true;
        // Создаём новый AbortController для этого запуска
        this.abortController = new AbortController();
        const signal = externalSignal !== null && externalSignal !== void 0 ? externalSignal : this.abortController.signal;
        for (let i = 0; i < this.config.stages.length; i++) {
            if (signal.aborted) {
                // Прерываем выполнение, если был вызван abort
                const apiError = toApiError({
                    message: "Pipeline aborted",
                    code: "ABORTED",
                });
                const key = ((_a = this.config.stages[i]) === null || _a === void 0 ? void 0 : _a.key) || `stage${i}`;
                this.stageResults[key] = { status: "error", error: apiError };
                this.notifyStageResults();
                this.progress.updateStage(i, "error");
                this.logs.push({
                    type: "error",
                    message: `abort:${key}`,
                    timestamp: new Date(),
                    data: { stepIndex: i, error: apiError },
                });
                await this.emit("log", {
                    type: "abort",
                    stepKey: key,
                    stepIndex: i,
                    error: apiError,
                });
                await this.emitStepError({
                    stepIndex: i,
                    stepKey: key,
                    status: "error",
                    error: apiError,
                    stageResults: { ...this.stageResults },
                });
                success = false;
                break;
            }
            const stage = this.config.stages[i];
            const key = (stage === null || stage === void 0 ? void 0 : stage.key) || `stage${i}`;
            // Получаем url команды для шага
            let stepUrl = undefined;
            if (typeof stage.request === "string") {
                stepUrl = stage.request;
            }
            else if (typeof stage.request === "function") {
                try {
                    const reqResult = await stage.request({
                        prev: i > 0
                            ? (_b = this.stageResults[this.config.stages[i - 1].key]) === null || _b === void 0 ? void 0 : _b.data
                            : undefined,
                        allResults: this.stageResults,
                        sharedData: this.sharedData,
                    });
                    if (typeof reqResult === "string") {
                        stepUrl = reqResult;
                    }
                }
                catch {
                    // ignore errors here, url не обязателен
                }
            }
            else {
                stepUrl = key;
            }
            this.stageResults[key] = { status: "pending", url: stepUrl };
            this.notifyStageResults();
            this.progress.updateStage(i, "loading");
            // Гибкая подписка на прогресс шага
            await this.emit(`step:${key}:progress`, "loading");
            // emit step start
            await this.emitStepStart({
                stepIndex: i,
                stepKey: key,
                status: "loading",
                stageResults: { ...this.stageResults },
            });
            try {
                let stepResult;
                // --- pauseBeforeMs (пауза перед выполнением команды) ---
                if (typeof stage.pauseBefore === "number" && stage.pauseBefore > 0) {
                    await new Promise((resolve) => setTimeout(resolve, stage.pauseBefore));
                }
                // --- before (pre-processing) ---
                let prevInput = i > 0
                    ? (_c = this.stageResults[this.config.stages[i - 1].key]) === null || _c === void 0 ? void 0 : _c.data
                    : undefined;
                if (typeof stage.before === "function") {
                    const beforeResult = await stage.before({
                        prev: prevInput,
                        allResults: this.stageResults,
                        sharedData: this.sharedData,
                    });
                    if (typeof beforeResult !== "undefined") {
                        prevInput = beforeResult;
                    }
                }
                // --- request ---
                if (typeof stage.request === "function") {
                    const reqResult = await stage.request({
                        prev: prevInput,
                        allResults: this.stageResults,
                        sharedData: this.sharedData,
                    });
                    if (typeof reqResult === "string") {
                        const res = await this.executor.execute(reqResult, undefined, stage.retryCount, stage.timeoutMs);
                        stepResult = res.data;
                    }
                    else {
                        stepResult = reqResult;
                    }
                }
                else if (stage.key) {
                    const res = await this.executor.execute(stage.key, undefined, stage.retryCount, stage.timeoutMs);
                    stepResult = res.data;
                }
                else {
                    stepResult = undefined;
                }
                // --- after (post-processing) ---
                if (typeof stage.after === "function") {
                    stepResult = await stage.after({
                        result: stepResult,
                        allResults: this.stageResults,
                        sharedData: this.sharedData,
                    });
                }
                // --- pauseAfterMs (пауза после выполнения команды) ---
                if (typeof stage.pauseAfter === "number" && stage.pauseAfter > 0) {
                    await new Promise((resolve) => setTimeout(resolve, stage.pauseAfter));
                }
                // --- Пользовательская пауза/подтверждение/изменение результата ---
                if (onStepPause) {
                    stepResult = await onStepPause(i, stepResult, this.stageResults);
                }
                this.stageResults[key] = {
                    status: "success",
                    data: stepResult,
                    url: (_d = this.stageResults[key]) === null || _d === void 0 ? void 0 : _d.url,
                };
                this.notifyStageResults();
                this.progress.updateStage(i, "success");
                await this.emit(`step:${key}:progress`, "success");
                await this.emitStepFinish({
                    stepIndex: i,
                    stepKey: key,
                    status: "success",
                    data: stepResult,
                    stageResults: { ...this.stageResults },
                });
            }
            catch (err) {
                let handled;
                if (stage && typeof stage.errorHandler === "function") {
                    handled = stage.errorHandler({
                        error: err,
                        key: stage.key,
                        sharedData: this.sharedData,
                    });
                }
                else if (stage) {
                    handled = this.errorHandler.handle(err, stage.key);
                }
                else {
                    handled = this.errorHandler.handle(err, "unknown");
                }
                if (!handled && stage) {
                    handled = this.errorHandler.handle(err, stage.key);
                }
                const apiError = toApiError(handled !== null && handled !== void 0 ? handled : err);
                this.stageResults[key] = {
                    status: "error",
                    error: apiError,
                    url: (_e = this.stageResults[key]) === null || _e === void 0 ? void 0 : _e.url,
                };
                this.notifyStageResults();
                this.progress.updateStage(i, "error");
                await this.emit(`step:${key}:progress`, "error");
                await this.emitStepError({
                    stepIndex: i,
                    stepKey: key,
                    status: "error",
                    error: apiError,
                    stageResults: { ...this.stageResults },
                });
                success = false;
                break;
            }
        }
        return { stageResults: { ...this.stageResults }, success };
    }
    /**
     * Очистить stageResults и уведомить подписчиков
     */
    clearStageResults() {
        this.stageResults = {};
        this.notifyStageResults();
        // Корректно сбрасываем прогресс
        this.progress.reset();
    }
}
