"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportPipelineState = exportPipelineState;
exports.parseImportedPipelineState = parseImportedPipelineState;
exports.computeProgressUpdatesFromStageResults = computeProgressUpdatesFromStageResults;
const stage_guards_js_1 = require("./stage-guards.js");
/** Snapshots `stageResults`/`logs` into the exportable, JSON-serializable shape — deep-cloned so later mutations don't leak into an already-taken snapshot. */
function exportPipelineState(stageResults, logs) {
    return {
        stageResults: JSON.parse(JSON.stringify(stageResults)),
        logs: logs.map((l) => ({
            ...l,
            timestamp: l.timestamp.toISOString(),
        })),
    };
}
/** Reverses `exportPipelineState()`: parses a previously exported snapshot back into the in-memory shape. */
function parseImportedPipelineState(state) {
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
function computeProgressUpdatesFromStageResults(stages, stageResults) {
    var _a, _b, _c;
    const updates = [];
    for (let i = 0; i < stages.length; i++) {
        const item = stages[i];
        let status;
        if ((0, stage_guards_js_1.isParallelGroup)(item)) {
            status = item.parallel
                .map((s) => { var _a; return (_a = stageResults[s.key]) === null || _a === void 0 ? void 0 : _a.status; })
                .find((s) => s !== undefined);
        }
        else if ((0, stage_guards_js_1.isSubPipeline)(item)) {
            status = (_a = stageResults[item.key]) === null || _a === void 0 ? void 0 : _a.status;
        }
        else if ((0, stage_guards_js_1.isStreamStage)(item)) {
            status = (_b = stageResults[item.key]) === null || _b === void 0 ? void 0 : _b.status;
        }
        else {
            status = (_c = stageResults[item.key]) === null || _c === void 0 ? void 0 : _c.status;
        }
        if (status)
            updates.push({ index: i, status });
    }
    return updates;
}
