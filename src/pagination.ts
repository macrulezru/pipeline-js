/**
 * Pagination utility: drives `fetchPage()` across pages and yields them as
 * an `AsyncGenerator`, hiding the differences between cursor-based and
 * offset/limit-based APIs. Useful both for simple `for await` iteration and
 * as a source for `StreamStageConfig.stream` (see examples/pagination-stream.ts).
 */

export interface CursorPage<T, C> {
  items: T[];
  /** Cursor for the next page. `null`/`undefined` — no more pages. */
  nextCursor?: C | null;
}

export interface CursorPaginationOptions<T, C = string> {
  strategy?: "cursor";
  /** Called with the cursor of the previous page (`undefined` for the first). */
  fetchPage: (cursor: C | undefined, signal?: AbortSignal) => Promise<CursorPage<T, C>>;
  signal?: AbortSignal;
}

export interface OffsetPage<T> {
  items: T[];
  /**
   * Total item count, if the API provides it — used to avoid making one
   * extra "empty" request after the last page.
   */
  total?: number;
}

export interface OffsetPaginationOptions<T> {
  strategy: "offset";
  /** Called with the current offset and a constant limit. */
  fetchPage: (offset: number, limit: number, signal?: AbortSignal) => Promise<OffsetPage<T>>;
  /** Page size. */
  limit: number;
  /** Starting offset. Default: 0. */
  startOffset?: number;
  signal?: AbortSignal;
}

export type PaginationOptions<T, C = string> =
  | CursorPaginationOptions<T, C>
  | OffsetPaginationOptions<T>;

function isOffsetOptions<T, C>(
  options: PaginationOptions<T, C>,
): options is OffsetPaginationOptions<T> {
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
export async function* paginate<T, C = string>(
  options: PaginationOptions<T, C>,
): AsyncGenerator<T[], void, undefined> {
  if (isOffsetOptions(options)) {
    let offset = options.startOffset ?? 0;
    while (true) {
      if (options.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const { items, total } = await options.fetchPage(offset, options.limit, options.signal);
      if (items.length > 0) yield items;
      offset += items.length;
      if (items.length === 0) return;
      if (typeof total === "number" && offset >= total) return;
      if (items.length < options.limit) return;
    }
  } else {
    let cursor: C | undefined;
    while (true) {
      if (options.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const { items, nextCursor } = await options.fetchPage(cursor, options.signal);
      if (items.length > 0) yield items;
      if (nextCursor === undefined || nextCursor === null) return;
      cursor = nextCursor;
    }
  }
}

/** Collects all pages into a single flat array. Handy when the total volume is known to be small. */
export async function paginateAll<T, C = string>(
  options: PaginationOptions<T, C>,
): Promise<T[]> {
  const all: T[] = [];
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
export async function* flattenPages<T>(pages: AsyncIterable<T[]>): AsyncGenerator<T, void, undefined> {
  for await (const page of pages) {
    for (const item of page) {
      yield item;
    }
  }
}
