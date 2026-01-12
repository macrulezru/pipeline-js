"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineOrchestrator = void 0;
const error_handler_1 = require("./error-handler");
const progress_tracker_1 = require("./progress-tracker");
const request_executor_1 = require("./request-executor");
// import { metricsBus } from '@/core/metrics/metrics-bus';
class PipelineOrchestrator {
    constructor(config, httpConfig, sharedData = {}) {
        this.config = config;
        this.progress = new progress_tracker_1.ProgressTracker(config.stages.length);
        this.errorHandler = new error_handler_1.ErrorHandler();
        this.executor = new request_executor_1.RequestExecutor(httpConfig);
        this.sharedData = sharedData;
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
     * Получить текущий прогресс выполнения pipeline (snapshot, не реактивный)
     */
    getProgress() {
        return this.progress.getProgress();
    }
    /**
     * @param onStepPause
     *   Необязательный callback, вызывается после каждого шага (до перехода к следующему).
     *   Позволяет приостановить выполнение, запросить подтверждение пользователя или изменить результат шага.
     *   Должен вернуть (optionally изменённый) результат шага или промис с ним.
     *   Если не передан — пайплайн работает как раньше.
     */
    async run(onStepPause) {
        const results = [];
        const errors = [];
        let success = true;
        for (let i = 0; i < this.config.stages.length; i++) {
            const stage = this.config.stages[i];
            this.progress.updateStage(i, 'in-progress');
            if (!stage) {
                this.progress.updateStage(i, 'skipped');
                results.push(undefined);
                continue;
            }
            // Проверка условия выполнения этапа
            if (stage.condition && !stage.condition(results[i - 1], results, this.sharedData)) {
                this.progress.updateStage(i, 'skipped');
                results.push(undefined);
                continue;
            }
            try {
                let stepResult;
                // Всегда передаём (prev, allResults) в request — best practice для pipeline
                if (typeof stage.request === 'function') {
                    stepResult = await stage.request(results[i - 1], results);
                }
                else if (stage.key) {
                    const res = await this.executor.execute(stage.key, undefined, stage.retryCount, stage.timeoutMs);
                    stepResult = res.data;
                }
                else {
                    stepResult = undefined;
                }
                // --- Пользовательская пауза/подтверждение/изменение результата ---
                if (onStepPause) {
                    stepResult = await onStepPause(i, stepResult, results);
                }
                results.push(stepResult);
                this.progress.updateStage(i, 'success');
                // ...existing code...
            }
            catch (err) {
                let handled;
                if (stage && typeof stage.errorHandler === 'function') {
                    handled = stage.errorHandler(err, stage.key, this.sharedData);
                }
                else if (stage) {
                    handled = this.errorHandler.handle(err, stage.key);
                }
                else {
                    handled = this.errorHandler.handle(err, 'unknown');
                }
                if (!handled && stage) {
                    handled = this.errorHandler.handle(err, stage.key);
                }
                errors.push(handled);
                this.progress.updateStage(i, 'error');
                success = false;
                break;
            }
        }
        return { results, errors, success };
    }
}
exports.PipelineOrchestrator = PipelineOrchestrator;
