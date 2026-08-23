// This file and pipeline-orchestrator.ts import from each other
// (this one needs the `PipelineOrchestrator` class to construct a nested
// instance; pipeline-orchestrator.ts imports `executeSubPipeline` below).
// Safe as a plain circular import here because `PipelineOrchestrator` is
// only ever referenced inside `executeSubPipeline`'s function body — never
// at module-evaluation time — by which point both modules have finished
// loading. This holds for both build outputs: ESM resolves it via live
// bindings, and TypeScript's CJS output (esModuleInterop) resolves it via a
// retained module-object reference rather than a value copied at import
// time, so either way the binding is fully populated by the time it's used.
import { PipelineOrchestrator } from "../pipeline-orchestrator.js";
/**
 * Runs a nested pipeline as a single step of the parent. Constructs a fresh
 * `PipelineOrchestrator` for `item.subPipeline` (merging `sharedData`), runs
 * it, and folds its `PipelineResult` into a single `PipelineStepResult` for
 * the parent — `data` holds the full nested result (`{ stageResults, success }`),
 * not just a scalar, so the parent can inspect individual nested stage results.
 */
export async function executeSubPipeline(ctx, stepIndex, item, signal, globalContinueOnError) {
    var _a, _b;
    const key = item.key;
    const shouldContinue = (_a = item.continueOnError) !== null && _a !== void 0 ? _a : globalContinueOnError;
    ctx.stageResults[key] = { status: "pending" };
    ctx.notifyStageResults();
    ctx.progress.updateStage(stepIndex, "loading");
    await ctx.emit(`step:${key}:progress`, "loading");
    ctx.addLog("log", `subPipeline:${key}:start`, { stepIndex });
    await ctx.emit("log", {
        type: "subPipeline:start",
        stepKey: key,
        stepIndex,
    });
    let subOrchestrator;
    try {
        subOrchestrator = new PipelineOrchestrator({
            config: item.subPipeline,
            httpConfig: item.httpConfig,
            sharedData: {
                ...ctx.sharedData,
                ...((_b = item.sharedData) !== null && _b !== void 0 ? _b : {}),
            },
        });
        const subResult = await subOrchestrator.run(undefined, signal);
        // If the sub-pipeline finished with an error AND should not continue - throw an error
        if (!subResult.success && !shouldContinue) {
            const error = new Error(`Sub-pipeline "${key}" failed`);
            error.subResult = subResult;
            throw error;
        }
        const resultStatus = subResult.success ? "success" : "error";
        const result = {
            status: resultStatus,
            data: subResult,
        };
        ctx.stageResults[key] = result;
        ctx.notifyStageResults();
        ctx.progress.updateStage(stepIndex, resultStatus);
        await ctx.emit(`step:${key}:progress`, resultStatus);
        if (subResult.success) {
            ctx.addLog("log", `subPipeline:${key}:success`, { stepIndex });
            await ctx.emit("log", {
                type: "subPipeline:success",
                stepKey: key,
                stepIndex,
            });
        }
        else {
            ctx.addLog("error", `subPipeline:${key}:error`, {
                stepIndex,
                error: subResult,
            });
            await ctx.emit("log", {
                type: "subPipeline:error",
                stepKey: key,
                stepIndex,
                error: subResult,
            });
        }
        return result;
    }
    catch (err) {
        const apiError = ctx.errorHandler.handle(err, key);
        const errorResult = {
            status: "error",
            error: apiError,
        };
        ctx.stageResults[key] = errorResult;
        ctx.notifyStageResults();
        ctx.progress.updateStage(stepIndex, "error");
        await ctx.emit(`step:${key}:progress`, "error");
        ctx.addLog("error", `subPipeline:${key}:exception`, {
            stepIndex,
            error: apiError,
        });
        await ctx.emit("log", {
            type: "subPipeline:exception",
            stepKey: key,
            stepIndex,
            error: apiError,
        });
        throw err;
    }
    finally {
        subOrchestrator === null || subOrchestrator === void 0 ? void 0 : subOrchestrator.destroy();
    }
}
