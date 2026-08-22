<script setup lang="ts">
import { ref, computed } from "vue";
import { paginate } from "rest-pipeline-js";

interface Build {
  id: string;
  branch: string;
  services: string[];
  createdAt: number;
  status: string;
  page?: number;
}

const strategy = ref<"cursor" | "offset">("offset");
const pageSize = ref(15);
const items = ref<Build[]>([]);
const pagesLoaded = ref(0);
const loading = ref(false);
const done = ref(false);
let abortController: AbortController | null = null;

async function loadAll() {
  items.value = [];
  pagesLoaded.value = 0;
  done.value = false;
  loading.value = true;
  abortController = new AbortController();

  const options =
    strategy.value === "offset"
      ? {
          strategy: "offset" as const,
          limit: pageSize.value,
          signal: abortController.signal,
          fetchPage: async (offset: number, limit: number) => {
            const res = await fetch(`/api/cicd/builds?offset=${offset}&limit=${limit}`, { signal: abortController!.signal });
            return res.json();
          },
        }
      : {
          strategy: "cursor" as const,
          signal: abortController.signal,
          fetchPage: async (cursor: string | undefined) => {
            const res = await fetch(`/api/cicd/builds?limit=${pageSize.value}${cursor ? `&cursor=${cursor}` : ""}`, {
              signal: abortController!.signal,
            });
            const data = await res.json();
            return { items: data.items, nextCursor: data.nextCursor };
          },
        };

  try {
    for await (const page of paginate<Build, string>(options as any)) {
      pagesLoaded.value++;
      items.value.push(...page.map((b) => ({ ...b, page: pagesLoaded.value })));
      await new Promise((r) => setTimeout(r, 150)); // slow it down enough to see pages arrive
    }
    done.value = true;
  } catch (e: any) {
    if (e?.name !== "AbortError" && e?.message !== "canceled") throw e;
  } finally {
    loading.value = false;
  }
}

function stopLoading() {
  abortController?.abort();
  loading.value = false;
}

const showCode = ref(false);
const statusCounts = computed(() => {
  const counts: Record<string, number> = {};
  for (const item of items.value) counts[item.status] = (counts[item.status] ?? 0) + 1;
  return counts;
});
</script>

<template>
  <div>
    <div class="demo-header">
      <div class="demo-title"><span class="demo-icon">📄</span> Pagination</div>
      <p class="demo-desc">
        <code style="font-family:var(--font-mono);color:var(--primary-light)">paginate()</code> as an
        <code style="font-family:var(--font-mono)">AsyncGenerator&lt;T[]&gt;</code> over the CI/CD build history —
        the same endpoint supports both a cursor and an offset strategy, toggle below to compare.
      </p>
      <div class="feature-tags">
        <span class="tag tag--primary">paginate()</span>
        <span class="tag tag--primary">cursor strategy</span>
        <span class="tag tag--primary">offset strategy</span>
      </div>
    </div>

    <div class="data-panel">
      <div class="data-panel__head">Settings</div>
      <div class="data-panel__body">
        <div style="display:flex;gap:32px;flex-wrap:wrap;align-items:flex-end">
          <div>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">Strategy</div>
            <select v-model="strategy" :disabled="loading" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-family:var(--font-mono);font-size:12px">
              <option value="offset">offset (limit + offset)</option>
              <option value="cursor">cursor (limit + cursor)</option>
            </select>
            <div style="font-size:11px;color:var(--text-dim);margin-top:6px;max-width:260px">
              <template v-if="strategy === 'offset'">Simple, supports "jump to page N" — but a row inserted/deleted mid-list can shift results between pages.</template>
              <template v-else>Stable under concurrent writes (each page anchors to the previous item's id) — but no random access, only "next".</template>
            </div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">Page size: <strong style="color:var(--primary-light);font-family:var(--font-mono)">{{ pageSize }}</strong></div>
            <input type="range" min="5" max="30" step="5" v-model.number="pageSize" :disabled="loading" style="accent-color:var(--primary);width:160px" />
          </div>
        </div>
      </div>
    </div>

    <div class="demo-controls">
      <button class="btn btn--run" @click="loadAll" :disabled="loading">
        <span class="btn__spinner" v-if="loading"></span>
        <span v-else>▶</span>
        {{ loading ? `Loading page ${pagesLoaded + 1}…` : "Load All Builds" }}
      </button>
      <button class="btn btn--abort" v-if="loading" @click="stopLoading">✕ Stop</button>
    </div>

    <div class="stats-row" v-if="items.length">
      <div class="stat-box">
        <div class="stat-box__label">Pages loaded</div>
        <div class="stat-box__value">{{ pagesLoaded }}</div>
      </div>
      <div class="stat-box">
        <div class="stat-box__label">Items loaded</div>
        <div class="stat-box__value" style="color:var(--primary-light)">{{ items.length }}</div>
      </div>
      <div class="stat-box" v-for="(count, status) in statusCounts" :key="status">
        <div class="stat-box__label">{{ status }}</div>
        <div class="stat-box__value">{{ count }}</div>
      </div>
    </div>

    <div class="data-panel" v-if="items.length">
      <div class="data-panel__head">
        <span>Build history</span>
        <span class="badge" :class="done ? 'badge--success' : 'badge--running'">{{ done ? "complete" : "loading…" }}</span>
      </div>
      <div class="data-panel__body" style="padding:0;max-height:400px;overflow-y:auto">
        <div class="req-log" style="border:none;border-radius:0">
          <template v-for="(b, i) in items" :key="b.id">
            <div
              v-if="b.page !== items[i - 1]?.page"
              style="padding:6px 14px;font-size:10px;font-family:var(--font-mono);color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;background:var(--surface3)"
            >
              — page {{ b.page }} —
            </div>
            <div class="req-log__row">
              <span class="req-log__num">{{ i + 1 }}</span>
              <span class="req-log__url">{{ b.branch }} ({{ b.services.length }} svc)</span>
              <span class="req-log__dur">{{ new Date(b.createdAt).toLocaleDateString() }}</span>
              <span></span>
              <span class="req-log__stat">
                <span class="badge" :class="{ 'badge--success': b.status === 'success', 'badge--error': b.status === 'failed', 'badge--running': b.status === 'running' }">{{ b.status }}</span>
              </span>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div class="empty-state" v-if="!items.length && !loading">
      <div style="font-size:36px;margin-bottom:12px">📄</div>
      <div>Click <strong>Load All Builds</strong> to page through the build history</div>
    </div>

    <div class="code-section" style="margin-top:20px">
      <button class="code-section__toggle" @click="showCode = !showCode">
        <span>▸ paginate() — offset vs cursor</span>
        <span class="code-arrow" :class="{ 'code-arrow--open': showCode }">▶</span>
      </button>
      <Transition name="expand">
        <div v-if="showCode">
          <pre class="code-block"><span class="cmt">// Offset strategy</span>
<span class="kw">for await</span> (<span class="kw">const</span> page <span class="kw">of</span> <span class="fn">paginate</span>({
  <span class="prop">strategy</span>: <span class="str">"offset"</span>,
  <span class="prop">limit</span>: <span class="num">15</span>,
  <span class="prop">fetchPage</span>: (offset, limit) <span class="op">=></span> <span class="fn">fetchBuilds</span>({ offset, limit }),
})) {
  items.<span class="fn">push</span>(<span class="op">...</span>page);
}

<span class="cmt">// Cursor strategy — same endpoint, different params</span>
<span class="kw">for await</span> (<span class="kw">const</span> page <span class="kw">of</span> <span class="fn">paginate</span>({
  <span class="prop">fetchPage</span>: (cursor) <span class="op">=></span> <span class="fn">fetchBuilds</span>({ cursor }).<span class="fn">then</span>(r <span class="op">=></span> ({ <span class="prop">items</span>: r.items, <span class="prop">nextCursor</span>: r.nextCursor })),
})) {
  items.<span class="fn">push</span>(<span class="op">...</span>page);
}</pre>
        </div>
      </Transition>
    </div>
  </div>
</template>
