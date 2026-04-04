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
export declare function usePipelineStageResultReact(orchestrator: PipelineOrchestrator, stepKey: string): PipelineStepResult | null;
