import { ref, onUnmounted } from "vue";
import type { PipelineOrchestrator } from "./pipeline-orchestrator";
import type { PipelineResult, PipelineStepResult } from "./types";

/**
 * Vue composition function to run pipeline and track status/result.
 * @returns { run, running, result, error, stageResults, abort, pause, resume, rerunStep, clearStageResults }
 */
export function usePipelineRunVue(orchestrator: PipelineOrchestrator) {
  const running = ref(false);
  const result = ref<PipelineResult | null>(null);
  const error = ref<any>(null);
  const stageResults = ref<Record<string, PipelineStepResult>>({});

  const unsubscribe = orchestrator.subscribeStageResults((results) => {
    stageResults.value = results;
  });

  onUnmounted(() => {
    if (typeof unsubscribe === "function") unsubscribe();
  });

  async function run(...args: any[]) {
    running.value = true;
    error.value = null;
    result.value = null;
    try {
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

  function abort() {
    orchestrator.abort();
  }

  function pause() {
    orchestrator.pause();
  }

  function resume() {
    orchestrator.resume();
  }

  function rerunStep(
    stepKey: string,
    options?: Parameters<PipelineOrchestrator["rerunStep"]>[1],
  ) {
    return orchestrator.rerunStep(stepKey, options);
  }

  function clearStageResults() {
    orchestrator.clearStageResults();
  }

  return { run, running, result, error, stageResults, abort, pause, resume, rerunStep, clearStageResults };
}
