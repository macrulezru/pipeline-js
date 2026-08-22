"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePipelineStageResultVue = usePipelineStageResultVue;
const vue_1 = require("vue");
/**
 * Vue composition function for subscribing to the result of a specific pipeline step.
 * Reactively updates on every change to stageResults.
 *
 * @param orchestrator PipelineOrchestrator instance
 * @param stepKey Key of the step to observe
 * @returns Ref<PipelineStepResult | null> — the reactive result of the step
 *
 * @example
 * const userResult = usePipelineStageResultVue(orchestrator, "fetchUser");
 * // userResult.value?.status === "success"
 * // userResult.value?.data — the step's data
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
