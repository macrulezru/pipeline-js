import { useEffect, useState } from "react";
/**
 * React hook for subscribing to pipeline progress
 * @param orchestrator PipelineOrchestrator instance
 * @returns PipelineProgress (reactive)
 */
export function usePipelineProgressReact(orchestrator) {
    const [progress, setProgress] = useState(orchestrator.getProgress());
    useEffect(() => {
        const unsubscribe = orchestrator.subscribeProgress(setProgress);
        return () => unsubscribe();
    }, [orchestrator]);
    return progress;
}
