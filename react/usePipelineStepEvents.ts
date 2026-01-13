import { useEffect, useRef, useState } from 'react';
import type { PipelineOrchestrator } from '../src/pipeline-orchestrator';

/**
 * React hook for subscribing to step events (success/error/progress) for a specific step
 * @param orchestrator PipelineOrchestrator instance
 * @param stepKey string — step key
 * @param eventType 'success' | 'error' | 'progress'
 * @returns last event payload (any)
 */
export function usePipelineStepEvent(orchestrator: PipelineOrchestrator, stepKey: string, eventType: 'success' | 'error' | 'progress') {
  const [event, setEvent] = useState<any>(null);
  const handlerRef = useRef<any>();
  useEffect(() => {
    handlerRef.current = (payload: any) => setEvent(payload);
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
export function usePipelineLogs(orchestrator: PipelineOrchestrator) {
  const [logs, setLogs] = useState(() => orchestrator.getLogs());
  useEffect(() => {
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
export function useRerunPipelineStep(orchestrator: PipelineOrchestrator) {
  return orchestrator.rerunStep.bind(orchestrator);
}
