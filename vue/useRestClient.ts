import { computed } from 'vue';
import { createRestClient } from '../src/rest-client';
import type { HttpConfig } from '../src/types';

/**
 * Vue composition function for memoized REST client
 * @param config HttpConfig
 * @returns RestClient instance
 */
export function useRestClient(config: HttpConfig) {
  return computed(() => createRestClient(config));
}
