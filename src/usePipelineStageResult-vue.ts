import { ref, onUnmounted } from "vue";
import type { Ref } from "vue";
import type { PipelineOrchestrator } from "./pipeline-orchestrator";
import type { PipelineStepResult } from "./types";

/**
 * Vue composition function для подписки на результат конкретного шага pipeline.
 * Реактивно обновляется при каждом изменении stageResults.
 *
 * @param orchestrator Экземпляр PipelineOrchestrator
 * @param stepKey Ключ шага, за которым нужно наблюдать
 * @returns Ref<PipelineStepResult | null> — реактивный результат шага
 *
 * @example
 * const userResult = usePipelineStageResultVue(orchestrator, "fetchUser");
 * // userResult.value?.status === "success"
 * // userResult.value?.data — данные шага
 */
export function usePipelineStageResultVue(
  orchestrator: PipelineOrchestrator,
  stepKey: string,
): Ref<PipelineStepResult | null> {
  const result = ref<PipelineStepResult | null>(null);

  const unsubscribe = orchestrator.subscribeStageResults((results) => {
    result.value = results[stepKey] ?? null;
  });

  onUnmounted(() => {
    if (typeof unsubscribe === "function") unsubscribe();
  });

  return result;
}
