<script setup lang="ts">
import { ref, computed, reactive } from "vue";
import { PipelineOrchestrator } from "rest-pipeline-js";
import { usePipelineRunVue } from "rest-pipeline-js/vue";

const BASE = "https://macrulez-api.ru";

// ── API helpers ─────────────────────────────────────────────────────

/** Для endpoint'ов типа routes/stats: { success, data: {...объект...} } */
async function apiGet(path: string) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
  const json = await res.json();
  return json.data ?? json;
}

/**
 * Для пагинируемых списков: { success, data: [...], pagination: { total, page, limit } }
 * Возвращает { total, items } напрямую из корня ответа.
 */
async function apiGetList(path: string): Promise<{ total: number; items: any[] }> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
  const json = await res.json();
  return {
    total: json.pagination?.total ?? json.total ?? (json.data?.length ?? 0),
    items: Array.isArray(json.data) ? json.data : [],
  };
}

// ── Stage timing ───────────────────────────────────────────────────
const timings = reactive<Record<string, number>>({});
const starts  = reactive<Record<string, number>>({});
// track when parallel group starts / last ends
let pStart = 0, pEnd = 0;

// ── Build orchestrator ─────────────────────────────────────────────
function buildOrch() {
  pStart = 0; pEnd = 0;
  Object.keys(timings).forEach((k) => delete timings[k]);
  Object.keys(starts).forEach((k)  => delete starts[k]);

  return new PipelineOrchestrator({
    config: {
      stages: [
        // ── Stage 1: sequential ──────────────────────────────────
        {
          key: "init",
          request: async () => {
            const { total } = await apiGetList("/api/airlines/airports?limit=1");
            return { total };
          },
          pauseAfter: 300,
        },

        // ── Stage 2: parallel group ──────────────────────────────
        {
          key: "load_data",
          parallel: [
            {
              key: "airports",
              request: async () => {
                const { total, items } = await apiGetList("/api/airlines/airports?limit=12");
                return { total, items: items.slice(0, 6) };
              },
            },
            {
              key: "carriers",
              request: async () => {
                const { total, items } = await apiGetList("/api/airlines/carriers?limit=12");
                return { total, items: items.slice(0, 6) };
              },
            },
            {
              key: "routes",
              request: async () => {
                // returns { total_routes, airlines, dep_airports, arr_airports, ... }
                const data = await apiGet("/api/airlines/routes/stats");
                return {
                  total_routes:  data.total_routes  ?? 0,
                  airlines:      data.airlines      ?? 0,
                  dep_airports:  data.dep_airports  ?? 0,
                  arr_airports:  data.arr_airports  ?? 0,
                };
              },
            },
          ],
        },

        // ── Stage 3: sequential ──────────────────────────────────
        {
          key: "summary",
          request: async ({ allResults }: any) => {
            // allResults[key] = PipelineStepResult = { status, data, error }
            // Данные лежат в .data — это обёртка оркестратора
            const a = allResults.airports?.data ?? {};
            const c = allResults.carriers?.data ?? {};
            const r = allResults.routes?.data   ?? {};
            return {
              airports:    a.total         ?? "—",
              carriers:    c.total         ?? "—",
              total_routes: r.total_routes ?? "—",
              airlines:     r.airlines      ?? "—",
              dep_airports: r.dep_airports ?? "—",
              arr_airports: r.arr_airports ?? "—",
              parallelMs:   pEnd > pStart ? pEnd - pStart : null,
              builtAt:     new Date().toISOString(),
            };
          },
        },
      ],

      middleware: {
        beforeEach: ({ stage }: any) => {
          starts[stage.key] = Date.now();
          if (["airports", "carriers", "routes"].includes(stage.key)) {
            if (!pStart) pStart = Date.now();
          }
        },
        afterEach: ({ stage }: any) => {
          timings[stage.key] = Date.now() - (starts[stage.key] ?? Date.now());
          if (["airports", "carriers", "routes"].includes(stage.key)) {
            pEnd = Date.now();
          }
        },
        onError: ({ stage }: any) => {
          timings[stage.key] = Date.now() - (starts[stage.key] ?? Date.now());
        },
      },
    },
    httpConfig: { baseURL: BASE, timeout: 20000 },
  });
}

let orchestrator = buildOrch();
const { run, running, error, stageResults, abort } = usePipelineRunVue(orchestrator);

// ── Status helper ──────────────────────────────────────────────────
// stageResults[key] = { status: "success"|"error"|"pending", data, error }
function getStatus(key: string): string {
  if (!started.value || resetting.value) return "idle";
  const r = (stageResults.value as any)?.[key];
  return r?.status ?? "idle";
}

function getDuration(key: string): string {
  const ms = timings[key];
  if (!ms) return "";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// ── All visible stage keys ─────────────────────────────────────────
const SEQ_BEFORE  = [{ key: "init",    label: "init",    desc: "Fetch total airports count" }];
const PARALLEL    = [
  { key: "airports", label: "airports", desc: "GET /api/airlines/airports" },
  { key: "carriers", label: "carriers", desc: "GET /api/airlines/carriers" },
  { key: "routes",   label: "routes",   desc: "GET /api/airlines/routes/stats" },
];
const SEQ_AFTER   = [{ key: "summary", label: "summary", desc: "Aggregate all results" }];
const ALL_KEYS    = ["init", "airports", "carriers", "routes", "summary"];

const completedCount = computed(() =>
  ALL_KEYS.filter((k) => ["success", "error"].includes(getStatus(k))).length
);
const progressPct = computed(() =>
  resetting.value ? 0 : Math.round((completedCount.value / ALL_KEYS.length) * 100)
);
const allDone = computed(() =>
  !resetting.value && started.value &&
  ALL_KEYS.every((k) => getStatus(k) === "success")
);
const displayError = computed(() => {
  if (error.value) return (error.value as any)?.message ?? String(error.value);
  if (!stageResults.value) return null;
  for (const k of ALL_KEYS) {
    const r = (stageResults.value as any)[k];
    if (r?.status === "error") return r.error?.message ?? `Stage "${k}" failed`;
  }
  return null;
});

const summaryData = computed(() =>
  allDone.value ? (stageResults.value as any)?.summary?.data ?? null : null
);

// ── Actions ────────────────────────────────────────────────────────
const resetting = ref(false);
const started   = ref(false);
const showCode  = ref(false);

async function startPipeline() {
  resetting.value = true;
  orchestrator.clearStageResults();
  // reset timing state for clean re-run
  pStart = 0; pEnd = 0;
  Object.keys(timings).forEach((k) => delete timings[k]);
  Object.keys(starts).forEach((k)  => delete starts[k]);
  await new Promise((r) => setTimeout(r, 120));
  resetting.value = false;
  started.value   = true;
  run();
}
</script>

<template>
  <div>
    <!-- ── Header ──────────────────────────────────────────────── -->
    <div class="demo-header">
      <div class="demo-title">
        <span class="demo-icon">🔀</span>
        Parallel Data Loading
      </div>
      <p class="demo-desc">
        Three API sources — airports, airlines, and route statistics — are queried
        <strong style="color:var(--text)">simultaneously</strong> inside a
        <code style="font-family:var(--font-mono);color:var(--primary-light);font-size:12px">parallel</code>
        group. The timing breakdown shows the speedup compared to running them
        sequentially. All results are aggregated in the final
        <code style="font-family:var(--font-mono);color:var(--primary-light);font-size:12px">summary</code> stage via
        <code style="font-family:var(--font-mono);color:var(--primary-light);font-size:12px">allResults</code>.
      </p>
      <div class="feature-tags">
        <span class="tag tag--primary">PipelineOrchestrator</span>
        <span class="tag tag--primary">parallel stages</span>
        <span class="tag tag--primary">Promise.all</span>
        <span class="tag">middleware.beforeEach / afterEach</span>
        <span class="tag">allResults</span>
      </div>
    </div>

    <!-- ── Controls ───────────────────────────────────────────── -->
    <div class="demo-controls">
      <button class="btn btn--run" @click="startPipeline" :disabled="running">
        <span class="btn__spinner" v-if="running"></span>
        <span v-else>▶</span>
        {{ running ? "Running…" : started ? "Run Again" : "Run Pipeline" }}
      </button>
      <button class="btn btn--abort" v-if="running" @click="abort()">✕ Abort</button>
    </div>

    <!-- ── Progress ────────────────────────────────────────────── -->
    <Transition name="slide-up">
      <div class="progress-wrap" v-if="started && !resetting">
        <div class="progress-bar">
          <div class="progress-bar__fill" :style="{ width: progressPct + '%' }"></div>
        </div>
        <span class="progress-pct">{{ progressPct }}%</span>
      </div>
    </Transition>

    <!-- ── Error ───────────────────────────────────────────────── -->
    <Transition name="slide-up">
      <div class="error-banner" v-if="displayError">
        <span class="error-banner__icon">⚠</span>
        <div>
          <div class="error-banner__title">Pipeline failed</div>
          <div class="error-banner__msg">{{ displayError }}</div>
        </div>
      </div>
    </Transition>

    <!-- ── Pipeline flow ───────────────────────────────────────── -->
    <div class="pipeline-flow" v-if="started && !resetting">
      <!-- init -->
      <div
        v-for="s in SEQ_BEFORE"
        :key="s.key"
        class="stage-wrap"
      >
        <div
          class="stage-card"
          :class="{
            'stage-card--running': getStatus(s.key) === 'pending',
            'stage-card--success': getStatus(s.key) === 'success',
            'stage-card--error':   getStatus(s.key) === 'error',
          }"
        >
          <div class="stage-card__head">
            <div class="stage-dot"></div>
            <span class="stage-card__key">{{ s.label }}</span>
            <span class="stage-card__dur">{{ getDuration(s.key) }}</span>
          </div>
          <div class="stage-card__body">
            <div class="stage-card__desc">{{ s.desc }}</div>
            <Transition name="slide-up">
              <div class="stage-card__result" v-if="getStatus(s.key) === 'success'">
                total: {{ (stageResults as any)?.[s.key]?.data?.total ?? "—" }} airports
              </div>
            </Transition>
          </div>
        </div>
      </div>

      <div class="pipe-arrow">→</div>

      <!-- parallel group -->
      <div class="parallel-wrap">
        <div class="parallel-group">
          <div class="parallel-label">parallel</div>
          <div class="parallel-stages">
            <div
              v-for="ps in PARALLEL"
              :key="ps.key"
              class="stage-card parallel-stage-card"
              :class="{
                'stage-card--running': getStatus(ps.key) === 'pending',
                'stage-card--success': getStatus(ps.key) === 'success',
                'stage-card--error':   getStatus(ps.key) === 'error',
              }"
            >
              <div class="stage-card__head">
                <div class="stage-dot"></div>
                <span class="stage-card__key">{{ ps.label }}</span>
                <span class="stage-card__dur">{{ getDuration(ps.key) }}</span>
              </div>
              <div class="stage-card__body" style="padding:8px 12px">
                <div class="stage-card__desc" style="font-size:11px">{{ ps.desc }}</div>
                <Transition name="slide-up">
                  <div class="stage-card__result" v-if="getStatus(ps.key) === 'success'">
                    <template v-if="ps.key === 'airports'">
                      total: {{ (stageResults as any)?.airports?.data?.total ?? "—" }}
                    </template>
                    <template v-else-if="ps.key === 'carriers'">
                      total: {{ (stageResults as any)?.carriers?.data?.total ?? "—" }}
                    </template>
                    <template v-else-if="ps.key === 'routes'">
                      {{ (stageResults as any)?.routes?.data?.total_routes?.toLocaleString() ?? "—" }} routes
                    </template>
                  </div>
                </Transition>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="pipe-arrow">→</div>

      <!-- summary -->
      <div
        v-for="s in SEQ_AFTER"
        :key="s.key"
        class="stage-wrap"
      >
        <div
          class="stage-card"
          :class="{
            'stage-card--running': getStatus(s.key) === 'pending',
            'stage-card--success': getStatus(s.key) === 'success',
            'stage-card--error':   getStatus(s.key) === 'error',
          }"
        >
          <div class="stage-card__head">
            <div class="stage-dot"></div>
            <span class="stage-card__key">{{ s.label }}</span>
            <span class="stage-card__dur">{{ getDuration(s.key) }}</span>
          </div>
          <div class="stage-card__body">
            <div class="stage-card__desc">{{ s.desc }}</div>
            <Transition name="slide-up">
              <div class="stage-card__result" v-if="getStatus(s.key) === 'success'">✓ merged</div>
            </Transition>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Results Dashboard ────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="allDone && summaryData">
        <div class="section-title" style="margin-bottom:14px">Dashboard — aggregated results</div>

        <div class="result-grid">
          <div class="result-card">
            <div class="result-card__head">🛬 Airports</div>
            <div class="result-card__body">
              <div class="result-card__label">Total in database</div>
              <div class="result-card__value result-card__value--blue">
                {{ Number(summaryData.airports).toLocaleString() }}
              </div>
              <div class="result-card__sub">/api/airlines/airports</div>
            </div>
          </div>

          <div class="result-card">
            <div class="result-card__head">✈️ Airlines</div>
            <div class="result-card__body">
              <div class="result-card__label">Total carriers</div>
              <div class="result-card__value result-card__value--accent">
                {{ Number(summaryData.carriers).toLocaleString() }}
              </div>
              <div class="result-card__sub">/api/airlines/carriers</div>
            </div>
          </div>

          <div class="result-card">
            <div class="result-card__head">🗺️ Routes</div>
            <div class="result-card__body">
              <div class="result-card__label">Total routes</div>
              <div class="result-card__value result-card__value--success">
                {{ Number(summaryData.total_routes).toLocaleString() }}
              </div>
              <div class="result-card__sub">/api/airlines/routes/stats</div>
            </div>
          </div>

          <div class="result-card" v-if="summaryData.parallelMs">
            <div class="result-card__head">⚡ Parallel speedup</div>
            <div class="result-card__body">
              <div class="result-card__label">3 requests in</div>
              <div class="result-card__value">{{ summaryData.parallelMs }}ms</div>
              <div class="result-card__sub" style="color:#4ade80">
                vs ~{{ Math.round(summaryData.parallelMs * 3 / 1000 * 10) / 10 }}s sequential estimate
              </div>
            </div>
          </div>
        </div>

        <!-- Extra stats from routes -->
        <div class="data-panel" v-if="summaryData.airlines">
          <div class="data-panel__head">Route network statistics</div>
          <div class="data-panel__body">
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px">
              <div v-for="(label, field) in {
                airlines:     'Airlines with routes',
                dep_airports: 'Departure airports',
                arr_airports: 'Arrival airports',
              }" :key="field">
                <div style="font-size:11px;color:var(--text-dim);margin-bottom:3px">{{ label }}</div>
                <div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:var(--text)">
                  {{ Number(summaryData[field]).toLocaleString() }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Timing breakdown -->
        <div class="data-panel">
          <div class="data-panel__head">Stage timing breakdown</div>
          <div class="data-panel__body">
            <div style="display:flex;flex-direction:column;gap:10px">
              <div
                v-for="key in ALL_KEYS"
                :key="key"
                style="display:flex;align-items:center;gap:12px"
              >
                <div style="width:80px;font-family:var(--font-mono);font-size:12px;color:var(--text-sub);text-align:right;flex-shrink:0">
                  {{ key }}
                </div>
                <div style="flex:1;height:20px;background:var(--surface2);border-radius:4px;overflow:hidden">
                  <div :style="{
                    width: timings[key] && Object.values(timings).length
                      ? Math.min(100, (timings[key] / Math.max(...Object.values(timings).filter(Boolean))) * 100) + '%'
                      : '0%',
                    height: '100%',
                    background: ['airports','carriers','routes'].includes(key) ? 'var(--primary)' : 'var(--blue)',
                    borderRadius: '4px',
                    transition: 'width .6s ease',
                  }"></div>
                </div>
                <div style="width:52px;font-family:var(--font-mono);font-size:11px;color:var(--text-dim);flex-shrink:0">
                  {{ getDuration(key) }}
                </div>
                <span
                  v-if="['airports','carriers','routes'].includes(key)"
                  class="badge badge--purple"
                  style="font-size:10px;flex-shrink:0"
                >parallel</span>
                <span v-else style="width:56px"></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── Empty state ─────────────────────────────────────────── -->
    <div class="empty-state" v-if="!started">
      <div style="font-size:36px;margin-bottom:12px">🔀</div>
      <div>Click <strong>Run Pipeline</strong> to load data from 3 sources in parallel</div>
      <div style="font-size:12px;color:var(--text-dim);margin-top:6px">
        macrulez-api.ru — airports, carriers, routes/stats
      </div>
    </div>

    <!-- ── Code snippet ────────────────────────────────────────── -->
    <div class="code-section" style="margin-top:20px">
      <button class="code-section__toggle" @click="showCode = !showCode">
        <span>▸ Pipeline configuration — parallel stages</span>
        <span class="code-arrow" :class="{ 'code-arrow--open': showCode }">▶</span>
      </button>
      <Transition name="expand">
        <div v-if="showCode">
          <pre class="code-block"><span class="kw">const</span> orchestrator = <span class="kw">new</span> <span class="fn">PipelineOrchestrator</span>({
  config: {
    stages: [
      {
        <span class="prop">key</span>: <span class="str">"init"</span>,
        <span class="prop">request</span>: <span class="kw">async</span> () <span class="op">=></span> fetchAirportsTotal(),
        <span class="prop">pauseAfter</span>: <span class="num">300</span>,
      },
      {
        <span class="prop">key</span>: <span class="str">"load_data"</span>,           <span class="cmt">// parent key for the group</span>
        <span class="prop">parallel</span>: [              <span class="cmt">// all 3 run via Promise.all</span>
          {
            <span class="prop">key</span>: <span class="str">"airports"</span>,
            <span class="prop">request</span>: <span class="kw">async</span> () <span class="op">=></span> fetchAirports(),
          },
          {
            <span class="prop">key</span>: <span class="str">"carriers"</span>,
            <span class="prop">request</span>: <span class="kw">async</span> () <span class="op">=></span> fetchCarriers(),
          },
          {
            <span class="prop">key</span>: <span class="str">"routes"</span>,
            <span class="prop">request</span>: <span class="kw">async</span> () <span class="op">=></span> fetchRouteStats(),
          },
        ],
      },
      {
        <span class="prop">key</span>: <span class="str">"summary"</span>,
        <span class="prop">request</span>: <span class="kw">async</span> ({ allResults }) <span class="op">=></span> ({
          <span class="cmt">// allResults[key] = { status, data, error } — нужен .data</span>
          airports:     allResults.airports.data.total,
          carriers:     allResults.carriers.data.total,
          total_routes: allResults.routes.data.total_routes,
          airlines:     allResults.routes.data.airlines,
        }),
      },
    ],

    middleware: {
      <span class="prop">beforeEach</span>: ({ stage }) <span class="op">=></span> console.log(<span class="str">"▶"</span>, stage.key),
      <span class="prop">afterEach</span>:  ({ stage }) <span class="op">=></span> console.log(<span class="str">"✓"</span>, stage.key),
    },
  },
  httpConfig: { <span class="prop">baseURL</span>: <span class="str">"https://macrulez-api.ru"</span>, <span class="prop">timeout</span>: <span class="num">20000</span> },
});

<span class="kw">const</span> { run, running, stageResults } = <span class="fn">usePipelineRunVue</span>(orchestrator);</pre>
        </div>
      </Transition>
    </div>
  </div>
</template>
