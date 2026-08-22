// --- Types for the pipeline orchestrator (stages, config, results, events) ---
/** Helper for errorHandler: marks the step as recovered (status: 'success') with the given data. */
export function recoverStep(data) {
    return { recover: true, data };
}
/** Check: is the value returned from errorHandler a sign that the step was recovered. */
export function isStepRecovery(value) {
    return (typeof value === "object" &&
        value !== null &&
        value.recover === true &&
        "data" in value);
}
