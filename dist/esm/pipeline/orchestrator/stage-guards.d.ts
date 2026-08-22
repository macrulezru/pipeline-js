import type { ParallelStageGroup, SubPipelineStage, StreamStageConfig, WebSocketStageConfig } from "../../types.js";
/** Check: is the item a parallel stage group */
export declare function isParallelGroup(item: unknown): item is ParallelStageGroup;
/** Check: is the item a nested (sub-)pipeline */
export declare function isSubPipeline(item: unknown): item is SubPipelineStage;
/** Check: is the item a stream stage */
export declare function isStreamStage(item: unknown): item is StreamStageConfig;
/** Check: is the item a WebSocket stage */
export declare function isWebSocketStage(item: unknown): item is WebSocketStageConfig;
