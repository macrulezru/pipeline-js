import type { PipelineOrchestrator } from '../src/pipeline-orchestrator';
import type { PipelineResult } from '../src/types';
/**
 * React hook to run pipeline and track status/result
 * @param orchestrator PipelineOrchestrator instance
 * @returns [run, { running, result, error }]
 */
export declare function usePipelineRun(orchestrator: PipelineOrchestrator): readonly [(...args: any[]) => Promise<any>, {
    readonly running: boolean;
    readonly result: PipelineResult | null;
    readonly error: any;
}];
