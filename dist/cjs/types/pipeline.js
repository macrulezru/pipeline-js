"use strict";
// --- Types for the pipeline orchestrator (stages, config, results, events) ---
Object.defineProperty(exports, "__esModule", { value: true });
exports.recoverStep = recoverStep;
exports.isStepRecovery = isStepRecovery;
/** Helper for errorHandler: marks the step as recovered (status: 'success') with the given data. */
function recoverStep(data) {
    return { recover: true, data };
}
/** Check: is the value returned from errorHandler a sign that the step was recovered. */
function isStepRecovery(value) {
    return (typeof value === "object" &&
        value !== null &&
        value.recover === true &&
        "data" in value);
}
