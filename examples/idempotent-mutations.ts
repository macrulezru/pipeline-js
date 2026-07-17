/**
 * Idempotency keys make a mutating request (POST/PUT/PATCH/DELETE) safe to
 * retry: if the client never saw the response (timeout, dropped connection,
 * retry after a transient failure), the backend can recognize the repeated
 * key and return the original result instead of double-charging a card,
 * double-creating an order, etc.
 *
 * The library only *sends* the header — deduplication has to happen on the
 * backend (most payment/order APIs — Stripe, PayPal, and plenty of in-house
 * ones — support an `Idempotency-Key`-style header out of the box; check your
 * backend's docs for the exact header name).
 */
import { createRestClient, RequestExecutor } from "rest-pipeline-js";

// ── Option A: set the key yourself, per logical operation ──────────────────
const client = createRestClient({ baseURL: "https://api.example.com" });

async function placeOrder(cart: { items: string[] }) {
  // Generate the key once per logical operation (e.g. once per "place order"
  // button click) and reuse it for every attempt of *that* operation — a
  // fresh key per HTTP call would defeat the purpose.
  const idempotencyKey = crypto.randomUUID();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await client.post("/orders", cart, { idempotencyKey });
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
}

// ── Option B: let RequestExecutor generate it automatically ────────────────
//
// RequestExecutor is what actually implements retry/backoff (see the
// RequestExecutor section of the README — createRestClient()'s own
// client.post()/put() calls don't retry on their own). With
// autoIdempotencyKey, it generates one key before starting the retry loop for
// POST/PUT/PATCH/DELETE and reuses it across every attempt automatically —
// no manual key management needed for pipeline stages using the
// "no request fn, key-as-URL" shorthand.
const executor = new RequestExecutor({
  baseURL: "https://api.example.com",
  autoIdempotencyKey: true,
  retry: { attempts: 2, delayMs: 300, backoffMultiplier: 2 },
});

async function placeOrderViaExecutor() {
  // Every retry of this call carries the same auto-generated Idempotency-Key.
  return executor.execute("/orders", { method: "POST", data: { items: ["sku-1"] } });
}

void placeOrder;
void placeOrderViaExecutor;
