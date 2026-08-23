<script setup lang="ts">
import { ref } from "vue";
import { createPipeline, createRestClient, recoverStep } from "rest-pipeline-js";

const malformed = ref(false);
const recoveryEnabled = ref(true);
const running = ref(false);

interface LogEntry {
  id: number;
  text: string;
  kind: "info" | "success" | "error" | "warn";
  ts: number;
}
const log = ref<LogEntry[]>([]);
let logId = 0;
function addLog(text: string, kind: LogEntry["kind"] = "info") {
  log.value.push({ id: ++logId, text, kind, ts: Date.now() });
}

let currentToken: string | null = null;
const client = createRestClient({
  baseURL: "",
  auth: {
    getToken: async () => {
      if (currentToken) return currentToken;
      const res = await fetch("/api/trading/auth/login", { method: "POST" });
      currentToken = (await res.json()).token;
      return currentToken!;
    },
    tokenTtlMs: 60_000,
  },
});

interface OrderFill {
  id: string;
  symbol: string;
  qty: number;
  side: string;
  price?: number;
}

const lastResult = ref<{ status: "success" | "error" | "recovered"; data?: OrderFill; error?: string } | null>(null);

async function run() {
  running.value = true;
  lastResult.value = null;
  addLog(`Placing order — malformed=${malformed.value}, recovery=${recoveryEnabled.value}`);

  let recovered = false;

  const orchestrator = createPipeline([
    {
      key: "placeOrder",
      request: async () =>
        (
          await client.post<OrderFill>(
            `/api/trading/orders${malformed.value ? "?malformed=true" : ""}`,
            { symbol: "AAPL", qty: 1, side: "buy" },
            { idempotencyKey: crypto.randomUUID() },
          )
        ).data,
      validateOutput: (data: OrderFill) => {
        if (typeof data.price !== "number") {
          throw new Error(`Invalid order-fill response: "price" is ${typeof data.price}, expected number`);
        }
        return data;
      },
      errorHandler: recoveryEnabled.value
        ? ({ error }: { error: Error }) => {
            addLog(`validateOutput threw — recovering with a fallback fill: ${error.message}`, "warn");
            recovered = true;
            return recoverStep({ id: "unknown", symbol: "AAPL", qty: 1, side: "buy", price: undefined });
          }
        : undefined,
    },
  ]);

  try {
    const result = await orchestrator.run();
    const stepResult = result.stageResults.placeOrder;

    if (stepResult.status === "success") {
      lastResult.value = { status: recovered ? "recovered" : "success", data: stepResult.data as OrderFill };
      addLog(recovered ? "Step recovered — pipeline continued as success" : "Order filled — validateOutput passed", "success");
    } else {
      lastResult.value = { status: "error", error: (stepResult.error as any)?.message ?? "Unknown error" };
      addLog(`Step failed — validateOutput rejected the response, no recovery configured`, "error");
    }
  } catch (e: any) {
    lastResult.value = { status: "error", error: e?.message ?? String(e) };
    addLog(`Run failed: ${e?.message ?? e}`, "error");
  } finally {
    running.value = false;
  }
}

const showCode = ref(false);
</script>

<template>
  <div>
    <div class="demo-header">
      <div class="demo-title"><span class="demo-icon">🧪</span> Schema Validation</div>
      <p class="demo-desc">
        <code style="font-family:var(--font-mono);color:var(--primary-light)">validateOutput</code> checks a real
        order-fill response from the trading mock API — toggle <strong style="color:var(--text)">malformed</strong>
        to make the server drop the <code style="font-family:var(--font-mono)">price</code> field, and
        <strong style="color:var(--text)">recovery</strong> to see <code style="font-family:var(--font-mono)">recoverStep()</code>
        rescue the step instead of failing the pipeline.
      </p>
      <div class="feature-tags">
        <span class="tag tag--primary">validateOutput</span>
        <span class="tag tag--primary">errorHandler</span>
        <span class="tag tag--primary">recoverStep()</span>
      </div>
    </div>

    <div class="demo-controls">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" v-model="malformed" />
        Server returns malformed response (missing <code style="font-family:var(--font-mono)">price</code>)
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" v-model="recoveryEnabled" />
        errorHandler recovers via recoverStep()
      </label>
    </div>
    <div class="demo-controls">
      <button class="btn btn--run" @click="run" :disabled="running">
        <span class="btn__spinner" v-if="running"></span>
        <span v-else>▶</span>
        Place Order
      </button>
    </div>

    <Transition name="slide-up">
      <div v-if="lastResult" :class="lastResult.status === 'error' ? 'error-banner' : 'info-note'" :style="lastResult.status === 'success' ? 'background:var(--success-glow);border-color:rgba(22,163,74,.3);color:#4ade80' : lastResult.status === 'recovered' ? 'background:var(--warning-glow);border-color:rgba(215,119,6,.3);color:#fbbf24' : ''">
        <template v-if="lastResult.status === 'error'">
          <span class="error-banner__icon">⚠</span>
          <div>
            <div class="error-banner__title">Step failed — validateOutput rejected the data</div>
            <div class="error-banner__msg">{{ lastResult.error }}</div>
          </div>
        </template>
        <template v-else-if="lastResult.status === 'recovered'">
          ⚠ validateOutput rejected the response, but <code>recoverStep()</code> supplied a fallback —
          the step is marked <strong>success</strong> with fallback data:
          <pre style="margin-top:8px;font-family:var(--font-mono);font-size:11px">{{ JSON.stringify(lastResult.data, null, 2) }}</pre>
        </template>
        <template v-else>
          ✓ Order filled and passed validateOutput:
          <pre style="margin-top:8px;font-family:var(--font-mono);font-size:11px">{{ JSON.stringify(lastResult.data, null, 2) }}</pre>
        </template>
      </div>
    </Transition>

    <div class="data-panel" v-if="log.length">
      <div class="data-panel__head">
        <span>Event log</span>
        <span class="badge badge--neutral">{{ log.length }} events</span>
      </div>
      <div class="data-panel__body" style="padding:10px">
        <div class="retry-log">
          <div v-for="e in log" :key="e.id" class="retry-entry" :class="e.kind === 'error' ? 'retry-entry--error' : e.kind === 'warn' ? 'retry-entry--wait' : e.kind === 'success' ? 'retry-entry--success' : ''">
            <span class="retry-entry__text">{{ e.text }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="empty-state" v-if="!log.length">
      <div style="font-size:36px;margin-bottom:12px">🧪</div>
      <div>Toggle the checkboxes above and click <strong>Place Order</strong></div>
    </div>

    <div class="code-section" style="margin-top:20px">
      <button class="code-section__toggle" @click="showCode = !showCode">
        <span>▸ validateOutput + recoverStep()</span>
        <span class="code-arrow" :class="{ 'code-arrow--open': showCode }">▶</span>
      </button>
      <Transition name="expand">
        <div v-if="showCode">
          <pre class="code-block">{
  <span class="prop">key</span>: <span class="str">"placeOrder"</span>,
  <span class="prop">request</span>: <span class="kw">async</span> () <span class="op">=></span> (<span class="kw">await</span> client.<span class="fn">post</span>(<span class="str">"/api/trading/orders"</span>, order)).data,
  <span class="prop">validateOutput</span>: (data) <span class="op">=></span> {
    <span class="kw">if</span> (<span class="kw">typeof</span> data.price !== <span class="str">"number"</span>) {
      <span class="kw">throw new</span> <span class="fn">Error</span>(<span class="str">"Invalid order-fill: missing price"</span>);
    }
    <span class="kw">return</span> data;
  },
  <span class="prop">errorHandler</span>: ({ error }) <span class="op">=></span> {
    <span class="cmt">// Rescue the step instead of failing the whole pipeline —</span>
    <span class="cmt">// the step is recorded as "success" with this fallback data.</span>
    <span class="kw">return</span> <span class="fn">recoverStep</span>({ <span class="prop">price</span>: <span class="kw">undefined</span>, <span class="op">...</span> });
  },
}</pre>
        </div>
      </Transition>
    </div>
  </div>
</template>
