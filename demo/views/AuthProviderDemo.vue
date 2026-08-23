<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { createRestClient } from "rest-pipeline-js";

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

const ttlMs = ref(4000); // short TTL so expiry/refresh is visible quickly
let currentToken: string | null = null;
let currentExpiry = 0;
const tokenPreview = ref<string | null>(null);
const tokenExpiresInSec = ref<number | null>(null);
const running = ref(false);

// Live countdown so token expiry is visible without an artificial "expire
// now" click — watch the seconds tick down and the badge flip on its own.
const now = ref(Date.now());
const tickInterval = setInterval(() => {
  now.value = Date.now();
}, 250);
onUnmounted(() => clearInterval(tickInterval));
const secondsLeft = computed(() => {
  if (!currentToken) return null;
  return Math.max(0, Math.ceil((currentExpiry - now.value) / 1000));
});
const tokenValid = computed(() => (secondsLeft.value ?? 0) > 0);

const client = createRestClient({
  baseURL: "",
  timeout: 10000,
  auth: {
    getToken: async () => {
      if (currentToken && Date.now() < currentExpiry) {
        addLog(`getToken() — cache hit, reusing token (${Math.round((currentExpiry - Date.now()) / 1000)}s left)`);
        return currentToken;
      }
      addLog("getToken() — cache miss/expired, calling POST /api/trading/auth/login…", "warn");
      const res = await fetch(`/api/trading/auth/login?ttlMs=${ttlMs.value}`, { method: "POST" });
      const { token, expiresIn } = await res.json();
      currentToken = token;
      currentExpiry = Date.now() + expiresIn * 1000;
      tokenPreview.value = token.slice(0, 8) + "…";
      tokenExpiresInSec.value = expiresIn;
      addLog(`Got fresh token, expires in ${expiresIn}s`, "success");
      return token;
    },
    onUnauthorized: async () => {
      addLog("onUnauthorized() — 401 received, invalidating cached token", "error");
      currentToken = null;
    },
    tokenTtlMs: 0, // let the server's own expiry drive this demo, not a separate client-side TTL
  },
});

async function callMe() {
  running.value = true;
  addLog("→ GET /api/trading/auth/me");
  try {
    const res = await client.get("/api/trading/auth/me");
    addLog(`✓ 200 — ${JSON.stringify(res.data)}`, "success");
  } catch (e: any) {
    addLog(`✗ ${e?.status ?? ""} ${e?.message ?? e}`, "error");
  } finally {
    running.value = false;
  }
}

async function expireNow() {
  currentExpiry = 0; // force the next getToken() to treat the cache as stale
  addLog("Manually expired the cached token — next call will refresh", "warn");
}

async function forceUnauthorized() {
  // Deliberately poison the cache with a bogus token so the server 401s,
  // triggering onUnauthorized() → a fresh login → one automatic retry.
  currentToken = "invalid-token";
  currentExpiry = Date.now() + 60_000;
  await callMe();
}

const showCode = ref(false);
</script>

<template>
  <div>
    <div class="demo-header">
      <div class="demo-title"><span class="demo-icon">🔐</span> Auth Provider</div>
      <p class="demo-desc">
        <code style="font-family:var(--font-mono);color:var(--primary-light)">AuthProvider</code> against a real
        local auth endpoint: <code style="font-family:var(--font-mono)">getToken()</code> caches until expiry,
        a 401 triggers <code style="font-family:var(--font-mono)">onUnauthorized()</code> and one automatic retry
        with a fresh token — all visible in the event log below.
      </p>
      <div class="feature-tags">
        <span class="tag tag--primary">AuthProvider.getToken</span>
        <span class="tag tag--primary">onUnauthorized</span>
        <span class="tag tag--primary">401 → refresh → retry</span>
      </div>
    </div>

    <div class="data-panel">
      <div class="data-panel__head">Settings</div>
      <div class="data-panel__body">
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">
          Token TTL (server-side): <strong style="color:var(--primary-light);font-family:var(--font-mono)">{{ ttlMs }}ms</strong>
        </div>
        <input type="range" min="2000" max="10000" step="1000" v-model.number="ttlMs" style="accent-color:var(--primary);width:200px" />
      </div>
    </div>

    <div class="demo-controls">
      <button class="btn btn--run" @click="callMe" :disabled="running">GET /auth/me</button>
      <button class="btn btn--secondary" @click="expireNow">⏱ Expire token now</button>
      <button class="btn btn--abort" @click="forceUnauthorized">✕ Force 401 (poison token)</button>
    </div>

    <div class="result-grid">
      <div class="result-card">
        <div class="result-card__head" style="display:flex;align-items:center;justify-content:space-between">
          <span>Cached token</span>
          <span
            v-if="tokenPreview"
            class="badge"
            :class="tokenValid ? 'badge--success' : 'badge--error'"
          >{{ tokenValid ? "valid" : "expired" }}</span>
        </div>
        <div class="result-card__body">
          <div class="result-card__value" style="font-size:16px">{{ tokenPreview ?? "none yet" }}</div>
          <div class="result-card__sub" v-if="tokenExpiresInSec">
            <template v-if="tokenValid">expires in {{ secondsLeft }}s</template>
            <template v-else>expired — next call will refresh it</template>
          </div>
        </div>
      </div>
    </div>

    <div class="data-panel" v-if="log.length">
      <div class="data-panel__head">
        <span>Event log</span>
        <span class="badge badge--neutral">{{ log.length }} events</span>
      </div>
      <div class="data-panel__body" style="padding:10px">
        <div class="retry-log">
          <div v-for="e in log" :key="e.id" class="retry-entry" :class="e.kind === 'error' ? 'retry-entry--error' : e.kind === 'warn' ? 'retry-entry--wait' : e.kind === 'success' ? 'retry-entry--success' : ''">
            <span class="retry-entry__text">{{ e.text }}</span>
            <span class="retry-entry__time">+{{ e.ts - (log[0]?.ts ?? e.ts) }}ms</span>
          </div>
        </div>
      </div>
    </div>

    <div class="empty-state" v-if="!log.length">
      <div style="font-size:36px;margin-bottom:12px">🔐</div>
      <div>Click <strong>GET /auth/me</strong> to fetch a token, then try expiring it or forcing a 401</div>
    </div>

    <div class="code-section" style="margin-top:20px">
      <button class="code-section__toggle" @click="showCode = !showCode">
        <span>▸ AuthProvider configuration</span>
        <span class="code-arrow" :class="{ 'code-arrow--open': showCode }">▶</span>
      </button>
      <Transition name="expand">
        <div v-if="showCode">
          <pre class="code-block"><span class="kw">const</span> client = <span class="fn">createRestClient</span>({
  <span class="prop">auth</span>: {
    <span class="prop">getToken</span>: <span class="kw">async</span> () <span class="op">=></span> {
      <span class="kw">if</span> (cached &amp;&amp; !expired) <span class="kw">return</span> cached; <span class="cmt">// reused across requests</span>
      <span class="kw">const</span> { token, expiresIn } = <span class="kw">await</span> <span class="fn">login</span>();
      cached = token;
      <span class="kw">return</span> token;
    },
    <span class="prop">onUnauthorized</span>: <span class="kw">async</span> () <span class="op">=></span> { cached = <span class="kw">null</span>; }, <span class="cmt">// invalidate; next getToken() re-fetches</span>
  },
});

<span class="cmt">// On a 401: onUnauthorized() runs, the cache is invalidated,</span>
<span class="cmt">// then the request is retried exactly once with a fresh token.</span></pre>
        </div>
      </Transition>
    </div>
  </div>
</template>
