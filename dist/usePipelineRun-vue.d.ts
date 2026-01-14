import type { PipelineOrchestrator } from "./pipeline-orchestrator";
import type { PipelineResult } from "./types";
/**
 * Vue composition function to run pipeline and track status/result
 * @param orchestrator PipelineOrchestrator instance
 * @returns { run, running, result, error }
 */
export declare function usePipelineRunVue(orchestrator: PipelineOrchestrator): {
    run: (...args: any[]) => Promise<any>;
    running: import("vue").Ref<boolean, boolean>;
    result: import("vue").Ref<{
        stageResults: import("./types").PipelineStageResults;
        success: boolean;
    } | null, PipelineResult | {
        stageResults: import("./types").PipelineStageResults;
        success: boolean;
    } | null>;
    error: import("vue").Ref<any, any>;
    stageResults: import("vue").Ref<Record<string, any>, Record<string, any>>;
    clearStageResults: () => void;
};
