import { ref, onUnmounted } from "vue";
/**
 * Vue composition function for subscribing to step events (success/error/progress) for a specific step
 * @param orchestrator PipelineOrchestrator instance
 * @param stepKey string — step key
 * @param eventType 'success' | 'error' | 'progress'
 * @returns Ref<any> — last event payload
 */
export function usePipelineStepEventVue(orchestrator, stepKey, eventType) {
    const event = ref(null);
    const eventName = `step:${stepKey}:${eventType}`;
    const handler = (payload) => {
        event.value = payload;
    };
    const unsubscribe = orchestrator.on(eventName, handler);
    onUnmounted(() => unsubscribe && unsubscribe());
    return event;
}
/**
 * Vue composition function for subscribing to pipeline logs
 * @param orchestrator PipelineOrchestrator instance
 * @returns Ref<log[]>
 */
export function usePipelineLogsVue(orchestrator) {
    const logs = ref(orchestrator.getLogs());
    const handler = () => {
        logs.value = orchestrator.getLogs();
    };
    const unsubscribe = orchestrator.on("log", handler);
    onUnmounted(() => unsubscribe && unsubscribe());
    return logs;
}
/**
 * Vue composition function for rerunning a pipeline step
 * @param orchestrator PipelineOrchestrator instance
 * @returns rerunStep function
 */
export function useRerunPipelineStepVue(orchestrator) {
    return orchestrator.rerunStep.bind(orchestrator);
}
