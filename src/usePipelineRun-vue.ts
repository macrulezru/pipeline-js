import { ref, onBeforeUnmount } from "vue";
import type { PipelineOrchestrator } from "./pipeline-orchestrator";
import type { PipelineResult } from "./types";

/**
 * Vue composition function to run pipeline and track status/result
 * @param orchestrator PipelineOrchestrator instance
 * @returns { run, running, result, error }
 */
export function usePipelineRunVue(orchestrator: PipelineOrchestrator) {
  const running = ref(false);
  const result = ref<PipelineResult | null>(null);
  const error = ref<any>(null);
  const stageResults = ref<Record<string, any>>({});

  // Подписка на изменения stageResults orchestrator
  const unsubscribe = orchestrator.subscribeStageResults((results) => {
    stageResults.value = results;
  });

  onBeforeUnmount(() => {
    if (typeof unsubscribe === "function") unsubscribe();
  });

  async function run(...args: any[]) {
    running.value = true;
    error.value = null;
    result.value = null;
    try {
      // Предполагается, что у orchestrator есть метод run
      const res = await (orchestrator as any).run(...args);
      result.value = res;
      return res;
    } catch (e) {
      error.value = e;
      throw e;
    } finally {
      running.value = false;
    }
  }

  function clearStageResults() {
    stageResults.value = {};
  }

  return { run, running, result, error, stageResults, clearStageResults };
}
