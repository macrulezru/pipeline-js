import { ref, onUnmounted } from 'vue';
import type { PipelineOrchestrator } from '../src/pipeline-orchestrator';
import type { PipelineProgress } from '../src/types';

/**
 * Vue composition function for subscribing to pipeline progress
 * @param orchestrator PipelineOrchestrator instance
 * @returns Ref<PipelineProgress>
 */
export function usePipelineProgress(orchestrator: PipelineOrchestrator) {
  const progress = ref<PipelineProgress>(orchestrator.getProgress());
  const unsubscribe = orchestrator.subscribeProgress(p => {
    progress.value = p;
  });
  onUnmounted(unsubscribe);
  return progress;
}
