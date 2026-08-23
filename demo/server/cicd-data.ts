// In-memory CI/CD domain: builds/services/logs, backing the CiCdDashboard,
// PaginationDemo, and OrchestrationDemo pages.
import { randomUUID } from "node:crypto";
import type { Router } from "./router.js";
import { readJsonBody, sendJson } from "./router.js";
import { maybeSendForcedFailure, parseLatencyMs, shouldFailAttempt, sleep } from "./flaky.js";

interface Build {
  id: string;
  branch: string;
  services: string[];
  createdAt: number;
  status: "queued" | "running" | "success" | "failed";
  testAttempts: Record<string, number>;
  deployAttempts: number;
}

const builds = new Map<string, Build>();

const SAMPLE_SERVICES = ["api-gateway", "auth-service", "billing", "notifications", "web-frontend"];
const SAMPLE_BRANCHES = ["main", "feature/checkout-v2", "feature/dark-mode", "hotfix/rate-limit-bug", "release/2.1"];

function seedHistory(count: number): void {
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const id = randomUUID();
    const services = SAMPLE_SERVICES.filter(() => Math.random() > 0.4);
    const roll = Math.random();
    builds.set(id, {
      id,
      branch: SAMPLE_BRANCHES[Math.floor(Math.random() * SAMPLE_BRANCHES.length)],
      services: services.length > 0 ? services : [SAMPLE_SERVICES[0]],
      createdAt: now - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000),
      status: roll < 0.75 ? "success" : roll < 0.92 ? "failed" : "running",
      testAttempts: {},
      deployAttempts: 0,
    });
  }
}
seedHistory(130);

function toSummary(build: Build) {
  return {
    id: build.id,
    branch: build.branch,
    services: build.services,
    createdAt: build.createdAt,
    status: build.status,
  };
}

const LOG_SCRIPT = [
  "Resolving dependencies...",
  "Compiling sources...",
  "Running static analysis...",
  "Packaging artifacts...",
  "Uploading to registry...",
  "Build complete.",
];

export function registerCicdRoutes(router: Router): void {
  router.post("/api/cicd/builds", async (req, res, _params, url) => {
    await sleep(parseLatencyMs(url));
    const body = (await readJsonBody<{ branch?: string; services?: string[] }>(req)) ?? {};
    const services: string[] = Array.isArray(body.services) && body.services.length > 0 ? body.services : SAMPLE_SERVICES;
    const branch: string = typeof body.branch === "string" && body.branch ? body.branch : "main";

    const id = randomUUID();
    const build: Build = {
      id,
      branch,
      services,
      createdAt: Date.now(),
      status: "running",
      testAttempts: {},
      deployAttempts: 0,
    };
    builds.set(id, build);
    sendJson(res, 201, toSummary(build));
  });

  router.get("/api/cicd/builds", async (req, res, _params, url) => {
    await sleep(parseLatencyMs(url));
    const limitRaw = Number(url.searchParams.get("limit"));
    const limit = Math.max(1, Math.min(50, Number.isFinite(limitRaw) ? limitRaw : 10));
    const all = [...builds.values()].sort((a, b) => b.createdAt - a.createdAt);

    const offsetParam = url.searchParams.get("offset");
    if (offsetParam !== null) {
      const offset = Math.max(0, Number(offsetParam) || 0);
      sendJson(res, 200, { items: all.slice(offset, offset + limit).map(toSummary), total: all.length });
      return;
    }

    const cursor = url.searchParams.get("cursor");
    let startIndex = 0;
    if (cursor) {
      const idx = all.findIndex((b) => b.id === cursor);
      if (idx === -1) {
        sendJson(res, 400, { error: "Unknown cursor" });
        return;
      }
      startIndex = idx + 1;
    }
    const slice = all.slice(startIndex, startIndex + limit);
    const nextCursor = startIndex + limit < all.length ? slice[slice.length - 1]?.id ?? null : null;
    sendJson(res, 200, { items: slice.map(toSummary), nextCursor });
  });

  router.get("/api/cicd/builds/:id/services/:service/build", async (req, res, params, url) => {
    const build = builds.get(params.id);
    if (!build) return sendJson(res, 404, { error: "Build not found" });
    await sleep(parseLatencyMs(url));
    if (maybeSendForcedFailure(url, res)) return;
    sendJson(res, 200, {
      service: params.service,
      artifact: `${params.service}.tar.gz`,
      sizeKb: Math.round(500 + Math.random() * 4500),
    });
  });

  router.get("/api/cicd/builds/:id/services/:service/test", async (req, res, params, url) => {
    const build = builds.get(params.id);
    if (!build) return sendJson(res, 404, { error: "Build not found" });
    await sleep(parseLatencyMs(url));
    if (maybeSendForcedFailure(url, res)) return;

    const attempt = (build.testAttempts[params.service] ?? 0) + 1;
    build.testAttempts[params.service] = attempt;

    if (shouldFailAttempt(url, attempt)) {
      sendJson(res, 503, { error: `Flaky test failure for ${params.service}`, attempt });
      return;
    }
    sendJson(res, 200, {
      service: params.service,
      passed: true,
      attempt,
      durationMs: Math.round(200 + Math.random() * 400),
    });
  });

  router.post("/api/cicd/builds/:id/deploy", async (req, res, params, url) => {
    const build = builds.get(params.id);
    if (!build) return sendJson(res, 404, { error: "Build not found" });
    await sleep(parseLatencyMs(url));
    if (maybeSendForcedFailure(url, res)) return;

    build.deployAttempts++;
    const failFirstN = Number(url.searchParams.get("failFirstN") ?? "0");
    if (failFirstN > 0 && build.deployAttempts <= failFirstN) {
      sendJson(res, 503, { error: "Deploy service unavailable", attempt: build.deployAttempts });
      return;
    }
    build.status = "success";
    sendJson(res, 200, {
      deployed: true,
      version: `v${build.deployAttempts}`,
      url: `https://deploy.example/${build.id}`,
    });
  });

  router.post("/api/cicd/builds/:id/deploy/reset", async (req, res, params) => {
    const build = builds.get(params.id);
    if (!build) return sendJson(res, 404, { error: "Build not found" });
    build.deployAttempts = 0;
    sendJson(res, 200, { reset: true });
  });

  router.get("/api/cicd/builds/:id/logs", (req, res, params) => {
    const build = builds.get(params.id);
    if (!build) return sendJson(res, 404, { error: "Build not found" });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    let i = 0;
    const interval = setInterval(() => {
      if (i >= LOG_SCRIPT.length) {
        res.write(`event: done\ndata: {}\n\n`);
        clearInterval(interval);
        res.end();
        return;
      }
      res.write(`data: ${JSON.stringify({ line: LOG_SCRIPT[i], ts: Date.now() })}\n\n`);
      i++;
    }, 250);

    req.on("close", () => clearInterval(interval));
  });
}
