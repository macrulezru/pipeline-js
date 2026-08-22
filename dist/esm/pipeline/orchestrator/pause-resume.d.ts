/**
 * Pause/resume state machine for `PipelineOrchestrator`. Extracted verbatim
 * from the orchestrator class (same fields, same semantics) so it can be
 * read/tested in isolation — the orchestrator just holds one instance and
 * delegates to it.
 */
export declare class PauseController {
    private _paused;
    private _resumePromise;
    private _resumeResolve;
    /** Pause after the current stage finishes. No-op if already paused. */
    pause(): void;
    /** Resume execution. No-op if not paused. */
    resume(): void;
    get isPaused(): boolean;
    /**
     * Resolves immediately if not paused; otherwise waits until `resume()` is
     * called. Call this right after committing a stage's success/emitting its
     * events — matching where the orchestrator checks for a pause today.
     */
    waitIfPaused(): Promise<void>;
    /**
     * Resets to the not-paused state without resolving any pending resume
     * promise — used when `run()`/a `pipelineRetry` attempt restarts, as
     * opposed to an actual user-triggered `resume()`.
     */
    reset(): void;
}
