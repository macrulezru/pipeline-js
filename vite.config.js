import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import { mockApiPlugin } from "./demo/server/mock-api.ts";

export default defineConfig({
  root: "demo",
  plugins: [vue(), mockApiPlugin()],
  build: {
    outDir: "../dist/demo",
    emptyOutDir: true,
  },
  resolve: {
    alias: [
      // sub-paths MUST come before the root alias
      { find: "rest-pipeline-js/vue",   replacement: path.resolve(__dirname, "dist/esm/plugins/vue/index.js") },
      { find: "rest-pipeline-js/react", replacement: path.resolve(__dirname, "dist/esm/plugins/react/index.js") },
      { find: "rest-pipeline-js",       replacement: path.resolve(__dirname, "dist/esm/index.js") },
      { find: "@",                      replacement: path.resolve(__dirname, "src") },
    ],
  },
  server: {
    port: 3000,
    open: true,
  },
});
