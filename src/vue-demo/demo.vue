<script setup lang="ts">
import "./demo.css";

import { ref } from "vue";
import {
  PipelineOrchestrator,
  usePipelineRunVue,
  usePipelineProgressVue,
} from "rest-pipeline-js";
import { computed } from "vue";

const pipelineConfig = {
  stages: [
    {
      key: "points",
    },
    {
      key: "availability",
      request: async (prev: any, _allResults: any, sharedData: any) => {
        const points = prev.points;
        if (!Array.isArray(points) || points.length === 0)
          throw new Error("No points");
        const randomPoint = points[Math.floor(Math.random() * points.length)];
        const from = randomPoint.point_code;
        const departures = (randomPoint.departure_to || "")
          .split(",")
          .filter(Boolean);
        if (!departures.length) throw new Error("No departures");
        const to = departures[Math.floor(Math.random() * departures.length)];
        sharedData.from = from;
        sharedData.to = to;
        return `availability/${from}/${to}`;
      },
    },
    {
      key: "services",
      request: async (prev: any, _allResults: any, sharedData: any) => {
        sharedData.apiDate = prev["api-date"];
        const direction = prev.directions.find(
          (item: any) => item.date === sharedData.apiDate
        );
        let randomFlight = null;
        if (
          direction &&
          Array.isArray(direction.flights) &&
          direction.flights.length > 0
        ) {
          randomFlight =
            direction.flights[
              Math.floor(Math.random() * direction.flights.length)
            ];
        }
        const segment = randomFlight.segments[0];
        sharedData.flightNumber = `${segment.oak}-${segment.flight_number}`;
        return `services/${sharedData.from}/${sharedData.to}/${sharedData.apiDate}/${sharedData.flightNumber}`;
      },
    },
    {
      key: "seatmap",
      request: async (_prev: any, _allResults: any, sharedData: any) => {
        return `seatmap/${sharedData.apiDate}/${sharedData.flightNumber}`;
      },
    },
  ],
};

const orchestrator = new PipelineOrchestrator({
  config: pipelineConfig,
  httpConfig: {
    baseURL: "https://api.macrulez.ru/v1/fly",
    timeout: 10000,
  },
});

const { run, running, error, stageResults } = usePipelineRunVue(orchestrator);

const progress = usePipelineProgressVue(orchestrator);

const totalStages = pipelineConfig.stages.length;

const completedStages = computed(() => {
  if (!progress.value || !progress.value.stageStatuses) return 0;
  return Object.values(progress.value.stageStatuses).filter(
    (status) => status === "success" || status === "error"
  ).length;
});

const progressPercent = computed(() => {
  return Math.round((completedStages.value / totalStages) * 100);
});

const stageResultsList = computed(() => {
  if (!stageResults.value) return [];
  return Object.entries(stageResults.value);
});

const resetting = ref(false);

const startPipeline = async () => {
  resetting.value = true;
  orchestrator.clearStageResults();
  await new Promise((r) => setTimeout(r, 120)); // дать UI обновиться
  resetting.value = false;
  run();
};
</script>

<template>
  <div>
    {{ progress }}
    <h1>Vue Pipeline Demo</h1>
    <button @click="startPipeline" :disabled="running">Run Pipeline</button>
    <div v-if="progress">
      <h3>Progress</h3>
      <div class="progress-bar-wrap">
        <div class="progress-bar-bg">
          <div
            class="progress-bar-fill"
            :style="{
              width: resetting ? '0%' : progressPercent + '%',
              opacity: resetting ? 0.5 : 1,
            }"
          ></div>
        </div>
        <div class="progress-bar-label">
          {{ resetting ? "0%" : progressPercent + "%" }}
        </div>
      </div>
      <pre>{{ progress }}</pre>
    </div>
    <div v-if="!resetting && stageResultsList.length" class="result">
      <div
        class="result__item"
        v-for="([key, stageResult], idx) in stageResultsList"
        :key="key"
      >
        <h4>{{ key }}</h4>
        <pre>{{ stageResult }}</pre>
      </div>
    </div>
    <div v-if="error">
      <h3 style="color: red">Error</h3>
      <pre>{{ error }}</pre>
    </div>
  </div>
</template>
