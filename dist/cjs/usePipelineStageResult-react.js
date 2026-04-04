"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePipelineStageResultReact = usePipelineStageResultReact;
const react_1 = require("react");
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
