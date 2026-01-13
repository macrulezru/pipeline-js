import type { PipelineOrchestrator } from '../src/pipeline-orchestrator';
/**
 * Vue composition function for subscribing to step events (success/error/progress) for a specific step
 * @param orchestrator PipelineOrchestrator instance
 * @param stepKey string — step key
 * @param eventType 'success' | 'error' | 'progress'
 * @returns Ref<any> — last event payload
 */
export declare function usePipelineStepEvent(orchestrator: PipelineOrchestrator, stepKey: string, eventType: 'success' | 'error' | 'progress'): import("vue").Ref<any, any>;
/**
 * Vue composition function for subscribing to pipeline logs
 * @param orchestrator PipelineOrchestrator instance
 * @returns Ref<log[]>
 */
export declare function usePipelineLogs(orchestrator: PipelineOrchestrator): import("vue").Ref<{
    type: string;
    message: string;
    data?: any;
    timestamp: Date;
}[], {
    type: string;
    message: string;
    data?: any;
    timestamp: Date;
}[] | {
    type: string;
    message: string;
    data?: any;
    timestamp: Date;
}[]>;
/**
 * Vue composition function for rerunning a pipeline step
 * @param orchestrator PipelineOrchestrator instance
 * @returns rerunStep function
 */
export declare function useRerunPipelineStep(orchestrator: PipelineOrchestrator): (stepKey: string, options?: {
    onStepPause?: (stepIndex: number, stepResult: unknown, stageResults: Record<string, import("../src/types").PipelineStepResult>) => Promise<unknown> | unknown;
    externalSignal?: AbortSignal;
}) => Promise<import("../src/types").PipelineStepResult | undefined>;
