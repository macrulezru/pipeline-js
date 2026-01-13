"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePipelineProgress = usePipelineProgress;
const vue_1 = require("vue");
/**
 * Vue composition function for subscribing to pipeline progress
 * @param orchestrator PipelineOrchestrator instance
 * @returns Ref<PipelineProgress>
 */
function usePipelineProgress(orchestrator) {
    const progress = (0, vue_1.ref)(orchestrator.getProgress());
    const unsubscribe = orchestrator.subscribeProgress(p => {
        progress.value = p;
    });
    (0, vue_1.onUnmounted)(unsubscribe);
    return progress;
}
