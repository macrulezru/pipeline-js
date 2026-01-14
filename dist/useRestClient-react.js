import { useMemo } from "react";
import { createRestClient } from "./rest-client";
/**
 * React hook for memoized REST client
 * @param config HttpConfig
 * @returns RestClient instance
 */
export function useRestClientReact(config) {
    return useMemo(() => createRestClient(config), [JSON.stringify(config)]);
}
