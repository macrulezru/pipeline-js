<script setup lang="ts">
import "./demo.css";
import { ref, reactive, computed } from "vue";
import {
  PipelineOrchestrator,
  usePipelineRunVue,
  usePipelineProgressVue,
} from "rest-pipeline-js/vue";
import Prism from "prismjs";
import "prismjs/components/prism-json";

function highlight(data: unknown): string {
  try {
    const json = JSON.stringify(data, null, 2);
    return Prism.highlight(json, Prism.languages.json, "json");
  } catch {
    return String(data);
  }
}

// ── HTTP helper ───────────────────────────────────────────────────
const BASE_URL = "https://macrulez-api.ru/api/portfolio/fly";
async function flyApi(path: string): Promise<any> {
  const res = await fetch(`${BASE_URL}/${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Display storage (populated from stage closures) ──────────────
const display = reactive({
  from: "" as string,
  fromCity: "" as string,
  to: "" as string,
  toCity: "" as string,
  date: "" as string,
  depTime: "" as string,
  arrTime: "" as string,
  flightNumber: "" as string,
  planeType: "" as string,
  offers: [] as any[],
  services: [] as any[],
  seat: null as { row: any; letter: string } | null,
  urls: {
    points: "points",
    availability: "",
    services: "",
    seatmap: "",
  } as Record<string, string>,
});

function resetDisplay() {
  display.from = "";
  display.fromCity = "";
  display.to = "";
  display.toCity = "";
  display.date = "";
  display.depTime = "";
  display.arrTime = "";
  display.flightNumber = "";
  display.planeType = "";
  display.offers = [];
  display.services = [];
  display.seat = null;
  display.urls = {
    points: "points",
    availability: "",
    services: "",
    seatmap: "",
  };
}

// ── Pipeline config ───────────────────────────────────────────────
const pipelineConfig = {
  stages: [
    {
      // points: no request → orchestrator does GET /points
      key: "points",
      pauseAfter: 600,
    },
    {
      key: "availability",
      request: async ({ prev, sharedData }: { prev: any; sharedData: any }) => {
        const points = prev.points;
        if (!Array.isArray(points) || points.length < 2)
          throw new Error("Not enough airport points");
        const fromIdx = Math.floor(Math.random() * points.length);
        let toIdx = Math.floor(Math.random() * (points.length - 1));
        if (toIdx >= fromIdx) toIdx++;
        const fp = points[fromIdx];
        const tp = points[toIdx];
        sharedData.from = fp.point_code;
        sharedData.to = tp.point_code;
        display.from = fp.point_code;
        display.fromCity = fp.city_name_ru || fp.city_name;
        display.to = tp.point_code;
        display.toCity = tp.city_name_ru || tp.city_name;
        const path = `availability/${sharedData.from}/${sharedData.to}`;
        display.urls.availability = path;
        return flyApi(path);
      },
      pauseBefore: 500,
    },
    {
      key: "services",
      request: async ({ prev, sharedData }: { prev: any; sharedData: any }) => {
        sharedData.apiDate = prev["api-date"];
        display.date = sharedData.apiDate;
        const direction =
          prev.directions?.find(
            (d: any) =>
              d.date === sharedData.apiDate &&
              Array.isArray(d.flights) &&
              d.flights.length > 0,
          ) ??
          prev.directions?.find(
            (d: any) => Array.isArray(d.flights) && d.flights.length > 0,
          );
        if (!direction) throw new Error("No flights available");
        const flight =
          direction.flights[
            Math.floor(Math.random() * direction.flights.length)
          ];
        const seg = flight.segments[0];
        sharedData.flightNumber = `${seg.ak}-${seg.flight_number}`;
        display.flightNumber = sharedData.flightNumber;
        display.depTime = seg.departure_time;
        display.arrTime = seg.arrival_time;
        display.planeType = seg.plane_type_name;
        display.offers = flight.offers ?? [];
        const path = `services/${sharedData.from}/${sharedData.to}/${sharedData.apiDate}/${sharedData.flightNumber}`;
        display.urls.services = path;
        return flyApi(path);
      },
      pauseBefore: 500,
    },
    {
      key: "seatmap",
      request: async ({ sharedData }: { sharedData: any }) => {
        const path = `seatmap/${sharedData.apiDate}/${sharedData.flightNumber}`;
        display.urls.seatmap = path;
        const data = await flyApi(path);
        // Pick a random available seat
        const available: { row: any; letter: string }[] = [];
        for (const cabin of data.segments?.[0]?.cabins ?? []) {
          (cabin.rows ?? []).forEach((row: any, rowIdx: number) => {
            for (const cell of row.cells ?? []) {
              if (cell.available === "Y" && cell.letter) {
                // row_number / row / number — field name varies by template
                const rowNum =
                  row.row_number ??
                  row.row ??
                  row.number ??
                  row.rowNumber ??
                  rowIdx + 1;
                available.push({ row: rowNum, letter: cell.letter });
              }
            }
          });
        }
        display.seat =
          available.length > 0
            ? available[Math.floor(Math.random() * available.length)]
            : null;
        // Pick a few services to display
        display.services = (data.services ?? []).slice(0, 5);
        return data;
      },
      pauseBefore: 300,
    },
  ],
};

const orchestrator = new PipelineOrchestrator({
  config: pipelineConfig,
  httpConfig: {
    baseURL: BASE_URL,
    timeout: 15000,
  },
});

const { run, running, error, stageResults } = usePipelineRunVue(orchestrator);
const progress = usePipelineProgressVue(orchestrator);

// ── Stage meta ────────────────────────────────────────────────────
const stagesMeta = [
  {
    key: "points",
    title: "Airports",
    description: "Fetch the airport list and pick a route",
  },
  {
    key: "availability",
    title: "Availability",
    description: "Query available flights for the selected route",
  },
  {
    key: "services",
    title: "Services",
    description: "Load ancillary services for the selected flight",
  },
  {
    key: "seatmap",
    title: "Seat",
    description: "Fetch the seat map and pick a free seat",
  },
];

// ── Status helpers ────────────────────────────────────────────────
// stageStatuses is an array indexed by stage — convert to key-based map
const stageStatus = computed<Record<string, string>>(() => {
  const arr = progress.value?.stageStatuses;
  if (!arr) return {};
  return Object.fromEntries(stagesMeta.map((s, i) => [s.key, arr[i] ?? ""]));
});

function hasStatus(key: string): boolean {
  const s = stageStatus.value[key];
  return !!s && s !== "";
}

function getStatus(key: string): string {
  return stageStatus.value[key] ?? "";
}

function getResult(key: string): any {
  return (stageResults.value as Record<string, any>)?.[key];
}

function getUrl(key: string): string {
  return (display.urls as Record<string, string>)[key] ?? key;
}

// ── Error display ─────────────────────────────────────────────────
const stageError = computed(() => {
  if (!stageResults.value) return null;
  for (const s of stagesMeta) {
    const r = stageResults.value[s.key] as any;
    if (r?.status === "error")
      return { stage: s.title, msg: r.error?.message ?? "Unknown error" };
  }
  return null;
});
const displayError = computed(() => {
  if (error.value)
    return {
      stage: "",
      msg: (error.value as any)?.message ?? String(error.value),
    };
  return stageError.value;
});

// ── Run ───────────────────────────────────────────────────────────
const resetting = ref(false);
const started = ref(false);

async function startPipeline() {
  resetting.value = true;
  resetDisplay();
  orchestrator.clearStageResults();
  await new Promise((r) => setTimeout(r, 140));
  resetting.value = false;
  started.value = true;
  run();
}

// ── Progress ──────────────────────────────────────────────────────
const completedCount = computed(() => {
  if (!progress.value?.stageStatuses) return 0;
  return Object.values(progress.value.stageStatuses).filter(
    (s) => s === "success" || s === "error",
  ).length;
});
const progressPercent = computed(() =>
  resetting.value
    ? 0
    : Math.round((completedCount.value / stagesMeta.length) * 100),
);
const allDone = computed(
  () =>
    !resetting.value &&
    stagesMeta.every((s) => stageStatus.value[s.key] === "success"),
);
</script>

<template>
  <div class="demo-root">
    <!-- ── Header ──────────────────────────────────────────────── -->
    <header class="demo-header">
      <div class="demo-logo">
        <span class="demo-logo__plane">✈</span>
        <div class="demo-logo__text">
          <div class="demo-logo__title">Fly Pipeline</div>
          <div class="demo-logo__sub">rest-pipeline-js · Vue 3 demo</div>
        </div>
      </div>
      <button
        class="run-btn"
        :class="{ 'run-btn--loading': running }"
        @click="startPipeline"
        :disabled="running"
      >
        <span class="run-btn__spinner" v-if="running"></span>
        <span class="run-btn__icon" v-else>▶</span>
        {{ running ? "Running..." : "Run Pipeline" }}
      </button>
    </header>

    <!-- ── Progress bar ─────────────────────────────────────────── -->
    <div
      class="progress-wrap"
      v-if="started && (running || progressPercent > 0)"
    >
      <div class="progress-bar">
        <div
          class="progress-bar__fill"
          :style="{ width: progressPercent + '%' }"
        ></div>
      </div>
      <span class="progress-pct">{{ progressPercent }}%</span>
    </div>

    <!-- ── Error banner ─────────────────────────────────────────── -->
    <Transition name="slide-up">
      <div class="error-banner" v-if="displayError">
        <span class="error-banner__icon">⚠</span>
        <div>
          <div class="error-banner__title">
            Pipeline failed{{
              displayError.stage ? ` · ${displayError.stage}` : ""
            }}
          </div>
          <div class="error-banner__msg">{{ displayError.msg }}</div>
        </div>
      </div>
    </Transition>

    <!-- ── Pipeline columns ─────────────────────────────────────── -->
    <div class="pipeline-out" v-if="started && !resetting">
      <div
        class="pipeline-col"
        v-for="(stage, idx) in stagesMeta"
        :key="stage.key"
      >
        <!-- Description -->
        <div class="pipeline-col__desc">{{ stage.description }}</div>

        <!-- Status circle -->
        <div
          class="stage-status"
          :class="{
            'stage-status--pending': getStatus(stage.key) === 'pending',
            'stage-status--success': getStatus(stage.key) === 'success',
            'stage-status--error': getStatus(stage.key) === 'error',
          }"
        >
          <div
            class="stage-status__track"
            v-if="idx < stagesMeta.length - 1"
          ></div>
          <div class="stage-status__circle">
            <span
              class="stage-status__spinner"
              v-if="getStatus(stage.key) === 'pending'"
            ></span>
            <span v-else class="stage-status__num">{{ idx + 1 }}</span>
          </div>
        </div>

        <!-- Request URL block -->
        <Transition name="slide-up">
          <div
            class="step-block step-block--request"
            v-if="hasStatus(stage.key)"
          >
            <div class="step-block__header">request</div>
            <div class="step-block__body step-block__body--mono">
              GET /{{ getUrl(stage.key) }}
            </div>
          </div>
        </Transition>

        <!-- Skeleton while running -->
        <template v-if="getStatus(stage.key) === 'pending'">
          <div class="skeleton" style="height: 180px"></div>
        </template>

        <!-- Error for this stage -->
        <Transition name="slide-up">
          <div
            class="step-block step-block--error"
            v-if="getStatus(stage.key) === 'error'"
          >
            <div class="step-block__header">error</div>
            <div class="step-block__body step-block__body--error">
              {{ getResult(stage.key)?.error?.message ?? "Unknown error" }}
            </div>
          </div>
        </Transition>

        <!-- ── Raw API response ──────────────────────────────── -->
        <Transition name="slide-up">
          <div
            class="step-block step-block--response"
            v-if="
              getStatus(stage.key) === 'success' &&
              getResult(stage.key)?.data !== undefined
            "
          >
            <div class="step-block__header">response</div>
            <div class="step-block__body step-block__body--response">
              <pre
                class="json-code"
                v-html="highlight(getResult(stage.key)?.data)"
              ></pre>
            </div>
          </div>
        </Transition>

        <!-- ── POINTS result ──────────────────────────────────── -->
        <Transition name="slide-up">
          <div
            class="step-block step-block--data"
            v-if="stage.key === 'points' && getStatus('points') === 'success'"
          >
            <div class="step-block__header">route selected</div>
            <div class="step-block__body">
              <div class="route-display">
                <div class="route-display__point">
                  <div class="route-display__code">{{ display.from }}</div>
                  <div class="route-display__city">{{ display.fromCity }}</div>
                </div>
                <div class="route-display__path">
                  <div class="route-display__dot"></div>
                  <div class="route-display__line"></div>
                  <div class="route-display__dot"></div>
                </div>
                <div class="route-display__point route-display__point--right">
                  <div class="route-display__code">{{ display.to }}</div>
                  <div class="route-display__city">{{ display.toCity }}</div>
                </div>
              </div>
            </div>
          </div>
        </Transition>

        <!-- ── AVAILABILITY result ───────────────────────────── -->
        <Transition name="slide-up">
          <div
            class="step-block step-block--data"
            v-if="
              stage.key === 'availability' &&
              getStatus('availability') === 'success'
            "
          >
            <div class="step-block__header">flight selected</div>
            <div class="step-block__body">
              <div class="flight-display">
                <div class="flight-display__row">
                  <div>
                    <div class="flight-display__label">Departs</div>
                    <div class="flight-display__time">
                      {{ display.depTime }}
                    </div>
                  </div>
                  <div class="flight-display__path">
                    <div class="flight-display__dot"></div>
                    <div class="flight-display__line"></div>
                    <div class="flight-display__dot"></div>
                  </div>
                  <div class="flight-display__right">
                    <div class="flight-display__label">Arrives</div>
                    <div class="flight-display__time">
                      {{ display.arrTime }}
                    </div>
                  </div>
                </div>
                <div class="flight-display__meta">
                  <span class="flight-display__plane">{{
                    display.planeType
                  }}</span>
                  <span class="flight-display__num">{{
                    display.flightNumber
                  }}</span>
                </div>
                <div v-if="display.offers.length" class="offers">
                  <div class="offers__label">Fares</div>
                  <div
                    v-for="offer in display.offers.slice(0, 2)"
                    :key="offer.offer_id"
                    class="offers__item"
                  >
                    <span class="offers__name">{{
                      offer.marketing_fare_code2 || offer.marketing_fare_code
                    }}</span>
                    <span class="offers__price"
                      >{{ Math.round(offer.price) }} ₽</span
                    >
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Transition>

        <!-- ── SERVICES result ───────────────────────────────── -->
        <Transition name="slide-up">
          <div
            class="step-block step-block--data"
            v-if="
              stage.key === 'services' && getStatus('services') === 'success'
            "
          >
            <div class="step-block__header">services</div>
            <div class="step-block__body">
              <div class="services-list">
                <div
                  v-for="svc in display.services"
                  :key="svc.name || svc.code"
                  class="services-list__item"
                >
                  {{ svc.name }}
                </div>
                <div
                  v-if="
                    getResult('services')?.data?.services?.length >
                    display.services.length
                  "
                  class="services-list__more"
                >
                  +{{
                    getResult("services").data.services.length -
                    display.services.length
                  }}
                  more
                </div>
              </div>
            </div>
          </div>
        </Transition>

        <!-- ── SEATMAP result ────────────────────────────────── -->
        <Transition name="slide-up">
          <div
            class="step-block step-block--data"
            v-if="stage.key === 'seatmap' && getStatus('seatmap') === 'success'"
          >
            <div class="step-block__header">seat selected</div>
            <div class="step-block__body">
              <template v-if="display.seat">
                <div class="seat-display">
                  <div class="seat-display__label">Row</div>
                  <div class="seat-display__val">{{ display.seat.row }}</div>
                  <div class="seat-display__label">Seat</div>
                  <div class="seat-display__val">{{ display.seat.letter }}</div>
                </div>
                <div class="seat-code">
                  {{ display.seat.row }}{{ display.seat.letter }}
                </div>
              </template>
              <div v-else class="seat-none">No available seats</div>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- ── Boarding pass (all stages succeeded) ────────────────────── -->
    <Transition name="fade">
      <div class="boarding-pass" v-if="allDone">
        <div class="boarding-pass__inner">
          <div class="boarding-pass__route">
            <div class="boarding-pass__point">
              <div class="boarding-pass__code">{{ display.from }}</div>
              <div class="boarding-pass__city">{{ display.fromCity }}</div>
            </div>
            <div class="boarding-pass__icon">✈</div>
            <div class="boarding-pass__point boarding-pass__point--right">
              <div class="boarding-pass__code">{{ display.to }}</div>
              <div class="boarding-pass__city">{{ display.toCity }}</div>
            </div>
          </div>
          <div class="boarding-pass__divider"></div>
          <div class="boarding-pass__info">
            <div class="boarding-pass__field">
              <span class="boarding-pass__field-label">Flight</span>
              <span class="boarding-pass__field-val">{{
                display.flightNumber
              }}</span>
            </div>
            <div class="boarding-pass__field">
              <span class="boarding-pass__field-label">Date</span>
              <span class="boarding-pass__field-val">{{ display.date }}</span>
            </div>
            <div class="boarding-pass__field">
              <span class="boarding-pass__field-label">Departs</span>
              <span class="boarding-pass__field-val">{{
                display.depTime
              }}</span>
            </div>
            <div class="boarding-pass__field">
              <span class="boarding-pass__field-label">Seat</span>
              <span
                class="boarding-pass__field-val boarding-pass__field-val--accent"
              >
                {{
                  display.seat ? display.seat.row + display.seat.letter : "—"
                }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Footer -->
    <footer class="demo-footer">
      Powered by <strong>rest-pipeline-js</strong> · Pipeline orchestration for
      REST APIs
    </footer>
  </div>
</template>
