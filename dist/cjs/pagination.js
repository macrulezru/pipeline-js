"use strict";
/**
 * Pagination utility: drives `fetchPage()` across pages and yields them as
 * an `AsyncGenerator`, hiding the differences between cursor-based and
 * offset/limit-based APIs. Useful both for simple `for await` iteration and
 * as a source for `StreamStageConfig.stream` (see examples/pagination-stream.ts).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.paginate = paginate;
exports.paginateAll = paginateAll;
exports.flattenPages = flattenPages;
function isOffsetOptions(options) {
    return options.strategy === "offset";
}
/**
 * Async generator of pages. Stops itself once the data runs out —
 * `nextCursor` is `null`/`undefined` (cursor strategy), or the page is
 * shorter than `limit`, or `offset` has reached `total` (offset strategy).
 *
 * @example
 * for await (const page of paginate({
 *   fetchPage: (cursor) => client.get("/items", { params: { cursor } }).then(r => r.data),
 * })) {
 *   console.log(page.length, "items");
 * }
 *
 * @example
 * for await (const page of paginate({
 *   strategy: "offset",
 *   limit: 50,
 *   fetchPage: (offset, limit) =>
 *     client.get("/items", { params: { offset, limit } }).then(r => r.data),
 * })) {
 *   console.log(page.length, "items");
 * }
 */
async function* paginate(options) {
    var _a, _b, _c;
    if (isOffsetOptions(options)) {
        let offset = (_a = options.startOffset) !== null && _a !== void 0 ? _a : 0;
        while (true) {
            if ((_b = options.signal) === null || _b === void 0 ? void 0 : _b.aborted) {
                throw new DOMException("Aborted", "AbortError");
            }
            const { items, total } = await options.fetchPage(offset, options.limit, options.signal);
            if (items.length > 0)
                yield items;
            offset += items.length;
            if (items.length === 0)
                return;
            if (typeof total === "number" && offset >= total)
                return;
            if (items.length < options.limit)
                return;
        }
    }
    else {
        let cursor;
        while (true) {
            if ((_c = options.signal) === null || _c === void 0 ? void 0 : _c.aborted) {
                throw new DOMException("Aborted", "AbortError");
            }
            const { items, nextCursor } = await options.fetchPage(cursor, options.signal);
            if (items.length > 0)
                yield items;
            if (nextCursor === undefined || nextCursor === null)
                return;
            cursor = nextCursor;
        }
    }
}
/** Collects all pages into a single flat array. Handy when the total volume is known to be small. */
async function paginateAll(options) {
    const all = [];
    for await (const page of paginate(options)) {
        all.push(...page);
    }
    return all;
}
/**
 * Flattens a stream of pages into a stream of individual items. Useful as a
 * source for `StreamStageConfig.stream` when `onChunk` should receive items
 * one at a time rather than in batches (see examples/pagination-stream.ts).
 */
async function* flattenPages(pages) {
    for await (const page of pages) {
        for (const item of page) {
            yield item;
        }
    }
}
