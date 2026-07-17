import { PipelineOrchestrator } from "./pipeline-orchestrator.js";
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
export class PipelineBuilder {
    constructor() {
        this.stages = [];
    }
    /**
     * Добавить обычный (последовательный) шаг.
     * `prev` в этом шаге типизируется как результат предыдущего `.step()` (или `undefined` для первого).
     * Тип `TOutput` обычно выводится автоматически из возвращаемого значения `request`/`after`.
     */
    step(stage) {
        this.stages.push(stage);
        // Безопасный cast: TPrev/TOutput — чисто типовые параметры, не хранятся в экземпляре,
        // поэтому смена фантомного типа не требует создания нового объекта.
        return this;
    }
    /**
     * Добавить группу параллельных шагов.
     * Все шаги в группе выполняются одновременно через Promise.all (либо через пул,
     * если задан `concurrency`).
     */
    parallel(stages, options) {
        var _a;
        const group = {
            key: (_a = options === null || options === void 0 ? void 0 : options.key) !== null && _a !== void 0 ? _a : `parallel-${this.stages.length}`,
            parallel: stages,
            ...((options === null || options === void 0 ? void 0 : options.continueOnError) !== undefined
                ? { continueOnError: options.continueOnError }
                : {}),
            ...((options === null || options === void 0 ? void 0 : options.concurrency) !== undefined
                ? { concurrency: options.concurrency }
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
 * `prev` первого `.step()` типизируется как `undefined` — ровно так, как ведёт себя
 * orchestrator в реальности (у первого шага pipeline нет предыдущего результата).
 *
 * @example
 * const orchestrator = pipe()
 *   .step({ key: "step1", request: async () => data })
 *   .build();
 */
export function pipe() {
    return new PipelineBuilder();
}
