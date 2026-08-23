"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePipelineStageResultReact = usePipelineStageResultReact;
const react_1 = require("react");
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
function usePipelineStageResultReact(orchestrator, stepKey) {
    const [result, setResult] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        const unsubscribe = orchestrator.subscribeStageResults((results) => {
            var _a;
            setResult((_a = results[stepKey]) !== null && _a !== void 0 ? _a : null);
        });
        return () => unsubscribe();
    }, [orchestrator, stepKey]);
    return result;
}
