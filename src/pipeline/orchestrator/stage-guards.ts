import type {
  ParallelStageGroup,
  SubPipelineStage,
  StreamStageConfig,
  WebSocketStageConfig,
} from "../../types.js";

/** Check: is the item a parallel stage group */
export function isParallelGroup(item: unknown): item is ParallelStageGroup {
  return typeof item === "object" && item !== null && "parallel" in item;
}

/** Check: is the item a nested (sub-)pipeline */
export function isSubPipeline(item: unknown): item is SubPipelineStage {
  return typeof item === "object" && item !== null && "subPipeline" in item;
}

/** Check: is the item a stream stage */
export function isStreamStage(item: unknown): item is StreamStageConfig {
  return typeof item === "object" && item !== null && "stream" in item;
}

/** Check: is the item a WebSocket stage */
export function isWebSocketStage(item: unknown): item is WebSocketStageConfig {
  return typeof item === "object" && item !== null && "onMessage" in item;
}
