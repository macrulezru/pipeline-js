import type { PipelineOrchestrator } from "./pipeline-orchestrator";
import type { PipelineProgress } from "./types";
/**
 * React hook for subscribing to pipeline progress
 * @param orchestrator PipelineOrchestrator instance
 * @returns PipelineProgress (reactive)
 */
export declare function usePipelineProgressReact(orchestrator: PipelineOrchestrator): PipelineProgress;
