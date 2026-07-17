<script setup lang="ts">
import { ref, computed } from "vue";
import { createRestClient, RequestExecutor, clearRestClientCache } from "rest-pipeline-js";

const BASE = "https://macrulez-api.ru";

// ── Idempotency: settings ───────────────────────────────────────────
const maxFails = ref(2); // simulated failures before the mutation succeeds

// ── Idempotency: attempt log ────────────────────────────────────────
interface AttemptEntry {
  id: number;
  attempt: number;
  outcome: "fail" | "success";
  idempotencyKey: string;
}
const attempts = ref<AttemptEntry[]>([]);
let attemptId = 0;
const idempoRunning = ref(false);
const idempoDone = ref(false);
const orderId = ref<string | null>(null);

const allKeysMatch = computed(() => {
  const keys = attempts.value.map((a) => a.idempotencyKey);
  return keys.length > 0 && keys.every((k) => k === keys[0]);
});

async function runIdempotentMutation() {
  if (idempoRunning.value) return;
  idempoRunning.value = true;
  idempoDone.value = false;
  orderId.value = null;
  attempts.value = [];

  let attemptCount = 0;

  // RequestExecutor's underlying client comes from a module-level cache
  // keyed by config shape (see getRestClient() in rest-client.ts) — two
  // RequestExecutors built from an equal-looking config would otherwise
  // share one cached client, reusing this run's *previous* adapter closure
  // (and its already-exhausted attempt counter) instead of this fresh one.
  // Clearing it before each demo run keeps every click independent; a real
  // app usually wants the opposite (one executor/client reused across calls).
  clearRestClientCache();

  // A custom HttpAdapter simulates a flaky backend client-side (no real
  // network calls needed to fail deterministically) — see
  // examples/edge-fetch-adapter.ts for the "real fetch" version of this
  // pattern. RequestExecutor is what actually implements retry/backoff
  // (createRestClient()'s own client.post() doesn't retry on its own — see
  // the RequestExecutor section below).
  const executor = new RequestExecutor({
    baseURL: BASE,
    autoIdempotencyKey: true, // ← the feature: one key, reused on every retry attempt
    retry: { attempts: maxFails.value + 1, delayMs: 350, backoffMultiplier: 1.3 },
    adapter: {
      request: async (cfg) => {
        attemptCount++;
        const key = (cfg.headers as Record<string, string> | undefined)?.["Idempotency-Key"] ?? "—";

        if (attemptCount <= maxFails.value) {
          attempts.value.push({ id: ++attemptId, attempt: attemptCount, outcome: "fail", idempotencyKey: key });
          await new Promise((r) => setTimeout(r, 250));
          const err = new Error("Simulated: order service temporarily unavailable") as Error & { status: number };
          err.status = 503;
          throw err;
        }

        attempts.value.push({ id: ++attemptId, attempt: attemptCount, outcome: "success", idempotencyKey: key });
        // A real call, just to make the success feel real — the response shape is faked as an "order".
        const res = await fetch(`${BASE}/api/airlines/carriers?limit=1`);
        await res.json().catch(() => null);
        return {
          data: { orderId: `ord_${Math.random().toString(36).slice(2, 10)}` },
          status: 201,
          statusText: "Created",
          headers: {},
        };
      },
    },
  });

  try {
    const res = await executor.execute<{ orderId: string }>("/orders", {
      method: "POST",
      data: { items: ["sku-flight-42"] },
    });
    orderId.value = res.data.orderId;
  } catch {
    // maxFails covered by retry.attempts, so this path isn't reached in the demo
  } finally {
    idempoRunning.value = false;
    idempoDone.value = true;
  }
}

// ── Tracing: settings + log ─────────────────────────────────────────
interface TraceEntry {
  id: number;
  url: string;
  traceId: string;
  spanId: string;
}
const traceLog = ref<TraceEntry[]>([]);
let traceEntryId = 0;
const correlate = ref(true);
const tracingRunning = ref(false);

const traceIdsMatch = computed(() => {
  const ids = traceLog.value.map((t) => t.traceId);
  return ids.length > 1 && ids.every((id) => id === ids[0]);
});

async function runTracedRequests() {
  if (tracingRunning.value) return;
  tracingRunning.value = true;
  traceLog.value = [];

  const client = createRestClient({
    baseURL: BASE,
    timeout: 15000,
    tracing: { generateTraceparent: true },
    metrics: {
      onRequestStart: (info) => {
        const tp = info.requestHeaders?.traceparent ?? "";
        const [, traceId = "", spanId = ""] = tp.split("-");
        traceLog.value.push({ id: ++traceEntryId, url: info.url ?? "", traceId, spanId });
      },
    },
  });

  // A shared traceId (derived once, like orchestrator.getRunId().replace(/-/g, ""))
  // correlates every call below into one trace when `correlate` is on;
  // omitting it lets each request generate its own random trace-id instead.
  const sharedTraceId = crypto.randomUUID().replace(/-/g, "");
  const endpoints = [
    "/api/portfolio/fly/points",
    "/api/airlines/airports?limit=3",
    "/api/airlines/carriers?limit=3",
  ];

  for (const url of endpoints) {
    await client.get(url, correlate.value ? { traceId: sharedTraceId } : undefined).catch(() => {});
  }

  tracingRunning.value = false;
}

// ── UI ────────────────────────────────────────────────────────────
const showIdempoCode = ref(false);
const showTraceCode = ref(false);

function shortId(id: string, len = 8): string {
  return id ? `${id.slice(0, len)}…` : "—";
}
</script>

<template>
  <div>
    <!-- ── Header ──────────────────────────────────────────────── -->
    <div class="demo-header">
      <div class="demo-title">
        <span class="demo-icon">🔑</span>
        Idempotency &amp; Tracing
      </div>
      <p class="demo-desc">
        <strong style="color:var(--text)">Idempotency:</strong> a mutating request fails
        <strong style="color:var(--text)">N times</strong> before succeeding — watch the
        <code style="font-family:var(--font-mono);color:var(--primary-light);font-size:12px">Idempotency-Key</code>
        header stay identical across every retry attempt.
        <strong style="color:var(--text)">Tracing:</strong> fire a few requests sharing one
        <code style="font-family:var(--font-mono);color:var(--primary-light);font-size:12px">traceparent</code>
        trace-id, the way stages in one pipeline run would via <code style="font-family:var(--font-mono);color:var(--text-sub);font-size:12px">runId</code>.
      </p>
      <div class="feature-tags">
        <span class="tag tag--primary">autoIdempotencyKey</span>
        <span class="tag tag--primary">RequestExecutor</span>
        <span class="tag tag--primary">tracing.generateTraceparent</span>
        <span class="tag">HttpAdapter</span>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- Idempotency section                                        -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <div class="data-panel" style="margin-bottom:20px">
      <div class="data-panel__head">Simulated flaky mutation</div>
      <div class="data-panel__body">
        <div style="display:flex;gap:32px;flex-wrap:wrap;align-items:flex-end">
          <div>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">
              Failures before success:
              <strong style="color:var(--primary-light);font-family:var(--font-mono)">{{ maxFails }}</strong>
            </div>
            <input
              type="range" min="0" max="4" v-model.number="maxFails"
              :disabled="idempoRunning"
              style="accent-color:var(--primary);width:160px"
            />
          </div>
          <div style="font-size:12px;color:var(--text-sub)">
            <code style="font-family:var(--font-mono);color:var(--text);font-size:11px">POST /orders</code> —
            retried automatically by <code style="font-family:var(--font-mono);color:var(--text);font-size:11px">RequestExecutor</code>
          </div>
        </div>
      </div>
    </div>

    <div class="demo-controls">
      <button class="btn btn--run" @click="runIdempotentMutation" :disabled="idempoRunning">
        <span class="btn__spinner" v-if="idempoRunning"></span>
        <span v-else>🔑</span>
        {{ idempoRunning ? "Retrying…" : idempoDone ? "Run Again" : "Place Order" }}
      </button>
    </div>

    <div class="data-panel" v-if="attempts.length">
      <div class="data-panel__head">
        <span>Attempt log</span>
        <span
          class="badge"
          :class="allKeysMatch ? 'badge--success' : 'badge--error'"
          v-if="attempts.length > 1"
        >
          {{ allKeysMatch ? "✓ same key on every attempt" : "keys differ" }}
        </span>
      </div>
      <div class="data-panel__body" style="padding:10px">
        <div class="retry-log">
          <div
            v-for="a in attempts"
            :key="a.id"
            class="retry-entry"
            :class="a.outcome === 'fail' ? 'retry-entry--error' : 'retry-entry--success'"
          >
            <span class="retry-entry__icon">{{ a.outcome === "fail" ? "🔴" : "🟢" }}</span>
            <span class="retry-entry__text">
              Attempt {{ a.attempt }} — {{ a.outcome === "fail" ? "503 Service Unavailable" : "201 Created" }}
              <span style="color:var(--text-dim)"> · Idempotency-Key: </span>
              <span style="font-family:var(--font-mono);color:var(--primary-light)">{{ shortId(a.idempotencyKey, 13) }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <Transition name="fade">
      <div class="stats-row" v-if="idempoDone && orderId">
        <div class="stat-box">
          <div class="stat-box__label">Order created</div>
          <div class="stat-box__value" style="color:#4ade80;font-size:16px">{{ orderId }}</div>
          <div class="stat-box__sub">after {{ attempts.length }} attempt(s)</div>
        </div>
        <div class="stat-box">
          <div class="stat-box__label">Idempotency-Key used</div>
          <div class="stat-box__value" style="color:var(--primary-light);font-size:13px;word-break:break-all">
            {{ attempts[0]?.idempotencyKey }}
          </div>
          <div class="stat-box__sub">identical on all {{ attempts.length }} attempt(s)</div>
        </div>
      </div>
    </Transition>

    <div class="empty-state" v-if="!attempts.length">
      <div style="font-size:36px;margin-bottom:12px">🔑</div>
      <div>Click <strong>Place Order</strong> to see retries share one key</div>
    </div>

    <div class="code-section" style="margin-top:20px;margin-bottom:28px">
      <button class="code-section__toggle" @click="showIdempoCode = !showIdempoCode">
        <span>▸ Idempotency configuration</span>
        <span class="code-arrow" :class="{ 'code-arrow--open': showIdempoCode }">▶</span>
      </button>
      <Transition name="expand">
        <div v-if="showIdempoCode">
          <pre class="code-block"><span class="kw">import</span> { RequestExecutor } <span class="kw">from</span> <span class="str">"rest-pipeline-js"</span>;

<span class="kw">const</span> executor = <span class="kw">new</span> <span class="fn">RequestExecutor</span>({
  <span class="prop">baseURL</span>: <span class="str">"https://api.example.com"</span>,
  <span class="prop">autoIdempotencyKey</span>: <span class="kw">true</span>, <span class="cmt">// one key, reused across every retry attempt</span>
  <span class="prop">retry</span>: { <span class="prop">attempts</span>: <span class="num">3</span>, <span class="prop">delayMs</span>: <span class="num">350</span>, <span class="prop">backoffMultiplier</span>: <span class="num">1.3</span> },
});

<span class="cmt">// Every attempt below sends the SAME Idempotency-Key header —</span>
<span class="cmt">// a backend that supports it can safely dedupe the retries.</span>
<span class="kw">await</span> executor.<span class="fn">execute</span>(<span class="str">"/orders"</span>, {
  <span class="prop">method</span>: <span class="str">"POST"</span>,
  <span class="prop">data</span>: { items: [<span class="str">"sku-flight-42"</span>] },
});</pre>
        </div>
      </Transition>
    </div>

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- Tracing section                                            -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <div class="data-panel" style="margin-bottom:20px">
      <div class="data-panel__head">Correlated requests</div>
      <div class="data-panel__body">
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-sub);cursor:pointer">
          <input type="checkbox" v-model="correlate" :disabled="tracingRunning" style="accent-color:var(--primary)" />
          Share one <code style="font-family:var(--font-mono);color:var(--text)">traceId</code> across all 3 requests
        </label>
      </div>
    </div>

    <div class="demo-controls">
      <button class="btn btn--run" @click="runTracedRequests" :disabled="tracingRunning">
        <span class="btn__spinner" v-if="tracingRunning"></span>
        <span v-else>🧵</span>
        Fire 3 requests
      </button>
    </div>

    <div class="data-panel" v-if="traceLog.length">
      <div class="data-panel__head">
        <span>traceparent headers</span>
        <span class="badge" :class="traceIdsMatch ? 'badge--success' : 'badge--neutral'">
          {{ traceIdsMatch ? "✓ same trace-id" : correlate ? "…" : "different trace-ids (expected)" }}
        </span>
      </div>
      <div>
        <div class="req-log">
          <div class="req-log__head">
            <span>#</span>
            <span>URL</span>
            <span style="text-align:right">trace-id</span>
            <span style="text-align:right">span-id</span>
          </div>
          <div v-for="t in traceLog" :key="t.id" class="req-log__row">
            <span class="req-log__num">{{ t.id }}</span>
            <span class="req-log__url" :title="t.url">{{ t.url }}</span>
            <span class="req-log__dur" style="color:var(--primary-light)">{{ shortId(t.traceId) }}</span>
            <span class="req-log__stat">{{ shortId(t.spanId, 6) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="empty-state" v-if="!traceLog.length">
      <div style="font-size:36px;margin-bottom:12px">🧵</div>
      <div>Click <strong>Fire 3 requests</strong> to compare trace-ids</div>
    </div>

    <div class="code-section" style="margin-top:20px">
      <button class="code-section__toggle" @click="showTraceCode = !showTraceCode">
        <span>▸ Tracing configuration</span>
        <span class="code-arrow" :class="{ 'code-arrow--open': showTraceCode }">▶</span>
      </button>
      <Transition name="expand">
        <div v-if="showTraceCode">
          <pre class="code-block"><span class="kw">const</span> client = <span class="fn">createRestClient</span>({
  <span class="prop">baseURL</span>: <span class="str">"https://api.example.com"</span>,
  <span class="prop">tracing</span>: { <span class="prop">generateTraceparent</span>: <span class="kw">true</span> },
});

<span class="cmt">// A UUID with its dashes stripped is exactly 32 hex chars —</span>
<span class="cmt">// the W3C trace-id format — so it can be reused as traceId.</span>
<span class="kw">const</span> traceId = orchestrator.<span class="fn">getRunId</span>().<span class="fn">replace</span>(<span class="op">/-/g</span>, <span class="str">""</span>);

<span class="kw">await</span> client.<span class="fn">get</span>(<span class="str">"/users/1"</span>, { traceId });
<span class="kw">await</span> client.<span class="fn">get</span>(<span class="str">"/orders"</span>,  { traceId }); <span class="cmt">// same trace as above</span></pre>
        </div>
      </Transition>
    </div>
  </div>
</template>
