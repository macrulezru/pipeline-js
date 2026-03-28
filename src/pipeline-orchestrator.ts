import { ErrorHandler } from './error-handler';
import { ProgressTracker } from './progress-tracker';
import { RequestExecutor } from './request-executor';
import { toApiError } from './rest-client';

import type {
  PipelineConfig,
  PipelineResult,
  PipelineStageConfig,
  PipelineStepResult,
  PipelineStepStatus,
  PipelineStepEvent,
  PipelineStepEventHandler,
  PipelineExportedState,
  ParallelStageGroup,
} from './types';

// Re-export так как types.ts теперь является единственным источником истины
export type { PipelineStepEvent, PipelineStepEventHandler };

/** Проверка: является ли элемент группой параллельных шагов */
function isParallelGroup(item: unknown): item is ParallelStageGroup {
  return typeof item === 'object' && item !== null && 'parallel' in item;
}

export class PipelineOrchestrator {
  private progress: ProgressTracker;
  private errorHandler: ErrorHandler;
  private executor: RequestExecutor;
  private sharedData: Record<string, unknown>;

  private onStepStartHandlers: PipelineStepEventHandler[] = [];
  private onStepFinishHandlers: PipelineStepEventHandler[] = [];
  private onStepErrorHandlers: PipelineStepEventHandler[] = [];

  /** Универсальные подписчики событий: ключ — имя события */
  private eventHandlers: Record<
    string,
    Array<(...args: any[]) => void | Promise<void>>
  > = {};

  /** Встроенные логи */
  private logs: Array<{
    type: string;
    message: string;
    data?: any;
    timestamp: Date;
  }> = [];

  private stageResults: Record<string, PipelineStepResult> = {};
  private stageResultsListeners: Array<
    (results: Record<string, PipelineStepResult>) => void
  > = [];

  private autoReset: boolean;

  /** AbortController для отмены пайплайна */
  private abortController: AbortController | null = null;

  /** Механизм pause/resume */
  private _paused = false;
  private _resumePromise: Promise<void> | null = null;
  private _resumeResolve: (() => void) | null = null;

  private config: PipelineConfig;

  constructor(params: {
    config: PipelineConfig;
    httpConfig?: import('./types').HttpConfig;
    sharedData?: Record<string, unknown>;
    options?: { autoReset?: boolean };
  }) {
    this.config = params.config;
    // Считаем общее кол-во шагов (параллельная группа = 1 элемент прогресса)
    this.progress = new ProgressTracker(params.config.stages.length);
    this.errorHandler = new ErrorHandler();
    this.executor = new RequestExecutor(params.httpConfig ?? {});
    this.sharedData = params.sharedData ?? {};
    this.autoReset = params.options?.autoReset ?? false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pause / Resume
  // ─────────────────────────────────────────────────────────────────────────

  /** Приостановить pipeline после завершения текущего шага */
  pause(): void {
    if (!this._paused) {
      this._paused = true;
      this._resumePromise = new Promise<void>((resolve) => {
        this._resumeResolve = resolve;
      });
    }
  }

  /** Возобновить выполнение pipeline */
  resume(): void {
    if (this._paused) {
      this._paused = false;
      this._resumeResolve?.();
      this._resumeResolve = null;
      this._resumePromise = null;
    }
  }

  /** Проверить, приостановлен ли pipeline */
  isPaused(): boolean {
    return this._paused;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Подписки
  // ─────────────────────────────────────────────────────────────────────────

  subscribeStageResults(
    listener: (results: Record<string, PipelineStepResult>) => void,
  ) {
    this.stageResultsListeners.push(listener);
    listener({ ...this.stageResults });
    return () => {
      this.stageResultsListeners = this.stageResultsListeners.filter(
        (l) => l !== listener,
      );
    };
  }

  on(event: string, handler: (...args: any[]) => void | Promise<void>) {
    if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
    this.eventHandlers[event].push(handler);
    return () => {
      this.eventHandlers[event] = this.eventHandlers[event].filter(
        (h) => h !== handler,
      );
    };
  }

  onStepStart(handler: PipelineStepEventHandler) {
    this.onStepStartHandlers.push(handler);
    return () => {
      this.onStepStartHandlers = this.onStepStartHandlers.filter(
        (h) => h !== handler,
      );
    };
  }

  onStepFinish(handler: PipelineStepEventHandler) {
    this.onStepFinishHandlers.push(handler);
    return () => {
      this.onStepFinishHandlers = this.onStepFinishHandlers.filter(
        (h) => h !== handler,
      );
    };
  }

  onStepError(handler: PipelineStepEventHandler) {
    this.onStepErrorHandlers.push(handler);
    return () => {
      this.onStepErrorHandlers = this.onStepErrorHandlers.filter(
        (h) => h !== handler,
      );
    };
  }

  subscribeProgress(
    listener: (progress: import('./types').PipelineProgress) => void,
  ) {
    return this.progress.subscribe(listener);
  }

  subscribeStepProgress(
    stepKey: string,
    listener: (status: PipelineStepStatus) => void,
  ) {
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

  // ─────────────────────────────────────────────────────────────────────────
  // Управление состоянием
  // ─────────────────────────────────────────────────────────────────────────

  clearStageResults() {
    this.stageResults = {};
    this.notifyStageResults();
    this.progress.reset();
  }

  /** Экспортировать снимок состояния pipeline (для сохранения и восстановления) */
  exportState(): PipelineExportedState {
    return {
      stageResults: JSON.parse(JSON.stringify(this.stageResults)),
      logs: this.logs.map((l) => ({
        ...l,
        timestamp: l.timestamp.toISOString(),
      })),
    };
  }

  /** Восстановить состояние pipeline из ранее сохранённого снимка */
  importState(state: PipelineExportedState): void {
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
          .map((s) => this.stageResults[s.key]?.status)
          .find((s) => s !== undefined);
        if (subStatus) this.progress.updateStage(i, subStatus);
      } else {
        const status = this.stageResults[(item as PipelineStageConfig).key]?.status;
        if (status) this.progress.updateStage(i, status);
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
    if (this._paused) this.resume();
  }

  isAborted() {
    return this.abortController?.signal.aborted ?? false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Emit helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async emit(event: string, ...args: any[]) {
    if (this.eventHandlers[event]) {
      for (const handler of this.eventHandlers[event]) {
        await handler(...args);
      }
    }
  }

  private notifyStageResults() {
    for (const listener of this.stageResultsListeners) {
      listener({ ...this.stageResults });
    }
  }

  private addLog(type: string, message: string, data?: any) {
    this.logs.push({ type, message, data, timestamp: new Date() });
  }

  private async emitStepStart(event: PipelineStepEvent) {
    for (const handler of this.onStepStartHandlers) await handler(event);
    await this.emit(`step:${event.stepKey}:start`, event);
    this.addLog('log', `step:${event.stepKey}:start`, event);
    await this.emit('log', { type: 'step:start', ...event });
  }

  private async emitStepFinish(event: PipelineStepEvent) {
    for (const handler of this.onStepFinishHandlers) await handler(event);
    await this.emit(`step:${event.stepKey}:success`, event);
    this.addLog('log', `step:${event.stepKey}:success`, event);
    await this.emit('log', { type: 'step:success', ...event });
  }

  private async emitStepError(event: PipelineStepEvent) {
    for (const handler of this.onStepErrorHandlers) await handler(event);
    await this.emit(`step:${event.stepKey}:error`, event);
    this.addLog('error', `step:${event.stepKey}:error`, event);
    await this.emit('log', { type: 'step:error', ...event });
  }

  private async emitStepSkipped(event: PipelineStepEvent) {
    await this.emit(`step:${event.stepKey}:skipped`, event);
    this.addLog('log', `step:${event.stepKey}:skipped`, event);
    await this.emit('log', { type: 'step:skipped', ...event });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Ядро: выполнение одного шага
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Выполнить один шаг pipeline.
   * Единственная точка реализации логики шага — используется и в run(), и в rerunStep().
   */
  private async executeStage(
    stepIndex: number,
    stage: PipelineStageConfig,
    signal: AbortSignal,
    onStepPause?: (
      stepIndex: number,
      stepResult: unknown,
      stageResults: Record<string, PipelineStepResult>,
    ) => Promise<unknown> | unknown,
  ): Promise<PipelineStepResult> {
    const key = stage.key;

    // Получаем prev из предыдущего шага (по порядку в конфиге)
    const prevStageIndex = this.config.stages
      .slice(0, stepIndex)
      .map((s) => (isParallelGroup(s) ? null : s))
      .filter(Boolean);
    const prevStage = prevStageIndex[prevStageIndex.length - 1] as PipelineStageConfig | undefined;
    const prevData = prevStage ? this.stageResults[prevStage.key]?.data : undefined;

    // ── Проверка condition (Bug #1 fix) ──────────────────────────────────
    if (typeof stage.condition === 'function') {
      const shouldRun = stage.condition({
        prev: prevData,
        allResults: this.stageResults,
        sharedData: this.sharedData,
      });
      if (!shouldRun) {
        const skippedResult: PipelineStepResult = { status: 'skipped' };
        this.stageResults[key] = skippedResult;
        this.notifyStageResults();
        this.progress.updateStage(stepIndex, 'skipped');
        await this.emit(`step:${key}:progress`, 'skipped');
        await this.emitStepSkipped({
          stepIndex,
          stepKey: key,
          status: 'skipped',
          stageResults: { ...this.stageResults },
        });
        return skippedResult;
      }
    }

    // ── Инициализация ────────────────────────────────────────────────────
    this.stageResults[key] = { status: 'pending' };
    this.notifyStageResults();
    this.progress.updateStage(stepIndex, 'loading');
    await this.emit(`step:${key}:progress`, 'loading');

    await this.emitStepStart({
      stepIndex,
      stepKey: key,
      status: 'loading',
      stageResults: { ...this.stageResults },
    });

    try {
      // ── Global middleware: beforeEach ──────────────────────────────────
      if (typeof this.config.middleware?.beforeEach === 'function') {
        await this.config.middleware.beforeEach({
          stage,
          index: stepIndex,
          sharedData: this.sharedData,
        });
      }

      // ── pauseBefore ───────────────────────────────────────────────────
      if (typeof stage.pauseBefore === 'number' && stage.pauseBefore > 0) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, stage.pauseBefore),
        );
      }

      // ── before hook ───────────────────────────────────────────────────
      let prevInput = prevData;
      if (typeof stage.before === 'function') {
        const beforeResult = await stage.before({
          prev: prevInput,
          allResults: this.stageResults,
          sharedData: this.sharedData,
        });
        if (beforeResult !== undefined) prevInput = beforeResult;
      }

      // ── request ────────────────────────────────────────────────────────
      // Bug #2 fix: request() вызывается ОДИН раз, возвращаемое значение
      // всегда является данными (строки больше не интерпретируются как URL).
      // HTTP-запрос через executor выполняется только если request не задан.
      let stepResult: unknown;
      if (typeof stage.request === 'function') {
        stepResult = await stage.request({
          prev: prevInput,
          allResults: this.stageResults,
          sharedData: this.sharedData,
        });
      } else if (stage.key) {
        // Нет функции request — используем stage.key как URL endpoint
        const res = await this.executor.execute(
          stage.key,
          undefined,
          stage.retryCount,
          stage.timeoutMs,
          signal,
        );
        stepResult = res.data;
      } else {
        stepResult = undefined;
      }

      // ── after hook ────────────────────────────────────────────────────
      if (typeof stage.after === 'function') {
        stepResult = await stage.after({
          result: stepResult,
          allResults: this.stageResults,
          sharedData: this.sharedData,
        });
      }

      // ── pauseAfter ────────────────────────────────────────────────────
      if (typeof stage.pauseAfter === 'number' && stage.pauseAfter > 0) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, stage.pauseAfter),
        );
      }

      // ── onStepPause callback ──────────────────────────────────────────
      if (onStepPause) {
        stepResult = await onStepPause(stepIndex, stepResult, this.stageResults);
      }

      // ── Сохраняем результат ───────────────────────────────────────────
      const successResult: PipelineStepResult = { status: 'success', data: stepResult };
      this.stageResults[key] = successResult;
      this.notifyStageResults();
      this.progress.updateStage(stepIndex, 'success');
      await this.emit(`step:${key}:progress`, 'success');

      // ── Global middleware: afterEach ───────────────────────────────────
      if (typeof this.config.middleware?.afterEach === 'function') {
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
        status: 'success',
        data: stepResult,
        stageResults: { ...this.stageResults },
      });

      // ── pause/resume: проверяем ПОСЛЕ emit событий, чтобы обработчики
      // событий могли вызвать pause() и pipeline корректно остановился ──
      if (this._paused && this._resumePromise) {
        await this._resumePromise;
      }

      return successResult;
    } catch (err) {
      // ── Обработка ошибки ─────────────────────────────────────────────
      // Если у шага есть errorHandler — вызываем его, результат нормализуем через toApiError.
      // Иначе используем ErrorHandler напрямую (возвращает ApiError без дополнительной конвертации).
      let apiError: import('./types').ApiError;
      if (typeof stage.errorHandler === 'function') {
        const handled = stage.errorHandler({
          error: err,
          key: stage.key,
          sharedData: this.sharedData,
        });
        apiError = toApiError(handled ?? err);
      } else {
        apiError = this.errorHandler.handle(err, stage.key);
      }

      const errorResult: PipelineStepResult = { status: 'error', error: apiError };
      this.stageResults[key] = errorResult;
      this.notifyStageResults();
      this.progress.updateStage(stepIndex, 'error');
      await this.emit(`step:${key}:progress`, 'error');

      // ── Global middleware: onError ─────────────────────────────────────
      if (typeof this.config.middleware?.onError === 'function') {
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
        status: 'error',
        error: apiError,
        stageResults: { ...this.stageResults },
      });

      return errorResult;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // run()
  // ─────────────────────────────────────────────────────────────────────────

  async run(
    onStepPause?: (
      stepIndex: number,
      stepResult: unknown,
      stageResults: Record<string, PipelineStepResult>,
    ) => Promise<unknown> | unknown,
    externalSignal?: AbortSignal,
  ): Promise<PipelineResult> {
    if (this.autoReset) {
      this.stageResults = {};
      this.logs = [];
      this.notifyStageResults();
    }

    this._paused = false;
    this._resumePromise = null;
    this._resumeResolve = null;

    this.abortController = new AbortController();
    const signal = externalSignal
      ? this.mergeSignals(externalSignal, this.abortController.signal)
      : this.abortController.signal;

    let success = true;

    for (let i = 0; i < this.config.stages.length; i++) {
      if (signal.aborted) {
        success = false;
        this.markRemainingAborted(i, signal);
        break;
      }

      const item = this.config.stages[i];

      if (isParallelGroup(item)) {
        // ── Параллельное выполнение группы шагов ────────────────────────
        const group = item as ParallelStageGroup;
        this.progress.updateStage(i, 'loading');

        // executeStage никогда не бросает — ошибки возвращаются как { status: 'error' }
        const parallelResults = await Promise.all(
          group.parallel.map((stage) =>
            this.executeStage(i, stage, signal, onStepPause),
          ),
        );

        const anyFailed = parallelResults.some(
          (r: PipelineStepResult) => r.status === 'error',
        );

        this.progress.updateStage(i, anyFailed ? 'error' : 'success');

        if (anyFailed) {
          success = false;
          break;
        }
      } else {
        // ── Последовательное выполнение ──────────────────────────────────
        const stage = item as PipelineStageConfig;
        const result = await this.executeStage(i, stage, signal, onStepPause);

        if (result.status === 'error') {
          success = false;
          break;
        }
      }
    }

    return { stageResults: { ...this.stageResults }, success };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // rerunStep()
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Повторно выполнить только один шаг pipeline (без полного рестарта).
   * Полностью зеркалирует поведение run(): вызывает before/after/condition/middleware.
   */
  async rerunStep(
    stepKey: string,
    options?: {
      onStepPause?: (
        stepIndex: number,
        stepResult: unknown,
        stageResults: Record<string, PipelineStepResult>,
      ) => Promise<unknown> | unknown;
      externalSignal?: AbortSignal;
    },
  ): Promise<PipelineStepResult | undefined> {
    // Ищем шаг в том числе внутри параллельных групп
    let stage: PipelineStageConfig | undefined;
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
      } else if ((item as PipelineStageConfig).key === stepKey) {
        stage = item as PipelineStageConfig;
        stepIndex = i;
        break;
      }
    }

    if (!stage || stepIndex === -1) return undefined;

    this.addLog('log', `rerunStep:${stepKey}:start`, { stepIndex });
    await this.emit('log', { type: 'rerunStep:start', stepKey, stepIndex });

    const signal = options?.externalSignal ?? new AbortController().signal;

    const result = await this.executeStage(
      stepIndex,
      stage,
      signal,
      options?.onStepPause,
    );

    const logType = result.status === 'error' ? 'error' : 'log';
    this.addLog(logType, `rerunStep:${stepKey}:${result.status}`, {
      stepIndex,
      ...(result.status === 'error' ? { error: result.error } : { data: result.data }),
    });
    await this.emit('log', {
      type: `rerunStep:${result.status}`,
      stepKey,
      stepIndex,
      ...(result.status === 'error' ? { error: result.error } : { data: result.data }),
    });

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (a.aborted || b.aborted) {
      controller.abort();
    } else {
      a.addEventListener('abort', abort, { once: true });
      b.addEventListener('abort', abort, { once: true });
    }
    return controller.signal;
  }

  private markRemainingAborted(fromIndex: number, _signal: AbortSignal) {
    const apiError = toApiError({ message: 'Pipeline aborted', code: 'ABORTED' });
    for (let i = fromIndex; i < this.config.stages.length; i++) {
      const item = this.config.stages[i];
      const keys = isParallelGroup(item)
        ? item.parallel.map((s) => s.key)
        : [(item as PipelineStageConfig).key];

      for (const key of keys) {
        if (!this.stageResults[key] || this.stageResults[key].status === 'pending') {
          this.stageResults[key] = { status: 'error', error: apiError };
        }
      }
      this.progress.updateStage(i, 'error');
    }
    this.notifyStageResults();
  }
}
