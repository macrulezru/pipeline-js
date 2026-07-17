"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useRestClientVue = void 0;
const vue_1 = require("vue");
const rest_client_js_1 = require("./rest-client.js");
/**
 * Vue composition function for memoized REST client
 * @param config HttpConfig
 * @returns RestClient instance
 */
const useRestClientVue = (config) => {
    return (0, vue_1.computed)(() => (0, rest_client_js_1.getRestClient)(config));
};
exports.useRestClientVue = useRestClientVue;
