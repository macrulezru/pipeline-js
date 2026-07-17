import type { PipelineOrchestrator } from "./pipeline-orchestrator.js";
import type { PipelineProgress } from "./types.js";
/**
 * React hook for subscribing to pipeline progress
 * @param orchestrator PipelineOrchestrator instance
 * @returns PipelineProgress (reactive)
 */
export declare function usePipelineProgressReact(orchestrator: PipelineOrchestrator): PipelineProgress;
