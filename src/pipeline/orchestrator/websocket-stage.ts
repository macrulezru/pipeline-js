import type { ErrorHandler } from "../../http/error-handler.js";
import type { ProgressTracker } from "../progress-tracker.js";
import type {
  PipelineConfig,
  PipelineExportedState,
  PipelineStepEvent,
  PipelineStepResult,
  WebSocketLike,
  WebSocketStageConfig,
} from "../../types.js";

/** Default WebSocket factory — the global class, if available (browser/Deno/Node ≥22). */
function defaultCreateWebSocket(url: string, protocols?: string | string[]): WebSocketLike {
  const g = globalThis as unknown as { WebSocket?: new (url: string, protocols?: string | string[]) => WebSocketLike };
  if (!g.WebSocket) {
    throw new Error(
      "No global WebSocket available. Pass WebSocketStageConfig.createWebSocket " +
        '(e.g. `(url, protocols) => new (require("ws"))(url, protocols)` on Node <22).',
    );
  }
  return new g.WebSocket(url, protocols);
}

/**
 * Exactly the slice of `PipelineOrchestrator`'s internals `executeWebSocketStage`
 * touches — passing `this` (typed to this interface) from the orchestrator
 * keeps this a pure extraction with no behavior change: TS `private` is
 * compile-time only, so this costs nothing at runtime.
 */
export interface WebSocketStageExecutionContext {
  stageResults: Record<string, PipelineStepResult>;
  sharedData: Record<string, unknown>;
  progress: ProgressTracker;
  errorHandler: ErrorHandler;
  config: PipelineConfig;
  _runId: string;
  _pauseController: { waitIfPaused(): Promise<void> };
  notifyStageResults(): void;
  emit(event: string, ...args: any[]): Promise<void>;
  addLog(type: string, message: string, data?: any): void;
  emitStepStart(event: PipelineStepEvent): Promise<void>;
  emitStepFinish(event: PipelineStepEvent): Promise<void>;
  emitStepError(event: PipelineStepEvent): Promise<void>;
  exportState(): PipelineExportedState;
  _getPrevData(stepIndex: number): unknown;
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
export async function executeWebSocketStage<T>(
  ctx: WebSocketStageExecutionContext,
  stepIndex: number,
  item: WebSocketStageConfig<T>,
  signal: AbortSignal,
): Promise<PipelineStepResult> {
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
    if (signal.aborted) throw new Error("Pipeline aborted");

    const url = typeof item.url === "function" ? item.url(hookParams) : item.url;
    const createWs = item.createWebSocket ?? defaultCreateWebSocket;
    const ws = createWs(url, item.protocols);

    const messages: T[] = await new Promise<T[]>((resolve, reject) => {
      const collected: T[] = [];
      let settled = false;
      let sawError = false;

      const cleanup = () => {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("message", onMessage);
        ws.removeEventListener("close", onClose);
        ws.removeEventListener("error", onError);
        signal.removeEventListener("abort", onAbort);
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      };

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
      };

      const onOpen = (event: unknown) => {
        void item.onOpen?.({ ...hookParams, event });
      };

      const onMessage = async (event: any) => {
        try {
          const data = await item.onMessage(event?.data, { ...hookParams, event });
          if (data !== undefined) {
            collected.push(data as T);
            item.onChunk?.(data as T, ctx.sharedData);
            await ctx.emit(`step:${key}:progress`, { chunk: data, chunks: [...collected] });
          }
          if (data !== undefined && item.closeOn?.(data as T, hookParams)) {
            try {
              ws.close();
            } catch {
              /* ignore — onClose still fires (or won't, but we're already settling below) */
            }
          }
        } catch (err) {
          settle(() => reject(err));
        }
      };

      const onClose = (event: any) => {
        settle(() => {
          const wasClean = event?.wasClean ?? !sawError;
          void (async () => {
            await item.onClose?.({
              ...hookParams,
              code: event?.code,
              reason: event?.reason,
              wasClean,
            });
            if (wasClean) {
              resolve(collected);
            } else {
              reject(
                new Error(
                  `WebSocket stage "${key}" closed uncleanly` +
                    (event?.code !== undefined ? ` (code ${event.code})` : ""),
                ),
              );
            }
          })();
        });
      };

      const onError = (event: unknown) => {
        sawError = true;
        void item.onError?.(event, hookParams);
        // Don't settle here — most WebSocket implementations send
        // 'close' right after 'error'; the final success/error outcome
        // is decided in onClose based on wasClean/sawError.
      };

      const onAbort = () => {
        settle(() => {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          reject(new Error("Pipeline aborted"));
        });
      };

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (item.timeoutMs && item.timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          settle(() => {
            try {
              ws.close();
            } catch {
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
      if (signal.aborted) onAbort();
    });

    const successResult: PipelineStepResult = { status: "success", data: messages };
    ctx.stageResults[key] = successResult;
    ctx.notifyStageResults();
    ctx.progress.updateStage(stepIndex, "success");
    await ctx.emit(`step:${key}:progress`, "success");

    ctx.config.metrics?.onStepDuration?.({
      stepKey: key,
      durationMs: Date.now() - stepStartTs,
      status: "success",
      runId: ctx._runId,
    });

    const persistAdapter = ctx.config.options?.persistAdapter;
    if (persistAdapter) {
      try { await persistAdapter.save(ctx.exportState()); } catch { /* ignore */ }
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
  } catch (err) {
    const apiError = ctx.errorHandler.handle(err, key);
    const errorResult: PipelineStepResult = { status: "error", error: apiError };
    ctx.stageResults[key] = errorResult;
    ctx.notifyStageResults();
    ctx.progress.updateStage(stepIndex, "error");
    await ctx.emit(`step:${key}:progress`, "error");

    ctx.config.metrics?.onStepDuration?.({
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
