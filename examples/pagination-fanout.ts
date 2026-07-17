/**
 * Fan out over many pages of a paginated API in parallel, capped at a fixed
 * `concurrency` so you don't open hundreds of connections at once for a
 * dataset with (say) 500 pages.
 *
 * `.parallel(stages, { concurrency })` runs `concurrency` workers that pull
 * the next stage off the list as soon as a slot frees up — results still come
 * back in the original stage order, regardless of completion order.
 */
import { pipe } from "rest-pipeline-js";

interface Page {
  page: number;
  items: string[];
}

async function fetchPage(page: number): Promise<Page> {
  const res = await fetch(`https://api.example.com/items?page=${page}`);
  return res.json();
}

const TOTAL_PAGES = 500;
const CONCURRENCY = 10;

const pageStages = Array.from({ length: TOTAL_PAGES }, (_, i) => ({
  key: `page-${i + 1}`,
  request: async () => fetchPage(i + 1),
}));

const orchestrator = pipe()
  .parallel(pageStages, { key: "allPages", concurrency: CONCURRENCY })
  .step({
    key: "merge",
    request: async ({ allResults }) => {
      // Each parallel stage's result lives under its own key in allResults.
      const pages = pageStages
        .map((s) => allResults[s.key]?.data as Page | undefined)
        .filter((p): p is Page => p !== undefined);
      return pages.flatMap((p) => p.items);
    },
  })
  .build({ httpConfig: { baseURL: "https://api.example.com" } });

async function main() {
  const result = await orchestrator.run();
  if (result.success) {
    const allItems = result.stageResults.merge.data as string[];
    console.log(`Fetched ${allItems.length} items across ${TOTAL_PAGES} pages`);
  }
}

void main;
