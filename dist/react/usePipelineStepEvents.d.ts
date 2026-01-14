import type { PipelineOrchestrator } from "../../dist/pipeline-orchestrator";
/**
 * React hook for subscribing to step events (success/error/progress) for a specific step
 * @param orchestrator PipelineOrchestrator instance
 * @param stepKey string — step key
 * @param eventType 'success' | 'error' | 'progress'
 * @returns last event payload (any)
 */
export declare function usePipelineStepEvent(orchestrator: PipelineOrchestrator, stepKey: string, eventType: "success" | "error" | "progress"): any;
/**
 * React hook for subscribing to pipeline logs
 * @param orchestrator PipelineOrchestrator instance
 * @returns array of log entries (reactive)
 */
export declare function usePipelineLogs(orchestrator: PipelineOrchestrator): {
    type: string;
    message: string;
    data?: any;
    timestamp: Date;
}[];
/**
 * React hook for rerunning a pipeline step
 * @param orchestrator PipelineOrchestrator instance
 * @returns rerunStep function
 */
export declare function useRerunPipelineStep(orchestrator: PipelineOrchestrator): (stepKey: string, options?: {
    onStepPause?: (stepIndex: number, stepResult: unknown, stageResults: Record<string, import("../types").PipelineStepResult>) => Promise<unknown> | unknown;
    externalSignal?: AbortSignal;
}) => Promise<import("../types").PipelineStepResult | undefined>;
