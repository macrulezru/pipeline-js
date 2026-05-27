<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import {
  PipelineOrchestrator,
  usePipelineRunVue,
  usePipelineProgressVue,
} from "rest-pipeline-js/vue";

// ── API ──────────────────────────────────────────────────────────
const BASE = "https://macrulez-api.ru/api/portfolio/fly";
async function fly(path: string) {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Shared display state ─────────────────────────────────────────
const display = reactive({
  from: "", fromCity: "",
  to: "", toCity: "",
  date: "", depTime: "", arrTime: "",
  flightNumber: "", planeType: "",
  offers: [] as any[],
  services: [] as any[],
  seat: null as { row: any; letter: string } | null,
  urls: { points: "points", availability: "", services: "", seatmap: "" } as Record<string, string>,
});

function resetDisplay() {
  Object.assign(display, {
    from: "", fromCity: "", to: "", toCity: "",
    date: "", depTime: "", arrTime: "",
    flightNumber: "", planeType: "",
    offers: [], services: [], seat: null,
    urls: { points: "points", availability: "", services: "", seatmap: "" },
  });
}

// ── Stage durations ──────────────────────────────────────────────
const durations = reactive<Record<string, number>>({});
const startTimes = reactive<Record<string, number>>({});

// ── Pipeline ─────────────────────────────────────────────────────
const orchestrator = new PipelineOrchestrator({
  config: {
    stages: [
      {
        key: "points",
        pauseAfter: 600,
      },
      {
        key: "availability",
        request: async ({ prev, sharedData }: any) => {
          const pts = prev.points;
          if (!Array.isArray(pts) || pts.length < 2) throw new Error("No airports");
          const i = Math.floor(Math.random() * pts.length);
          let j = Math.floor(Math.random() * (pts.length - 1));
          if (j >= i) j++;
          const fp = pts[i], tp = pts[j];
          sharedData.from = fp.point_code;
          sharedData.to   = tp.point_code;
          display.from     = fp.point_code;
          display.fromCity = fp.city_name_ru || fp.city_name || fp.point_code;
          display.to       = tp.point_code;
          display.toCity   = tp.city_name_ru || tp.city_name || tp.point_code;
          const path = `availability/${sharedData.from}/${sharedData.to}`;
          display.urls.availability = path;
          return fly(path);
        },
        pauseBefore: 500,
      },
      {
        key: "services",
        request: async ({ prev, sharedData }: any) => {
          sharedData.apiDate = prev["api-date"];
          display.date = sharedData.apiDate;
          const dir =
            prev.directions?.find((d: any) => d.date === sharedData.apiDate && d.flights?.length) ??
            prev.directions?.find((d: any) => d.flights?.length);
          if (!dir) throw new Error("No flights available");
          const flight = dir.flights[Math.floor(Math.random() * dir.flights.length)];
          const seg = flight.segments[0];
          sharedData.flightNumber = `${seg.ak}-${seg.flight_number}`;
          display.flightNumber = sharedData.flightNumber;
          display.depTime   = seg.departure_time;
          display.arrTime   = seg.arrival_time;
          display.planeType = seg.plane_type_name;
          display.offers    = flight.offers ?? [];
          const path = `services/${sharedData.from}/${sharedData.to}/${sharedData.apiDate}/${sharedData.flightNumber}`;
          display.urls.services = path;
          return fly(path);
        },
        pauseBefore: 500,
      },
      {
        key: "seatmap",
        request: async ({ sharedData }: any) => {
          const path = `seatmap/${sharedData.apiDate}/${sharedData.flightNumber}`;
          display.urls.seatmap = path;
          const data = await fly(path);
          const avail: { row: any; letter: string }[] = [];
          for (const cabin of data.segments?.[0]?.cabins ?? []) {
            (cabin.rows ?? []).forEach((row: any, ri: number) => {
              for (const cell of row.cells ?? []) {
                if (cell.available === "Y" && cell.letter) {
                  avail.push({ row: row.row_number ?? row.row ?? row.number ?? ri + 1, letter: cell.letter });
                }
              }
            });
          }
          display.seat     = avail.length ? avail[Math.floor(Math.random() * avail.length)] : null;
          display.services = (data.services ?? []).slice(0, 5);
          return data;
        },
        pauseBefore: 300,
      },
    ],
    middleware: {
      beforeEach: ({ stage }: any) => { startTimes[stage.key] = Date.now(); },
      afterEach:  ({ stage }: any) => { durations[stage.key] = Date.now() - (startTimes[stage.key] ?? Date.now()); },
      onError:    ({ stage }: any) => { durations[stage.key] = Date.now() - (startTimes[stage.key] ?? Date.now()); },
    },
  },
  httpConfig: { baseURL: BASE, timeout: 15000 },
});

const { run, running, error, stageResults, abort } = usePipelineRunVue(orchestrator);
const progress = usePipelineProgressVue(orchestrator);

// ── Stage metadata ────────────────────────────────────────────────
const STAGES = [
  { key: "points",       label: "Airports",     desc: "Fetch airport list, pick random route" },
  { key: "availability", label: "Availability", desc: "Query flights for the selected route" },
  { key: "services",     label: "Services",     desc: "Load ancillary services for the flight" },
  { key: "seatmap",      label: "Seat map",     desc: "Fetch seat map, pick a free seat" },
];

// ── Derived state ─────────────────────────────────────────────────
const stageStatus = computed<Record<string, string>>(() => {
  const arr = progress.value?.stageStatuses;
  if (!arr) return {};
  return Object.fromEntries(STAGES.map((s, i) => [s.key, arr[i] ?? ""]));
});

function getStatus(key: string) { return stageStatus.value[key] ?? "idle"; }
function getResult(key: string) { return (stageResults.value as any)?.[key]; }
function getDuration(key: string) {
  const ms = durations[key];
  if (!ms) return "";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const displayError = computed(() => {
  if (error.value) return { msg: (error.value as any)?.message ?? String(error.value) };
  if (!stageResults.value) return null;
  for (const s of STAGES) {
    const r = (stageResults.value as any)[s.key];
    if (r?.status === "error") return { msg: r.error?.message ?? "Stage failed" };
  }
  return null;
});

const completedCount = computed(() =>
  Object.values(stageStatus.value).filter((s) => s === "success" || s === "error").length
);
const progressPercent = computed(() =>
  resetting.value ? 0 : Math.round((completedCount.value / STAGES.length) * 100)
);
const allDone = computed(() =>
  !resetting.value && STAGES.every((s) => stageStatus.value[s.key] === "success")
);

// ── Actions ───────────────────────────────────────────────────────
const resetting = ref(false);
const started   = ref(false);
const showCode  = ref(false);

async function startPipeline() {
  resetting.value = true;
  resetDisplay();
  Object.keys(durations).forEach((k) => delete durations[k]);
  orchestrator.clearStageResults();
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
        <span class="demo-icon">✈️</span>
        Flight Booking Pipeline
      </div>
      <p class="demo-desc">
        A 4-stage sequential pipeline that searches for real flights via the
        macrulez-api.ru REST API. Each stage passes its result forward via
        <code style="font-family:var(--font-mono);color:var(--primary-light);font-size:12px">prev</code>
        and mutates a
        <code style="font-family:var(--font-mono);color:var(--primary-light);font-size:12px">sharedData</code>
        pool used by downstream stages. Includes artificial pauses between stages
        to make the flow visible.
      </p>
      <div class="feature-tags">
        <span class="tag tag--primary">PipelineOrchestrator</span>
        <span class="tag tag--primary">sharedData</span>
        <span class="tag tag--primary">middleware</span>
        <span class="tag">pauseBefore / pauseAfter</span>
        <span class="tag">usePipelineRunVue</span>
        <span class="tag">usePipelineProgressVue</span>
      </div>
    </div>

    <!-- ── Controls ───────────────────────────────────────────── -->
    <div class="demo-controls">
      <button class="btn btn--run" @click="startPipeline" :disabled="running">
        <span class="btn__spinner" v-if="running"></span>
        <span v-else>▶</span>
        {{ running ? "Running…" : started ? "Run Again" : "Run Pipeline" }}
      </button>
      <button class="btn btn--abort" v-if="running" @click="abort()">
        ✕ Abort
      </button>
    </div>

    <!-- ── Progress bar ────────────────────────────────────────── -->
    <Transition name="slide-up">
      <div class="progress-wrap" v-if="started && !resetting">
        <div class="progress-bar">
          <div class="progress-bar__fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <span class="progress-pct">{{ progressPercent }}%</span>
      </div>
    </Transition>

    <!-- ── Error banner ────────────────────────────────────────── -->
    <Transition name="slide-up">
      <div class="error-banner" v-if="displayError">
        <span class="error-banner__icon">⚠</span>
        <div>
          <div class="error-banner__title">Pipeline failed</div>
          <div class="error-banner__msg">{{ displayError.msg }}</div>
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
              <span class="stage-card__dur" v-if="getDuration(stage.key)">
                {{ getDuration(stage.key) }}
              </span>
            </div>
            <div class="stage-card__body">
              <div class="stage-card__desc">{{ stage.desc }}</div>

              <!-- URL -->
              <div
                class="stage-card__result"
                v-if="getStatus(stage.key) !== 'idle' && display.urls[stage.key]"
                style="color:var(--text-dim);margin-bottom:6px;font-size:11px"
              >
                GET /{{ display.urls[stage.key] }}
              </div>

              <!-- Route (points) -->
              <Transition name="slide-up">
                <div v-if="stage.key === 'points' && getStatus('points') === 'success'">
                  <div style="display:flex;align-items:center;gap:10px;margin-top:4px">
                    <div>
                      <div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--text);line-height:1">{{ display.from }}</div>
                      <div style="font-size:11px;color:var(--text-dim)">{{ display.fromCity }}</div>
                    </div>
                    <div style="color:var(--text-dim);font-size:16px">✈</div>
                    <div style="text-align:right">
                      <div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--text);line-height:1">{{ display.to }}</div>
                      <div style="font-size:11px;color:var(--text-dim)">{{ display.toCity }}</div>
                    </div>
                  </div>
                </div>
              </Transition>

              <!-- Flight (availability) -->
              <Transition name="slide-up">
                <div v-if="stage.key === 'availability' && getStatus('availability') === 'success'">
                  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:4px">
                    <div>
                      <div style="font-size:10px;color:var(--text-dim)">Departs</div>
                      <div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:var(--text)">{{ display.depTime }}</div>
                    </div>
                    <div style="font-size:13px;color:var(--text-dim)">→</div>
                    <div style="text-align:right">
                      <div style="font-size:10px;color:var(--text-dim)">Arrives</div>
                      <div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:var(--text)">{{ display.arrTime }}</div>
                    </div>
                  </div>
                  <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
                    <span class="badge badge--neutral">{{ display.flightNumber }}</span>
                    <span class="badge badge--neutral" style="font-size:10px">{{ display.planeType }}</span>
                  </div>
                  <div v-if="display.offers.length" style="margin-top:8px">
                    <div
                      v-for="o in display.offers.slice(0,2)"
                      :key="o.offer_id"
                      style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-sub);padding:3px 0;border-bottom:1px solid var(--border2)"
                    >
                      <span>{{ o.marketing_fare_code2 || o.marketing_fare_code }}</span>
                      <span style="font-family:var(--font-mono);color:var(--primary-light)">{{ Math.round(o.price) }} ₽</span>
                    </div>
                  </div>
                </div>
              </Transition>

              <!-- Services -->
              <Transition name="slide-up">
                <div v-if="stage.key === 'services' && getStatus('services') === 'success'">
                  <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px">
                    <div
                      v-for="svc in display.services"
                      :key="svc.name"
                      style="font-size:12px;color:var(--text-sub);padding:4px 8px;background:var(--surface2);border-radius:5px"
                    >
                      {{ svc.name }}
                    </div>
                  </div>
                </div>
              </Transition>

              <!-- Seat -->
              <Transition name="slide-up">
                <div v-if="stage.key === 'seatmap' && getStatus('seatmap') === 'success'">
                  <div v-if="display.seat" style="margin-top:6px;text-align:center">
                    <div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Selected seat</div>
                    <div style="font-family:var(--font-mono);font-size:38px;font-weight:800;color:var(--primary-light);line-height:1">
                      {{ display.seat.row }}{{ display.seat.letter }}
                    </div>
                  </div>
                  <div v-else style="font-size:12px;color:var(--text-dim);margin-top:6px">No available seats</div>
                </div>
              </Transition>

              <!-- Running skeleton -->
              <div
                v-if="getStatus(stage.key) === 'pending' && stage.key !== 'points'"
                style="display:flex;flex-direction:column;gap:6px;margin-top:6px"
              >
                <div style="height:12px;background:var(--surface2);border-radius:4px;animation:blink 1.2s ease-in-out infinite"></div>
                <div style="height:12px;width:70%;background:var(--surface2);border-radius:4px;animation:blink 1.2s ease-in-out .3s infinite"></div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- ── Boarding pass ───────────────────────────────────────── -->
    <Transition name="fade">
      <div class="boarding-pass" v-if="allDone">
        <div class="boarding-pass__inner">
          <div class="boarding-pass__main">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--text-dim);margin-bottom:16px">Boarding Pass</div>
            <div class="boarding-pass__route">
              <div>
                <div class="bp-airport__code">{{ display.from }}</div>
                <div class="bp-airport__name">{{ display.fromCity }}</div>
              </div>
              <div class="bp-plane">
                <div class="bp-plane__icon">✈</div>
                <div class="bp-plane__line"></div>
              </div>
              <div style="text-align:right">
                <div class="bp-airport__code">{{ display.to }}</div>
                <div class="bp-airport__name">{{ display.toCity }}</div>
              </div>
            </div>
          </div>
          <div class="boarding-pass__divider"></div>
          <div class="boarding-pass__details">
            <div>
              <div class="bp-field__label">Flight</div>
              <div class="bp-field__value">{{ display.flightNumber }}</div>
            </div>
            <div>
              <div class="bp-field__label">Date</div>
              <div class="bp-field__value">{{ display.date }}</div>
            </div>
            <div>
              <div class="bp-field__label">Departs</div>
              <div class="bp-field__value">{{ display.depTime }}</div>
            </div>
            <div>
              <div class="bp-field__label">Aircraft</div>
              <div class="bp-field__value" style="font-size:13px">{{ display.planeType }}</div>
            </div>
            <div>
              <div class="bp-field__label">Seat</div>
              <div class="bp-field__value bp-field__value--seat">
                {{ display.seat ? display.seat.row + display.seat.letter : "—" }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── Code snippet ────────────────────────────────────────── -->
    <div class="code-section">
      <button class="code-section__toggle" @click="showCode = !showCode">
        <span>▸ Pipeline configuration</span>
        <span class="code-arrow" :class="{ 'code-arrow--open': showCode }">▶</span>
      </button>
      <Transition name="expand">
        <div v-if="showCode">
          <pre class="code-block"><span class="kw">const</span> orchestrator = <span class="kw">new</span> <span class="fn">PipelineOrchestrator</span>({
  config: {
    stages: [
      {
        <span class="prop">key</span>: <span class="str">"points"</span>,             <span class="cmt">// no request — uses httpConfig.baseURL + key</span>
        <span class="prop">pauseAfter</span>: <span class="num">600</span>,           <span class="cmt">// wait 600ms before next stage</span>
      },
      {
        <span class="prop">key</span>: <span class="str">"availability"</span>,
        <span class="prop">request</span>: <span class="kw">async</span> ({ prev, sharedData }) <span class="op">=></span> {
          <span class="cmt">// prev = result of "points" stage</span>
          <span class="kw">const</span> [from, to] = pickRandom(prev.points);
          sharedData.from = from.point_code;   <span class="cmt">// share with downstream</span>
          sharedData.to   = to.point_code;
          <span class="kw">return</span> flyApi(<span class="str">`availability/${from}/${to}`</span>);
        },
        <span class="prop">pauseBefore</span>: <span class="num">500</span>,
      },
      {
        <span class="prop">key</span>: <span class="str">"services"</span>,
        <span class="prop">request</span>: <span class="kw">async</span> ({ prev, sharedData }) <span class="op">=></span> {
          <span class="kw">const</span> flight = pickFlight(prev.directions);
          sharedData.flightNumber = flight.number;
          sharedData.apiDate      = prev[<span class="str">"api-date"</span>];
          <span class="kw">return</span> flyApi(<span class="str">`services/.../${sharedData.flightNumber}`</span>);
        },
        <span class="prop">pauseBefore</span>: <span class="num">500</span>,
      },
      {
        <span class="prop">key</span>: <span class="str">"seatmap"</span>,
        <span class="prop">request</span>: <span class="kw">async</span> ({ sharedData }) <span class="op">=></span>
          flyApi(<span class="str">`seatmap/${sharedData.apiDate}/${sharedData.flightNumber}`</span>),
        <span class="prop">pauseBefore</span>: <span class="num">300</span>,
      },
    ],
    middleware: {
      <span class="prop">beforeEach</span>: ({ stage }) <span class="op">=></span> console.log(<span class="str">"▶"</span>, stage.key),
      <span class="prop">afterEach</span>:  ({ stage, result }) <span class="op">=></span> console.log(<span class="str">"✓"</span>, stage.key, result.data),
      <span class="prop">onError</span>:    ({ stage, error }) <span class="op">=></span> console.error(<span class="str">"✕"</span>, stage.key, error),
    },
  },
  httpConfig: { <span class="prop">baseURL</span>: <span class="str">"https://macrulez-api.ru/api/portfolio/fly"</span>, <span class="prop">timeout</span>: <span class="num">15000</span> },
});

<span class="cmt">// Vue composables</span>
<span class="kw">const</span> { run, running, error, stageResults, abort } = <span class="fn">usePipelineRunVue</span>(orchestrator);
<span class="kw">const</span> progress = <span class="fn">usePipelineProgressVue</span>(orchestrator);</pre>
        </div>
      </Transition>
    </div>
  </div>
</template>
