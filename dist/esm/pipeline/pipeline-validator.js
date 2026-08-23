import { isParallelGroup, isSubPipeline, isStreamStage, isWebSocketStage } from "./orchestrator/stage-guards.js";
/**
 * Validates a pipeline configuration before it runs.
 * Detects duplicate keys, empty keys, and invalid stage configs.
 * Recursively checks nested (sub-pipeline) configs.
 *
 * @example
 * const { valid, errors } = validatePipelineConfig(config);
 * if (!valid) {
 *   console.error("Pipeline config errors:", errors);
 * }
 */
export function validatePipelineConfig(config, context = "root") {
    const errors = [];
    if (!config || typeof config !== "object") {
        return { valid: false, errors: [`[${context}] config must be an object`] };
    }
    if (!Array.isArray(config.stages)) {
        errors.push(`[${context}] config.stages must be an array`);
        return { valid: false, errors };
    }
    if (config.stages.length === 0) {
        errors.push(`[${context}] config.stages must not be empty`);
    }
    const allKeys = collectAllKeys(config.stages, context, errors);
    checkDuplicateKeys(allKeys, context, errors);
    return { valid: errors.length === 0, errors };
}
// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
/** Recursively collects all stage keys and validates their format */
function collectAllKeys(stages, context, errors) {
    const keys = [];
    for (const item of stages) {
        if (isParallelGroup(item)) {
            validateKey(item.key, `${context} > parallel group`, errors);
            if (isValidKey(item.key))
                keys.push(item.key);
            if (!Array.isArray(item.parallel) || item.parallel.length === 0) {
                errors.push(`[${context}] parallel group "${item.key}" must have at least one stage`);
            }
            else {
                const subKeys = collectAllKeys(item.parallel, `${context} > ${item.key}`, errors);
                keys.push(...subKeys);
            }
        }
        else if (isSubPipeline(item)) {
            validateKey(item.key, `${context} > subPipeline`, errors);
            if (isValidKey(item.key))
                keys.push(item.key);
            // Recursive validation of the nested pipeline
            const subResult = validatePipelineConfig(item.subPipeline, `${context} > subPipeline:${item.key}`);
            errors.push(...subResult.errors);
        }
        else if (isStreamStage(item)) {
            validateKey(item.key, `${context} > stream`, errors);
            if (isValidKey(item.key))
                keys.push(item.key);
            if (typeof item.stream !== "function") {
                errors.push(`[${context}] stream stage "${item.key}": stream must be a function`);
            }
        }
        else if (isWebSocketStage(item)) {
            validateKey(item.key, `${context} > websocket`, errors);
            if (isValidKey(item.key))
                keys.push(item.key);
            if (item.url === undefined ||
                (typeof item.url !== "string" && typeof item.url !== "function")) {
                errors.push(`[${context}] websocket stage "${item.key}": url must be a string or function`);
            }
            if (typeof item.onMessage !== "function") {
                errors.push(`[${context}] websocket stage "${item.key}": onMessage must be a function`);
            }
            if (item.timeoutMs !== undefined &&
                (typeof item.timeoutMs !== "number" || item.timeoutMs <= 0)) {
                errors.push(`[${context}] websocket stage "${item.key}": timeoutMs must be a positive number`);
            }
        }
        else {
            // Regular stage
            const stage = item;
            validateKey(stage.key, context, errors);
            if (isValidKey(stage.key))
                keys.push(stage.key);
            if (stage.request !== undefined &&
                typeof stage.request !== "function") {
                errors.push(`[${context}] stage "${stage.key}": request must be a function`);
            }
            if (stage.condition !== undefined &&
                typeof stage.condition !== "function") {
                errors.push(`[${context}] stage "${stage.key}": condition must be a function`);
            }
            if (stage.retryCount !== undefined &&
                (typeof stage.retryCount !== "number" || stage.retryCount < 0)) {
                errors.push(`[${context}] stage "${stage.key}": retryCount must be a non-negative number`);
            }
            if (stage.timeoutMs !== undefined &&
                (typeof stage.timeoutMs !== "number" || stage.timeoutMs <= 0)) {
                errors.push(`[${context}] stage "${stage.key}": timeoutMs must be a positive number`);
            }
        }
    }
    return keys;
}
/** Only push keys that passed validateKey() into the dupe-check list — an already-reported invalid key (empty/non-string) shouldn't also trigger a spurious "duplicate key" error. */
function isValidKey(key) {
    return typeof key === "string" && key.trim() !== "";
}
function validateKey(key, context, errors) {
    if (typeof key !== "string" || key.trim() === "") {
        errors.push(`[${context}] stage key must be a non-empty string (got: ${JSON.stringify(key)})`);
    }
}
function checkDuplicateKeys(keys, context, errors) {
    const seen = new Set();
    for (const key of keys) {
        if (seen.has(key)) {
            errors.push(`[${context}] duplicate stage key: "${key}"`);
        }
        seen.add(key);
    }
}
