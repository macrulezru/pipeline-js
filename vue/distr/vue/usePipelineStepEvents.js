"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePipelineStepEvent = usePipelineStepEvent;
exports.usePipelineLogs = usePipelineLogs;
exports.useRerunPipelineStep = useRerunPipelineStep;
const vue_1 = require("vue");
/**
 * Vue composition function for subscribing to step events (success/error/progress) for a specific step
 * @param orchestrator PipelineOrchestrator instance
 * @param stepKey string — step key
 * @param eventType 'success' | 'error' | 'progress'
 * @returns Ref<any> — last event payload
 */
function usePipelineStepEvent(orchestrator, stepKey, eventType) {
    const event = (0, vue_1.ref)(null);
    const eventName = `step:${stepKey}:${eventType}`;
    const handler = (payload) => { event.value = payload; };
    const unsubscribe = orchestrator.on(eventName, handler);
    (0, vue_1.onUnmounted)(() => unsubscribe && unsubscribe());
    return event;
}
/**
 * Vue composition function for subscribing to pipeline logs
 * @param orchestrator PipelineOrchestrator instance
 * @returns Ref<log[]>
 */
function usePipelineLogs(orchestrator) {
    const logs = (0, vue_1.ref)(orchestrator.getLogs());
    const handler = () => { logs.value = orchestrator.getLogs(); };
    const unsubscribe = orchestrator.on('log', handler);
    (0, vue_1.onUnmounted)(() => unsubscribe && unsubscribe());
    return logs;
}
/**
 * Vue composition function for rerunning a pipeline step
 * @param orchestrator PipelineOrchestrator instance
 * @returns rerunStep function
 */
function useRerunPipelineStep(orchestrator) {
    return orchestrator.rerunStep.bind(orchestrator);
}
