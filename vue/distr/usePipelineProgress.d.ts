import type { PipelineOrchestrator } from '../src/pipeline-orchestrator';
import type { PipelineProgress } from '../src/types';
/**
 * Vue composition function for subscribing to pipeline progress
 * @param orchestrator PipelineOrchestrator instance
 * @returns Ref<PipelineProgress>
 */
export declare function usePipelineProgress(orchestrator: PipelineOrchestrator): import("vue").Ref<{
    currentStage: number;
    totalStages: number;
    stageStatuses: Array<import("../src/types").PipelineStepStatus>;
}, PipelineProgress | {
    currentStage: number;
    totalStages: number;
    stageStatuses: Array<import("../src/types").PipelineStepStatus>;
}>;
