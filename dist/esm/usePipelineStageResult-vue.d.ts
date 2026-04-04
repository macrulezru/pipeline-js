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
export declare function usePipelineStageResultVue(orchestrator: PipelineOrchestrator, stepKey: string): Ref<PipelineStepResult | null>;
