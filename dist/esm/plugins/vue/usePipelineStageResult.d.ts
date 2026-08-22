import type { Ref } from "vue";
import type { PipelineOrchestrator } from "../../pipeline/pipeline-orchestrator.js";
import type { PipelineStepResult } from "../../types.js";
/**
 * Vue composition function for subscribing to the result of a specific pipeline step.
 * Reactively updates on every change to stageResults.
 *
 * @param orchestrator PipelineOrchestrator instance
 * @param stepKey Key of the step to observe
 * @returns Ref<PipelineStepResult | null> — the reactive result of the step
 *
 * @example
 * const userResult = usePipelineStageResultVue(orchestrator, "fetchUser");
 * // userResult.value?.status === "success"
 * // userResult.value?.data — the step's data
 */
export declare function usePipelineStageResultVue(orchestrator: PipelineOrchestrator, stepKey: string): Ref<PipelineStepResult | null>;
