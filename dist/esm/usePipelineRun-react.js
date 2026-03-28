import { useCallback, useEffect, useState } from "react";
/**
 * React hook to run pipeline and track status/result.
 * @returns [run, { running, result, error, stageResults, abort, rerunStep }]
 */
export function usePipelineRunReact(orchestrator) {
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [stageResults, setStageResults] = useState({});
    useEffect(() => {
        const unsubscribe = orchestrator.subscribeStageResults(setStageResults);
        return () => unsubscribe();
    }, [orchestrator]);
    const run = useCallback(async (...args) => {
        setRunning(true);
        setError(null);
        setResult(null);
        try {
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
    const abort = useCallback(() => orchestrator.abort(), [orchestrator]);
    const pause = useCallback(() => orchestrator.pause(), [orchestrator]);
    const resume = useCallback(() => orchestrator.resume(), [orchestrator]);
    const rerunStep = useCallback((stepKey, options) => orchestrator.rerunStep(stepKey, options), [orchestrator]);
    return [run, { running, result, error, stageResults, abort, pause, resume, rerunStep }];
}
