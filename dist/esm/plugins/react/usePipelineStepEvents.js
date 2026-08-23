import { useEffect, useRef, useState } from "react";
/**
 * React hook for subscribing to step events (success/error/progress) for a specific step
 * @param orchestrator PipelineOrchestrator instance
 * @param stepKey string — step key
 * @param eventType 'success' | 'error' | 'progress'
 * @returns last event payload (any)
 */
export function usePipelineStepEventReact(orchestrator, stepKey, eventType) {
    const [event, setEvent] = useState(null);
    const handlerRef = useRef(null);
    useEffect(() => {
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
export function usePipelineLogsReact(orchestrator) {
    const [logs, setLogs] = useState(() => orchestrator.getLogs());
    useEffect(() => {
        // Refresh immediately for the new orchestrator — the lazy useState
        // initializer above only runs once (on mount), so without this, logs
        // would keep showing the previous orchestrator's data until the new
        // one happens to fire its own first "log" event.
        setLogs(orchestrator.getLogs());
        const handler = () => setLogs(orchestrator.getLogs());
        const unsubscribe = orchestrator.on("log", handler);
        return () => unsubscribe && unsubscribe();
    }, [orchestrator]);
    return logs;
}
/**
 * React hook for rerunning a pipeline step
 * @param orchestrator PipelineOrchestrator instance
 * @returns rerunStep function
 */
export function useRerunPipelineStepReact(orchestrator) {
    return orchestrator.rerunStep.bind(orchestrator);
}
