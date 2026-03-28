import { useCallback, useEffect, useState } from "react";
import type { PipelineOrchestrator } from "./pipeline-orchestrator";
import type { PipelineResult, PipelineStepResult } from "./types";

/**
 * React hook to run pipeline and track status/result.
 * @returns [run, { running, result, error, stageResults, abort, rerunStep }]
 */
export function usePipelineRunReact(orchestrator: PipelineOrchestrator) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<any>(null);
  const [stageResults, setStageResults] = useState<Record<string, PipelineStepResult>>({});

  useEffect(() => {
    const unsubscribe = orchestrator.subscribeStageResults(setStageResults);
    return () => unsubscribe();
  }, [orchestrator]);

  const run = useCallback(
    async (...args: any[]) => {
      setRunning(true);
      setError(null);
      setResult(null);
      try {
        const res = await (orchestrator as any).run(...args);
        setResult(res);
        return res;
      } catch (e) {
        setError(e);
        throw e;
      } finally {
        setRunning(false);
      }
    },
    [orchestrator],
  );

  const abort = useCallback(() => orchestrator.abort(), [orchestrator]);

  const pause = useCallback(() => orchestrator.pause(), [orchestrator]);

  const resume = useCallback(() => orchestrator.resume(), [orchestrator]);

  const rerunStep = useCallback(
    (stepKey: string, options?: Parameters<PipelineOrchestrator["rerunStep"]>[1]) =>
      orchestrator.rerunStep(stepKey, options),
    [orchestrator],
  );

  return [run, { running, result, error, stageResults, abort, pause, resume, rerunStep }] as const;
}
