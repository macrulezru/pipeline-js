import { ref, onUnmounted } from "vue";
/**
 * Vue composition function to run pipeline and track status/result.
 * @returns { run, running, result, error, stageResults, abort, pause, resume, rerunStep, clearStageResults }
 */
export function usePipelineRunVue(orchestrator) {
    const running = ref(false);
    const result = ref(null);
    const error = ref(null);
    const stageResults = ref({});
    const unsubscribe = orchestrator.subscribeStageResults((results) => {
        stageResults.value = results;
    });
    onUnmounted(() => {
        if (typeof unsubscribe === "function")
            unsubscribe();
    });
    async function run(...args) {
        running.value = true;
        error.value = null;
        result.value = null;
        try {
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
    function abort() {
        orchestrator.abort();
    }
    function pause() {
        orchestrator.pause();
    }
    function resume() {
        orchestrator.resume();
    }
    function rerunStep(stepKey, options) {
        return orchestrator.rerunStep(stepKey, options);
    }
    function clearStageResults() {
        orchestrator.clearStageResults();
    }
    return { run, running, result, error, stageResults, abort, pause, resume, rerunStep, clearStageResults };
}
