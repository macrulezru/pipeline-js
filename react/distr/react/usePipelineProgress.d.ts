import type { PipelineOrchestrator } from '../src/pipeline-orchestrator';
import type { PipelineProgress } from '../src/types';
/**
 * React hook for subscribing to pipeline progress
 * @param orchestrator PipelineOrchestrator instance
 * @returns PipelineProgress (reactive)
 */
export declare function usePipelineProgress(orchestrator: PipelineOrchestrator): PipelineProgress;
