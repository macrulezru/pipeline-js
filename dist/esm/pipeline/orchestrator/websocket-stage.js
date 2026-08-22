/** Default WebSocket factory — the global class, if available (browser/Deno/Node ≥22). */
function defaultCreateWebSocket(url, protocols) {
    const g = globalThis;
    if (!g.WebSocket) {
        throw new Error("No global WebSocket available. Pass WebSocketStageConfig.createWebSocket " +
            '(e.g. `(url, protocols) => new (require("ws"))(url, protocols)` on Node <22).');
    }
    return new g.WebSocket(url, protocols);
}
/**
 * Runs a `WebSocketStageConfig` step: opens a connection, collects every
 * non-`undefined` value returned by `onMessage` into the step's `data`
 * array (calling `onChunk` and emitting a `step:<key>:progress` event per
 * message in real time), and resolves once the connection closes cleanly
 * (or `closeOn` says to close it), times out, or the pipeline aborts.
 *
 * Success/error is decided by the close event's `wasClean`, not the error
 * event directly — most WebSocket implementations fire `error` immediately
 * before `close`, so `onError` alone doesn't fail the stage.
 */
export async function executeWebSocketStage(ctx, stepIndex, item, signal) {
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
    ctx.addLog("log", `websocket:${key}:start`, { stepIndex });
    await ctx.emit("log", { type: "websocket:start", stepKey: key, stepIndex });
    const hookParams = {
        prev: prevData,
        allResults: ctx.stageResults,
        sharedData: ctx.sharedData,
        signal,
    };
    try {
        if (signal.aborted)
            throw new Error("Pipeline aborted");
        const url = typeof item.url === "function" ? item.url(hookParams) : item.url;
        const createWs = (_a = item.createWebSocket) !== null && _a !== void 0 ? _a : defaultCreateWebSocket;
        const ws = createWs(url, item.protocols);
        const messages = await new Promise((resolve, reject) => {
            const collected = [];
            let settled = false;
            let sawError = false;
            const cleanup = () => {
                ws.removeEventListener("open", onOpen);
                ws.removeEventListener("message", onMessage);
                ws.removeEventListener("close", onClose);
                ws.removeEventListener("error", onError);
                signal.removeEventListener("abort", onAbort);
                if (timeoutId !== undefined)
                    clearTimeout(timeoutId);
            };
            const settle = (fn) => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                fn();
            };
            const onOpen = (event) => {
                var _a;
                void ((_a = item.onOpen) === null || _a === void 0 ? void 0 : _a.call(item, { ...hookParams, event }));
            };
            const onMessage = async (event) => {
                var _a, _b;
                try {
                    const data = await item.onMessage(event === null || event === void 0 ? void 0 : event.data, { ...hookParams, event });
                    if (data !== undefined) {
                        collected.push(data);
                        (_a = item.onChunk) === null || _a === void 0 ? void 0 : _a.call(item, data, ctx.sharedData);
                        await ctx.emit(`step:${key}:progress`, { chunk: data, chunks: [...collected] });
                    }
                    if (data !== undefined && ((_b = item.closeOn) === null || _b === void 0 ? void 0 : _b.call(item, data, hookParams))) {
                        try {
                            ws.close();
                        }
                        catch {
                            /* ignore — onClose still fires (or won't, but we're already settling below) */
                        }
                    }
                }
                catch (err) {
                    settle(() => reject(err));
                }
            };
            const onClose = (event) => {
                settle(() => {
                    var _a;
                    const wasClean = (_a = event === null || event === void 0 ? void 0 : event.wasClean) !== null && _a !== void 0 ? _a : !sawError;
                    void (async () => {
                        var _a;
                        await ((_a = item.onClose) === null || _a === void 0 ? void 0 : _a.call(item, {
                            ...hookParams,
                            code: event === null || event === void 0 ? void 0 : event.code,
                            reason: event === null || event === void 0 ? void 0 : event.reason,
                            wasClean,
                        }));
                        if (wasClean) {
                            resolve(collected);
                        }
                        else {
                            reject(new Error(`WebSocket stage "${key}" closed uncleanly` +
                                ((event === null || event === void 0 ? void 0 : event.code) !== undefined ? ` (code ${event.code})` : "")));
                        }
                    })();
                });
            };
            const onError = (event) => {
                var _a;
                sawError = true;
                void ((_a = item.onError) === null || _a === void 0 ? void 0 : _a.call(item, event, hookParams));
                // Don't settle here — most WebSocket implementations send
                // 'close' right after 'error'; the final success/error outcome
                // is decided in onClose based on wasClean/sawError.
            };
            const onAbort = () => {
                settle(() => {
                    try {
                        ws.close();
                    }
                    catch {
                        /* ignore */
                    }
                    reject(new Error("Pipeline aborted"));
                });
            };
            let timeoutId;
            if (item.timeoutMs && item.timeoutMs > 0) {
                timeoutId = setTimeout(() => {
                    settle(() => {
                        try {
                            ws.close();
                        }
                        catch {
                            /* ignore */
                        }
                        reject(new Error(`WebSocket stage "${key}" timed out after ${item.timeoutMs}ms`));
                    });
                }, item.timeoutMs);
            }
            ws.addEventListener("open", onOpen);
            ws.addEventListener("message", onMessage);
            ws.addEventListener("close", onClose);
            ws.addEventListener("error", onError);
            signal.addEventListener("abort", onAbort, { once: true });
            // Closes a race condition: the signal could have been aborted between the check
            // at the start of the try block (before the WebSocket was created) and the
            // listener registration above — without this check, such an abort() would be
            // missed forever, and the stage would hang waiting for an event that will
            // never arrive.
            if (signal.aborted)
                onAbort();
        });
        const successResult = { status: "success", data: messages };
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
        ctx.addLog("log", `websocket:${key}:success`, { stepIndex, messages: messages.length });
        await ctx.emit("log", { type: "websocket:success", stepKey: key, stepIndex });
        await ctx.emitStepFinish({
            stepIndex,
            stepKey: key,
            status: "success",
            data: messages,
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
        ctx.addLog("error", `websocket:${key}:error`, { stepIndex, error: apiError });
        await ctx.emit("log", { type: "websocket:error", stepKey: key, stepIndex, error: apiError });
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
