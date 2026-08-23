/**
 * Runs a `StreamStageConfig` step: consumes its `AsyncIterable`, collecting
 * every chunk into the step's `data` array (calling `onChunk` and emitting a
 * `step:<key>:progress` event per chunk in real time) until the iterable
 * completes, the pipeline is aborted, or the stream throws.
 */
export async function executeStreamStage(ctx, stepIndex, item, signal) {
    var _a, _b, _c, _d, _e, _f;
    const key = item.key;
    const prevData = ctx._getPrevData(stepIndex);
    const stepStartTs = Date.now();
    ctx.stageResults[key] = { status: "pending" };
    ctx.notifyStageResults();
    ctx.progress.updateStage(stepIndex, "loading");
    await ctx.emit(`step:${key}:progress`, "loading");
    await ctx.emitStepStart({
        stepIndex,
        stepKey: key,
        status: "loading",
        stageResults: { ...ctx.stageResults },
    });
    ctx.addLog("log", `stream:${key}:start`, { stepIndex });
    await ctx.emit("log", { type: "stream:start", stepKey: key, stepIndex });
    try {
        if (signal.aborted)
            throw new Error("Pipeline aborted");
        const chunks = [];
        const asyncIter = item.stream({
            prev: prevData,
            allResults: ctx.stageResults,
            sharedData: ctx.sharedData,
            signal,
        });
        for await (const chunk of asyncIter) {
            if (signal.aborted)
                throw new Error("Pipeline aborted");
            chunks.push(chunk);
            (_a = item.onChunk) === null || _a === void 0 ? void 0 : _a.call(item, chunk, ctx.sharedData);
            // Emit chunk progress event so subscribers can render chunks in real time
            await ctx.emit(`step:${key}:progress`, { chunk, chunks: [...chunks] });
        }
        const successResult = { status: "success", data: chunks };
        ctx.stageResults[key] = successResult;
        ctx.notifyStageResults();
        ctx.progress.updateStage(stepIndex, "success");
        await ctx.emit(`step:${key}:progress`, "success");
        (_c = (_b = ctx.config.metrics) === null || _b === void 0 ? void 0 : _b.onStepDuration) === null || _c === void 0 ? void 0 : _c.call(_b, {
            stepKey: key,
            durationMs: Date.now() - stepStartTs,
            status: "success",
            runId: ctx._runId,
        });
        const persistAdapter = (_d = ctx.config.options) === null || _d === void 0 ? void 0 : _d.persistAdapter;
        if (persistAdapter) {
            try {
                await persistAdapter.save(ctx.exportState());
            }
            catch { /* ignore */ }
        }
        ctx.addLog("log", `stream:${key}:success`, { stepIndex, chunks: chunks.length });
        await ctx.emit("log", { type: "stream:success", stepKey: key, stepIndex });
        await ctx.emitStepFinish({
            stepIndex,
            stepKey: key,
            status: "success",
            data: chunks,
            stageResults: { ...ctx.stageResults },
        });
        await ctx._pauseController.waitIfPaused();
        return successResult;
    }
    catch (err) {
        const apiError = ctx.errorHandler.handle(err, key);
        const errorResult = { status: "error", error: apiError };
        ctx.stageResults[key] = errorResult;
        ctx.notifyStageResults();
        ctx.progress.updateStage(stepIndex, "error");
        await ctx.emit(`step:${key}:progress`, "error");
        (_f = (_e = ctx.config.metrics) === null || _e === void 0 ? void 0 : _e.onStepDuration) === null || _f === void 0 ? void 0 : _f.call(_e, {
            stepKey: key,
            durationMs: Date.now() - stepStartTs,
            status: "error",
            runId: ctx._runId,
        });
        ctx.addLog("error", `stream:${key}:error`, { stepIndex, error: apiError });
        await ctx.emit("log", { type: "stream:error", stepKey: key, stepIndex, error: apiError });
        await ctx.emitStepError({
            stepIndex,
            stepKey: key,
            status: "error",
            error: apiError,
            stageResults: { ...ctx.stageResults },
        });
        return errorResult;
    }
}
