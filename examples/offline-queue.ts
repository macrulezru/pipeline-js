/**
 * `HttpConfig.offlineQueue` queues mutating requests (POST/PUT/PATCH/DELETE
 * by default) made while offline instead of failing them immediately, and
 * replays them — in order, using the same `Idempotency-Key` on every replay
 * attempt — once connectivity returns. `client.post()`/etc. reject with
 * `OfflineQueuedError` (not a network error) when a request gets queued, so
 * calling code can tell the two apart.
 */
import {
  createRestClient,
  OfflineQueuedError,
  type PipelineStateAdapter,
  type QueuedRequest,
} from "rest-pipeline-js";

// `PipelineStateAdapter` is generic and reused as-is here — the same
// interface used for PipelineOrchestrator's persistAdapter, just persisting
// QueuedRequest[] instead of pipeline state.
const localStorageQueueAdapter: PipelineStateAdapter<QueuedRequest[]> = {
  save: (queue) => localStorage.setItem("offline-queue", JSON.stringify(queue)),
  load: () => JSON.parse(localStorage.getItem("offline-queue") ?? "null"),
};

export const client = createRestClient({
  baseURL: "https://api.example.com",
  offlineQueue: {
    enabled: true,
    persistAdapter: localStorageQueueAdapter,
    // Defaults shown explicitly here — omit both to get the same behavior:
    // isOnline defaults to navigator.onLine, onOnlineChange to window's
    // "online" event, so a plain `{ enabled: true, persistAdapter }` is
    // enough in a browser.
    isOnline: () => navigator.onLine,
    onOnlineChange: (callback) => {
      window.addEventListener("online", callback);
      return () => window.removeEventListener("online", callback);
    },
    onFlushSuccess: (request, response) => {
      console.log(`Synced queued ${request.method} ${request.url}`, response.data);
    },
    onFlushError: (request, error) => {
      // The backend rejected it outright (e.g. 422 validation) — not "still
      // offline". Surface this to the user; it won't be retried again.
      console.error(`Queued ${request.method} ${request.url} failed permanently:`, error);
    },
  },
});

async function placeOrder(cart: { items: string[] }) {
  try {
    return await client.post("/orders", cart);
  } catch (err) {
    if (err instanceof OfflineQueuedError) {
      // Show a "will sync once you're back online" toast instead of a hard error.
      console.log(`Order queued (${err.queueId}) — will sync automatically.`);
      return;
    }
    throw err;
  }
}

/** Example "pending sync" badge, e.g. in an app header. */
async function renderPendingSyncBadge() {
  const queued = await client.getQueuedRequests();
  if (queued.length > 0) {
    console.log(`${queued.length} action(s) waiting to sync`);
  }
}

/** A manual "sync now" button, in addition to the automatic flush on reconnect. */
async function syncNow() {
  await client.flushQueue();
}

void placeOrder;
void renderPendingSyncBadge;
void syncNow;
