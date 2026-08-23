import type { PipelineOrchestrator } from "../../pipeline/pipeline-orchestrator.js";
import type { PipelineStepResult } from "../../types.js";
/**
 * React hook for subscribing to the result of a specific pipeline step.
 * Reactively updates on every change to stageResults.
 *
 * @param orchestrator PipelineOrchestrator instance
 * @param stepKey Key of the step to observe
 * @returns PipelineStepResult | null — the current result of the step
 *
 * @example
 * const userResult = usePipelineStageResultReact(orchestrator, "fetchUser");
 * // userResult?.status === "success"
 * // userResult?.data — the step's data
 */
export declare function usePipelineStageResultReact(orchestrator: PipelineOrchestrator, stepKey: string): PipelineStepResult | null;
