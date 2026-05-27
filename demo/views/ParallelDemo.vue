<script setup lang="ts">
import { ref, computed, reactive } from "vue";
import { pipe, PipelineOrchestrator } from "rest-pipeline-js";
import { usePipelineRunVue, usePipelineProgressVue } from "rest-pipeline-js/vue";

const BASE = "https://macrulez-api.ru";

// ── Stage timing ─────────────────────────────────────────────────
const startTimes  = reactive<Record<string, number>>({});
const durations   = reactive<Record<string, number>>({});
const parallelStart = ref<number | null>(null);
const parallelEnd   = ref<number | null>(null);

// ── Result data ───────────────────────────────────────────────────
const summary = ref<any>(null);

// ── Build pipeline with pipe() ────────────────────────────────────
function buildOrchestrator() {
  Object.keys(durations).forEach((k) => delete durations[k]);
  Object.keys(startTimes).forEach((k) => delete startTimes[k]);
  parallelStart.value = null;
  parallelEnd.value   = null;
  summary.value       = null;

  return pipe()
    .step({
      key: "init",
      request: async () => {
        const res = await fetch(`${BASE}/api/airlines/airports?limit=1`);
        const data = await res.json();
        return { totalAirports: data.total ?? data.count ?? "—", timestamp: new Date().toISOString() };
      },
    })
    .parallel([
      {
        key: "airports",
        request: async () => {
          const res = await fetch(`${BASE}/api/airlines/airports?limit=12`);
          const data = await res.json();
          return data;
        },
      },
      {
        key: "carriers",
        request: async () => {
          const res = await fetch(`${BASE}/api/airlines/carriers?limit=12`);
          const data = await res.json();
          return data;
        },
      },
      {
        key: "routes",
        request: async () => {
          const res = await fetch(`${BASE}/api/airlines/routes/stats`);
          const data = await res.json();
          return data;
        },
      },
    ])
    .step({
      key: "summary",
      request: async ({ allResults }: any) => {
        const a = allResults.airports?.data  ?? allResults.airports  ?? {};
        const c = allResults.carriers?.data  ?? allResults.carriers  ?? {};
        const r = allResults.routes?.data    ?? allResults.routes    ?? {};
        return {
          airports:  a.total ?? a.count ?? (Array.isArray(a) ? a.length : "—"),
          carriers:  c.total ?? c.count ?? (Array.isArray(c) ? c.length : "—"),
          routes:    r.total ?? r.count ?? (Array.isArray(r) ? r.length : "—"),
          parallelMs: parallelEnd.value && parallelStart.value
            ? parallelEnd.value - parallelStart.value
            : null,
          builtAt: new Date().toISOString(),
        };
      },
    })
    .build({
      httpConfig: { baseURL: BASE, timeout: 15000 },
      config: {
        middleware: {
          beforeEach: ({ stage }: any) => {
            startTimes[stage.key] = Date.now();
            if (["airports", "carriers", "routes"].includes(stage.key) && !parallelStart.value) {
              parallelStart.value = Date.now();
            }
          },
          afterEach: ({ stage }: any) => {
            durations[stage.key] = Date.now() - (startTimes[stage.key] ?? Date.now());
            if (["airports", "carriers", "routes"].includes(stage.key)) {
              parallelEnd.value = Date.now();
            }
          },
          onError: ({ stage }: any) => {
            durations[stage.key] = Date.now() - (startTimes[stage.key] ?? Date.now());
          },
        },
      },
    });
}

let orchestrator = buildOrchestrator();
const { run, running, error, stageResults, abort } = usePipelineRunVue(orchestrator);
const progress = usePipelineProgressVue(orchestrator);

// ── Stage metadata ────────────────────────────────────────────────
const SEQUENTIAL = [
  { key: "init",    label: "init",    desc: "Get total airports count" },
];
const PARALLEL = [
  { key: "airports", label: "airports", desc: "GET /api/airlines/airports" },
  { key: "carriers", label: "carriers", desc: "GET /api/airlines/carriers" },
  { key: "routes",   label: "routes",   desc: "GET /api/airlines/routes/stats" },
];
const AFTER = [
  { key: "summary", label: "summary", desc: "Aggregate all results" },
];

const ALL_KEYS = ["init", "airports", "carriers", "routes", "summary"];

// stageStatuses is indexed: init=0, airports=1, carriers=2, routes=3, summary=4
const stageStatus = computed<Record<string, string>>(() => {
  const arr = progress.value?.stageStatuses;
  if (!arr) return {};
  return Object.fromEntries(ALL_KEYS.map((k, i) => [k, arr[i] ?? ""]));
});

function getStatus(key: string) { return stageStatus.value[key] ?? "idle"; }
function getDuration(key: string) {
  const ms = durations[key];
  if (!ms) return "";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const completedCount = computed(() =>
  ALL_KEYS.filter((k) => ["success", "error"].includes(stageStatus.value[k])).length
);
const progressPct = computed(() =>
  resetting.value ? 0 : Math.round((completedCount.value / ALL_KEYS.length) * 100)
);
const allDone = computed(() =>
  !resetting.value && ALL_KEYS.every((k) => stageStatus.value[k] === "success")
);

const displayError = computed(() => {
  if (error.value) return (error.value as any)?.message ?? String(error.value);
  if (!stageResults.value) return null;
  for (const k of ALL_KEYS) {
    const r = (stageResults.value as any)[k];
    if (r?.status === "error") return r.error?.message ?? "Stage failed";
  }
  return null;
});

const summaryData = computed(() => {
  if (!allDone.value || !stageResults.value) return null;
  return (stageResults.value as any)?.summary?.data ?? null;
});

// ── Actions ───────────────────────────────────────────────────────
const resetting = ref(false);
const started   = ref(false);
const showCode  = ref(false);

async function startPipeline() {
  resetting.value = true;
  orchestrator.clearStageResults();
  await new Promise((r) => setTimeout(r, 100));
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
        <code style="font-family:var(--font-mono);color:var(--primary-light);font-size:12px">.parallel()</code>
        group. Compare the parallel execution time with the total sequential time
        to see the speedup. Built with the fluent
        <code style="font-family:var(--font-mono);color:var(--primary-light);font-size:12px">pipe()</code>
        builder.
      </p>
      <div class="feature-tags">
        <span class="tag tag--primary">pipe() builder</span>
        <span class="tag tag--primary">.parallel([])</span>
        <span class="tag tag--primary">Promise.all</span>
        <span class="tag">middleware.beforeEach</span>
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
      <div class="stage-wrap" v-for="s in SEQUENTIAL" :key="s.key">
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
              <div
                class="stage-card__result"
                v-if="getStatus(s.key) === 'success'"
              >
                total: {{ (stageResults as any)?.[s.key]?.data?.totalAirports ?? "—" }} airports
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
                    <template v-if="ps.key === 'carriers'">
                      total: {{ (stageResults as any)?.carriers?.data?.total ?? "—" }}
                    </template>
                    <template v-if="ps.key === 'routes'">
                      total: {{ (stageResults as any)?.routes?.data?.total ?? (stageResults as any)?.routes?.data?.count ?? "—" }}
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
      <div class="stage-wrap" v-for="s in AFTER" :key="s.key">
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
                ✓ merged
              </div>
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
            <div class="result-card__head">Airports</div>
            <div class="result-card__body">
              <div class="result-card__label">Total in database</div>
              <div class="result-card__value result-card__value--blue">{{ summaryData.airports }}</div>
              <div class="result-card__sub">from /api/airlines/airports</div>
            </div>
          </div>
          <div class="result-card">
            <div class="result-card__head">Airlines</div>
            <div class="result-card__body">
              <div class="result-card__label">Total carriers</div>
              <div class="result-card__value result-card__value--accent">{{ summaryData.carriers }}</div>
              <div class="result-card__sub">from /api/airlines/carriers</div>
            </div>
          </div>
          <div class="result-card">
            <div class="result-card__head">Routes</div>
            <div class="result-card__body">
              <div class="result-card__label">Total routes</div>
              <div class="result-card__value result-card__value--success">{{ summaryData.routes }}</div>
              <div class="result-card__sub">from /api/airlines/routes/stats</div>
            </div>
          </div>
          <div class="result-card" v-if="summaryData.parallelMs">
            <div class="result-card__head">Parallel speedup</div>
            <div class="result-card__body">
              <div class="result-card__label">3 requests finished in</div>
              <div class="result-card__value">{{ summaryData.parallelMs }}ms</div>
              <div class="result-card__sub" style="color:#4ade80">
                ~{{ Math.round(summaryData.parallelMs / 3) }}ms avg per request
              </div>
            </div>
          </div>
        </div>

        <!-- Timing breakdown -->
        <div class="data-panel" v-if="Object.keys(durations).length">
          <div class="data-panel__head">
            <span>Stage timing breakdown</span>
          </div>
          <div class="data-panel__body">
            <div style="display:flex;flex-direction:column;gap:10px">
              <div
                v-for="key in ALL_KEYS"
                :key="key"
                style="display:flex;align-items:center;gap:12px"
              >
                <div style="width:80px;font-family:var(--font-mono);font-size:12px;color:var(--text-sub);text-align:right">
                  {{ key }}
                </div>
                <div style="flex:1;height:20px;background:var(--surface2);border-radius:4px;overflow:hidden;position:relative">
                  <div
                    :style="{
                      width: durations[key] ? Math.min(100, (durations[key] / Math.max(...Object.values(durations))) * 100) + '%' : '0%',
                      height: '100%',
                      background: ['airports','carriers','routes'].includes(key) ? 'var(--primary)' : 'var(--blue)',
                      borderRadius: '4px',
                      transition: 'width .5s ease',
                    }"
                  ></div>
                </div>
                <div style="width:52px;font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">
                  {{ getDuration(key) }}
                </div>
                <span
                  v-if="['airports','carriers','routes'].includes(key)"
                  class="badge badge--purple"
                  style="font-size:10px"
                >parallel</span>
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
        <span>▸ pipe() builder configuration</span>
        <span class="code-arrow" :class="{ 'code-arrow--open': showCode }">▶</span>
      </button>
      <Transition name="expand">
        <div v-if="showCode">
          <pre class="code-block"><span class="kw">import</span> { pipe } <span class="kw">from</span> <span class="str">"rest-pipeline-js"</span>;

<span class="kw">const</span> orchestrator = <span class="fn">pipe</span>()
  .<span class="fn">step</span>({
    <span class="prop">key</span>: <span class="str">"init"</span>,
    <span class="prop">request</span>: <span class="kw">async</span> () <span class="op">=></span> {
      <span class="kw">const</span> res = <span class="kw">await</span> fetch(<span class="str">"/api/airlines/airports?limit=1"</span>);
      <span class="kw">return</span> res.json();    <span class="cmt">// { total: 9800, ... }</span>
    },
  })
  .<span class="fn">parallel</span>([                <span class="cmt">// all 3 run via Promise.all</span>
    {
      <span class="prop">key</span>: <span class="str">"airports"</span>,
      <span class="prop">request</span>: <span class="kw">async</span> () <span class="op">=></span> fetch(<span class="str">"/api/airlines/airports?limit=12"</span>).then(r <span class="op">=></span> r.json()),
    },
    {
      <span class="prop">key</span>: <span class="str">"carriers"</span>,
      <span class="prop">request</span>: <span class="kw">async</span> () <span class="op">=></span> fetch(<span class="str">"/api/airlines/carriers?limit=12"</span>).then(r <span class="op">=></span> r.json()),
    },
    {
      <span class="prop">key</span>: <span class="str">"routes"</span>,
      <span class="prop">request</span>: <span class="kw">async</span> () <span class="op">=></span> fetch(<span class="str">"/api/airlines/routes/stats"</span>).then(r <span class="op">=></span> r.json()),
    },
  ])
  .<span class="fn">step</span>({
    <span class="prop">key</span>: <span class="str">"summary"</span>,
    <span class="prop">request</span>: <span class="kw">async</span> ({ allResults }) <span class="op">=></span> ({
      <span class="cmt">// allResults contains results from ALL previous stages</span>
      airports: allResults.airports.total,
      carriers: allResults.carriers.total,
      routes:   allResults.routes.total,
    }),
  })
  .<span class="fn">build</span>({
    httpConfig: { <span class="prop">baseURL</span>: <span class="str">"https://macrulez-api.ru"</span>, <span class="prop">timeout</span>: <span class="num">15000</span> },
  });</pre>
        </div>
      </Transition>
    </div>
  </div>
</template>
