/**
 * `HttpConfig.rateLimit.onRateLimitHeaders` runs after every response
 * (success or error) with the raw response headers, so you can throttle
 * *before* actually hitting a 429 — instead of only reacting to one after
 * the fact via `retriableStatus`/`Retry-After`.
 *
 * The library doesn't parse any particular header scheme itself (there's no
 * single standard — `X-RateLimit-*`, the IETF-draft `RateLimit-*`, and
 * vendor-specific headers all differ), so this file shows two common shapes
 * you can adapt to whatever your backend actually sends.
 */
import { createRestClient } from "rest-pipeline-js";

// ── Shape 1: classic `X-RateLimit-Remaining` + `X-RateLimit-Reset` (epoch seconds) ──
export const githubStyleClient = createRestClient({
  baseURL: "https://api.example.com",
  rateLimit: {
    onRateLimitHeaders: (headers, control) => {
      const remaining = Number(headers["x-ratelimit-remaining"]);
      const resetAtEpochSec = Number(headers["x-ratelimit-reset"]);
      if (remaining === 0 && Number.isFinite(resetAtEpochSec)) {
        const waitMs = resetAtEpochSec * 1000 - Date.now();
        control.throttleFor(waitMs);
      }
    },
  },
});

// ── Shape 2: IETF draft `RateLimit-Remaining` + `RateLimit-Reset` (seconds *from now*) ──
// https://www.ietf.org/archive/id/draft-ietf-httpapi-ratelimit-headers-08.html
export const draftStandardClient = createRestClient({
  baseURL: "https://api.example.com",
  rateLimit: {
    onRateLimitHeaders: (headers, control) => {
      const remaining = Number(headers["ratelimit-remaining"]);
      const resetInSec = Number(headers["ratelimit-reset"]);
      if (remaining === 0 && Number.isFinite(resetInSec)) {
        control.throttleFor(resetInSec * 1000);
      }
    },
  },
});

// ── Throttling proportionally as the quota runs low (not just at zero) ──
// Useful when a burst of requests is likely to blow through the last few
// units of quota before any single response reports "0 remaining".
export const gradualBackoffClient = createRestClient({
  baseURL: "https://api.example.com",
  rateLimit: {
    onRateLimitHeaders: (headers, control) => {
      const remaining = Number(headers["x-ratelimit-remaining"]);
      const limit = Number(headers["x-ratelimit-limit"]);
      if (!Number.isFinite(remaining) || !Number.isFinite(limit) || limit === 0) return;

      const fractionLeft = remaining / limit;
      if (fractionLeft < 0.1) {
        // Under 10% of quota left: add a small fixed delay to every
        // subsequent request rather than waiting for a hard 429.
        control.throttleFor(500);
      }
    },
  },
});
