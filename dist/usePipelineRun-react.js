import { useCallback, useState } from "react";
/**
 * React hook to run pipeline and track status/result
 * @param orchestrator PipelineOrchestrator instance
 * @returns [run, { running, result, error }]
 */
export function usePipelineRunReact(orchestrator) {
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const run = useCallback(async (...args) => {
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
