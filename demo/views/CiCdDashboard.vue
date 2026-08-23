<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import { pipe, createRestClient, RequestExecutor } from "rest-pipeline-js";
import type { PipelineOrchestrator } from "rest-pipeline-js";
import { usePipelineRunVue, usePipelineProgressVue } from "rest-pipeline-js/vue";

type JitterStrategy = "fixed" | "full" | "decorrelated";

// ── Settings ─────────────────────────────────────────────────────
const jitterStrategy = ref<JitterStrategy>("fixed");
const failEveryNth = ref(3); // test stage fails attempts 1..N-1, succeeds on Nth
const branchMode = ref<"feature" | "hotfix">("feature");

const SERVICES = ["api-gateway", "auth-service", "billing", "notifications"];

// ── Console log (build logs + plugin-captured lifecycle events) ───
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
  nextTick(() => {
    if (consoleEl.value) consoleEl.value.scrollTop = consoleEl.value.scrollHeight;
  });
}

// ── Approval gate state ─────────────────────────────────────────
const awaitingApproval = ref(false);
const lastBuildId = ref<string | null>(null);
const lastBuild = ref<{ branch: string; version: string; url: string } | null>(null);

// ── SSE build-log source (StreamStageConfig) ────────────────────
async function* sseLogSource(buildId: string, signal: AbortSignal): AsyncGenerator<string> {
  const res = await fetch(`/api/cicd/builds/${buildId}/logs`, { signal });
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
        const eventLine = chunk.split("\n").find((l) => l.startsWith("event: "));
        if (eventLine?.includes("done")) return;
        if (dataLine) {
          const payload = JSON.parse(dataLine.slice(6));
          if (payload.line) yield payload.line as string;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Pipeline plugin: mirror every internal "log" event into the console ─
function makeLoggingPlugin() {
  return {
    name: "console-logger",
    install(o: PipelineOrchestrator) {
      const off = o.on("log", (event: any) => {
        const stepPart = event?.stepKey ? ` (${event.stepKey})` : "";
        let text = `${event?.message ?? event?.type ?? "log"}${stepPart}`;
        // RequestExecutor's retry loop is invisible from the outside (no
        // per-attempt hook) — surface the outcome instead, once the step
        // finishes, so a retried step's attempt count is still visible.
        const d = event?.data;
        if (event?.type === "step:success" && d) {
          if (typeof d.attempt === "number" && d.attempt > 1) text += ` — took ${d.attempt} attempts to succeed`;
          if (typeof d.sizeKb === "number") text += ` — artifact ${d.sizeKb} KB`;
          if (typeof d.version === "string") text += ` — ${d.version}`;
        }
        if (event?.type === "step:error" && event?.error?.message) text += ` — ${event.error.message}`;
        const kind = String(event?.type ?? "").includes("error")
          ? "error"
          : String(event?.type ?? "").includes("success")
            ? "success"
            : "info";
        addConsole(text, kind);
      });
      return () => off();
    },
  };
}

// ── Build the pipeline once — settings are re-read live from refs
// inside each stage's closure, so changing them between runs takes
// effect without needing a new orchestrator instance (which would
// break the Vue composables below: they call onUnmounted() and must
// only ever be invoked once, synchronously, during setup()).
// `createRestClient()`'s own client.get()/post() don't retry on their own —
// only RequestExecutor.execute() implements retry/backoff/jitter — so the
// flaky test stages use a dedicated executor while everything else uses the
// plain client.
let client = createRestClient({ baseURL: "", timeout: 15000 });
let testExecutor = new RequestExecutor({
  baseURL: "",
  timeout: 15000,
  retry: { attempts: 3, delayMs: 350, backoffMultiplier: 2, jitterStrategy: jitterStrategy.value },
});

const orchestrator: PipelineOrchestrator = pipe()
  .step({
    key: "trigger",
    request: async ({ sharedData }) => {
      const branch = branchMode.value === "hotfix" ? "hotfix/rate-limit-bug" : "feature/checkout-v2";
      addConsole(`Triggering build for branch "${branch}"…`);
      if (branch.startsWith("hotfix/")) {
        addConsole("⚠️ Hotfix branch — next() jumps straight to deploy, skipping tests and approval", "warn");
      }
      const res = await client.post<{ id: string; branch: string; services: string[] }>("/api/cicd/builds", {
        branch,
        services: SERVICES,
      });
      sharedData.buildId = res.data.id;
      sharedData.branch = branch;
      lastBuildId.value = res.data.id;
      return res.data;
    },
    next: ({ result }: any) => (result.branch.startsWith("hotfix/") ? "deploy" : null),
  })
  .parallel(
    SERVICES.map((service) => ({
      key: `build:${service}`,
      request: async ({ sharedData }: any) =>
        (await client.get(`/api/cicd/builds/${sharedData.buildId}/services/${service}/build`)).data,
    })),
    { key: "build" },
  )
  .subPipeline({
    key: "frontendPipeline",
    subPipeline: {
      stages: [
        {
          key: "frontendBuild",
          request: async ({ sharedData }: any) =>
            (await client.get(`/api/cicd/builds/${sharedData.buildId}/services/web-frontend/build`)).data,
        },
        {
          key: "frontendTest",
          request: async ({ sharedData, signal }: any) =>
            (
              await testExecutor.execute(
                `/api/cicd/builds/${sharedData.buildId}/services/web-frontend/test?failEveryNth=${failEveryNth.value}`,
                undefined,
                undefined,
                15000,
                signal,
              )
            ).data,
        },
      ],
    },
  })
  .parallel(
    SERVICES.map((service) => ({
      key: `test:${service}`,
      request: async ({ sharedData, signal }: any) =>
        (
          await testExecutor.execute(
            `/api/cicd/builds/${sharedData.buildId}/services/${service}/test?failEveryNth=${failEveryNth.value}`,
            undefined,
            undefined,
            15000,
            signal,
          )
        ).data,
    })),
    { key: "test" },
  )
  .step({
    key: "awaitApproval",
    request: async () => {
      awaitingApproval.value = true;
      addConsole("Awaiting manual approval before deploy…", "warn");
      orchestrator.pause();
      return { approved: true };
    },
  })
  .step({
    key: "deploy",
    request: async ({ sharedData }: any) => {
      awaitingApproval.value = false;
      const res = await client.post<{ deployed: boolean; version: string; url: string }>(
        `/api/cicd/builds/${sharedData.buildId}/deploy`,
      );
      lastBuild.value = { branch: sharedData.branch, version: res.data.version, url: res.data.url };
      return res.data;
    },
  })
  .stream({
    key: "logs",
    stream: ({ sharedData, signal }: any) => sseLogSource(sharedData.buildId, signal),
    onChunk: (line: unknown) => addConsole(line as string),
  })
  .build({
    sharedData: { buildId: null, branch: null },
    pipelineOptions: { plugins: [makeLoggingPlugin()] },
  });

const { run: runPipeline, running, error, stageResults, abort, resume } = usePipelineRunVue(orchestrator);
usePipelineProgressVue(orchestrator);

const started = ref(false);
const showCode = ref(false);

async function startPipeline() {
  consoleLines.value = [];
  awaitingApproval.value = false;
  if (orchestrator.isPaused()) orchestrator.resume();
  // Rebuild the executor so a changed jitterStrategy takes effect this run.
  testExecutor = new RequestExecutor({
    baseURL: "",
    timeout: 15000,
    retry: { attempts: 3, delayMs: 350, backoffMultiplier: 2, jitterStrategy: jitterStrategy.value },
  });
  orchestrator.clearStageResults();
  started.value = true;
  try {
    await runPipeline();
  } catch {
    /* surfaced via the `error` ref already */
  }
}

function approveDeploy() {
  awaitingApproval.value = false;
  resume();
}

function abortPipeline() {
  abort();
  awaitingApproval.value = false;
  addConsole("Pipeline aborted by user", "error");
}

// ── Export / import state (localStorage round trip) ─────────────
const exportedPreview = ref<string | null>(null);
function saveState() {
  const state = orchestrator.exportState();
  localStorage.setItem("cicd-demo-state", JSON.stringify(state));
  exportedPreview.value = JSON.stringify(state, null, 2);
  addConsole("State exported to localStorage via exportState()", "info");
}
function loadState() {
  const raw = localStorage.getItem("cicd-demo-state");
  if (!raw) {
    addConsole("No saved state found in localStorage", "warn");
    return;
  }
  orchestrator.importState(JSON.parse(raw));
  exportedPreview.value = JSON.stringify(orchestrator.exportState(), null, 2);
  started.value = true;
  addConsole("State restored into the orchestrator via importState()", "success");
}

// ── Circuit breaker sandbox ──────────────────────────────────────
const breakerState = ref<"closed" | "open" | "half-open" | "unknown">("unknown");
const breakerLog = ref<string[]>([]);
let breakerClient = createRestClient({
  baseURL: "",
  timeout: 8000,
  retry: { attempts: 0 },
  circuitBreaker: { failureThreshold: 3, openMs: 4000, successThreshold: 1 },
});

async function sandboxDeploy() {
  if (!lastBuildId.value) {
    breakerLog.value.unshift("Trigger a pipeline run first to get a buildId.");
    return;
  }
  try {
    const res = await breakerClient.post(`/api/cicd/builds/${lastBuildId.value}/deploy?failFirstN=3`);
    breakerLog.value.unshift(`✓ Deploy succeeded — ${JSON.stringify(res.data)}`);
  } catch (e: any) {
    breakerLog.value.unshift(
      `✗ ${e?.code === "CIRCUIT_OPEN" ? "Circuit OPEN — request blocked locally, no network call made" : (e?.message ?? "Deploy failed")}`,
    );
  }
  breakerState.value = (await breakerClient.getCircuitBreakerState()) ?? "unknown";
}
async function resetSandbox() {
  breakerClient = createRestClient({
    baseURL: "",
    timeout: 8000,
    retry: { attempts: 0 },
    circuitBreaker: { failureThreshold: 3, openMs: 4000, successThreshold: 1 },
  });
  breakerState.value = "unknown";
  breakerLog.value = [];
  if (lastBuildId.value) {
    await fetch(`/api/cicd/builds/${lastBuildId.value}/deploy/reset`, { method: "POST" });
  }
}

// ── Stage metadata for the flow diagram ──────────────────────────
const STAGES = [
  { key: "trigger", label: "trigger", desc: "POST /api/cicd/builds" },
  { key: "build", label: "build (parallel)", desc: "Per-service build fan-out" },
  { key: "frontendPipeline", label: "frontendPipeline", desc: "Nested subPipeline: build → test" },
  { key: "test", label: "test (parallel)", desc: "Flaky — auto retry + backoff" },
  { key: "awaitApproval", label: "awaitApproval", desc: "pause() — manual gate" },
  { key: "deploy", label: "deploy", desc: "POST .../deploy" },
  { key: "logs", label: "logs (stream)", desc: "SSE live build log" },
];

// Parallel groups don't get a stageResults entry under their own group key —
// only each inner per-service stage does (`build:api-gateway`, etc.) — so
// their card status is aggregated from those.
const GROUP_PREFIXES = new Set(["build", "test"]);
function groupStatus(prefix: string): string {
  const statuses = SERVICES.map((s) => stageResults.value[`${prefix}:${s}`]?.status);
  if (statuses.some((s) => s === "error")) return "error";
  if (statuses.length > 0 && statuses.every((s) => s === "success")) return "success";
  if (statuses.some((s) => s === "pending" || s === "success")) return "pending";
  return "idle";
}
function stageStatus(key: string): string {
  if (GROUP_PREFIXES.has(key)) return groupStatus(key);
  return stageResults.value[key]?.status ?? "idle";
}

function serviceResult(groupKey: string, service: string) {
  return (stageResults.value as any)[`${groupKey}:${service}`];
}
function serviceResultText(groupKey: string, service: string): string {
  const r = serviceResult(groupKey, service);
  if (!r) return "";
  if (r.status === "error") return `✕ ${r.error?.message ?? "failed"}`;
  if (r.status !== "success") return "";
  const d = r.data ?? {};
  if (groupKey === "build") return `${d.sizeKb ?? "?"} KB`;
  if (groupKey === "test") return d.attempt > 1 ? `✓ attempt ${d.attempt}` : "✓ passed";
  return "";
}

function stageResultText(key: string): string {
  const r = (stageResults.value as any)[key];
  if (!r) return "";
  if (r.status === "error") return `✕ ${r.error?.message ?? "failed"}`;
  if (r.status !== "success") return "";
  const d = r.data ?? {};
  switch (key) {
    case "trigger":
      return `branch: ${d.branch}`;
    case "frontendPipeline": {
      const attempt = d.stageResults?.frontendTest?.data?.attempt;
      return `lint + test passed${attempt > 1 ? ` (attempt ${attempt})` : ""}`;
    }
    case "awaitApproval":
      return "approved — resuming deploy";
    case "deploy":
      return `${d.version} deployed`;
    case "logs":
      return "log stream closed";
    default:
      return "";
  }
}
const completedCount = computed(
  () => STAGES.filter((s) => ["success", "error"].includes(stageStatus(s.key))).length,
);
const progressPct = computed(() => Math.round((completedCount.value / STAGES.length) * 100));
const allDone = computed(() => stageStatus("logs") === "success" || stageStatus("deploy") === "success");
</script>

<template>
  <div>
    <div class="demo-header">
      <div class="demo-title"><span class="demo-icon">🚦</span> CI/CD Pipeline</div>
      <p class="demo-desc">
        A build/deploy pipeline against a real local mock server: parallel per-service builds,
        a dedicated <code style="font-family:var(--font-mono);color:var(--primary-light)">subPipeline</code>
        for the frontend, automatic retry/backoff on a flaky test stage, a real manual
        <strong style="color:var(--text)">pause()/resume()</strong> approval gate before deploy,
        a DAG <code style="font-family:var(--font-mono);color:var(--primary-light)">next()</code> branch for hotfixes,
        and a live SSE log stream after deploy.
      </p>
      <div class="feature-tags">
        <span class="tag tag--primary">.parallel()</span>
        <span class="tag tag--primary">.subPipeline()</span>
        <span class="tag tag--primary">retry + jitterStrategy</span>
        <span class="tag tag--primary">pause() / resume()</span>
        <span class="tag tag--primary">next() DAG branch</span>
        <span class="tag tag--primary">.stream() SSE</span>
        <span class="tag">PipelinePlugin</span>
        <span class="tag">exportState / importState</span>
      </div>
    </div>

    <!-- ── Settings ─────────────────────────────────────────── -->
    <div class="data-panel">
      <div class="data-panel__head">Simulation settings</div>
      <div class="data-panel__body">
        <div style="display:flex;gap:32px;flex-wrap:wrap;align-items:flex-end">
          <div>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">Branch</div>
            <select v-model="branchMode" :disabled="running" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-family:var(--font-mono);font-size:12px">
              <option value="feature">feature/checkout-v2 (full pipeline)</option>
              <option value="hotfix">hotfix/rate-limit-bug (skips straight to deploy)</option>
            </select>
          </div>
          <div>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">
              jitterStrategy: <strong style="color:var(--primary-light);font-family:var(--font-mono)">{{ jitterStrategy }}</strong>
            </div>
            <select v-model="jitterStrategy" :disabled="running" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-family:var(--font-mono);font-size:12px">
              <option value="fixed">fixed</option>
              <option value="full">full</option>
              <option value="decorrelated">decorrelated</option>
            </select>
          </div>
          <div>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">
              Test succeeds on attempt: <strong style="color:var(--primary-light);font-family:var(--font-mono)">{{ failEveryNth }}</strong>
            </div>
            <input type="range" min="1" max="4" v-model.number="failEveryNth" :disabled="running" style="accent-color:var(--primary);width:160px" />
          </div>
        </div>
        <p style="font-size:11px;color:var(--text-dim);margin-top:12px">
          Retries run for real inside <code style="font-family:var(--font-mono)">RequestExecutor</code> — the
          library doesn't expose a per-attempt hook, so failed attempts aren't logged live, but the real backoff
          delay is what makes a flaky stage take longer to turn green. Watch the elapsed time, then check the
          "took N attempts" line in the console once it succeeds.
        </p>
      </div>
    </div>

    <!-- ── Controls ─────────────────────────────────────────── -->
    <div class="demo-controls">
      <button class="btn btn--run" @click="startPipeline" :disabled="running">
        <span class="btn__spinner" v-if="running"></span>
        <span v-else>▶</span>
        {{ running ? "Running…" : started ? "Run Again" : "Trigger Build" }}
      </button>
      <button class="btn btn--abort" v-if="running" @click="abortPipeline">✕ Abort</button>
      <button class="btn btn--resume" v-if="awaitingApproval" @click="approveDeploy">✓ Approve &amp; Deploy</button>
      <div class="control-divider" v-if="started"></div>
      <button class="btn btn--secondary" @click="saveState" :disabled="!started">💾 Export state</button>
      <button class="btn btn--secondary" @click="loadState">📂 Load from localStorage</button>
    </div>

    <Transition name="slide-up">
      <div class="progress-wrap" v-if="started">
        <div class="progress-bar"><div class="progress-bar__fill" :style="{ width: progressPct + '%' }"></div></div>
        <span class="progress-pct">{{ progressPct }}%</span>
      </div>
    </Transition>

    <Transition name="slide-up">
      <div class="error-banner" v-if="error && !running">
        <span class="error-banner__icon">⚠</span>
        <div>
          <div class="error-banner__title">Pipeline stopped</div>
          <div class="error-banner__msg">{{ error?.message ?? String(error) }}</div>
        </div>
      </div>
    </Transition>

    <Transition name="slide-up">
      <div class="info-note" v-if="awaitingApproval">
        ⏸ Pipeline paused via a real <code>orchestrator.pause()</code> call inside the
        <code>awaitApproval</code> stage — click <strong>Approve &amp; Deploy</strong> to
        call <code>resume()</code> and continue to the deploy stage.
      </div>
    </Transition>

    <!-- ── Pipeline flow ────────────────────────────────────── -->
    <div class="pipeline-flow" v-if="started">
      <template v-for="(stage, idx) in STAGES" :key="stage.key">
        <div class="pipe-arrow" v-if="idx > 0">→</div>

        <!-- Parallel groups: break down into one card per service instead
             of collapsing 4 concurrent requests into one opaque box. -->
        <div class="parallel-wrap" v-if="GROUP_PREFIXES.has(stage.key)">
          <div class="parallel-group">
            <div class="parallel-label">{{ stage.label }}</div>
            <div class="parallel-stages">
              <div
                v-for="service in SERVICES"
                :key="service"
                class="stage-card parallel-stage-card"
                :class="{
                  'stage-card--running': serviceResult(stage.key, service)?.status === 'pending',
                  'stage-card--success': serviceResult(stage.key, service)?.status === 'success',
                  'stage-card--error': serviceResult(stage.key, service)?.status === 'error',
                }"
              >
                <div class="stage-card__head">
                  <div class="stage-dot"></div>
                  <span class="stage-card__key">{{ service }}</span>
                </div>
                <div class="stage-card__body" v-if="serviceResultText(stage.key, service)">
                  <div class="stage-card__result">{{ serviceResultText(stage.key, service) }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Regular single stage -->
        <div class="stage-wrap" v-else>
          <div
            class="stage-card"
            :class="{
              'stage-card--running': stageStatus(stage.key) === 'pending',
              'stage-card--success': stageStatus(stage.key) === 'success',
              'stage-card--error': stageStatus(stage.key) === 'error',
              'stage-card--skipped': stageStatus(stage.key) === 'skipped',
            }"
          >
            <div class="stage-card__head">
              <div class="stage-dot"></div>
              <span class="stage-card__key">{{ stage.label }}</span>
            </div>
            <div class="stage-card__body">
              <div class="stage-card__desc">{{ stage.desc }}</div>
              <div class="stage-card__result" v-if="stageResultText(stage.key)">{{ stageResultText(stage.key) }}</div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- ── Live console ─────────────────────────────────────── -->
    <div class="data-panel" v-if="consoleLines.length">
      <div class="data-panel__head">
        <span>Build console</span>
        <span class="badge badge--neutral">{{ consoleLines.length }} lines</span>
      </div>
      <div class="data-panel__body" style="padding:10px">
        <div class="console" ref="consoleEl">
          <div v-for="line in consoleLines" :key="line.id" class="console__line" :class="`console__line--${line.kind}`">
            <span class="console__time">+{{ line.ts - (consoleLines[0]?.ts ?? line.ts) }}ms</span>
            <span class="console__text">{{ line.text }}</span>
          </div>
          <span v-if="running" class="console__cursor"></span>
        </div>
      </div>
    </div>

    <!-- ── Export preview ───────────────────────────────────── -->
    <div class="data-panel" v-if="exportedPreview">
      <div class="data-panel__head">exportState() snapshot</div>
      <div class="data-panel__body" style="padding:0">
        <pre class="code-block" style="max-height:200px">{{ exportedPreview }}</pre>
      </div>
    </div>

    <!-- ── Build summary ────────────────────────────────────── -->
    <Transition name="fade">
      <div class="build-summary" v-if="allDone && lastBuild">
        <div class="build-summary__inner">
          <div class="build-summary__head">
            <span class="build-summary__icon">✅</span>
            <div>
              <div class="build-summary__title">Deployed {{ lastBuild.version }}</div>
              <div class="build-summary__sub">{{ lastBuild.url }}</div>
            </div>
          </div>
          <div class="build-summary__grid">
            <div><div class="bs-field__label">Branch</div><div class="bs-field__value">{{ lastBuild.branch }}</div></div>
            <div><div class="bs-field__label">Services</div><div class="bs-field__value">{{ SERVICES.length + 1 }}</div></div>
            <div><div class="bs-field__label">jitterStrategy</div><div class="bs-field__value">{{ jitterStrategy }}</div></div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── Circuit breaker sandbox ──────────────────────────── -->
    <div class="data-panel">
      <div class="data-panel__head">
        <span>Circuit breaker sandbox</span>
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
          Reuses the last triggered build's id — trigger a build above first. The server fails the first 3 deploy
          calls; <code style="font-family:var(--font-mono)">failureThreshold: 3</code> means the breaker trips
          open on the 3rd failure and starts rejecting locally (no network call) until <code>openMs</code> elapses.
        </p>
        <div class="demo-controls" style="margin-bottom:12px">
          <button class="btn btn--run" @click="sandboxDeploy" :disabled="!lastBuildId" :title="!lastBuildId ? 'Trigger a build first' : ''">
            Attempt Deploy{{ !lastBuildId ? " (no build yet)" : "" }}
          </button>
          <button class="btn btn--reset" @click="resetSandbox">Reset</button>
        </div>
        <div class="console" v-if="breakerLog.length" style="max-height:140px">
          <div v-for="(l, i) in breakerLog" :key="i" class="console__line" :class="l.startsWith('✓') ? 'console__line--success' : 'console__line--error'">
            <span class="console__text">{{ l }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="empty-state" v-if="!started">
      <div style="font-size:36px;margin-bottom:12px">🚦</div>
      <div>Configure the branch/settings and click <strong>Trigger Build</strong></div>
    </div>

    <div class="code-section" style="margin-top:20px">
      <button class="code-section__toggle" @click="showCode = !showCode">
        <span>▸ Pipeline shape (pipe() builder)</span>
        <span class="code-arrow" :class="{ 'code-arrow--open': showCode }">▶</span>
      </button>
      <Transition name="expand">
        <div v-if="showCode">
          <pre class="code-block"><span class="kw">const</span> orchestrator = <span class="fn">pipe</span>()
  .<span class="fn">step</span>({ <span class="prop">key</span>: <span class="str">"trigger"</span>, <span class="prop">request</span>: <span class="op">...</span>, <span class="prop">next</span>: ({ result }) <span class="op">=></span> result.branch.<span class="fn">startsWith</span>(<span class="str">"hotfix/"</span>) <span class="op">?</span> <span class="str">"deploy"</span> <span class="op">:</span> <span class="kw">null</span> })
  .<span class="fn">parallel</span>(services.<span class="fn">map</span>(s <span class="op">=></span> ({ <span class="prop">key</span>: <span class="str">`build:${s}`</span>, <span class="op">...</span> })), { <span class="prop">key</span>: <span class="str">"build"</span> })
  .<span class="fn">subPipeline</span>({ <span class="prop">key</span>: <span class="str">"frontendPipeline"</span>, <span class="prop">subPipeline</span>: { <span class="prop">stages</span>: [buildStage, testStage] } })
  .<span class="fn">parallel</span>(services.<span class="fn">map</span>(s <span class="op">=></span> ({ <span class="prop">key</span>: <span class="str">`test:${s}`</span>, <span class="op">...</span> })), { <span class="prop">key</span>: <span class="str">"test"</span> })
  .<span class="fn">step</span>({ <span class="prop">key</span>: <span class="str">"awaitApproval"</span>, <span class="prop">request</span>: <span class="kw">async</span> () <span class="op">=></span> { orchestrator.<span class="fn">pause</span>(); <span class="kw">return</span> {}; } })
  .<span class="fn">step</span>({ <span class="prop">key</span>: <span class="str">"deploy"</span>, <span class="prop">request</span>: <span class="op">...</span> })
  .<span class="fn">stream</span>({ <span class="prop">key</span>: <span class="str">"logs"</span>, <span class="prop">stream</span>: ({ signal }) <span class="op">=></span> <span class="fn">sseLogSource</span>(buildId, signal), <span class="prop">onChunk</span>: line <span class="op">=></span> <span class="fn">addConsole</span>(line) })
  .<span class="fn">build</span>({ <span class="prop">pipelineOptions</span>: { <span class="prop">plugins</span>: [loggingPlugin] } });

<span class="cmt">// Approve &amp; deploy button:</span>
runState.<span class="fn">resume</span>(); <span class="cmt">// unblocks waitIfPaused() right before "deploy"</span></pre>
        </div>
      </Transition>
    </div>
  </div>
</template>
