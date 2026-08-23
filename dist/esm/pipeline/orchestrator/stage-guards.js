/** Check: is the item a parallel stage group */
export function isParallelGroup(item) {
    return typeof item === "object" && item !== null && "parallel" in item;
}
/** Check: is the item a nested (sub-)pipeline */
export function isSubPipeline(item) {
    return typeof item === "object" && item !== null && "subPipeline" in item;
}
/** Check: is the item a stream stage */
export function isStreamStage(item) {
    return typeof item === "object" && item !== null && "stream" in item;
}
/** Check: is the item a WebSocket stage */
export function isWebSocketStage(item) {
    return typeof item === "object" && item !== null && "onMessage" in item;
}
