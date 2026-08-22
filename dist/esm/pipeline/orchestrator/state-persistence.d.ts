import type { PipelineExportedState, PipelineItem, PipelineStepResult, PipelineStepStatus } from "../../types.js";
/** In-memory shape of `PipelineOrchestrator`'s logs, before the timestamp is serialized to a string for export. */
export interface InMemoryLogEntry {
    type: string;
    message: string;
    data?: any;
    timestamp: Date;
    runId?: string;
}
/** Snapshots `stageResults`/`logs` into the exportable, JSON-serializable shape — deep-cloned so later mutations don't leak into an already-taken snapshot. */
export declare function exportPipelineState(stageResults: Record<string, PipelineStepResult>, logs: InMemoryLogEntry[]): PipelineExportedState;
/** Reverses `exportPipelineState()`: parses a previously exported snapshot back into the in-memory shape. */
export declare function parseImportedPipelineState(state: PipelineExportedState): {
    stageResults: Record<string, PipelineStepResult>;
    logs: InMemoryLogEntry[];
};
/**
 * Derives, for each pipeline item, the `{ index, status }` progress update
 * implied by an imported `stageResults` snapshot — for a parallel group,
 * the first defined status among its sub-stages (matching the orchestrator's
 * existing, slightly approximate restore behavior — a parallel group's
 * overall progress status isn't separately persisted, only its members'
 * individual results are).
 */
export declare function computeProgressUpdatesFromStageResults(stages: PipelineItem[], stageResults: Record<string, PipelineStepResult>): Array<{
    index: number;
    status: PipelineStepStatus;
}>;
