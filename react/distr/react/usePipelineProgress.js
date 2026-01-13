"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePipelineProgress = usePipelineProgress;
const react_1 = require("react");
/**
 * React hook for subscribing to pipeline progress
 * @param orchestrator PipelineOrchestrator instance
 * @returns PipelineProgress (reactive)
 */
function usePipelineProgress(orchestrator) {
    const [progress, setProgress] = (0, react_1.useState)(orchestrator.getProgress());
    (0, react_1.useEffect)(() => {
        const unsubscribe = orchestrator.subscribeProgress(setProgress);
        return () => unsubscribe();
    }, [orchestrator]);
    return progress;
}
