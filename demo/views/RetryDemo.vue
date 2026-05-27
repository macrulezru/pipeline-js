<script setup lang="ts">
import { ref, computed, reactive } from "vue";
import { PipelineOrchestrator } from "rest-pipeline-js";
import { usePipelineRunVue, usePipelineProgressVue } from "rest-pipeline-js/vue";

const BASE = "https://macrulez-api.ru";

// ── Settings ─────────────────────────────────────────────────────
const maxFails  = ref(2);    // how many times the flaky stage fails before succeeding
const retryDelay = ref(700); // base delay in ms between retries
const backoffMult = ref(1.5);

// ── Retry event log ───────────────────────────────────────────────
interface LogEntry {
  id: number;
  type: "start" | "error" | "wait" | "success" | "stage" | "info" | "abort";
  text: string;
  ts: number;
}
const log = ref<LogEntry[]>([]);
let logId = 0;

function addLog(type: LogEntry["type"], text: string) {
  log.value.push({ id: ++logId, type, text, ts: Date.now() });
}

// ── Pause state (not from orchestrator — simulated between stages) ─
const isPaused  = ref(false);
const pauseResolve = ref<(() => void) | null>(null);

function pausePipeline()  { isPaused.value = true;  addLog("info", "⏸ Pipeline paused"); }
function resumePipeline() {
  if (pauseResolve.value) { pauseResolve.value(); pauseResolve.value = null; }
  isPaused.value = false;
  addLog("info", "▶ Pipeline resumed");
}

// ── Stage timing ──────────────────────────────────────────────────
const startTimes = reactive<Record<string, number>>({});
const durations  = reactive<Record<string, number>>({});

// ── Attempt counters (reset per run) ─────────────────────────────
let flakyCount = 0;
let aborted    = false;

const sleep = (ms: number) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    const id = setInterval(() => { if (aborted) { clearTimeout(t); clearInterval(id); reject(new Error("Aborted")); } }, 50);
    setTimeout(() => clearInterval(id), ms + 100);
  });

// ── Build orchestrator ────────────────────────────────────────────
function buildOrchestrator() {
  flakyCount = 0;
  aborted = false;
  isPaused.value = false;
  Object.keys(durations).forEach((k) => delete durations[k]);
  Object.keys(startTimes).forEach((k) => delete startTimes[k]);

  return new PipelineOrchestrator({
    config: {
      stages: [
        {
          key: "fetch_airports",
          request: async () => {
            addLog("stage", "▶ Stage 1 — fetch_airports");
            const res = await fetch(`${BASE}/api/portfolio/fly/points`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return { count: Array.isArray(data) ? data.length : (data.points ?? data).length, status: "ok" };
          },
        },
        {
          key: "flaky_service",
          request: async () => {
            addLog("stage", "▶ Stage 2 — flaky_service");

            // Retry loop with exponential backoff (simulated inside the stage)
            for (let attempt = 1; attempt <= maxFails.value + 1; attempt++) {
              if (aborted) throw new Error("Aborted by user");

              addLog("start", `Attempt ${attempt} / ${maxFails.value + 1}…`);
              flakyCount = attempt;

              if (attempt <= maxFails.value) {
                addLog("error", `✕ Connection refused (simulated failure #${attempt})`);
                const waitMs = Math.round(retryDelay.value * Math.pow(backoffMult.value, attempt - 1));
                addLog("wait", `⏳ Waiting ${waitMs}ms before retry (backoff ×${backoffMult.value})`);
                await sleep(waitMs);
                continue;
              }

              // Succeed on the final attempt
              addLog("success", `✓ Service responded on attempt ${attempt}`);
              const res = await fetch(`${BASE}/api/airlines/carriers?limit=6`);
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return await res.json();
            }
            throw new Error("Max retries exceeded");
          },
        },
        {
          key: "finalize",
          request: async () => {
            // Demonstrate pause/resume between stages
            if (isPaused.value) {
              addLog("info", "⏸ Waiting for resume…");
              await new Promise<void>((resolve) => { pauseResolve.value = resolve; });
            }
            addLog("stage", "▶ Stage 3 — finalize");
            const res = await fetch(`${BASE}/api/macrulez-blog/posts?limit=4`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const count = Array.isArray(data) ? data.length : data.data?.length ?? data.length ?? 0;
            return { posts: count, summary: `Completed after ${flakyCount} attempt(s) on flaky_service` };
          },
        },
      ],
      middleware: {
        beforeEach: ({ stage }: any) => { startTimes[stage.key] = Date.now(); },
        afterEach:  ({ stage }: any) => { durations[stage.key]  = Date.now() - (startTimes[stage.key] ?? Date.now()); },
        onError:    ({ stage }: any) => { durations[stage.key]  = Date.now() - (startTimes[stage.key] ?? Date.now()); },
      },
    },
    httpConfig: {
      baseURL: BASE,
      timeout: 20000,
      retry: {
        attempts: 0, // retry is handled manually inside the stage
        delayMs: retryDelay.value,
        backoffMultiplier: backoffMult.value,
      },
    },
  });
}

let orchestrator = buildOrchestrator();
const runState = usePipelineRunVue(orchestrator);
const { run, running, error, stageResults, abort } = runState;
const progress = usePipelineProgressVue(orchestrator);

// ── Stage metadata ────────────────────────────────────────────────
const STAGES = [
  { key: "fetch_airports", label: "fetch_airports", desc: "Fetch airport list — always succeeds" },
  { key: "flaky_service",  label: "flaky_service",  desc: "Simulates an unstable service", isFlaky: true },
  { key: "finalize",       label: "finalize",       desc: "Fetch blog posts — with pause/resume demo" },
];

const stageStatus = computed<Record<string, string>>(() => {
  const arr = progress.value?.stageStatuses;
  if (!arr) return {};
  return Object.fromEntries(STAGES.map((s, i) => [s.key, arr[i] ?? ""]));
});

function getStatus(key: string)   { return stageStatus.value[key] ?? "idle"; }
function getDuration(key: string) {
  const ms = durations[key];
  return ms ? (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`) : "";
}

const completedCount = computed(() =>
  STAGES.filter((s) => ["success", "error"].includes(stageStatus.value[s.key])).length
);
const progressPct = computed(() =>
  resetting.value ? 0 : Math.round((completedCount.value / STAGES.length) * 100)
);
const allDone = computed(() =>
  !resetting.value && STAGES.every((s) => stageStatus.value[s.key] === "success")
);
const displayError = computed(() => {
  if (error.value) return (error.value as any)?.message ?? String(error.value);
  return null;
});

// ── Actions ───────────────────────────────────────────────────────
const resetting = ref(false);
const started   = ref(false);
const showCode  = ref(false);

async function startPipeline() {
  resetting.value = true;
  log.value = [];
  aborted = false;
  isPaused.value = false;
  pauseResolve.value = null;
  orchestrator.clearStageResults();
  await new Promise((r) => setTimeout(r, 100));
  resetting.value = false;
  started.value   = true;
  run();
}

function abortPipeline() {
  aborted = true;
  abort();
  addLog("abort", "✕ Pipeline aborted by user");
}

function logTypeIcon(t: LogEntry["type"]) {
  return { start: "🔵", error: "🔴", wait: "🟡", success: "🟢", stage: "⬡", info: "ℹ️", abort: "✕" }[t] ?? "·";
}
function logTypeClass(t: LogEntry["type"]) {
  return { error: "retry-entry--error", wait: "retry-entry--wait", success: "retry-entry--success", abort: "retry-entry--error" }[t] ?? "";
}
</script>

<template>
  <div>
    <!-- ── Header ──────────────────────────────────────────────── -->
    <div class="demo-header">
      <div class="demo-title">
        <span class="demo-icon">🛡️</span>
        Retry &amp; Recovery
      </div>
      <p class="demo-desc">
        Stage 2 (<code style="font-family:var(--font-mono);color:#f87171">flaky_service</code>) deliberately fails the first
        <strong style="color:var(--text)">N attempts</strong> before succeeding.
        Watch the exponential backoff play out in the event log.
        Also demonstrates <strong style="color:var(--text)">abort()</strong>
        and a manual <strong style="color:var(--text)">pause / resume</strong>
        checkpoint before Stage 3.
      </p>
      <div class="feature-tags">
        <span class="tag tag--primary">retry + backoff</span>
        <span class="tag tag--primary">abort()</span>
        <span class="tag tag--primary">pause / resume</span>
        <span class="tag">middleware.onError</span>
        <span class="tag">PipelineOrchestrator</span>
      </div>
    </div>

    <!-- ── Settings ───────────────────────────────────────────── -->
    <div class="data-panel" style="margin-bottom:20px">
      <div class="data-panel__head">Simulation settings</div>
      <div class="data-panel__body">
        <div style="display:flex;gap:32px;flex-wrap:wrap;align-items:flex-end">
          <div>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">
              Failures before success:
              <strong style="color:var(--primary-light);font-family:var(--font-mono)">{{ maxFails }}</strong>
            </div>
            <input
              type="range" min="0" max="4" v-model.number="maxFails"
              :disabled="running"
              style="accent-color:var(--primary);width:160px"
            />
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-dim);width:160px">
              <span>0 (always ok)</span><span>4</span>
            </div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">
              Base retry delay:
              <strong style="color:var(--primary-light);font-family:var(--font-mono)">{{ retryDelay }}ms</strong>
            </div>
            <input
              type="range" min="300" max="1500" step="100" v-model.number="retryDelay"
              :disabled="running"
              style="accent-color:var(--primary);width:160px"
            />
          </div>
          <div>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">
              Backoff multiplier:
              <strong style="color:var(--primary-light);font-family:var(--font-mono)">×{{ backoffMult }}</strong>
            </div>
            <input
              type="range" min="1" max="3" step="0.5" v-model.number="backoffMult"
              :disabled="running"
              style="accent-color:var(--primary);width:160px"
            />
          </div>
        </div>
        <div style="margin-top:12px;font-size:12px;color:var(--text-dim)" v-if="maxFails > 0">
          Expected delays:
          <span
            v-for="i in maxFails" :key="i"
            style="font-family:var(--font-mono);color:#fbbf24;margin-right:8px"
          >
            {{ Math.round(retryDelay * Math.pow(backoffMult, i - 1)) }}ms
          </span>
          then success →
        </div>
      </div>
    </div>

    <!-- ── Controls ───────────────────────────────────────────── -->
    <div class="demo-controls">
      <button class="btn btn--run" @click="startPipeline" :disabled="running">
        <span class="btn__spinner" v-if="running && !isPaused"></span>
        <span v-else>▶</span>
        {{ running ? (isPaused ? "Paused…" : "Running…") : started ? "Run Again" : "Run Pipeline" }}
      </button>
      <button class="btn btn--abort" v-if="running" @click="abortPipeline">✕ Abort</button>
      <div class="control-divider" v-if="running"></div>
      <button
        class="btn btn--pause"
        v-if="running && !isPaused && stageStatus['fetch_airports'] === 'success' && stageStatus['flaky_service'] !== 'success'"
        disabled
        title="Pause happens automatically before Stage 3"
      >
        ⏸ Pause (auto before Stage 3)
      </button>
      <button
        class="btn btn--resume"
        v-if="running && isPaused"
        @click="resumePipeline"
      >
        ▶ Resume
      </button>
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
      <div class="error-banner" v-if="displayError && !running">
        <span class="error-banner__icon">⚠</span>
        <div>
          <div class="error-banner__title">Pipeline stopped</div>
          <div class="error-banner__msg">{{ displayError }}</div>
        </div>
      </div>
    </Transition>

    <!-- ── Pipeline flow ───────────────────────────────────────── -->
    <div class="pipeline-flow" v-if="started && !resetting">
      <template v-for="(stage, idx) in STAGES" :key="stage.key">
        <div class="pipe-arrow" v-if="idx > 0">→</div>
        <div class="stage-wrap">
          <div
            class="stage-card"
            :class="{
              'stage-card--running': getStatus(stage.key) === 'pending',
              'stage-card--success': getStatus(stage.key) === 'success',
              'stage-card--error':   getStatus(stage.key) === 'error',
            }"
          >
            <div class="stage-card__head">
              <div class="stage-dot"></div>
              <span class="stage-card__key">{{ stage.label }}</span>
              <span
                class="badge badge--warning"
                v-if="stage.isFlaky"
                style="font-size:10px;padding:1px 6px"
              >flaky</span>
              <span class="stage-card__dur">{{ getDuration(stage.key) }}</span>
            </div>
            <div class="stage-card__body">
              <div class="stage-card__desc">{{ stage.desc }}</div>

              <!-- Pause notice -->
              <Transition name="slide-up">
                <div
                  v-if="stage.key === 'finalize' && isPaused"
                  style="margin-top:6px;padding:8px;background:var(--warning-glow);border:1px solid rgba(215,119,6,.3);border-radius:6px;font-size:12px;color:#fbbf24"
                >
                  ⏸ Paused — click <strong>Resume</strong> to continue
                </div>
              </Transition>

              <!-- Attempt counter on flaky stage -->
              <Transition name="slide-up">
                <div
                  v-if="stage.isFlaky && getStatus(stage.key) === 'pending' && flakyCount > 0"
                  style="margin-top:6px;font-size:12px;color:#fbbf24;font-family:var(--font-mono)"
                >
                  Attempt {{ flakyCount }} / {{ maxFails + 1 }}
                </div>
              </Transition>

              <!-- Success result -->
              <Transition name="slide-up">
                <div class="stage-card__result" v-if="getStatus(stage.key) === 'success'">
                  <template v-if="stage.key === 'fetch_airports'">
                    {{ (stageResults as any)?.fetch_airports?.data?.count ?? "—" }} airports
                  </template>
                  <template v-else-if="stage.key === 'flaky_service'">
                    ✓ succeeded after {{ flakyCount }} attempt{{ flakyCount !== 1 ? 's' : '' }}
                  </template>
                  <template v-else-if="stage.key === 'finalize'">
                    {{ (stageResults as any)?.finalize?.data?.posts ?? "—" }} blog posts
                  </template>
                </div>
              </Transition>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- ── Event log ───────────────────────────────────────────── -->
    <div class="data-panel" v-if="log.length">
      <div class="data-panel__head">
        <span>Event log</span>
        <span class="badge badge--neutral">{{ log.length }} events</span>
      </div>
      <div class="data-panel__body" style="padding:10px">
        <div class="retry-log">
          <div
            v-for="entry in log"
            :key="entry.id"
            class="retry-entry"
            :class="logTypeClass(entry.type)"
          >
            <span class="retry-entry__icon">{{ logTypeIcon(entry.type) }}</span>
            <span class="retry-entry__text">{{ entry.text }}</span>
            <span class="retry-entry__time">+{{ entry.ts - (log[0]?.ts ?? entry.ts) }}ms</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Success summary ─────────────────────────────────────── -->
    <Transition name="fade">
      <div class="stats-row" v-if="allDone">
        <div class="stat-box">
          <div class="stat-box__label">Attempts needed</div>
          <div class="stat-box__value" style="color:var(--primary-light)">{{ flakyCount }}</div>
          <div class="stat-box__sub">for flaky_service to succeed</div>
        </div>
        <div class="stat-box">
          <div class="stat-box__label">Total pipeline time</div>
          <div class="stat-box__value">{{ Object.values(durations).reduce((a, b) => a + b, 0) }}ms</div>
          <div class="stat-box__sub">including all retry delays</div>
        </div>
        <div class="stat-box">
          <div class="stat-box__label">Blog posts loaded</div>
          <div class="stat-box__value" style="color:#4ade80">
            {{ (stageResults as any)?.finalize?.data?.posts ?? "—" }}
          </div>
          <div class="stat-box__sub">from /api/macrulez-blog/posts</div>
        </div>
      </div>
    </Transition>

    <!-- ── Empty state ─────────────────────────────────────────── -->
    <div class="empty-state" v-if="!started">
      <div style="font-size:36px;margin-bottom:12px">🛡️</div>
      <div>Configure the failure count and click <strong>Run Pipeline</strong></div>
      <div style="font-size:12px;color:var(--text-dim);margin-top:6px">
        Watch the exponential backoff play out in real time
      </div>
    </div>

    <!-- ── Code ────────────────────────────────────────────────── -->
    <div class="code-section" style="margin-top:20px">
      <button class="code-section__toggle" @click="showCode = !showCode">
        <span>▸ Retry + pause/resume configuration</span>
        <span class="code-arrow" :class="{ 'code-arrow--open': showCode }">▶</span>
      </button>
      <Transition name="expand">
        <div v-if="showCode">
          <pre class="code-block"><span class="cmt">// Stage with manual retry + exponential backoff</span>
{
  <span class="prop">key</span>: <span class="str">"flaky_service"</span>,
  <span class="prop">request</span>: <span class="kw">async</span> () <span class="op">=></span> {
    <span class="kw">for</span> (<span class="kw">let</span> attempt = <span class="num">1</span>; attempt &lt;= maxAttempts; attempt++) {
      <span class="kw">if</span> (aborted) <span class="kw">throw new</span> <span class="fn">Error</span>(<span class="str">"Aborted"</span>);

      <span class="kw">if</span> (attempt &lt;= maxFails) {
        <span class="kw">const</span> waitMs = Math.<span class="fn">round</span>(delayMs * Math.<span class="fn">pow</span>(backoffMultiplier, attempt - <span class="num">1</span>));
        <span class="cmt">// delayMs=700, backoffMultiplier=1.5</span>
        <span class="cmt">// attempt 1 → wait 700ms</span>
        <span class="cmt">// attempt 2 → wait 1050ms</span>
        <span class="cmt">// attempt 3 → wait 1575ms</span>
        <span class="kw">await</span> <span class="fn">sleep</span>(waitMs);
        <span class="kw">continue</span>;
      }

      <span class="kw">return</span> <span class="kw">await</span> <span class="fn">fetchData</span>();
    }
  },
},

<span class="cmt">// Pause / resume between stages</span>
{
  <span class="prop">key</span>: <span class="str">"finalize"</span>,
  <span class="prop">request</span>: <span class="kw">async</span> () <span class="op">=></span> {
    <span class="kw">if</span> (isPaused) {
      <span class="cmt">// Block until resume() is called</span>
      <span class="kw">await new</span> <span class="fn">Promise</span>((resolve) <span class="op">=></span> { pauseResolve = resolve });
    }
    <span class="kw">return</span> <span class="fn">fetchBlogPosts</span>();
  },
},

<span class="cmt">// Abort: set a shared flag checked inside the loop</span>
<span class="kw">function</span> <span class="fn">abort</span>() {
  aborted = <span class="kw">true</span>;    <span class="cmt">// flaky stage checks this on each loop iteration</span>
  orchestrator.<span class="fn">abort</span>(); <span class="cmt">// cancels current HTTP request via AbortSignal</span>
}</pre>
        </div>
      </Transition>
    </div>
  </div>
</template>
