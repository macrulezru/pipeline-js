import type { PipelineConfig } from "./types";
export interface PipelineValidationResult {
    valid: boolean;
    errors: string[];
}
/**
 * Валидирует конфигурацию pipeline до запуска.
 * Обнаруживает дублирующиеся ключи, пустые ключи, некорректные конфиги шагов.
 * Рекурсивно проверяет вложенные (sub-pipeline) конфиги.
 *
 * @example
 * const { valid, errors } = validatePipelineConfig(config);
 * if (!valid) {
 *   console.error("Pipeline config errors:", errors);
 * }
 */
export declare function validatePipelineConfig(config: PipelineConfig, context?: string): PipelineValidationResult;
