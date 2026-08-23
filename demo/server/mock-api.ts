// Local mock API for the demo app, mounted directly on Vite's dev server —
// real HTTP/WebSocket round-trips (genuine network delay, real headers, a
// real dropped connection on abort()) instead of client-simulated behavior,
// so retry/circuit-breaker/rate-limit/jitter demos show real timing.
import type { Plugin, ViteDevServer } from "vite";
import { WebSocketServer } from "ws";
import { Router } from "./router.js";
import { registerCicdRoutes } from "./cicd-data.js";
import { registerTradingRoutes, handleTicksConnection } from "./trading-data.js";

export function mockApiPlugin(): Plugin {
  return {
    name: "demo-mock-api",
    configureServer(server: ViteDevServer) {
      const router = new Router();
      registerCicdRoutes(router);
      registerTradingRoutes(router);

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          next();
          return;
        }
        try {
          const handled = await router.handle(req, res);
          if (!handled) next();
        } catch (err) {
          console.error("[mock-api]", err);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
          }
          res.end(JSON.stringify({ error: "Internal mock-api error" }));
        }
      });

      const wss = new WebSocketServer({ noServer: true });
      server.httpServer?.on("upgrade", (req, socket, head) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== "/api/trading/ws/ticks") return;
        wss.handleUpgrade(req, socket, head, (ws) => {
          handleTicksConnection(ws, url);
        });
      });
    },
  };
}
