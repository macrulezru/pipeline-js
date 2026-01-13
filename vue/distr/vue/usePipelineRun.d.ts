import type { PipelineOrchestrator } from '../src/pipeline-orchestrator';
import type { PipelineResult } from '../src/types';
/**
 * Vue composition function to run pipeline and track status/result
 * @param orchestrator PipelineOrchestrator instance
 * @returns { run, running, result, error }
 */
export declare function usePipelineRun(orchestrator: PipelineOrchestrator): {
    run: (...args: any[]) => Promise<any>;
    running: import("vue").Ref<boolean, boolean>;
    result: import("vue").Ref<{
        stageResults: import("../src/types").PipelineStageResults;
        success: boolean;
    } | null, PipelineResult | {
        stageResults: import("../src/types").PipelineStageResults;
        success: boolean;
    } | null>;
    error: import("vue").Ref<any, any>;
};
