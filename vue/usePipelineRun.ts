import { ref } from 'vue';
import type { PipelineOrchestrator } from '../src/pipeline-orchestrator';
import type { PipelineResult } from '../src/types';

/**
 * Vue composition function to run pipeline and track status/result
 * @param orchestrator PipelineOrchestrator instance
 * @returns { run, running, result, error }
 */
export function usePipelineRun(orchestrator: PipelineOrchestrator) {
  const running = ref(false);
  const result = ref<PipelineResult | null>(null);
  const error = ref<any>(null);

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

  return { run, running, result, error };
}
