import type { PipelineOrchestrator } from "./pipeline-orchestrator";
import type { PipelineProgress } from "./types";
/**
 * Vue composition function for subscribing to pipeline progress
 * @param orchestrator PipelineOrchestrator instance
 * @returns Ref<PipelineProgress>
 */
export declare function usePipelineProgressVue(orchestrator: PipelineOrchestrator): import("vue").Ref<{
    currentStage: number;
    totalStages: number;
    stageStatuses: Array<import("./types").PipelineStepStatus>;
}, PipelineProgress | {
    currentStage: number;
    totalStages: number;
    stageStatuses: Array<import("./types").PipelineStepStatus>;
}>;
