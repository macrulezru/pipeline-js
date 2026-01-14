import type { PipelineOrchestrator } from "../../dist/pipeline-orchestrator";
import type { PipelineProgress } from "../../dist/types";
/**
 * React hook for subscribing to pipeline progress
 * @param orchestrator PipelineOrchestrator instance
 * @returns PipelineProgress (reactive)
 */
export declare function usePipelineProgress(orchestrator: PipelineOrchestrator): PipelineProgress;
