/**
 * `createMockAdapter()` (from `rest-pipeline-js/testing` — a separate entry
 * point, so it never ships in an app's production bundle) replaces the
 * network with a set of routes, for testing code that uses this package
 * without hitting a real backend.
 */
import { createRestClient, PipelineOrchestrator } from "rest-pipeline-js";
import { createMockAdapter } from "rest-pipeline-js/testing";

const adapter = createMockAdapter([
  { method: "GET", url: "/users/1", respond: { data: { id: 1, name: "Ada" } } },

  // Dynamic response — reads the request to build the reply.
  {
    method: "POST",
    url: "/orders",
    respond: (info) => ({ data: { id: 42, ...(info.data as object) }, status: 201 }),
  },

  // A sequence of responses consumed one per matching call — useful for
  // exercising retry: the first two attempts fail with a retriable status,
  // the third succeeds. The last entry repeats once the array is exhausted.
  {
    method: "GET",
    url: "/flaky",
    respond: [
      { error: true, status: 503 },
      { error: true, status: 503 },
      { data: { ok: true } },
    ],
  },
]);

export const client = createRestClient({
  baseURL: "https://api.example.com",
  adapter,
  retry: { attempts: 2, delayMs: 0, backoffMultiplier: 1, retriableStatus: [503] },
});

async function demo() {
  const user = await client.get("/users/1");
  console.log(user.data); // { id: 1, name: "Ada" }

  const order = await client.post("/orders", { item: "widget" });
  console.log(order.data); // { id: 42, item: "widget" }

  const flaky = await client.get("/flaky"); // retried twice internally, then succeeds
  console.log(flaky.data); // { ok: true }

  // `calls` records every request the adapter handled, in order — assert on
  // it in your own tests instead of a real network call.
  console.log(adapter.calls.length, "requests made");
}

void demo;

// Works with PipelineOrchestrator too. This stage reuses the same `client`/
// `adapter` configured above via its `request` function; `httpConfig` below
// only matters for stages that omit `request` and use `key` as a URL
// shorthand instead (see PipelineOrchestrator's own executor).
export const orchestrator = new PipelineOrchestrator({
  config: {
    stages: [{ key: "fetchUser", request: async ({ sharedData }) => client.get(`/users/${sharedData.userId}`) }],
  },
  httpConfig: { baseURL: "https://api.example.com", adapter },
  sharedData: { userId: 1 },
});
