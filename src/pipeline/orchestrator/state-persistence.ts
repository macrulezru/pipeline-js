import { isParallelGroup, isSubPipeline, isStreamStage } from "./stage-guards.js";

import type {
  PipelineExportedState,
  PipelineItem,
  PipelineStageConfig,
  PipelineStepResult,
  PipelineStepStatus,
  StreamStageConfig,
  SubPipelineStage,
} from "../../types.js";

/** In-memory shape of `PipelineOrchestrator`'s logs, before the timestamp is serialized to a string for export. */
export interface InMemoryLogEntry {
  type: string;
  message: string;
  data?: any;
  timestamp: Date;
  runId?: string;
}

/** Snapshots `stageResults`/`logs` into the exportable, JSON-serializable shape — deep-cloned so later mutations don't leak into an already-taken snapshot. */
export function exportPipelineState(
  stageResults: Record<string, PipelineStepResult>,
  logs: InMemoryLogEntry[],
): PipelineExportedState {
  return {
    stageResults: JSON.parse(JSON.stringify(stageResults)),
    logs: logs.map((l) => ({
      ...l,
      timestamp: l.timestamp.toISOString(),
    })),
  };
}

/** Reverses `exportPipelineState()`: parses a previously exported snapshot back into the in-memory shape. */
export function parseImportedPipelineState(
  state: PipelineExportedState,
): { stageResults: Record<string, PipelineStepResult>; logs: InMemoryLogEntry[] } {
  return {
    stageResults: JSON.parse(JSON.stringify(state.stageResults)),
    logs: state.logs.map((l) => ({
      ...l,
      timestamp: new Date(l.timestamp),
    })),
  };
}

/**
 * Derives, for each pipeline item, the `{ index, status }` progress update
 * implied by an imported `stageResults` snapshot — for a parallel group,
 * the first defined status among its sub-stages (matching the orchestrator's
 * existing, slightly approximate restore behavior — a parallel group's
 * overall progress status isn't separately persisted, only its members'
 * individual results are).
 */
export function computeProgressUpdatesFromStageResults(
  stages: PipelineItem[],
  stageResults: Record<string, PipelineStepResult>,
): Array<{ index: number; status: PipelineStepStatus }> {
  const updates: Array<{ index: number; status: PipelineStepStatus }> = [];

  for (let i = 0; i < stages.length; i++) {
    const item = stages[i];
    let status: PipelineStepStatus | undefined;

    if (isParallelGroup(item)) {
      status = item.parallel
        .map((s) => stageResults[s.key]?.status)
        .find((s) => s !== undefined);
    } else if (isSubPipeline(item)) {
      status = stageResults[(item as SubPipelineStage).key]?.status;
    } else if (isStreamStage(item)) {
      status = stageResults[(item as StreamStageConfig).key]?.status;
    } else {
      status = stageResults[(item as PipelineStageConfig).key]?.status;
    }

    if (status) updates.push({ index: i, status });
  }

  return updates;
}
