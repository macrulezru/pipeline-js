import { ref, onBeforeUnmount } from "vue";
/**
 * Vue composition function to run pipeline and track status/result
 * @param orchestrator PipelineOrchestrator instance
 * @returns { run, running, result, error }
 */
export function usePipelineRunVue(orchestrator) {
    const running = ref(false);
    const result = ref(null);
    const error = ref(null);
    const stageResults = ref({});
    // Подписка на изменения stageResults orchestrator
    const unsubscribe = orchestrator.subscribeStageResults((results) => {
        stageResults.value = results;
    });
    onBeforeUnmount(() => {
        if (typeof unsubscribe === "function")
            unsubscribe();
    });
    async function run(...args) {
        running.value = true;
        error.value = null;
        result.value = null;
        try {
            // Предполагается, что у orchestrator есть метод run
            const res = await orchestrator.run(...args);
            result.value = res;
            return res;
        }
        catch (e) {
            error.value = e;
            throw e;
        }
        finally {
            running.value = false;
        }
    }
    function clearStageResults() {
        stageResults.value = {};
    }
    return { run, running, result, error, stageResults, clearStageResults };
}
