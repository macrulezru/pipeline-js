"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isParallelGroup = isParallelGroup;
exports.isSubPipeline = isSubPipeline;
exports.isStreamStage = isStreamStage;
exports.isWebSocketStage = isWebSocketStage;
/** Check: is the item a parallel stage group */
function isParallelGroup(item) {
    return typeof item === "object" && item !== null && "parallel" in item;
}
/** Check: is the item a nested (sub-)pipeline */
function isSubPipeline(item) {
    return typeof item === "object" && item !== null && "subPipeline" in item;
}
/** Check: is the item a stream stage */
function isStreamStage(item) {
    return typeof item === "object" && item !== null && "stream" in item;
}
/** Check: is the item a WebSocket stage */
function isWebSocketStage(item) {
    return typeof item === "object" && item !== null && "onMessage" in item;
}
