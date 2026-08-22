import type { PipelineOrchestrator } from "../../pipeline/pipeline-orchestrator.js";
import type { PipelineProgress } from "../../types.js";
/**
 * Vue composition function for subscribing to pipeline progress
 * @param orchestrator PipelineOrchestrator instance
 * @returns Ref<PipelineProgress>
 */
export declare function usePipelineProgressVue(orchestrator: PipelineOrchestrator): import("vue").Ref<{
    currentStage: number;
    totalStages: number;
    stageStatuses: Array<import("./index.js").PipelineStepStatus>;
}, PipelineProgress | {
    currentStage: number;
    totalStages: number;
    stageStatuses: Array<import("./index.js").PipelineStepStatus>;
}>;
