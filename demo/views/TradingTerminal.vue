<script setup lang="ts">
import { ref, reactive, computed, nextTick } from "vue";
import { pipe, createRestClient } from "rest-pipeline-js";
import type { PipelineOrchestrator } from "rest-pipeline-js";
import { usePipelineRunVue } from "rest-pipeline-js/vue";

const SYMBOLS = ["AAPL", "TSLA", "NVDA", "MSFT", "BTC-USD", "ETH-USD"];

// ── Console log ──────────────────────────────────────────────────
interface ConsoleLine {
  id: number;
  text: string;
  kind: "info" | "success" | "error" | "warn";
  ts: number;
}
const consoleLines = ref<ConsoleLine[]>([]);
const consoleEl = ref<HTMLElement | null>(null);
let lineId = 0;
function addConsole(text: string, kind: ConsoleLine["kind"] = "info") {
  consoleLines.value.push({ id: ++lineId, text, kind, ts: Date.now() });
  if (consoleLines.value.length > 200) consoleLines.value.shift();
  nextTick(() => {
    if (consoleEl.value) consoleEl.value.scrollTop = consoleEl.value.scrollHeight;
  });
}

// ── Ticker state (driven by the WebSocket stage) ─────────────────
interface TickerState {
  symbol: string;
  price: number;
  prevPrice: number;
  direction: "up" | "down" | null;
  history: number[];
}
const tickers = reactive<Record<string, TickerState>>(
  Object.fromEntries(SYMBOLS.map((s) => [s, { symbol: s, price: 0, prevPrice: 0, direction: null, history: [] }])),
);

function sparklinePath(history: number[]): string {
  if (history.length < 2) return "";
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const step = w / (history.length - 1);
  return history
    .map((v, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(" ");
}

// ── Auth (AuthProvider) ───────────────────────────────────────────
let currentToken: string | null = null;
let currentTokenExpiry = 0;

async function fetchLoginToken(): Promise<{ token: string; expiresIn: number }> {
  const res = await fetch("/api/trading/auth/login", { method: "POST" });
  return res.json();
}

// ── Offline queue plumbing ────────────────────────────────────────
const isOnline = ref(true);
let notifyOnlineChange: (() => void) | null = null;

// ── Rate limit UI state ───────────────────────────────────────────
const rateLimitInfo = ref<{ remaining: number; limit: number; resetSec: number } | null>(null);
const throttled = ref(false);

const client = createRestClient({
  baseURL: "",
  timeout: 15000,
  auth: {
    getToken: async () => {
      if (currentToken && Date.now() < currentTokenExpiry) return currentToken;
      const { token, expiresIn } = await fetchLoginToken();
      currentToken = token;
      currentTokenExpiry = Date.now() + expiresIn * 1000;
      addConsole(`AuthProvider: obtained token (expires in ${expiresIn}s)`, "info");
      return token;
    },
    onUnauthorized: async () => {
      addConsole("AuthProvider: 401 received — invalidating cached token", "warn");
      currentToken = null;
    },
    tokenTtlMs: 12000,
  },
  rateLimit: {
    onRateLimitHeaders: (headers: Record<string, string>, control: { throttleFor: (ms: number) => void }) => {
      const remaining = Number(headers["x-ratelimit-remaining"]);
      const limit = Number(headers["x-ratelimit-limit"]);
      const resetSec = Number(headers["x-ratelimit-reset"]);
      if (Number.isFinite(remaining)) rateLimitInfo.value = { remaining, limit, resetSec };
      if (remaining === 0 && Number.isFinite(resetSec) && resetSec > 0) {
        throttled.value = true;
        control.throttleFor(resetSec * 1000);
        addConsole(`Rate limit exhausted — throttleFor(${resetSec}s) applied to future requests`, "warn");
        setTimeout(() => (throttled.value = false), resetSec * 1000);
      }
    },
  },
  offlineQueue: {
    enabled: true,
    persistAdapter: {
      save: (q: unknown) => localStorage.setItem("trading-demo-queue", JSON.stringify(q)),
      load: () => {
        const raw = localStorage.getItem("trading-demo-queue");
        return raw ? JSON.parse(raw) : null;
      },
    },
    isOnline: () => isOnline.value,
    onOnlineChange: (cb: () => void) => {
      notifyOnlineChange = cb;
    },
    shouldQueue: ({ method }: { method: string }) => method !== "GET",
    onFlushSuccess: (req: { id: string }) => addConsole(`Queued order flushed successfully: ${req.id}`, "success"),
    onFlushError: (req: { id: string }) => addConsole(`Queued order flush failed: ${req.id}`, "error"),
  },
  circuitBreaker: { failureThreshold: 3, openMs: 5000, successThreshold: 1 },
});

// ── WebSocket URL (relative to wherever the demo is served) ───────
function ticksUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/api/trading/ws/ticks?symbols=${SYMBOLS.join(",")}`;
}

// ── Pipeline: login check → parallel account data → live tick feed ─
const orchestrator: PipelineOrchestrator = pipe()
  .step({
    key: "login",
    request: async () => (await client.get("/api/trading/auth/me")).data,
  })
  .parallel(
    [
      { key: "positions", request: async () => (await client.get("/api/trading/positions")).data },
      ...SYMBOLS.slice(0, 3).map((symbol) => ({
        key: `quote:${symbol}`,
        request: async () => (await client.get(`/api/trading/quotes/${symbol}`)).data,
      })),
    ],
    { key: "account" },
  )
  .websocket<{ type: string; symbol: string; price: number }>({
    key: "ticks",
    url: () => ticksUrl(),
    onOpen: async () => addConsole("WebSocket connected — live ticks streaming", "success"),
    onMessage: (data) => JSON.parse(data as string),
    onChunk: (tick) => {
      const t = tickers[tick.symbol];
      if (!t) return;
      t.prevPrice = t.price || tick.price;
      t.direction = tick.price > t.prevPrice ? "up" : tick.price < t.prevPrice ? "down" : null;
      t.price = tick.price;
      t.history.push(tick.price);
      if (t.history.length > 30) t.history.shift();
    },
    onClose: async ({ wasClean }) => addConsole(wasClean ? "WebSocket closed" : "WebSocket closed uncleanly", wasClean ? "info" : "error"),
    onError: async () => addConsole("WebSocket error", "error"),
  })
  .build({ pipelineOptions: {} });

const { run: runPipeline, running, error, stageResults, abort } = usePipelineRunVue(orchestrator);

const connected = ref(false);
async function connect() {
  consoleLines.value = [];
  orchestrator.clearStageResults();
  connected.value = true;
  try {
    await runPipeline();
  } catch {
    /* surfaced via `error` */
  } finally {
    connected.value = false;
  }
}
function disconnect() {
  abort();
  connected.value = false;
}

// ── Orders (idempotency) ──────────────────────────────────────────
const lastOrder = ref<{ id: string; symbol: string; qty: number; side: string; price?: number } | null>(null);
let lastIdempotencyKey: string | null = null;
const placingOrder = ref(false);

async function placeOrder(symbol: string, side: "buy" | "sell") {
  placingOrder.value = true;
  lastIdempotencyKey = crypto.randomUUID();
  try {
    const res = await client.post(
      "/api/trading/orders",
      { symbol, qty: 1, side },
      { idempotencyKey: lastIdempotencyKey },
    );
    lastOrder.value = res.data as typeof lastOrder.value;
    addConsole(`Order filled: ${side} ${symbol} — id ${(res.data as any).id.slice(0, 8)}…`, "success");
  } catch (e: any) {
    addConsole(`Order failed: ${e?.message ?? e}`, "error");
  } finally {
    placingOrder.value = false;
  }
}

async function retryLastOrder() {
  if (!lastIdempotencyKey || !lastOrder.value) return;
  try {
    const res = await client.post(
      "/api/trading/orders",
      { symbol: lastOrder.value.symbol, qty: lastOrder.value.qty, side: lastOrder.value.side },
      { idempotencyKey: lastIdempotencyKey },
    );
    const sameId = (res.data as any).id === lastOrder.value.id;
    addConsole(
      sameId
        ? `Retry with same Idempotency-Key returned the SAME order id — no duplicate created`
        : `Unexpected: a new order id was returned`,
      sameId ? "success" : "error",
    );
  } catch (e: any) {
    addConsole(`Retry failed: ${e?.message ?? e}`, "error");
  }
}

async function toggleOffline() {
  isOnline.value = !isOnline.value;
  addConsole(isOnline.value ? "Back online — flushing queued orders" : "Simulating offline mode", isOnline.value ? "success" : "warn");
  if (isOnline.value) notifyOnlineChange?.();
}

const burstRunning = ref(false);
async function burstOrders() {
  burstRunning.value = true;
  try {
    // The rate-limit budget is a global counter shared with every other order
    // button on this page — reset it first so this demo is reproducible
    // regardless of what was clicked before.
    await fetch("/api/trading/rate-limit/reset", { method: "POST" });
    addConsole("Firing 6 rapid orders to exhaust the rate limit budget (5/10s)…", "info");
    for (let i = 0; i < 6; i++) {
      try {
        await client.post("/api/trading/orders", { symbol: "AAPL", qty: 1, side: "buy" }, { idempotencyKey: crypto.randomUUID() });
        addConsole(`Burst order ${i + 1}/6 — ok`, "success");
      } catch (e: any) {
        addConsole(`Burst order ${i + 1}/6 — ${e?.status === 429 ? "429 rate limited" : (e?.message ?? "failed")}`, "error");
      }
    }
  } finally {
    burstRunning.value = false;
  }
}

// ── Circuit breaker (broker outage) ───────────────────────────────
const breakerState = ref<"closed" | "open" | "half-open" | "unknown">("unknown");
const outageRunning = ref(false);
async function simulateOutage() {
  outageRunning.value = true;
  try {
    // Same reasoning as burstOrders() — start from a full rate-limit budget so
    // this always fails the way the copy below promises (3x 503, then
    // CIRCUIT_OPEN), not an unrelated 429 left over from other clicks.
    await fetch("/api/trading/rate-limit/reset", { method: "POST" });
    for (let i = 0; i < 4; i++) {
      try {
        await client.post("/api/trading/orders?failFirstN=3", { symbol: "TSLA", qty: 1, side: "sell" }, { idempotencyKey: crypto.randomUUID() });
        addConsole(`Outage test ${i + 1}/4 — succeeded`, "success");
      } catch (e: any) {
        addConsole(`Outage test ${i + 1}/4 — ${e?.code === "CIRCUIT_OPEN" ? "circuit OPEN, blocked locally" : (e?.message ?? "failed")}`, "error");
      }
    }
    breakerState.value = (await client.getCircuitBreakerState()) ?? "unknown";
  } finally {
    outageRunning.value = false;
  }
}
async function resetOutage() {
  await fetch("/api/trading/broker/reset", { method: "POST" });
  breakerState.value = "unknown";
}

const showCode = ref(false);
const positionsResult = computed(() => (stageResults.value as any)?.positions?.data?.positions ?? []);

// ── Stage flow metadata (login → parallel account data → live ticks) ─
const QUOTE_SYMBOLS = SYMBOLS.slice(0, 3);
function stageClass(key: string) {
  const status = (stageResults.value as any)[key]?.status;
  return {
    "stage-card--running": status === "pending",
    "stage-card--success": status === "success",
    "stage-card--error": status === "error",
  };
}
</script>

<template>
  <div>
    <div class="demo-header">
      <div class="demo-title"><span class="demo-icon">📈</span> Trading Terminal</div>
      <p class="demo-desc">
        A live trading dashboard: <code style="font-family:var(--font-mono);color:var(--cyan)">AuthProvider</code>
        login, a <strong style="color:var(--text)">WebSocket stage</strong> streaming live price ticks,
        idempotent order placement, real <code style="font-family:var(--font-mono);color:var(--cyan)">X-RateLimit-*</code>
        headers driving proactive throttling, an offline order queue, and a circuit breaker on the broker endpoint.
      </p>
      <div class="feature-tags">
        <span class="tag tag--cyan">.websocket()</span>
        <span class="tag tag--cyan">AuthProvider</span>
        <span class="tag tag--cyan">onRateLimitHeaders + throttleFor</span>
        <span class="tag tag--cyan">offlineQueue</span>
        <span class="tag tag--cyan">autoIdempotencyKey (manual key)</span>
        <span class="tag">circuitBreaker</span>
      </div>
    </div>

    <div class="demo-controls">
      <button class="btn btn--run" @click="connect" :disabled="running">
        <span class="btn__spinner" v-if="running"></span>
        <span v-else>▶</span>
        {{ running ? "Connected — streaming…" : "Connect" }}
      </button>
      <button class="btn btn--abort" v-if="running" @click="disconnect">✕ Disconnect</button>
      <div class="control-divider"></div>
      <button class="btn" :class="isOnline ? 'btn--secondary' : 'btn--pause'" @click="toggleOffline">
        {{ isOnline ? "🟢 Online" : "🔴 Offline (orders will queue)" }}
      </button>
    </div>

    <Transition name="slide-up">
      <div class="error-banner" v-if="error && !running">
        <span class="error-banner__icon">⚠</span>
        <div>
          <div class="error-banner__title">Connection stopped</div>
          <div class="error-banner__msg">{{ error?.message ?? String(error) }}</div>
        </div>
      </div>
    </Transition>

    <!-- ── Pipeline flow ────────────────────────────────────── -->
    <div class="pipeline-flow" v-if="connected || running">
      <div class="stage-wrap">
        <div class="stage-card" :class="stageClass('login')">
          <div class="stage-card__head"><div class="stage-dot"></div><span class="stage-card__key">login</span></div>
          <div class="stage-card__body"><div class="stage-card__desc">GET /auth/me (AuthProvider)</div></div>
        </div>
      </div>
      <div class="pipe-arrow">→</div>
      <div class="parallel-wrap">
        <div class="parallel-group">
          <div class="parallel-label">account (parallel)</div>
          <div class="parallel-stages">
            <div class="stage-card parallel-stage-card" :class="stageClass('positions')">
              <div class="stage-card__head"><div class="stage-dot"></div><span class="stage-card__key">positions</span></div>
            </div>
            <div class="stage-card parallel-stage-card" v-for="s in QUOTE_SYMBOLS" :key="s" :class="stageClass(`quote:${s}`)">
              <div class="stage-card__head"><div class="stage-dot"></div><span class="stage-card__key">quote:{{ s }}</span></div>
            </div>
          </div>
        </div>
      </div>
      <div class="pipe-arrow">→</div>
      <div class="stage-wrap">
        <div class="stage-card" :class="{ 'stage-card--running': running }">
          <div class="stage-card__head"><div class="stage-dot"></div><span class="stage-card__key">ticks (websocket)</span></div>
          <div class="stage-card__body"><div class="stage-card__desc">{{ running ? "streaming live — stays open until Disconnect" : "closed" }}</div></div>
        </div>
      </div>
    </div>

    <!-- ── Ticker grid ──────────────────────────────────────── -->
    <div class="result-grid">
      <div class="result-card" v-for="s in SYMBOLS" :key="s">
        <div class="result-card__head">{{ s }}</div>
        <div class="result-card__body" style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div class="ticker" :class="tickers[s].direction === 'up' ? 'ticker--up' : tickers[s].direction === 'down' ? 'ticker--down' : ''" style="font-size:20px">
              {{ tickers[s].price ? tickers[s].price.toFixed(2) : "—" }}
            </div>
          </div>
          <svg class="sparkline" width="80" height="24" viewBox="0 0 80 24" v-if="tickers[s].history.length > 1">
            <path :d="sparklinePath(tickers[s].history)" :stroke="tickers[s].direction === 'down' ? '#f87171' : '#4ade80'" />
          </svg>
        </div>
      </div>
    </div>

    <!-- ── Positions ────────────────────────────────────────── -->
    <div class="data-panel" v-if="positionsResult.length">
      <div class="data-panel__head">Positions</div>
      <div class="data-panel__body">
        <div class="req-log">
          <div class="req-log__row" v-for="p in positionsResult" :key="p.symbol">
            <span class="req-log__num">{{ p.symbol }}</span>
            <span class="req-log__url">qty {{ p.qty }}</span>
            <span class="req-log__dur">avg ${{ p.avgPrice.toFixed(2) }}</span>
            <span></span><span></span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Order controls ───────────────────────────────────── -->
    <div class="data-panel">
      <div class="data-panel__head">Order desk</div>
      <div class="data-panel__body">
        <div class="demo-controls" style="margin-bottom:8px">
          <button class="btn btn--run" @click="placeOrder('AAPL', 'buy')" :disabled="placingOrder">Buy 1 AAPL</button>
          <button class="btn btn--abort" @click="placeOrder('AAPL', 'sell')" :disabled="placingOrder">Sell 1 AAPL</button>
          <button class="btn btn--secondary" @click="retryLastOrder" :disabled="!lastOrder">🔁 Retry last order (same key)</button>
          <div class="control-divider"></div>
          <button class="btn btn--secondary" @click="burstOrders" :disabled="burstRunning">🔥 Burst 6 orders (rate limit)</button>
        </div>
        <div v-if="rateLimitInfo" style="font-size:12px;color:var(--text-sub);font-family:var(--font-mono)">
          X-RateLimit-Remaining: {{ rateLimitInfo.remaining }}/{{ rateLimitInfo.limit }}
          <span v-if="throttled" class="badge badge--warning" style="margin-left:8px">throttled</span>
        </div>
      </div>
    </div>

    <!-- ── Trade ticket ──────────────────────────────────────── -->
    <Transition name="fade">
      <div class="trade-ticket" v-if="lastOrder">
        <div class="trade-ticket__inner">
          <div class="trade-ticket__main">
            <div class="trade-ticket__symbol">{{ lastOrder.symbol }}</div>
            <div class="trade-ticket__side badge" :class="lastOrder.side === 'buy' ? 'badge--success' : 'badge--error'">{{ lastOrder.side.toUpperCase() }}</div>
          </div>
          <div class="trade-ticket__divider"></div>
          <div class="trade-ticket__details">
            <div><div class="bs-field__label">Qty</div><div class="bs-field__value">{{ lastOrder.qty }}</div></div>
            <div><div class="bs-field__label">Price</div><div class="bs-field__value">{{ lastOrder.price ?? "—" }}</div></div>
            <div><div class="bs-field__label">Order ID</div><div class="bs-field__value" style="font-size:12px">{{ lastOrder.id.slice(0, 8) }}…</div></div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── Console ──────────────────────────────────────────── -->
    <div class="data-panel" v-if="consoleLines.length">
      <div class="data-panel__head">
        <span>Event log</span>
        <span class="badge badge--neutral">{{ consoleLines.length }} lines</span>
      </div>
      <div class="data-panel__body" style="padding:10px">
        <div class="console" ref="consoleEl">
          <div v-for="line in consoleLines" :key="line.id" class="console__line" :class="`console__line--${line.kind}`">
            <span class="console__time">+{{ line.ts - (consoleLines[0]?.ts ?? line.ts) }}ms</span>
            <span class="console__text">{{ line.text }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Circuit breaker (broker outage) ──────────────────── -->
    <div class="data-panel">
      <div class="data-panel__head">
        <span>Broker outage simulation</span>
        <span
          class="badge"
          :class="{
            'badge--success': breakerState === 'closed',
            'badge--error': breakerState === 'open',
            'badge--warning': breakerState === 'half-open',
            'badge--neutral': breakerState === 'unknown',
          }"
        >{{ breakerState }}</span>
      </div>
      <div class="data-panel__body">
        <p style="font-size:12px;color:var(--text-sub);margin-bottom:12px">
          Fires 4 order attempts against a broker endpoint that fails the first 3 calls —
          <code style="font-family:var(--font-mono)">failureThreshold: 3</code> trips the breaker open before
          the 4th attempt even reaches the network.
        </p>
        <div class="demo-controls">
          <button class="btn btn--run" @click="simulateOutage" :disabled="outageRunning">Simulate Outage</button>
          <button class="btn btn--reset" @click="resetOutage">Reset</button>
        </div>
      </div>
    </div>

    <div class="empty-state" v-if="!connected && !running">
      <div style="font-size:36px;margin-bottom:12px">📈</div>
      <div>Click <strong>Connect</strong> to log in and start streaming live prices</div>
    </div>

    <div class="code-section" style="margin-top:20px">
      <button class="code-section__toggle" @click="showCode = !showCode">
        <span>▸ WebSocket stage + AuthProvider + offlineQueue</span>
        <span class="code-arrow" :class="{ 'code-arrow--open': showCode }">▶</span>
      </button>
      <Transition name="expand">
        <div v-if="showCode">
          <pre class="code-block"><span class="kw">const</span> client = <span class="fn">createRestClient</span>({
  <span class="prop">auth</span>: { <span class="prop">getToken</span>: <span class="kw">async</span> () <span class="op">=></span> (<span class="kw">await</span> <span class="fn">login</span>()).token, <span class="prop">tokenTtlMs</span>: <span class="num">12000</span> },
  <span class="prop">rateLimit</span>: { <span class="prop">onRateLimitHeaders</span>: (headers, control) <span class="op">=></span> {
    <span class="kw">if</span> (headers[<span class="str">"x-ratelimit-remaining"</span>] === <span class="str">"0"</span>) control.<span class="fn">throttleFor</span>(resetMs);
  }},
  <span class="prop">offlineQueue</span>: { <span class="prop">enabled</span>: <span class="kw">true</span>, <span class="prop">persistAdapter</span>, <span class="prop">isOnline</span>: () <span class="op">=></span> isOnline, <span class="prop">shouldQueue</span>: ({ method }) <span class="op">=></span> method !== <span class="str">"GET"</span> },
});

<span class="kw">const</span> orchestrator = <span class="fn">pipe</span>()
  .<span class="fn">step</span>({ <span class="prop">key</span>: <span class="str">"login"</span>, <span class="prop">request</span>: <span class="op">...</span> })
  .<span class="fn">parallel</span>([positionsStage, <span class="op">...</span>quoteStages], { <span class="prop">key</span>: <span class="str">"account"</span> })
  .<span class="fn">websocket</span>({
    <span class="prop">key</span>: <span class="str">"ticks"</span>,
    <span class="prop">url</span>: () <span class="op">=></span> <span class="str">`wss://${location.host}/api/trading/ws/ticks`</span>,
    <span class="prop">onMessage</span>: (data) <span class="op">=></span> JSON.<span class="fn">parse</span>(data),
    <span class="prop">onChunk</span>: (tick) <span class="op">=></span> <span class="fn">updateTicker</span>(tick),
  })
  .<span class="fn">build</span>();</pre>
        </div>
      </Transition>
    </div>
  </div>
</template>
