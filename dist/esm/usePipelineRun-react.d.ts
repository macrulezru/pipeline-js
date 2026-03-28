import type { PipelineOrchestrator } from "./pipeline-orchestrator";
import type { PipelineResult } from "./types";
/**
 * React hook to run pipeline and track status/result
 * @param orchestrator PipelineOrchestrator instance
 * @returns [run, { running, result, error }]
 */
export declare function usePipelineRunReact(orchestrator: PipelineOrchestrator): readonly [(...args: any[]) => Promise<any>, {
    readonly running: boolean;
    readonly result: PipelineResult | null;
    readonly error: any;
}];
