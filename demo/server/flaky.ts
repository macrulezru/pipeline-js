// Shared query-param control layer for simulating unreliable/slow network
// conditions on mock endpoints — lets demo pages drive retry/circuit-breaker/
// rate-limit/cache behavior deterministically via URL params instead of
// hoping a real flaky server misbehaves the "right" way on cue.
import type { ServerResponse } from "node:http";

/** `latencyMs=300` (fixed) or `latencyMs=100-500` (random range). */
export function parseLatencyMs(url: URL): number {
  const raw = url.searchParams.get("latencyMs");
  if (!raw) return 0;
  const [minStr, maxStr] = raw.split("-");
  const min = Number(minStr);
  if (!maxStr) return Number.isFinite(min) ? Math.max(0, min) : 0;
  const max = Number(maxStr);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return 0;
  return Math.round(min + Math.random() * (max - min));
}

export function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export function isMalformed(url: URL): boolean {
  return url.searchParams.get("malformed") === "true";
}

/**
 * Given the caller's own per-resource attempt counter (1-based), decides
 * whether this attempt should fail — `failEveryNth=3` fails attempts 1-2 and
 * succeeds on 3 (a realistic "flaky, eventually recovers" shape for retry
 * demos); `failRate=0.5` fails ~half of attempts at random.
 */
export function shouldFailAttempt(url: URL, attempt: number): boolean {
  const failEveryNth = url.searchParams.get("failEveryNth");
  if (failEveryNth) {
    const n = Number(failEveryNth);
    if (Number.isFinite(n) && n > 0) return attempt % n !== 0;
  }
  const failRate = url.searchParams.get("failRate");
  if (failRate) {
    const rate = Number(failRate);
    if (Number.isFinite(rate)) return Math.random() < rate;
  }
  return false;
}

/**
 * One-shot forced failure for "click this button to simulate a 429/503"
 * controls: `failStatus=429&retryAfter=3` (seconds) or `retryAfter=date`
 * (an HTTP-date ~5s out) — covers both `Retry-After` forms. Returns true if
 * it wrote a response (caller must stop).
 */
export function maybeSendForcedFailure(url: URL, res: ServerResponse): boolean {
  const failStatusRaw = url.searchParams.get("failStatus");
  if (!failStatusRaw) return false;
  const status = Number(failStatusRaw);
  if (!Number.isFinite(status) || status < 100 || status > 999) return false;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const retryAfter = url.searchParams.get("retryAfter");
  if (retryAfter === "date") {
    headers["Retry-After"] = new Date(Date.now() + 5000).toUTCString();
  } else if (retryAfter) {
    const seconds = Number(retryAfter);
    headers["Retry-After"] = String(Number.isFinite(seconds) ? seconds : 5);
  }

  res.writeHead(status, headers);
  res.end(JSON.stringify({ error: "Forced failure", status }));
  return true;
}
