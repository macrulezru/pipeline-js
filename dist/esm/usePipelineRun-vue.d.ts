import type { PipelineOrchestrator } from "./pipeline-orchestrator";
import type { PipelineResult, PipelineStepResult } from "./types";
/**
 * Vue composition function to run pipeline and track status/result.
 * @returns { run, running, result, error, stageResults, abort, pause, resume, rerunStep, clearStageResults }
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
    stageResults: import("vue").Ref<Record<string, PipelineStepResult>, Record<string, PipelineStepResult>>;
    abort: () => void;
    pause: () => void;
    resume: () => void;
    rerunStep: (stepKey: string, options?: Parameters<PipelineOrchestrator["rerunStep"]>[1]) => Promise<PipelineStepResult | undefined>;
    clearStageResults: () => void;
};
