/**
 * Pause/resume state machine for `PipelineOrchestrator`. Extracted verbatim
 * from the orchestrator class (same fields, same semantics) so it can be
 * read/tested in isolation — the orchestrator just holds one instance and
 * delegates to it.
 */
export class PauseController {
  private _paused = false;
  private _resumePromise: Promise<void> | null = null;
  private _resumeResolve: (() => void) | null = null;

  /** Pause after the current stage finishes. No-op if already paused. */
  pause(): void {
    if (!this._paused) {
      this._paused = true;
      this._resumePromise = new Promise<void>((resolve) => {
        this._resumeResolve = resolve;
      });
    }
  }

  /** Resume execution. No-op if not paused. */
  resume(): void {
    if (this._paused) {
      this._paused = false;
      this._resumeResolve?.();
      this._resumeResolve = null;
      this._resumePromise = null;
    }
  }

  get isPaused(): boolean {
    return this._paused;
  }

  /**
   * Resolves immediately if not paused; otherwise waits until `resume()` is
   * called. Call this right after committing a stage's success/emitting its
   * events — matching where the orchestrator checks for a pause today.
   */
  async waitIfPaused(): Promise<void> {
    if (this._paused && this._resumePromise) {
      await this._resumePromise;
    }
  }

  /**
   * Resets to the not-paused state without resolving any pending resume
   * promise — used when `run()`/a `pipelineRetry` attempt restarts, as
   * opposed to an actual user-triggered `resume()`.
   */
  reset(): void {
    this._paused = false;
    this._resumePromise = null;
    this._resumeResolve = null;
  }
}
