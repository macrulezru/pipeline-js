import type { PipelineConfig, PipelineItem } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Type guards (локальные, без импорта из orchestrator)
// ─────────────────────────────────────────────────────────────────────────────

function isParallelGroup(item: PipelineItem): item is import("./types").ParallelStageGroup {
  return typeof item === "object" && item !== null && "parallel" in item;
}

function isSubPipeline(item: PipelineItem): item is import("./types").SubPipelineStage {
  return typeof item === "object" && item !== null && "subPipeline" in item;
}

function isStreamStage(item: PipelineItem): item is import("./types").StreamStageConfig {
  return typeof item === "object" && item !== null && "stream" in item;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validator
// ─────────────────────────────────────────────────────────────────────────────

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
export function validatePipelineConfig(
  config: PipelineConfig,
  context = "root",
): PipelineValidationResult {
  const errors: string[] = [];

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

/** Рекурсивно собирает все ключи шагов и проверяет их формат */
function collectAllKeys(
  stages: PipelineItem[],
  context: string,
  errors: string[],
): string[] {
  const keys: string[] = [];

  for (const item of stages) {
    if (isParallelGroup(item)) {
      validateKey(item.key, `${context} > parallel group`, errors);
      keys.push(item.key);

      if (!Array.isArray(item.parallel) || item.parallel.length === 0) {
        errors.push(`[${context}] parallel group "${item.key}" must have at least one stage`);
      } else {
        const subKeys = collectAllKeys(item.parallel, `${context} > ${item.key}`, errors);
        keys.push(...subKeys);
      }
    } else if (isSubPipeline(item)) {
      validateKey(item.key, `${context} > subPipeline`, errors);
      keys.push(item.key);

      // Рекурсивная валидация вложенного pipeline
      const subResult = validatePipelineConfig(item.subPipeline, `${context} > subPipeline:${item.key}`);
      errors.push(...subResult.errors);
    } else if (isStreamStage(item)) {
      validateKey(item.key, `${context} > stream`, errors);
      keys.push(item.key);

      if (typeof item.stream !== "function") {
        errors.push(`[${context}] stream stage "${item.key}": stream must be a function`);
      }
    } else {
      // Обычный шаг
      const stage = item as import("./types").PipelineStageConfig;
      validateKey(stage.key, context, errors);
      keys.push(stage.key);

      if (
        stage.request !== undefined &&
        typeof stage.request !== "function"
      ) {
        errors.push(`[${context}] stage "${stage.key}": request must be a function`);
      }
      if (
        stage.condition !== undefined &&
        typeof stage.condition !== "function"
      ) {
        errors.push(`[${context}] stage "${stage.key}": condition must be a function`);
      }
      if (
        stage.retryCount !== undefined &&
        (typeof stage.retryCount !== "number" || stage.retryCount < 0)
      ) {
        errors.push(`[${context}] stage "${stage.key}": retryCount must be a non-negative number`);
      }
      if (
        stage.timeoutMs !== undefined &&
        (typeof stage.timeoutMs !== "number" || stage.timeoutMs <= 0)
      ) {
        errors.push(`[${context}] stage "${stage.key}": timeoutMs must be a positive number`);
      }
    }
  }

  return keys;
}

function validateKey(key: unknown, context: string, errors: string[]): void {
  if (typeof key !== "string" || key.trim() === "") {
    errors.push(`[${context}] stage key must be a non-empty string (got: ${JSON.stringify(key)})`);
  }
}

function checkDuplicateKeys(keys: string[], context: string, errors: string[]): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      errors.push(`[${context}] duplicate stage key: "${key}"`);
    }
    seen.add(key);
  }
}
