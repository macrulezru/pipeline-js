import { useEffect, useState } from "react";
import type { PipelineOrchestrator } from "./pipeline-orchestrator";
import type { PipelineStepResult } from "./types";

/**
 * React hook для подписки на результат конкретного шага pipeline.
 * Реактивно обновляется при каждом изменении stageResults.
 *
 * @param orchestrator Экземпляр PipelineOrchestrator
 * @param stepKey Ключ шага, за которым нужно наблюдать
 * @returns PipelineStepResult | null — текущий результат шага
 *
 * @example
 * const userResult = usePipelineStageResultReact(orchestrator, "fetchUser");
 * // userResult?.status === "success"
 * // userResult?.data — данные шага
 */
export function usePipelineStageResultReact(
  orchestrator: PipelineOrchestrator,
  stepKey: string,
): PipelineStepResult | null {
  const [result, setResult] = useState<PipelineStepResult | null>(null);

  useEffect(() => {
    const unsubscribe = orchestrator.subscribeStageResults((results) => {
      setResult(results[stepKey] ?? null);
    });
    return () => unsubscribe();
  }, [orchestrator, stepKey]);

  return result;
}
