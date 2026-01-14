import { computed } from "vue";
import { getRestClient } from "../rest-client";
/**
 * Vue composition function for memoized REST client
 * @param config HttpConfig
 * @returns RestClient instance
 */
export const useRestClient = (config) => {
    return computed(() => getRestClient(config));
};
