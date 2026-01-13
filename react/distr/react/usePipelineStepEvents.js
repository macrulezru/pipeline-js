"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePipelineStepEvent = usePipelineStepEvent;
exports.usePipelineLogs = usePipelineLogs;
exports.useRerunPipelineStep = useRerunPipelineStep;
const react_1 = require("react");
/**
 * React hook for subscribing to step events (success/error/progress) for a specific step
 * @param orchestrator PipelineOrchestrator instance
 * @param stepKey string — step key
 * @param eventType 'success' | 'error' | 'progress'
 * @returns last event payload (any)
 */
function usePipelineStepEvent(orchestrator, stepKey, eventType) {
    const [event, setEvent] = (0, react_1.useState)(null);
    const handlerRef = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        handlerRef.current = (payload) => setEvent(payload);
        const eventName = `step:${stepKey}:${eventType}`;
        const unsubscribe = orchestrator.on(eventName, handlerRef.current);
        return () => unsubscribe && unsubscribe();
    }, [orchestrator, stepKey, eventType]);
    return event;
}
/**
 * React hook for subscribing to pipeline logs
 * @param orchestrator PipelineOrchestrator instance
 * @returns array of log entries (reactive)
 */
function usePipelineLogs(orchestrator) {
    const [logs, setLogs] = (0, react_1.useState)(() => orchestrator.getLogs());
    (0, react_1.useEffect)(() => {
        const handler = () => setLogs(orchestrator.getLogs());
        const unsubscribe = orchestrator.on('log', handler);
        return () => unsubscribe && unsubscribe();
    }, [orchestrator]);
    return logs;
}
/**
 * React hook for rerunning a pipeline step
 * @param orchestrator PipelineOrchestrator instance
 * @returns rerunStep function
 */
function useRerunPipelineStep(orchestrator) {
    return orchestrator.rerunStep.bind(orchestrator);
}
