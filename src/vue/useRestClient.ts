import { computed } from "vue";
import { getRestClient } from "../rest-client";
import type { HttpConfig } from "../types";

/**
 * Vue composition function for memoized REST client
 * @param config HttpConfig
 * @returns RestClient instance
 */
export const useRestClient = (config: HttpConfig) => {
  return computed(() => getRestClient(config));
};
