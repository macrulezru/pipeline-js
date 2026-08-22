// In-memory trading domain: auth/positions/quotes/orders + a WebSocket tick
// feed, backing the TradingTerminal, AuthProviderDemo, and SchemaValidationDemo
// pages.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WebSocket } from "ws";
import type { Router } from "./router.js";
import { readJsonBody, sendJson } from "./router.js";
import { isMalformed, parseLatencyMs, sleep } from "./flaky.js";

const SYMBOLS = ["AAPL", "TSLA", "NVDA", "MSFT", "BTC-USD", "ETH-USD"];
const BASE_PRICES: Record<string, number> = {
  AAPL: 230, TSLA: 260, NVDA: 140, MSFT: 420, "BTC-USD": 64000, "ETH-USD": 3400,
};
const quotes = new Map<string, number>(SYMBOLS.map((s) => [s, BASE_PRICES[s]]));

const positions = SYMBOLS.slice(0, 3).map((symbol) => ({
  symbol,
  qty: Math.round(5 + Math.random() * 50),
  avgPrice: BASE_PRICES[symbol] * (0.9 + Math.random() * 0.15),
}));

interface Order {
  id: string;
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  price?: number;
  status: "filled";
  createdAt: number;
}

const ordersByIdempotencyKey = new Map<string, Order>();
const validTokens = new Map<string, number>();
let brokerFailStreak = 0;
let rateLimitWindow = { remaining: 5, limit: 5, resetAt: Date.now() + 10_000 };

function nextPrice(price: number): number {
  const drift = price * (Math.random() - 0.5) * 0.01;
  return Math.max(0.01, Math.round((price + drift) * 100) / 100);
}

function issueToken(ttlMs: number): { token: string; expiresIn: number } {
  const token = randomUUID();
  validTokens.set(token, Date.now() + ttlMs);
  return { token, expiresIn: Math.round(ttlMs / 1000) };
}

function requireAuth(req: IncomingMessage, res: ServerResponse): boolean {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const expiresAt = token ? validTokens.get(token) : undefined;
  if (!expiresAt || expiresAt < Date.now()) {
    sendJson(res, 401, { error: "Unauthorized" });
    return false;
  }
  return true;
}

function currentRateLimitHeaders(): Record<string, string> {
  if (Date.now() > rateLimitWindow.resetAt) {
    rateLimitWindow = { remaining: 5, limit: 5, resetAt: Date.now() + 10_000 };
  }
  return {
    "X-RateLimit-Limit": String(rateLimitWindow.limit),
    "X-RateLimit-Remaining": String(Math.max(0, rateLimitWindow.remaining)),
    "X-RateLimit-Reset": String(Math.max(0, Math.ceil((rateLimitWindow.resetAt - Date.now()) / 1000))),
  };
}

export function registerTradingRoutes(router: Router): void {
  router.post("/api/trading/auth/login", async (req, res, _params, url) => {
    await sleep(parseLatencyMs(url));
    const ttlMs = Number(url.searchParams.get("ttlMs") ?? "15000");
    sendJson(res, 200, issueToken(Number.isFinite(ttlMs) ? ttlMs : 15_000));
  });

  router.post("/api/trading/auth/refresh", async (req, res, _params, url) => {
    await sleep(parseLatencyMs(url));
    const ttlMs = Number(url.searchParams.get("ttlMs") ?? "15000");
    sendJson(res, 200, issueToken(Number.isFinite(ttlMs) ? ttlMs : 15_000));
  });

  router.get("/api/trading/auth/me", async (req, res, _params, url) => {
    await sleep(parseLatencyMs(url));
    if (!requireAuth(req, res)) return;
    sendJson(res, 200, { user: "demo-trader", accountId: "ACC-001" });
  });

  router.get("/api/trading/quotes/:symbol", async (req, res, params, url) => {
    await sleep(parseLatencyMs(url));
    const price = quotes.get(params.symbol.toUpperCase());
    if (price === undefined) {
      sendJson(res, 404, { error: "Unknown symbol" });
      return;
    }
    sendJson(res, 200, { symbol: params.symbol.toUpperCase(), price, ts: Date.now() });
  });

  router.get("/api/trading/positions", async (req, res, _params, url) => {
    await sleep(parseLatencyMs(url));
    if (!requireAuth(req, res)) return;
    sendJson(res, 200, { positions });
  });

  router.get("/api/trading/history", async (req, res, _params, url) => {
    await sleep(parseLatencyMs(url));
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") ?? "10")));
    const all = [...ordersByIdempotencyKey.values()].sort((a, b) => b.createdAt - a.createdAt);
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
    sendJson(res, 200, { items: all.slice(offset, offset + limit), total: all.length });
  });

  router.post("/api/trading/orders", async (req, res, _params, url) => {
    await sleep(parseLatencyMs(url));
    if (!requireAuth(req, res)) return;

    const idemKey = req.headers["idempotency-key"];
    const key = typeof idemKey === "string" ? idemKey : undefined;
    const existing = key ? ordersByIdempotencyKey.get(key) : undefined;
    if (existing) {
      sendJson(res, 200, existing, currentRateLimitHeaders());
      return;
    }

    if (rateLimitWindow.remaining <= 0) {
      const rateHeaders = currentRateLimitHeaders();
      res.writeHead(429, {
        "Content-Type": "application/json",
        ...rateHeaders,
        "Retry-After": rateHeaders["X-RateLimit-Reset"],
      });
      res.end(JSON.stringify({ error: "Rate limit exceeded" }));
      return;
    }
    rateLimitWindow.remaining--;
    const rateHeaders = currentRateLimitHeaders();

    const failFirstN = Number(url.searchParams.get("failFirstN") ?? "0");
    if (failFirstN > 0) {
      brokerFailStreak++;
      if (brokerFailStreak <= failFirstN) {
        sendJson(res, 503, { error: "Broker unavailable", attempt: brokerFailStreak }, rateHeaders);
        return;
      }
    }

    const body = (await readJsonBody<{ symbol?: string; qty?: number; side?: "buy" | "sell" }>(req)) ?? {};
    const symbol = body.symbol ?? "AAPL";
    const order: Order = {
      id: randomUUID(),
      symbol,
      qty: body.qty ?? 1,
      side: body.side ?? "buy",
      price: isMalformed(url) ? undefined : quotes.get(symbol) ?? 0,
      status: "filled",
      createdAt: Date.now(),
    };
    if (key) ordersByIdempotencyKey.set(key, order);
    sendJson(res, 201, order, rateHeaders);
  });

  router.post("/api/trading/broker/reset", async (req, res) => {
    brokerFailStreak = 0;
    sendJson(res, 200, { reset: true });
  });

  router.post("/api/trading/rate-limit/reset", async (req, res) => {
    rateLimitWindow = { remaining: 5, limit: 5, resetAt: Date.now() + 10_000 };
    sendJson(res, 200, { reset: true });
  });
}

/** Pushes a `{ type: "tick", symbol, price, ts }` message per watched symbol every 700ms until the socket closes. */
export function handleTicksConnection(ws: WebSocket, url: URL): void {
  const requested = url.searchParams.get("symbols");
  const symbols = requested ? requested.split(",").map((s) => s.toUpperCase()) : SYMBOLS;

  const interval = setInterval(() => {
    for (const symbol of symbols) {
      const price = quotes.get(symbol);
      if (price === undefined) continue;
      const updated = nextPrice(price);
      quotes.set(symbol, updated);
      ws.send(JSON.stringify({ type: "tick", symbol, price: updated, ts: Date.now() }));
    }
  }, 700);

  ws.on("close", () => clearInterval(interval));
  ws.on("error", () => clearInterval(interval));
}
