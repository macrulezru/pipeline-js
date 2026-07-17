import { computed } from "vue";
import { getRestClient } from "./rest-client.js";
import type { HttpConfig } from "./types.js";

/**
 * Vue composition function for memoized REST client
 * @param config HttpConfig
 * @returns RestClient instance
 */
export const useRestClientVue = (config: HttpConfig) => {
  return computed(() => getRestClient(config));
};
