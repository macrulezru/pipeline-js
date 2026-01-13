"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useRestClient = useRestClient;
const vue_1 = require("vue");
const rest_client_1 = require("../src/rest-client");
/**
 * Vue composition function for memoized REST client
 * @param config HttpConfig
 * @returns RestClient instance
 */
function useRestClient(config) {
    return (0, vue_1.computed)(() => (0, rest_client_1.createRestClient)(config));
}
