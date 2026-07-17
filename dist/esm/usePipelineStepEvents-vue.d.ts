import type { PipelineOrchestrator } from "./pipeline-orchestrator.js";
/**
 * Vue composition function for subscribing to step events (success/error/progress) for a specific step
 * @param orchestrator PipelineOrchestrator instance
 * @param stepKey string — step key
 * @param eventType 'success' | 'error' | 'progress'
 * @returns Ref<any> — last event payload
 */
export declare function usePipelineStepEventVue(orchestrator: PipelineOrchestrator, stepKey: string, eventType: "success" | "error" | "progress"): import("vue").Ref<any, any>;
/**
 * Vue composition function for subscribing to pipeline logs
 * @param orchestrator PipelineOrchestrator instance
 * @returns Ref<log[]>
 */
export declare function usePipelineLogsVue(orchestrator: PipelineOrchestrator): import("vue").Ref<{
    type: string;
    message: string;
    data?: any;
    timestamp: Date;
    runId?: string | undefined;
}[], {
    type: string;
    message: string;
    data?: any;
    timestamp: Date;
    runId?: string;
}[] | {
    type: string;
    message: string;
    data?: any;
    timestamp: Date;
    runId?: string | undefined;
}[]>;
/**
 * Vue composition function for rerunning a pipeline step
 * @param orchestrator PipelineOrchestrator instance
 * @returns rerunStep function
 */
export declare function useRerunPipelineStepVue(orchestrator: PipelineOrchestrator): (stepKey: string | (string & {}), options?: {
    onStepPause?: (stepIndex: number, stepResult: unknown, stageResults: Record<string, import("./types.js").PipelineStepResult>) => Promise<unknown> | unknown;
    externalSignal?: AbortSignal;
}) => Promise<import("./types.js").PipelineStepResult | undefined>;
