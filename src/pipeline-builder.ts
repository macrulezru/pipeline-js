import { PipelineOrchestrator } from "./pipeline-orchestrator";
import type {
  PipelineItem,
  PipelineStageConfig,
  ParallelStageGroup,
  SubPipelineStage,
  StreamStageConfig,
  PipelineConfig,
  PipelineMiddleware,
  PipelineOptions,
  HttpConfig,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// 4.1 createPipeline() — фабричная функция
// ─────────────────────────────────────────────────────────────────────────────

export interface CreatePipelineOptions {
  /** HTTP-конфиг для всех шагов, использующих executor (URL-шаги) */
  httpConfig?: HttpConfig;
  /** Общий пул данных, доступный всем шагам через params.sharedData */
  sharedData?: Record<string, any>;
  /** Глобальные middleware-хуки (beforeEach / afterEach / onError) */
  middleware?: PipelineMiddleware;
  /** Опции поведения pipeline */
  pipelineOptions?: PipelineOptions;
  /** Метрики pipeline (onPipelineStart / onPipelineEnd / onStepDuration) */
  metrics?: PipelineConfig["metrics"];
}

/**
 * Сокращённая фабричная функция для создания PipelineOrchestrator.
 * Избавляет от необходимости писать вложенный объект `{ config: { stages: [...] } }`.
 *
 * @example
 * const orchestrator = createPipeline([
 *   { key: "fetchUser", request: async () => fetchUser() },
 *   { key: "processData", request: async ({ prev }) => process(prev) },
 * ], {
 *   httpConfig: { baseURL: "https://api.example.com" },
 *   sharedData: { userId: 42 },
 * });
 */
export function createPipeline(
  stages: PipelineItem[],
  options: CreatePipelineOptions = {},
): PipelineOrchestrator {
  return new PipelineOrchestrator({
    config: {
      stages,
      middleware: options.middleware,
      options: options.pipelineOptions,
      metrics: options.metrics,
    },
    httpConfig: options.httpConfig,
    sharedData: options.sharedData,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4.2 pipe() — Fluent builder API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fluent builder для создания pipeline.
 * Позволяет строить конвейер цепочкой вызовов вместо ручного конструирования массива stages.
 *
 * `TPrev` — тип `prev`, который получит *следующий* `.step()` (тип данных, возвращённых
 * текущим шагом). Это чисто типовой (phantom) параметр — во время выполнения класс всегда
 * работает с одним и тем же массивом stages, поведение не меняется по сравнению с
 * нетипизированным использованием (без чейнинга — через отдельные вызовы без переприсвоения).
 *
 * `.parallel()` / `.subPipeline()` / `.stream()` не меняют `TPrev` — это соответствует
 * реальному поведению orchestrator: `prev` следующего шага берётся из последнего обычного
 * (`step`) шага, а не из параллельной группы/sub-pipeline/стрима.
 *
 * @example
 * const orchestrator = pipe()
 *   .step({ key: "auth", request: async () => getToken() })            // TPrev для следующего шага: string
 *   .step({ key: "fetchUser", request: async ({ prev }) => fetchUser(prev) }) // prev: string — автокомплит и проверка типов
 *   .parallel([
 *     { key: "loadA", request: async () => loadA() },
 *     { key: "loadB", request: async () => loadB() },
 *   ])
 *   .build({ httpConfig: { baseURL: "https://api.example.com" } });
 */
export class PipelineBuilder<TPrev = any> {
  private stages: PipelineItem[] = [];

  /**
   * Добавить обычный (последовательный) шаг.
   * `prev` в этом шаге типизируется как результат предыдущего `.step()` (или `undefined` для первого).
   * Тип `TOutput` обычно выводится автоматически из возвращаемого значения `request`/`after`.
   */
  step<TOutput = any>(
    stage: PipelineStageConfig<TPrev, TOutput>,
  ): PipelineBuilder<TOutput> {
    this.stages.push(stage as PipelineItem);
    // Безопасный cast: TPrev/TOutput — чисто типовые параметры, не хранятся в экземпляре,
    // поэтому смена фантомного типа не требует создания нового объекта.
    return this as unknown as PipelineBuilder<TOutput>;
  }

  /**
   * Добавить группу параллельных шагов.
   * Все шаги в группе выполняются одновременно через Promise.all (либо через пул,
   * если задан `concurrency`).
   */
  parallel(
    stages: PipelineStageConfig[],
    options?: { key?: string; continueOnError?: boolean; concurrency?: number },
  ): PipelineBuilder<TPrev> {
    const group: ParallelStageGroup = {
      key: options?.key ?? `parallel-${this.stages.length}`,
      parallel: stages,
      ...(options?.continueOnError !== undefined
        ? { continueOnError: options.continueOnError }
        : {}),
      ...(options?.concurrency !== undefined
        ? { concurrency: options.concurrency }
        : {}),
    };
    this.stages.push(group);
    return this;
  }

  /**
   * Добавить вложенный pipeline как шаг.
   */
  subPipeline(item: SubPipelineStage): PipelineBuilder<TPrev> {
    this.stages.push(item);
    return this;
  }

  /**
   * Добавить stream-шаг (SSE / AsyncIterable).
   */
  stream<T = unknown>(stage: StreamStageConfig<T>): PipelineBuilder<TPrev> {
    this.stages.push(stage as PipelineItem);
    return this;
  }

  /**
   * Создать PipelineOrchestrator из накопленных шагов.
   */
  build(options: CreatePipelineOptions = {}): PipelineOrchestrator {
    return createPipeline([...this.stages], options);
  }

  /**
   * Получить только конфиг (без создания orchestrator).
   * Полезно для передачи конфига в другое место.
   */
  toConfig(
    options: Omit<CreatePipelineOptions, "httpConfig" | "sharedData"> = {},
  ): PipelineConfig {
    return {
      stages: [...this.stages],
      middleware: options.middleware,
      options: options.pipelineOptions,
      metrics: options.metrics,
    };
  }
}

/**
 * Создаёт новый PipelineBuilder.
 * Точка входа для fluent API.
 * `prev` первого `.step()` типизируется как `undefined` — ровно так, как ведёт себя
 * orchestrator в реальности (у первого шага pipeline нет предыдущего результата).
 *
 * @example
 * const orchestrator = pipe()
 *   .step({ key: "step1", request: async () => data })
 *   .build();
 */
export function pipe(): PipelineBuilder<undefined> {
  return new PipelineBuilder<undefined>();
}
