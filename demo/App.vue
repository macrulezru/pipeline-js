<script setup lang="ts">
import { ref, shallowRef, defineAsyncComponent } from "vue";

const FlightDemo = defineAsyncComponent(() => import("./views/FlightDemo.vue"));
const ParallelDemo = defineAsyncComponent(
  () => import("./views/ParallelDemo.vue"),
);
const RetryDemo = defineAsyncComponent(() => import("./views/RetryDemo.vue"));
const CacheDemo = defineAsyncComponent(() => import("./views/CacheDemo.vue"));
const TracingDemo = defineAsyncComponent(
  () => import("./views/TracingDemo.vue"),
);

const demos = [
  {
    id: "flight",
    icon: "✈️",
    title: "Flight Pipeline",
    subtitle: "Sequential stages · sharedData",
    component: FlightDemo,
  },
  {
    id: "parallel",
    icon: "🔀",
    title: "Parallel Loading",
    subtitle: "pipe() builder · concurrent",
    component: ParallelDemo,
  },
  {
    id: "retry",
    icon: "🛡️",
    title: "Retry & Recovery",
    subtitle: "Backoff · abort · pause/resume",
    component: RetryDemo,
  },
  {
    id: "cache",
    icon: "⚡",
    title: "Cache & Rate Limit",
    subtitle: "HTTP optimization · metrics",
    component: CacheDemo,
  },
  {
    id: "tracing",
    icon: "🔑",
    title: "Idempotency & Tracing",
    subtitle: "autoIdempotencyKey · traceparent",
    component: TracingDemo,
  },
];

const activeId = ref("flight");
const ActiveComponent = shallowRef(FlightDemo);

function navigate(demo: (typeof demos)[number]) {
  activeId.value = demo.id;
  ActiveComponent.value = demo.component;
}
</script>

<template>
  <div class="app-layout">
    <!-- ── Sidebar ──────────────────────────────────────────── -->
    <aside class="sidebar">
      <div class="sidebar-logo">
        <div class="sidebar-logo__icon">🚀</div>
        <div class="sidebar-logo__text">
          <div class="sidebar-logo__name">rest-pipeline-js</div>
          <div class="sidebar-logo__sub">Interactive Demo</div>
        </div>
      </div>

      <nav class="sidebar-nav">
        <button
          v-for="demo in demos"
          :key="demo.id"
          class="nav-item"
          :class="{ 'nav-item--active': activeId === demo.id }"
          @click="navigate(demo)"
        >
          <span class="nav-item__icon">{{ demo.icon }}</span>
          <div class="nav-item__text">
            <div class="nav-item__title">{{ demo.title }}</div>
            <div class="nav-item__sub">{{ demo.subtitle }}</div>
          </div>
        </button>
      </nav>

      <div class="sidebar-links">
        <a
          href="https://github.com/macrulezru/pipeline-js"
          target="_blank"
          class="sidebar-link"
          title="GitHub"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"
            />
          </svg>
          GitHub
        </a>
        <a
          href="https://www.npmjs.com/package/rest-pipeline-js"
          target="_blank"
          class="sidebar-link"
          title="npm"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M0 0v24h24V0H0zm6.672 18.586H3.328V5.414h3.344v13.172zm7.656 0h-3.344v-9.83H7.656V5.414h10.004v13.172h-3.332v-9.83z"
            />
          </svg>
          npm
        </a>
      </div>
    </aside>

    <!-- ── Main content ───────────────────────────────────── -->
    <main class="content">
      <Suspense>
        <component :is="ActiveComponent" />
        <template #fallback>
          <div class="loading-placeholder">
            <div class="loading-spinner"></div>
            <span>Loading demo…</span>
          </div>
        </template>
      </Suspense>
    </main>
  </div>
</template>
