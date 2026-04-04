import { ref, onUnmounted } from "vue";
/**
 * Vue composition function для подписки на результат конкретного шага pipeline.
 * Реактивно обновляется при каждом изменении stageResults.
 *
 * @param orchestrator Экземпляр PipelineOrchestrator
 * @param stepKey Ключ шага, за которым нужно наблюдать
 * @returns Ref<PipelineStepResult | null> — реактивный результат шага
 *
 * @example
 * const userResult = usePipelineStageResultVue(orchestrator, "fetchUser");
 * // userResult.value?.status === "success"
 * // userResult.value?.data — данные шага
 */
export function usePipelineStageResultVue(orchestrator, stepKey) {
    const result = ref(null);
    const unsubscribe = orchestrator.subscribeStageResults((results) => {
        var _a;
        result.value = (_a = results[stepKey]) !== null && _a !== void 0 ? _a : null;
    });
    onUnmounted(() => {
        if (typeof unsubscribe === "function")
            unsubscribe();
    });
    return result;
}
