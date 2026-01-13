
import { ErrorHandler } from './error-handler';
import { ProgressTracker } from './progress-tracker';
import { RequestExecutor } from './request-executor';

import type { PipelineConfig, PipelineResult } from './types';

/**
 * Событие шага pipeline (для хуков)
 */
export type PipelineStepEvent = {
  /** Индекс шага */
  stepIndex: number;
  /** Ключ шага */
  stepKey: string;
  /** Статус шага */
  status: import('./types').PipelineStepStatus;
  /** Данные результата (если успех) */
  data?: any;
  /** Ошибка (если error) */
  error?: import('./types').ApiError;
  /** Снимок всех результатов на момент события */
  stageResults: Record<string, import('./types').PipelineStepResult>;
};

/**
 * Callback для подписки на события этапов pipeline
 */
export type PipelineStepEventHandler = (event: PipelineStepEvent) => void | Promise<void>;

export class PipelineOrchestrator {
  private progress: ProgressTracker;
  private errorHandler: ErrorHandler;
  private executor: RequestExecutor;
  private sharedData: Record<string, unknown>;

  private onStepStartHandlers: PipelineStepEventHandler[] = [];
  private onStepFinishHandlers: PipelineStepEventHandler[] = [];
  private onStepErrorHandlers: PipelineStepEventHandler[] = [];

  /** Универсальные подписчики событий: ключ — имя события */
  private eventHandlers: Record<string, Array<(...args: any[]) => void | Promise<void>>> = {};

  /** Встроенные логи */
  private logs: Array<{ type: string; message: string; data?: any; timestamp: Date }> = [];

  private stageResults: Record<string, import('./types').PipelineStepResult> = {};
  private stageResultsListeners: Array<(results: Record<string, import('./types').PipelineStepResult>) => void> = [];
  private autoReset: boolean;
  /** AbortController для отмены пайплайна */
  private abortController: AbortController | null = null;

  private config: PipelineConfig;

  constructor(
    config: PipelineConfig,
    httpConfig: import('./types').HttpConfig,
    sharedData: Record<string, unknown> = {},
    options: { autoReset?: boolean } = {}
  ) {
    this.config = config;
    this.progress = new ProgressTracker(config.stages.length);
    this.errorHandler = new ErrorHandler();
    this.executor = new RequestExecutor(httpConfig);
    this.sharedData = sharedData;
    this.autoReset = options.autoReset ?? false;
  }

  /**
   * Подписка на изменения stageResults (реактивно)
   */
  subscribeStageResults(listener: (results: Record<string, import('./types').PipelineStepResult>) => void) {
    this.stageResultsListeners.push(listener);
    // Немедленно уведомляем нового подписчика о текущем состоянии
    listener({ ...this.stageResults });
    return () => {
      this.stageResultsListeners = this.stageResultsListeners.filter(l => l !== listener);
    };
  }

  /**
   * Универсальная подписка на события: step:<key>, progress, log и др.
   */
  on(event: string, handler: (...args: any[]) => void | Promise<void>) {
    if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
    this.eventHandlers[event].push(handler);
    return () => {
      this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
    };
  }

  /**
   * Вызов всех обработчиков события
   */
  private async emit(event: string, ...args: any[]) {
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

  private notifyStageResults() {
    for (const listener of this.stageResultsListeners) {
      listener({ ...this.stageResults });
    }
  }

  /**
   * Повторно выполнить только один шаг пайплайна (без полного рестарта)
   * @param stepKey ключ шага
   * @param options дополнительные опции (например, onStepPause, externalSignal)
   */
  async rerunStep(
    stepKey: string,
    options?: {
      onStepPause?: (
        stepIndex: number,
        stepResult: unknown,
        stageResults: Record<string, import('./types').PipelineStepResult>,
      ) => Promise<unknown> | unknown,
      externalSignal?: AbortSignal
    }
  ): Promise<import('./types').PipelineStepResult | undefined> {
    const i = this.config.stages.findIndex(s => s.key === stepKey);
    if (i === -1) return undefined;
    const stage = this.config.stages[i];
    const key = stage.key;
    const signal = options?.externalSignal;
    this.logs.push({ type: 'log', message: `rerunStep:${key}:start`, timestamp: new Date(), data: { stepIndex: i } });
    await this.emit('log', { type: 'rerunStep:start', stepKey: key, stepIndex: i });
    this.stageResults[key] = { status: 'pending' };
    this.notifyStageResults();
    this.progress.updateStage(i, 'loading');
    await this.emitStepStart({ stepIndex: i, stepKey: key, status: 'loading', stageResults: { ...this.stageResults } });
    await this.emit(`step:${key}:start`, { stepIndex: i, stepKey: key, status: 'loading', stageResults: { ...this.stageResults } });
    try {
      let stepResult: unknown;
      if (typeof stage.request === 'function') {
        stepResult = await stage.request(
          i > 0 ? this.stageResults[this.config.stages[i-1].key]?.data : undefined,
          this.stageResults
        );
      } else {
        const res = await this.executor.execute(
          stage.key,
          undefined,
          stage.retryCount,
          stage.timeoutMs,
        );
        stepResult = res.data;
      }
      if (options?.onStepPause) {
        stepResult = await options.onStepPause(i, stepResult, this.stageResults);
      }
      this.stageResults[key] = { status: 'success', data: stepResult };
      this.notifyStageResults();
      this.progress.updateStage(i, 'success');
      await this.emitStepFinish({ stepIndex: i, stepKey: key, status: 'success', data: stepResult, stageResults: { ...this.stageResults } });
      await this.emit(`step:${key}:success`, { stepIndex: i, stepKey: key, status: 'success', data: stepResult, stageResults: { ...this.stageResults } });
      this.logs.push({ type: 'log', message: `rerunStep:${key}:success`, timestamp: new Date(), data: { stepIndex: i, data: stepResult } });
      await this.emit('log', { type: 'rerunStep:success', stepKey: key, stepIndex: i, data: stepResult });
      return this.stageResults[key];
    } catch (err) {
      let handled;
      if (stage && typeof stage.errorHandler === 'function') {
        handled = stage.errorHandler(err, stage.key, this.sharedData);
      } else if (stage) {
        handled = this.errorHandler.handle(err, stage.key);
      } else {
        handled = this.errorHandler.handle(err, 'unknown');
      }
      if (!handled && stage) {
        handled = this.errorHandler.handle(err, stage.key);
      }
      const { toApiError } = await import('./rest-client.js');
      const apiError = toApiError(handled ?? err);
      this.stageResults[key] = { status: 'error', error: apiError };
      this.notifyStageResults();
      this.progress.updateStage(i, 'error');
      await this.emitStepError({ stepIndex: i, stepKey: key, status: 'error', error: apiError, stageResults: { ...this.stageResults } });
      await this.emit(`step:${key}:error`, { stepIndex: i, stepKey: key, status: 'error', error: apiError, stageResults: { ...this.stageResults } });
      this.logs.push({ type: 'error', message: `rerunStep:${key}:error`, timestamp: new Date(), data: { stepIndex: i, error: apiError } });
      await this.emit('log', { type: 'rerunStep:error', stepKey: key, stepIndex: i, error: apiError });
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
    return this.abortController?.signal.aborted ?? false;
  }

  /**
   * Подписка на событие начала шага
   */
  onStepStart(handler: PipelineStepEventHandler) {
    this.onStepStartHandlers.push(handler);
    return () => {
      this.onStepStartHandlers = this.onStepStartHandlers.filter(h => h !== handler);
    };
  }

  /**
   * Подписка на событие успешного завершения шага
   */
  onStepFinish(handler: PipelineStepEventHandler) {
    this.onStepFinishHandlers.push(handler);
    return () => {
      this.onStepFinishHandlers = this.onStepFinishHandlers.filter(h => h !== handler);
    };
  }

  /**
   * Подписка на событие ошибки шага
   */
  onStepError(handler: PipelineStepEventHandler) {
    this.onStepErrorHandlers.push(handler);
    return () => {
      this.onStepErrorHandlers = this.onStepErrorHandlers.filter(h => h !== handler);
    };
  }

  private async emitStepStart(event: PipelineStepEvent) {
    for (const handler of this.onStepStartHandlers) {
      await handler(event);
    }
    // Гибкая подписка на step:<key>:start
    await this.emit(`step:${event.stepKey}:start`, event);
    // Логирование
    this.logs.push({ type: 'log', message: `step:${event.stepKey}:start`, timestamp: new Date(), data: event });
    await this.emit('log', { type: 'step:start', ...event });
  }
  private async emitStepFinish(event: PipelineStepEvent) {
    for (const handler of this.onStepFinishHandlers) {
      await handler(event);
    }
    await this.emit(`step:${event.stepKey}:success`, event);
    this.logs.push({ type: 'log', message: `step:${event.stepKey}:success`, timestamp: new Date(), data: event });
    await this.emit('log', { type: 'step:success', ...event });
  }
  private async emitStepError(event: PipelineStepEvent) {
    for (const handler of this.onStepErrorHandlers) {
      await handler(event);
    }
    await this.emit(`step:${event.stepKey}:error`, event);
    this.logs.push({ type: 'error', message: `step:${event.stepKey}:error`, timestamp: new Date(), data: event });
    await this.emit('log', { type: 'step:error', ...event });
  }

  /**
   * Подписаться на изменения прогресса выполнения pipeline
   * @param listener функция-обработчик изменений
   * @returns функция для отписки
   */
  subscribeProgress(listener: (progress: import('./types').PipelineProgress) => void) {
    return this.progress.subscribe(listener);
  }

  /**
   * Подписка на прогресс с фильтрацией по этапу (stepKey) или общий
   */
  subscribeStepProgress(stepKey: string, listener: (status: import('./types').PipelineStepStatus) => void) {
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
  async run(
    onStepPause?: (
      stepIndex: number,
      stepResult: unknown,
      stageResults: Record<string, import('./types').PipelineStepResult>,
    ) => Promise<unknown> | unknown,
    externalSignal?: AbortSignal
  ): Promise<import('./types').PipelineResult> {
    if (this.autoReset) {
      this.stageResults = {};
      this.notifyStageResults();
    }
    let success = true;

    // Создаём новый AbortController для этого запуска
    this.abortController = new AbortController();
    const signal = externalSignal ?? this.abortController.signal;

    for (let i = 0; i < this.config.stages.length; i++) {
      if (signal.aborted) {
        // Прерываем выполнение, если был вызван abort
        const { toApiError } = await import('./rest-client.js');
        const apiError = toApiError({ message: 'Pipeline aborted', code: 'ABORTED' });
        const key = this.config.stages[i]?.key || `stage${i}`;
        this.stageResults[key] = { status: 'error', error: apiError };
        this.notifyStageResults();
        this.progress.updateStage(i, 'error');
        this.logs.push({ type: 'error', message: `abort:${key}`, timestamp: new Date(), data: { stepIndex: i, error: apiError } });
        await this.emit('log', { type: 'abort', stepKey: key, stepIndex: i, error: apiError });
        await this.emitStepError({
          stepIndex: i,
          stepKey: key,
          status: 'error',
          error: apiError,
          stageResults: { ...this.stageResults },
        });
        success = false;
        break;
      }
      const stage = this.config.stages[i];
      const key = stage?.key || `stage${i}`;
      this.stageResults[key] = { status: 'pending' };
      this.notifyStageResults();
      this.progress.updateStage(i, 'loading');

      // Гибкая подписка на прогресс шага
      await this.emit(`step:${key}:progress`, 'loading');

      // emit step start
      await this.emitStepStart({
        stepIndex: i,
        stepKey: key,
        status: 'loading',
        stageResults: { ...this.stageResults },
      });

      if (!stage) {
        this.progress.updateStage(i, 'skipped');
        this.stageResults[key] = { status: 'skipped' };
        this.notifyStageResults();
        await this.emit(`step:${key}:progress`, 'skipped');
        continue;
      }

      // Проверка условия выполнения этапа
      if (stage.condition && !stage.condition(
        i > 0 ? this.stageResults[this.config.stages[i-1].key]?.data : undefined,
        this.stageResults,
        this.sharedData)) {
        this.progress.updateStage(i, 'skipped');
        this.stageResults[key] = { status: 'skipped' };
        this.notifyStageResults();
        await this.emit(`step:${key}:progress`, 'skipped');
        continue;
      }
      try {
        let stepResult: unknown;
        // Всегда передаём (prev, allResults) в request — best practice для pipeline
        if (typeof stage.request === 'function') {
          stepResult = await stage.request(
            i > 0 ? this.stageResults[this.config.stages[i-1].key]?.data : undefined,
            this.stageResults
          );
        } else if (stage.key) {
          const res = await this.executor.execute(
            stage.key,
            undefined,
            stage.retryCount,
            stage.timeoutMs,
          );
          stepResult = res.data;
        } else {
          stepResult = undefined;
        }

        // --- Пользовательская пауза/подтверждение/изменение результата ---
        if (onStepPause) {
          stepResult = await onStepPause(i, stepResult, this.stageResults);
        }
        this.stageResults[key] = { status: 'success', data: stepResult };
        this.notifyStageResults();
        this.progress.updateStage(i, 'success');
        await this.emit(`step:${key}:progress`, 'success');

        // emit step finish
        await this.emitStepFinish({
          stepIndex: i,
          stepKey: key,
          status: 'success',
          data: stepResult,
          stageResults: { ...this.stageResults },
        });

      } catch (err) {
        let handled;
        if (stage && typeof stage.errorHandler === 'function') {
          handled = stage.errorHandler(err, stage.key, this.sharedData);
        } else if (stage) {
          handled = this.errorHandler.handle(err, stage.key);
        } else {
          handled = this.errorHandler.handle(err, 'unknown');
        }
        if (!handled && stage) {
          handled = this.errorHandler.handle(err, stage.key);
        }
        // Унификация: всегда ApiError
        const { toApiError } = await import('./rest-client.js');
        const apiError = toApiError(handled ?? err);
        this.stageResults[key] = { status: 'error', error: apiError };
        this.notifyStageResults();
        this.progress.updateStage(i, 'error');
        await this.emit(`step:${key}:progress`, 'error');
        // emit step error
        await this.emitStepError({
          stepIndex: i,
          stepKey: key,
          status: 'error',
          error: apiError,
          stageResults: { ...this.stageResults },
        });
        success = false;
        break;
      }
    }

    return { stageResults: { ...this.stageResults }, success };
  }
}
