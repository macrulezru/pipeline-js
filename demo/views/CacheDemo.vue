<script setup lang="ts">
import { ref, computed } from "vue";
import { createRestClient } from "rest-pipeline-js";

const BASE = "https://macrulez-api.ru";

// ── Settings ─────────────────────────────────────────────────────
const cacheTtl       = ref(30000);
const maxConcurrent  = ref(2);
const maxPerInterval = ref(4);
const intervalMs     = ref(2000);
const burstCount     = ref(6);

// ── Request log ───────────────────────────────────────────────────
interface ReqEntry {
  id: number;
  url: string;
  status: "pending" | "success" | "error";
  cached: boolean;
  durationMs: number | null;
  startedAt: number;
  statusCode: number | null;
  bytes: number | null;
  group: "cache" | "rate";
}
const reqLog = ref<ReqEntry[]>([]);
let nextId = 1;

function addReq(url: string, group: ReqEntry["group"]): number {
  const id = nextId++;
  reqLog.value.push({
    id, url, status: "pending", cached: false,
    durationMs: null, startedAt: Date.now(),
    statusCode: null, bytes: null, group,
  });
  return id;
}
function resolveReq(id: number, patch: Partial<ReqEntry>) {
  const r = reqLog.value.find((x) => x.id === id);
  if (r) Object.assign(r, patch);
}

// ── Tracked request wrapper ───────────────────────────────────────
// Обёртка вместо metrics-коллбэков: rest-client создаёт разные объекты
// для onRequestStart и onRequestEnd, поэтому сохранить _demoId невозможно.
// Кроме того, кэш-хиты возвращаются до вызова _executeRequest — метрики
// там вообще не срабатывают.
async function trackedGet(
  client: ReturnType<typeof createRestClient>,
  path: string,
  group: ReqEntry["group"],
): Promise<void> {
  const id = addReq(path, group);
  const start = Date.now();
  try {
    const res = await client.get(path);
    const dur = Date.now() - start;
    let bytes: number | null = null;
    try { bytes = res.data ? JSON.stringify(res.data).length : null; } catch { /**/ }
    resolveReq(id, {
      status:    "success",
      durationMs: dur,
      statusCode: (res as any).status ?? 200,
      bytes,
      cached:    dur < 5,   // эвристика: < 5мс = ответ из памяти
    });
  } catch (e: any) {
    resolveReq(id, {
      status:    "error",
      durationMs: Date.now() - start,
      statusCode: e?.response?.status ?? null,
    });
  }
}

// ── Stats ─────────────────────────────────────────────────────────
const cacheHits    = computed(() => reqLog.value.filter((r) => r.cached  && r.group === "cache").length);
const cacheMisses  = computed(() => reqLog.value.filter((r) => !r.cached && r.group === "cache" && r.status === "success").length);
const cacheHitRate = computed(() => {
  const total = cacheHits.value + cacheMisses.value;
  return total > 0 ? Math.round((cacheHits.value / total) * 100) : 0;
});

const cacheSuccessReqs = computed(() => reqLog.value.filter((r) => r.group === "cache" && r.status === "success"));
const avgCached   = computed(() => {
  const hits = cacheSuccessReqs.value.filter((r) => r.cached);
  if (!hits.length) return null;
  return Math.round(hits.reduce((s, r) => s + (r.durationMs ?? 0), 0) / hits.length);
});
const avgUncached = computed(() => {
  const misses = cacheSuccessReqs.value.filter((r) => !r.cached);
  if (!misses.length) return null;
  return Math.round(misses.reduce((s, r) => s + (r.durationMs ?? 0), 0) / misses.length);
});

// ── Clients ───────────────────────────────────────────────────────
function buildCacheClient() {
  return createRestClient({
    baseURL: BASE,
    timeout: 15000,
    cache: { enabled: true, ttlMs: cacheTtl.value },
    sanitizeHeaders: true,
  });
}

function buildRateClient() {
  return createRestClient({
    baseURL: BASE,
    timeout: 15000,
    rateLimit: {
      maxConcurrent:          maxConcurrent.value,
      maxRequestsPerInterval: maxPerInterval.value,
      intervalMs:             intervalMs.value,
    },
  });
}

let cacheClient = buildCacheClient();
let rateClient  = buildRateClient();

// ── Cache demo ────────────────────────────────────────────────────
const cacheRunning = ref(false);
const cacheRound   = ref(0);
const CACHE_URL    = "/api/airlines/airports?limit=8";

async function runCacheRequest() {
  if (cacheRunning.value) return;
  cacheRunning.value = true;
  cacheRound.value++;
  try {
    await trackedGet(cacheClient, CACHE_URL, "cache");
  } finally {
    cacheRunning.value = false;
  }
}

async function runCacheBurst() {
  if (cacheRunning.value) return;
  cacheRunning.value = true;
  cacheRound.value++;
  // Запускаем 4 запроса почти одновременно.
  // addReq() внутри trackedGet() выполняется синхронно до первого await,
  // поэтому ID появляются в порядке 1→4, а затем все ждут сети.
  const promises: Promise<void>[] = [];
  for (let i = 0; i < 4; i++) {
    promises.push(trackedGet(cacheClient, CACHE_URL, "cache").catch(() => {}));
  }
  await Promise.allSettled(promises);
  cacheRunning.value = false;
}

function clearCacheAndLog() {
  cacheClient = buildCacheClient();
  reqLog.value = reqLog.value.filter((r) => r.group !== "cache");
  cacheRound.value = 0;
}

// ── Rate limit demo ───────────────────────────────────────────────
const rateRunning = ref(false);
const RATE_URL    = "/api/airlines/airports?limit=4";

async function runBurst() {
  if (rateRunning.value) return;
  rateRunning.value = true;
  rateClient = buildRateClient();
  reqLog.value = reqLog.value.filter((r) => r.group !== "rate");

  const promises: Promise<void>[] = [];
  for (let i = 0; i < burstCount.value; i++) {
    promises.push(trackedGet(rateClient, RATE_URL, "rate").catch(() => {}));
    // Крошечная задержка чтобы ID шли по порядку в логе
    // (все запросы всё равно уходят в лимитер одновременно)
    await new Promise((r) => setTimeout(r, 15));
  }
  await Promise.allSettled(promises);
  rateRunning.value = false;
}

// ── UI ────────────────────────────────────────────────────────────
const showCacheCode = ref(false);
const showRateCode  = ref(false);
const activeTab     = ref<"cache" | "rate">("cache");

function durColor(r: ReqEntry): string {
  if (r.status === "pending") return "var(--text-dim)";
  if (r.cached)               return "#a78bfa";
  if ((r.durationMs ?? 999) < 100) return "#4ade80";
  if ((r.durationMs ?? 999) < 500) return "#fbbf24";
  return "#f87171";
}

const cacheLog = computed(() => reqLog.value.filter((r) => r.group === "cache").slice().reverse());
const rateLog  = computed(() => reqLog.value.filter((r) => r.group === "rate").slice().reverse());
</script>

<template>
  <div>
    <!-- ── Header ──────────────────────────────────────────────── -->
    <div class="demo-header">
      <div class="demo-title">
        <span class="demo-icon">⚡</span>
        Cache &amp; Rate Limiting
      </div>
      <p class="demo-desc">
        <strong style="color:var(--text)">Cache:</strong> нажмите <em>Single Request</em>
        несколько раз — первый запрос идёт на сервер, последующие возвращаются из памяти
        за <span style="color:#a78bfa">&lt;5 мс</span>.
        <strong style="color:var(--text)">Rate limiter:</strong> отправьте пачку запросов
        и наблюдайте, как лимитер регулирует очередь.
        Оба механизма настраиваются в
        <code style="font-family:var(--font-mono);color:var(--primary-light);font-size:12px">createRestClient()</code>.
      </p>
      <div class="feature-tags">
        <span class="tag tag--primary">createRestClient</span>
        <span class="tag tag--primary">cache.ttlMs</span>
        <span class="tag tag--primary">rateLimit</span>
        <span class="tag">sanitizeHeaders</span>
      </div>
    </div>

    <!-- ── Tabs ────────────────────────────────────────────────── -->
    <div style="display:flex;gap:0;margin-bottom:20px;border-bottom:1px solid var(--border2)">
      <button
        v-for="tab in ['cache', 'rate'] as const"
        :key="tab"
        @click="activeTab = tab"
        :style="{
          padding: '8px 18px',
          border: 'none',
          background: 'none',
          fontFamily: 'inherit',
          fontSize: '13px',
          fontWeight: '600',
          cursor: 'pointer',
          color: activeTab === tab ? 'var(--text)' : 'var(--text-sub)',
          borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
          transition: 'all .15s',
          marginBottom: '-1px',
        }"
      >
        {{ tab === 'cache' ? '⚡ HTTP Cache' : '🚦 Rate Limiter' }}
      </button>
    </div>

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- Cache tab                                                  -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <div v-show="activeTab === 'cache'">
      <!-- Settings -->
      <div class="data-panel" style="margin-bottom:20px">
        <div class="data-panel__head">Cache settings</div>
        <div class="data-panel__body">
          <div style="display:flex;gap:32px;flex-wrap:wrap;align-items:flex-end">
            <div>
              <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">
                TTL:
                <strong style="color:var(--primary-light);font-family:var(--font-mono)">{{ cacheTtl / 1000 }}s</strong>
              </div>
              <input
                type="range" min="5000" max="120000" step="5000"
                v-model.number="cacheTtl"
                :disabled="cacheRunning"
                style="accent-color:var(--primary);width:160px"
              />
            </div>
            <div style="font-size:12px;color:var(--text-sub);line-height:1.8">
              Endpoint: <code style="font-family:var(--font-mono);color:var(--text);font-size:11px">{{ CACHE_URL }}</code><br/>
              Кэш сбрасывается кнопкой «Clear» или при изменении TTL.
            </div>
          </div>
        </div>
      </div>

      <!-- Controls -->
      <div class="demo-controls">
        <button class="btn btn--run" @click="runCacheRequest" :disabled="cacheRunning">
          <span class="btn__spinner" v-if="cacheRunning"></span>
          <span v-else>⚡</span>
          Single Request
        </button>
        <button class="btn btn--secondary" @click="runCacheBurst" :disabled="cacheRunning">
          ⚡⚡⚡ Burst × 4
        </button>
        <button class="btn btn--reset" @click="clearCacheAndLog" :disabled="cacheRunning">
          Clear cache &amp; log
        </button>
      </div>

      <!-- Stats -->
      <Transition name="fade">
        <div class="stats-row" v-if="cacheLog.length">
          <div class="stat-box">
            <div class="stat-box__label">Cache hits</div>
            <div class="stat-box__value" style="color:#a78bfa">{{ cacheHits }}</div>
            <div class="stat-box__sub">⚡ из памяти</div>
          </div>
          <div class="stat-box">
            <div class="stat-box__label">Cache misses</div>
            <div class="stat-box__value" style="color:#60a5fa">{{ cacheMisses }}</div>
            <div class="stat-box__sub">🌐 на сервер</div>
          </div>
          <div class="stat-box">
            <div class="stat-box__label">Hit rate</div>
            <div class="stat-box__value" :style="{ color: cacheHitRate > 50 ? '#4ade80' : '#fbbf24' }">
              {{ cacheHitRate }}%
            </div>
            <div class="stat-box__sub">от успешных</div>
          </div>
          <div class="stat-box" v-if="avgUncached !== null">
            <div class="stat-box__label">Speedup</div>
            <div class="stat-box__value" style="color:#4ade80">
              {{ avgCached !== null && avgUncached ? `${Math.round(avgUncached / Math.max(avgCached, 1))}×` : '—' }}
            </div>
            <div class="stat-box__sub">
              сервер: {{ avgUncached }}мс
              <template v-if="avgCached !== null"> · кэш: {{ avgCached }}мс</template>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Request log -->
      <div class="data-panel" v-if="cacheLog.length">
        <div class="data-panel__head">
          <span>Request log</span>
          <span class="badge badge--neutral">{{ cacheLog.length }} запросов</span>
        </div>
        <div>
          <div class="req-log">
            <div class="req-log__head">
              <span>#</span>
              <span>URL</span>
              <span style="text-align:right">Duration</span>
              <span style="text-align:center">Source</span>
              <span style="text-align:right">Status</span>
            </div>
            <div
              v-for="r in cacheLog"
              :key="r.id"
              class="req-log__row"
            >
              <span class="req-log__num">{{ r.id }}</span>
              <span class="req-log__url" :title="r.url">{{ r.url }}</span>
              <span class="req-log__dur" :style="{ color: durColor(r) }">
                <template v-if="r.status === 'pending'">
                  <span style="animation:blink 1s infinite;display:inline-block">…</span>
                </template>
                <template v-else>{{ r.durationMs !== null ? r.durationMs + 'ms' : '—' }}</template>
              </span>
              <span class="req-log__src">
                <span v-if="r.status === 'pending'"  class="badge badge--running" style="font-size:10px">fetching</span>
                <span v-else-if="r.cached"           class="badge badge--purple"  style="font-size:10px">⚡ cache</span>
                <span v-else-if="r.status==='success'" class="badge badge--running" style="font-size:10px">🌐 server</span>
                <span v-else                         class="badge badge--error"   style="font-size:10px">error</span>
              </span>
              <span class="req-log__stat">
                <span v-if="r.status === 'success'" class="badge badge--success" style="font-size:10px">{{ r.statusCode ?? 200 }}</span>
                <span v-else-if="r.status === 'error'" class="badge badge--error" style="font-size:10px">error</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div class="empty-state" v-else>
        <div style="font-size:36px;margin-bottom:12px">⚡</div>
        <div>Нажмите <strong>Single Request</strong>, потом нажмите ещё раз</div>
        <div style="font-size:12px;color:var(--text-dim);margin-top:6px">
          Второй запрос вернётся из кэша за &lt;5мс
        </div>
      </div>

      <!-- Code snippet -->
      <div class="code-section" style="margin-top:20px">
        <button class="code-section__toggle" @click="showCacheCode = !showCacheCode">
          <span>▸ Cache configuration</span>
          <span class="code-arrow" :class="{ 'code-arrow--open': showCacheCode }">▶</span>
        </button>
        <Transition name="expand">
          <div v-if="showCacheCode">
            <pre class="code-block"><span class="kw">import</span> { createRestClient } <span class="kw">from</span> <span class="str">"rest-pipeline-js"</span>;

<span class="kw">const</span> client = <span class="fn">createRestClient</span>({
  <span class="prop">baseURL</span>: <span class="str">"https://macrulez-api.ru"</span>,
  <span class="prop">timeout</span>: <span class="num">15000</span>,

  <span class="prop">cache</span>: {
    <span class="prop">enabled</span>: <span class="kw">true</span>,
    <span class="prop">ttlMs</span>:   <span class="num">30000</span>,  <span class="cmt">// кэшировать GET-ответы 30 секунд</span>
  },

  <span class="prop">sanitizeHeaders</span>: <span class="kw">true</span>,  <span class="cmt">// маскировать Authorization, cookie в логах</span>
});

<span class="cmt">// Запрос 1 → сервер   ~200мс</span>
<span class="kw">await</span> client.<span class="fn">get</span>(<span class="str">"/api/airlines/airports?limit=8"</span>);

<span class="cmt">// Запрос 2 → кэш      &lt;2мс  (в пределах TTL)</span>
<span class="kw">await</span> client.<span class="fn">get</span>(<span class="str">"/api/airlines/airports?limit=8"</span>);

<span class="cmt">// Переопределение TTL и ключа на уровне запроса:</span>
<span class="kw">await</span> client.<span class="fn">get</span>(<span class="str">"/api/data"</span>, {
  <span class="prop">useCache</span>:   <span class="kw">true</span>,
  <span class="prop">cacheTtlMs</span>: <span class="num">5000</span>,
  <span class="prop">cacheKey</span>:   <span class="str">"my-data"</span>,
});

<span class="cmt">// Сбросить кэш:</span>
client.<span class="fn">clearCache</span>();</pre>
          </div>
        </Transition>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- Rate limit tab                                             -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <div v-show="activeTab === 'rate'">
      <!-- Settings -->
      <div class="data-panel" style="margin-bottom:20px">
        <div class="data-panel__head">Rate limit settings</div>
        <div class="data-panel__body">
          <div style="display:flex;gap:32px;flex-wrap:wrap;align-items:flex-end">
            <div>
              <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">
                Max concurrent:
                <strong style="color:var(--primary-light);font-family:var(--font-mono)">{{ maxConcurrent }}</strong>
              </div>
              <input type="range" min="1" max="5" v-model.number="maxConcurrent"
                :disabled="rateRunning" style="accent-color:var(--primary);width:130px" />
            </div>
            <div>
              <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">
                Max req / interval:
                <strong style="color:var(--primary-light);font-family:var(--font-mono)">{{ maxPerInterval }}</strong>
              </div>
              <input type="range" min="2" max="10" v-model.number="maxPerInterval"
                :disabled="rateRunning" style="accent-color:var(--primary);width:130px" />
            </div>
            <div>
              <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">
                Interval:
                <strong style="color:var(--primary-light);font-family:var(--font-mono)">{{ intervalMs / 1000 }}s</strong>
              </div>
              <input type="range" min="1000" max="5000" step="500" v-model.number="intervalMs"
                :disabled="rateRunning" style="accent-color:var(--primary);width:130px" />
            </div>
            <div>
              <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">
                Burst size:
                <strong style="color:var(--primary-light);font-family:var(--font-mono)">{{ burstCount }}</strong>
              </div>
              <input type="range" min="3" max="12" v-model.number="burstCount"
                :disabled="rateRunning" style="accent-color:var(--primary);width:130px" />
            </div>
          </div>
          <div style="margin-top:12px;font-size:12px;color:var(--text-sub)">
            Config: max
            <span class="badge badge--purple">{{ maxConcurrent }} concurrent</span>
            ·
            <span class="badge badge--running">{{ maxPerInterval }} per {{ intervalMs / 1000 }}s</span>
            · Запускаем
            <span class="badge badge--warning">{{ burstCount }} запросов</span>
            одновременно
          </div>
        </div>
      </div>

      <!-- Controls -->
      <div class="demo-controls">
        <button class="btn btn--run" @click="runBurst" :disabled="rateRunning">
          <span class="btn__spinner" v-if="rateRunning"></span>
          <span v-else>🚦</span>
          Fire {{ burstCount }} requests
        </button>
      </div>

      <!-- Stats -->
      <Transition name="fade">
        <div class="stats-row" v-if="rateLog.length">
          <div class="stat-box">
            <div class="stat-box__label">Total</div>
            <div class="stat-box__value">{{ rateLog.length }}</div>
            <div class="stat-box__sub">запущено</div>
          </div>
          <div class="stat-box">
            <div class="stat-box__label">Completed</div>
            <div class="stat-box__value" style="color:#4ade80">
              {{ rateLog.filter(r => r.status === 'success').length }}
            </div>
            <div class="stat-box__sub">из {{ rateLog.length }}</div>
          </div>
          <div class="stat-box">
            <div class="stat-box__label">Pending</div>
            <div class="stat-box__value" style="color:#fbbf24">
              {{ rateLog.filter(r => r.status === 'pending').length }}
            </div>
            <div class="stat-box__sub">в очереди / выполняются</div>
          </div>
          <div class="stat-box">
            <div class="stat-box__label">Avg duration</div>
            <div class="stat-box__value">
              {{ (() => {
                const d = rateLog.filter(r => r.durationMs !== null);
                return d.length
                  ? Math.round(d.reduce((s, r) => s + r.durationMs!, 0) / d.length) + 'ms'
                  : '—';
              })() }}
            </div>
            <div class="stat-box__sub">включая ожидание в очереди</div>
          </div>
        </div>
      </Transition>

      <!-- Request log -->
      <div class="data-panel" v-if="rateLog.length">
        <div class="data-panel__head">
          <span>Request log</span>
          <span class="badge badge--neutral">{{ rateLog.length }} запросов</span>
        </div>
        <div>
          <div class="req-log">
            <div class="req-log__head">
              <span>#</span>
              <span>URL</span>
              <span style="text-align:right">Duration</span>
              <span style="text-align:center">State</span>
              <span style="text-align:right">Status</span>
            </div>
            <div
              v-for="r in rateLog"
              :key="r.id"
              class="req-log__row"
            >
              <span class="req-log__num">{{ r.id }}</span>
              <span class="req-log__url">{{ r.url }}</span>
              <span class="req-log__dur" :style="{ color: durColor(r) }">
                <template v-if="r.status === 'pending'">
                  <span style="animation:blink 1s infinite;display:inline-block">…</span>
                </template>
                <template v-else>{{ r.durationMs !== null ? r.durationMs + 'ms' : '—' }}</template>
              </span>
              <span class="req-log__src">
                <span v-if="r.status === 'pending'"    class="badge badge--running" style="font-size:10px">queued</span>
                <span v-else-if="r.status === 'success'" class="badge badge--success" style="font-size:10px">done</span>
                <span v-else                           class="badge badge--error"   style="font-size:10px">error</span>
              </span>
              <span class="req-log__stat">
                <span v-if="r.statusCode" class="badge badge--neutral" style="font-size:10px">{{ r.statusCode }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div class="empty-state" v-else>
        <div style="font-size:36px;margin-bottom:12px">🚦</div>
        <div>Нажмите <strong>Fire {{ burstCount }} requests</strong></div>
        <div style="font-size:12px;color:var(--text-dim);margin-top:6px">
          Запросы сверх лимита concurrency ставятся в очередь и уходят когда освобождается слот
        </div>
      </div>

      <!-- Code snippet -->
      <div class="code-section" style="margin-top:20px">
        <button class="code-section__toggle" @click="showRateCode = !showRateCode">
          <span>▸ Rate limiting configuration</span>
          <span class="code-arrow" :class="{ 'code-arrow--open': showRateCode }">▶</span>
        </button>
        <Transition name="expand">
          <div v-if="showRateCode">
            <pre class="code-block"><span class="kw">const</span> client = <span class="fn">createRestClient</span>({
  <span class="prop">baseURL</span>: <span class="str">"https://macrulez-api.ru"</span>,

  <span class="prop">rateLimit</span>: {
    <span class="prop">maxConcurrent</span>:         <span class="num">2</span>,    <span class="cmt">// max 2 запроса одновременно</span>
    <span class="prop">maxRequestsPerInterval</span>: <span class="num">4</span>,    <span class="cmt">// max 4 запроса за интервал</span>
    <span class="prop">intervalMs</span>:             <span class="num">2000</span>, <span class="cmt">// интервал = 2 секунды</span>
  },
});

<span class="cmt">// Запускаем 8 запросов одновременно:</span>
<span class="kw">const</span> results = <span class="kw">await</span> Promise.<span class="fn">allSettled</span>(
  Array.<span class="fn">from</span>({ length: <span class="num">8</span> }, () <span class="op">=></span>
    client.<span class="fn">get</span>(<span class="str">"/api/airlines/airports?limit=4"</span>)
  )
);
<span class="cmt">// Запросы 1-2: стартуют немедленно (maxConcurrent=2)</span>
<span class="cmt">// Запросы 3-4: ждут в очереди, стартуют когда 1-2 завершатся</span>
<span class="cmt">// Запросы 5-8: ждут следующего интервала (через 2s)</span>
<span class="cmt">// Все запросы завершаются успешно — просто с задержкой</span></pre>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>
