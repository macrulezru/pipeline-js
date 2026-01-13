"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePipelineRun = usePipelineRun;
const vue_1 = require("vue");
/**
 * Vue composition function to run pipeline and track status/result
 * @param orchestrator PipelineOrchestrator instance
 * @returns { run, running, result, error }
 */
function usePipelineRun(orchestrator) {
    const running = (0, vue_1.ref)(false);
    const result = (0, vue_1.ref)(null);
    const error = (0, vue_1.ref)(null);
    async function run(...args) {
        running.value = true;
        error.value = null;
        result.value = null;
        try {
            // Предполагается, что у orchestrator есть метод run
            const res = await orchestrator.run(...args);
            result.value = res;
            return res;
        }
        catch (e) {
            error.value = e;
            throw e;
        }
        finally {
            running.value = false;
        }
    }
    return { run, running, result, error };
}
