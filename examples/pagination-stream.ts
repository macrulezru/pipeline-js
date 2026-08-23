/**
 * `paginate()`/`flattenPages()` (see `src/pagination.ts`) work as a source
 * for `StreamStageConfig.stream` — the stage streams items to `onChunk` as
 * each page arrives, instead of waiting for every page to load before the
 * stage resolves (unlike `pagination-fanout.ts`, which fetches pages in
 * parallel up front; this streams them in as they're fetched, sequentially).
 *
 * Good fit for "load more as you scroll" UIs, or any case where you want to
 * start processing the first page's items before the last page has loaded.
 */
import { createRestClient, flattenPages, paginate, pipe } from "rest-pipeline-js";

interface Item {
  id: number;
  name: string;
}

const client = createRestClient({ baseURL: "https://api.example.com" });

const orchestrator = pipe()
  .stream<Item>({
    key: "allItems",
    stream: ({ signal }) =>
      flattenPages(
        paginate<Item>({
          signal,
          fetchPage: async (cursor) => {
            const res = await client.get<{ items: Item[]; nextCursor: string | null }>(
              "/items",
              { params: { cursor }, signal },
            );
            return { items: res.data.items, nextCursor: res.data.nextCursor };
          },
        }),
      ),
    onChunk: (item, sharedData) => {
      // Fires per item, as each page arrives — e.g. render incrementally.
      sharedData.itemCount = ((sharedData.itemCount as number | undefined) ?? 0) + 1;
    },
  })
  .build({ httpConfig: { baseURL: "https://api.example.com" } });

async function main() {
  const result = await orchestrator.run();
  if (result.success) {
    const allItems = result.stageResults.allItems.data as Item[];
    console.log(`Streamed ${allItems.length} items`);
  }
}

void main;

/**
 * If you don't need per-item streaming and just want every item once
 * loading is done, `paginateAll()` (or a plain `request` stage using
 * `paginate()`'s page-at-a-time iterator directly) is simpler than a
 * stream stage:
 */
import { paginateAll } from "rest-pipeline-js";

export const simplePipeline = pipe()
  .step({
    key: "allItemsFlat",
    request: () =>
      paginateAll<Item>({
        fetchPage: async (cursor) => {
          const res = await client.get<{ items: Item[]; nextCursor: string | null }>(
            "/items",
            { params: { cursor } },
          );
          return { items: res.data.items, nextCursor: res.data.nextCursor };
        },
      }),
  })
  .build({ httpConfig: { baseURL: "https://api.example.com" } });
