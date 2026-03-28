import type { PipelineOrchestrator } from "./pipeline-orchestrator";
import type { PipelineResult, PipelineStepResult } from "./types";
/**
 * React hook to run pipeline and track status/result.
 * @returns [run, { running, result, error, stageResults, abort, rerunStep }]
 */
export declare function usePipelineRunReact(orchestrator: PipelineOrchestrator): readonly [(...args: any[]) => Promise<any>, {
    readonly running: boolean;
    readonly result: PipelineResult | null;
    readonly error: any;
    readonly stageResults: Record<string, PipelineStepResult>;
    readonly abort: () => void;
    readonly pause: () => void;
    readonly resume: () => void;
    readonly rerunStep: (stepKey: string, options?: Parameters<PipelineOrchestrator["rerunStep"]>[1]) => Promise<PipelineStepResult | undefined>;
}];
