import { ref, onUnmounted } from "vue";
/**
 * Vue composition function for subscribing to pipeline progress
 * @param orchestrator PipelineOrchestrator instance
 * @returns Ref<PipelineProgress>
 */
export function usePipelineProgressVue(orchestrator) {
    const progress = ref(orchestrator.getProgress());
    const unsubscribe = orchestrator.subscribeProgress((p) => {
        progress.value = p;
    });
    onUnmounted(unsubscribe);
    return progress;
}
