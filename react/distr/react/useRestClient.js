"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useRestClient = useRestClient;
const react_1 = require("react");
const rest_client_1 = require("../src/rest-client");
/**
 * React hook for memoized REST client
 * @param config HttpConfig
 * @returns RestClient instance
 */
function useRestClient(config) {
    return (0, react_1.useMemo)(() => (0, rest_client_1.createRestClient)(config), [JSON.stringify(config)]);
}
