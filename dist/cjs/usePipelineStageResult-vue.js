"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePipelineStageResultVue = usePipelineStageResultVue;
const vue_1 = require("vue");
/**
 * Vue composition function для подписки на результат конкретного шага pipeline.
 * Реактивно обновляется при каждом изменении stageResults.
 *
 * @param orchestrator Экземпляр PipelineOrchestrator
 * @param stepKey Ключ шага, за которым нужно наблюдать
 * @returns Ref<PipelineStepResult | null> — реактивный результат шага
 *
 * @example
 * const userResult = usePipelineStageResultVue(orchestrator, "fetchUser");
 * // userResult.value?.status === "success"
 * // userResult.value?.data — данные шага
 */
function usePipelineStageResultVue(orchestrator, stepKey) {
    const result = (0, vue_1.ref)(null);
    const unsubscribe = orchestrator.subscribeStageResults((results) => {
        var _a;
        result.value = (_a = results[stepKey]) !== null && _a !== void 0 ? _a : null;
    });
    (0, vue_1.onUnmounted)(() => {
        if (typeof unsubscribe === "function")
            unsubscribe();
    });
    return result;
}
