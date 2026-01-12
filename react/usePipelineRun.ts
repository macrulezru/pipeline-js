import { useCallback, useState } from 'react';
import type { PipelineOrchestrator } from '../src/pipeline-orchestrator';
import type { PipelineResult } from '../src/types';

/**
 * React hook to run pipeline and track status/result
 * @param orchestrator PipelineOrchestrator instance
 * @returns [run, { running, result, error }]
 */
export function usePipelineRun(orchestrator: PipelineOrchestrator) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<any>(null);

  const run = useCallback(async (...args: any[]) => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      // Предполагается, что у orchestrator есть метод run
      const res = await (orchestrator as any).run(...args);
      setResult(res);
      return res;
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setRunning(false);
    }
  }, [orchestrator]);

  return [run, { running, result, error }] as const;
}
