"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePipelineRun = usePipelineRun;
const react_1 = require("react");
/**
 * React hook to run pipeline and track status/result
 * @param orchestrator PipelineOrchestrator instance
 * @returns [run, { running, result, error }]
 */
function usePipelineRun(orchestrator) {
    const [running, setRunning] = (0, react_1.useState)(false);
    const [result, setResult] = (0, react_1.useState)(null);
    const [error, setError] = (0, react_1.useState)(null);
    const run = (0, react_1.useCallback)(async (...args) => {
        setRunning(true);
        setError(null);
        setResult(null);
        try {
            // Предполагается, что у orchestrator есть метод run
            const res = await orchestrator.run(...args);
            setResult(res);
            return res;
        }
        catch (e) {
            setError(e);
            throw e;
        }
        finally {
            setRunning(false);
        }
    }, [orchestrator]);
    return [run, { running, result, error }];
}
