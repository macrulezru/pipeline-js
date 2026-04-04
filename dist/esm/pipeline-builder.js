import { PipelineOrchestrator } from "./pipeline-orchestrator";
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
export function createPipeline(stages, options = {}) {
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
    constructor() {
        this.stages = [];
    }
    /**
     * Добавить обычный (последовательный) шаг.
     */
    step(stage) {
        this.stages.push(stage);
        return this;
    }
    /**
     * Добавить группу параллельных шагов.
     * Все шаги в группе выполняются одновременно через Promise.all.
     */
    parallel(stages, options) {
        var _a;
        const group = {
            key: (_a = options === null || options === void 0 ? void 0 : options.key) !== null && _a !== void 0 ? _a : `parallel-${this.stages.length}`,
            parallel: stages,
            ...((options === null || options === void 0 ? void 0 : options.continueOnError) !== undefined
                ? { continueOnError: options.continueOnError }
                : {}),
        };
        this.stages.push(group);
        return this;
    }
    /**
     * Добавить вложенный pipeline как шаг.
     */
    subPipeline(item) {
        this.stages.push(item);
        return this;
    }
    /**
     * Добавить stream-шаг (SSE / AsyncIterable).
     */
    stream(stage) {
        this.stages.push(stage);
        return this;
    }
    /**
     * Создать PipelineOrchestrator из накопленных шагов.
     */
    build(options = {}) {
        return createPipeline([...this.stages], options);
    }
    /**
     * Получить только конфиг (без создания orchestrator).
     * Полезно для передачи конфига в другое место.
     */
    toConfig(options = {}) {
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
export function pipe() {
    return new PipelineBuilder();
}
