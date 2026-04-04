import { useEffect, useState } from "react";
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
export function usePipelineStageResultReact(orchestrator, stepKey) {
    const [result, setResult] = useState(null);
    useEffect(() => {
        const unsubscribe = orchestrator.subscribeStageResults((results) => {
            var _a;
            setResult((_a = results[stepKey]) !== null && _a !== void 0 ? _a : null);
        });
        return () => unsubscribe();
    }, [orchestrator, stepKey]);
    return result;
}
