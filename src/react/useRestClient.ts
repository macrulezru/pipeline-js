import { useMemo } from "react";
import { createRestClient } from "../rest-client";
import type { HttpConfig } from "../../dist/types";

/**
 * React hook for memoized REST client
 * @param config HttpConfig
 * @returns RestClient instance
 */
export function useRestClient(config: HttpConfig) {
  return useMemo(() => createRestClient(config), [JSON.stringify(config)]);
}
