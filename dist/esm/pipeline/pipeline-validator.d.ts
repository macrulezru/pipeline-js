import type { PipelineConfig } from "../types.js";
export interface PipelineValidationResult {
    valid: boolean;
    errors: string[];
}
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
export declare function validatePipelineConfig(config: PipelineConfig, context?: string): PipelineValidationResult;
