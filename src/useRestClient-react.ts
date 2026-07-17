import { useMemo } from "react";
import { createRestClient } from "./rest-client.js";
import type { HttpConfig } from "./types.js";

/**
 * React hook for a memoized REST client.
 *
 * Recreates the client whenever `config` is a *new object reference* — standard
 * `useMemo` semantics. Pass a stable reference (memoize it yourself with
 * `useMemo`, keep it in `useState`/`useRef`, or define it as a module-level
 * constant) if you don't want a new client on every render.
 *
 * Earlier versions keyed the memo on `JSON.stringify(config)` instead. That
 * silently dropped function-valued fields (`auth`, `metrics`, `onError`,
 * `interceptors`, `adapter`) from the comparison — a new inline callback passed
 * on a later render was never picked up, the client kept calling the closure
 * captured on the first render. Reference-identity memoization has no such gap,
 * at the cost of requiring the caller to memoize the config object explicitly.
 *
 * @param config HttpConfig
 * @returns RestClient instance
 */
export function useRestClientReact(config: HttpConfig) {
  return useMemo(() => createRestClient(config), [config]);
}
