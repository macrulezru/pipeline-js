<script setup lang="ts">
import { ref } from "vue";
import { pipe } from "rest-pipeline-js";
import type { PipelineOrchestrator, PipelineExportedState } from "rest-pipeline-js";

interface LogEntry {
  id: number;
  text: string;
  kind: "info" | "success" | "error";
  ts: number;
}
const log = ref<LogEntry[]>([]);
let logId = 0;
function addLog(text: string, kind: LogEntry["kind"] = "info") {
  log.value.push({ id: ++logId, text, kind, ts: Date.now() });
}

function loggingPlugin() {
  return {
    name: "console-logger",
    install(o: PipelineOrchestrator) {
      const off = o.on("log", (event: any) => {
        addLog(`[plugin] ${event?.type ?? "log"}${event?.stepKey ? ` (${event.stepKey})` : ""}`);
      });
      return () => off();
    },
  };
}

function buildOrchestrator(branch: string) {
  return pipe()
    .step({
      key: "checkBranch",
      request: async () => ({ branch }),
      next: ({ result }) => (result.branch.startsWith("hotfix/") ? "notify" : null),
    })
    .subPipeline({
      key: "runChecks",
      subPipeline: {
        stages: [
          { key: "lint", request: async () => ({ passed: true, warnings: 0 }) },
          { key: "test", request: async () => ({ passed: true, coverage: 94 }) },
        ],
      },
    })
    .step({
      key: "notify",
      request: async ({ allResults }) => ({
        summary: allResults.runChecks ? "Checks passed, team notified" : "Hotfix — checks skipped, team notified",
      }),
    })
    .build({ pipelineOptions: { plugins: [loggingPlugin()] } });
}

const running = ref(false);
const lastResult = ref<any>(null);
let orchestrator: PipelineOrchestrator | null = null;

async function run(branch: string) {
  running.value = true;
  log.value = [];
  orchestrator = buildOrchestrator(branch);
  addLog(`Running with branch="${branch}"`);
  try {
    lastResult.value = await orchestrator.run();
  } catch (e: any) {
    addLog(`Run failed: ${e?.message ?? e}`, "error");
  } finally {
    running.value = false;
  }
}

// ── Export / import ────────────────────────────────────────────
const exportedState = ref<PipelineExportedState | null>(null);
const importedPreview = ref<any>(null);

function exportNow() {
  if (!orchestrator) return;
  exportedState.value = orchestrator.exportState();
  localStorage.setItem("orchestration-demo-state", JSON.stringify(exportedState.value));
  addLog("exportState() → saved to localStorage", "success");
}

function importIntoFreshOrchestrator() {
  const raw = localStorage.getItem("orchestration-demo-state");
  if (!raw) {
    addLog("No saved state in localStorage — export first", "error");
    return;
  }
  const state: PipelineExportedState = JSON.parse(raw);
  const fresh = buildOrchestrator("main");
  fresh.importState(state);
  importedPreview.value = {
    stageResults: fresh.getStageResults(),
    logs: fresh.getLogs().length,
  };
  addLog("importState() → restored stageResults into a brand-new orchestrator instance", "success");
}

const showCode = ref(false);
</script>

<template>
  <div>
    <div class="demo-header">
      <div class="demo-title"><span class="demo-icon">🕸️</span> Advanced Orchestration</div>
      <p class="demo-desc">
        Four orchestration primitives in one small pipeline: a DAG
        <code style="font-family:var(--font-mono);color:var(--primary-light)">next()</code> branch, a nested
        <code style="font-family:var(--font-mono);color:var(--primary-light)">subPipeline</code>, a
        <code style="font-family:var(--font-mono);color:var(--primary-light)">PipelinePlugin</code> capturing
        events, and <code style="font-family:var(--font-mono);color:var(--primary-light)">exportState()</code> /
        <code style="font-family:var(--font-mono);color:var(--primary-light)">importState()</code> round-tripping
        through <code style="font-family:var(--font-mono)">localStorage</code> into a fresh orchestrator instance.
      </p>
      <div class="feature-tags">
        <span class="tag tag--primary">next() DAG branch</span>
        <span class="tag tag--primary">subPipeline</span>
        <span class="tag tag--primary">PipelinePlugin</span>
        <span class="tag tag--primary">exportState / importState</span>
      </div>
    </div>

    <div class="demo-controls">
      <button class="btn btn--run" @click="run('feature/checkout-v2')" :disabled="running">Run: feature branch (full path)</button>
      <button class="btn btn--secondary" @click="run('hotfix/urgent-fix')" :disabled="running">Run: hotfix branch (skips checks)</button>
    </div>

    <div class="pipeline-flow" v-if="lastResult">
      <div class="stage-wrap">
        <div class="stage-card" :class="lastResult.stageResults.checkBranch ? 'stage-card--success' : ''">
          <div class="stage-card__head"><div class="stage-dot"></div><span class="stage-card__key">checkBranch</span></div>
          <div class="stage-card__body">
            <div class="stage-card__desc">branch: {{ lastResult.stageResults.checkBranch?.data?.branch }}</div>
            <div class="stage-card__result">next() → {{ lastResult.stageResults.runChecks ? "runChecks (default order)" : "notify (jumped)" }}</div>
          </div>
        </div>
      </div>
      <div class="pipe-arrow">→</div>
      <div class="stage-wrap">
        <div class="stage-card" :class="lastResult.stageResults.runChecks ? 'stage-card--success' : 'stage-card--skipped'">
          <div class="stage-card__head"><div class="stage-dot"></div><span class="stage-card__key">runChecks (subPipeline)</span></div>
          <div class="stage-card__body">
            <div class="stage-card__desc" v-if="lastResult.stageResults.runChecks">lint + test both passed</div>
            <div class="stage-card__desc" v-else>skipped by next() branch</div>
          </div>
        </div>
      </div>
      <div class="pipe-arrow">→</div>
      <div class="stage-wrap">
        <div class="stage-card" :class="lastResult.stageResults.notify ? 'stage-card--success' : ''">
          <div class="stage-card__head"><div class="stage-dot"></div><span class="stage-card__key">notify</span></div>
          <div class="stage-card__body"><div class="stage-card__result">{{ lastResult.stageResults.notify?.data?.summary }}</div></div>
        </div>
      </div>
    </div>

    <div class="demo-controls" v-if="lastResult">
      <button class="btn btn--secondary" @click="exportNow">💾 exportState()</button>
      <button class="btn btn--secondary" @click="importIntoFreshOrchestrator">📂 importState() into fresh instance</button>
    </div>

    <div class="data-panel" v-if="importedPreview">
      <div class="data-panel__head">Restored into a brand-new PipelineOrchestrator</div>
      <div class="data-panel__body" style="padding:0">
        <pre class="code-block" style="max-height:220px">{{ JSON.stringify(importedPreview, null, 2) }}</pre>
      </div>
    </div>

    <div class="data-panel" v-if="log.length">
      <div class="data-panel__head">
        <span>Event log (via PipelinePlugin)</span>
        <span class="badge badge--neutral">{{ log.length }} events</span>
      </div>
      <div class="data-panel__body" style="padding:10px">
        <div class="retry-log">
          <div v-for="e in log" :key="e.id" class="retry-entry" :class="e.kind === 'error' ? 'retry-entry--error' : e.kind === 'success' ? 'retry-entry--success' : ''">
            <span class="retry-entry__text">{{ e.text }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="empty-state" v-if="!lastResult">
      <div style="font-size:36px;margin-bottom:12px">🕸️</div>
      <div>Run either branch to see the DAG jump, subPipeline, and plugin log in action</div>
    </div>

    <div class="code-section" style="margin-top:20px">
      <button class="code-section__toggle" @click="showCode = !showCode">
        <span>▸ next() + subPipeline + plugin</span>
        <span class="code-arrow" :class="{ 'code-arrow--open': showCode }">▶</span>
      </button>
      <Transition name="expand">
        <div v-if="showCode">
          <pre class="code-block"><span class="kw">const</span> orchestrator = <span class="fn">pipe</span>()
  .<span class="fn">step</span>({
    <span class="prop">key</span>: <span class="str">"checkBranch"</span>,
    <span class="prop">request</span>: <span class="kw">async</span> () <span class="op">=></span> ({ branch }),
    <span class="prop">next</span>: ({ result }) <span class="op">=></span> result.branch.<span class="fn">startsWith</span>(<span class="str">"hotfix/"</span>) <span class="op">?</span> <span class="str">"notify"</span> <span class="op">:</span> <span class="kw">null</span>,
  })
  .<span class="fn">subPipeline</span>({
    <span class="prop">key</span>: <span class="str">"runChecks"</span>,
    <span class="prop">subPipeline</span>: { <span class="prop">stages</span>: [lintStage, testStage] },
  })
  .<span class="fn">step</span>({ <span class="prop">key</span>: <span class="str">"notify"</span>, <span class="prop">request</span>: <span class="op">...</span> })
  .<span class="fn">build</span>({ <span class="prop">pipelineOptions</span>: { <span class="prop">plugins</span>: [loggingPlugin] } });

<span class="cmt">// elsewhere, on a fresh page load:</span>
<span class="kw">const</span> state = JSON.<span class="fn">parse</span>(localStorage.<span class="fn">getItem</span>(<span class="str">"saved"</span>));
<span class="kw">const</span> restored = <span class="fn">pipe</span>()<span class="op">...</span><span class="fn">build</span>();
restored.<span class="fn">importState</span>(state); <span class="cmt">// stageResults + logs restored</span></pre>
        </div>
      </Transition>
    </div>
  </div>
</template>
