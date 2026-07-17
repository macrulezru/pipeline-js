/**
 * Two independent tracing features, usable separately or together:
 *
 * 1. `tracing.generateTraceparent` — adds a W3C `traceparent` header
 *    (https://www.w3.org/TR/trace-context/) to every request, so any backend
 *    that understands trace context (most APM agents do) can correlate the
 *    call with the rest of a distributed trace.
 * 2. `tracing.provider` — a hook called around every request to create a real
 *    span in your tracing system. Its shape is a deliberate subset of
 *    OpenTelemetry's `Span` API (duck-typed — this package doesn't depend on
 *    `@opentelemetry/api`), so wiring in a real OTel SDK is a thin adapter.
 */
import { createRestClient, PipelineOrchestrator, type TracingProvider, type TracingSpan } from "rest-pipeline-js";

// ── Option A: wire in a real OpenTelemetry SDK ──────────────────────────────
//
// If you already depend on `@opentelemetry/api`, the adapter is almost a
// direct pass-through (its `Span` already has `end()`, `setStatus()`,
// `recordException()` with matching signatures):
//
//   import { trace, SpanStatusCode } from "@opentelemetry/api";
//   const tracer = trace.getTracer("rest-pipeline-js");
//   const otelProvider: TracingProvider = {
//     startSpan: (name, attributes) => tracer.startSpan(name, { attributes }),
//   };
//
// (SpanStatusCode.OK/ERROR line up with this package's "ok"/"error" codes
// closely enough that most OTel Span implementations accept them as-is —
// check your SDK version if TypeScript complains.)

// ── Option B: a minimal in-house provider (e.g. forwarding to your own APM) ─
function createConsoleTracingProvider(): TracingProvider {
  return {
    startSpan(name, attributes): TracingSpan {
      const start = Date.now();
      console.log(`[span:start] ${name}`, attributes);
      return {
        end() {
          console.log(`[span:end] ${name} (${Date.now() - start}ms)`);
        },
        setStatus(status) {
          console.log(`[span:status] ${name} →`, status);
        },
        recordException(error) {
          console.error(`[span:exception] ${name}`, error);
        },
      };
    },
  };
}

export const client = createRestClient({
  baseURL: "https://api.example.com",
  tracing: {
    generateTraceparent: true,
    provider: createConsoleTracingProvider(),
  },
});

// ── Correlating traceparent with a pipeline's runId ─────────────────────────
//
// A UUID with its dashes stripped is exactly 32 hex characters — the W3C
// trace-id format — so every HTTP call made by stages in one pipeline run can
// share one trace by deriving traceId from orchestrator.getRunId(). run()
// generates runId synchronously before the first stage executes, so it's
// already set by the time any stage's `before`/`request` hook runs.
const orchestrator = new PipelineOrchestrator({
  config: {
    stages: [
      {
        key: "fetchUser",
        request: async ({ sharedData }) =>
          client.get(`/users/${sharedData.userId}`, {
            traceId: orchestrator.getRunId().replace(/-/g, ""),
          }),
      },
    ],
  },
  httpConfig: { baseURL: "https://api.example.com", tracing: { generateTraceparent: true } },
  sharedData: { userId: 42 },
});

async function main() {
  await orchestrator.run();
}

void main;
