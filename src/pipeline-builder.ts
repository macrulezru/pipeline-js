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
 * @example
 * const orchestrator = pipe()
 *   .step({ key: "auth", request: async () => getToken() })
 *   .step({ key: "fetchUser", condition: ({ prev }) => !!prev, request: async ({ prev }) => fetchUser(prev) })
 *   .parallel([
 *     { key: "loadA", request: async () => loadA() },
 *     { key: "loadB", request: async () => loadB() },
 *   ])
 *   .build({ httpConfig: { baseURL: "https://api.example.com" } });
 */
export class PipelineBuilder {
  private stages: PipelineItem[] = [];

  /**
   * Добавить обычный (последовательный) шаг.
   */
  step(stage: PipelineStageConfig): this {
    this.stages.push(stage);
    return this;
  }

  /**
   * Добавить группу параллельных шагов.
   * Все шаги в группе выполняются одновременно через Promise.all.
   */
  parallel(
    stages: PipelineStageConfig[],
    options?: { key?: string; continueOnError?: boolean },
  ): this {
    const group: ParallelStageGroup = {
      key: options?.key ?? `parallel-${this.stages.length}`,
      parallel: stages,
      ...(options?.continueOnError !== undefined
        ? { continueOnError: options.continueOnError }
        : {}),
    };
    this.stages.push(group);
    return this;
  }

  /**
   * Добавить вложенный pipeline как шаг.
   */
  subPipeline(item: SubPipelineStage): this {
    this.stages.push(item);
    return this;
  }

  /**
   * Добавить stream-шаг (SSE / AsyncIterable).
   */
  stream<T = unknown>(stage: StreamStageConfig<T>): this {
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
 *
 * @example
 * const orchestrator = pipe()
 *   .step({ key: "step1", request: async () => data })
 *   .build();
 */
export function pipe(): PipelineBuilder {
  return new PipelineBuilder();
}
