import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // Hook tests (tests/vue-hooks.test.ts, tests/react-hooks.test.ts) import
      // via the public package specifier ("rest-pipeline-js/vue"), which is how
      // real consumers use it. Without this alias, Vite's self-reference
      // resolution (package.json `exports`) points that specifier at the built
      // `dist/esm/*.js` instead of `src/*.ts` — so v8 coverage never
      // instruments the hook source files (they showed 0% despite passing
      // tests), and the tests silently exercise whatever was last built into
      // `dist` instead of the current `src`. Aliasing to `src` fixes both:
      // coverage attributes correctly, and tests reflect current source.
      // `npm run verify:esm` (CI) separately confirms the real `dist` build
      // loads correctly — that responsibility doesn't need duplicating here.
      { find: "rest-pipeline-js/vue", replacement: src("plugins/vue/index.ts") },
      { find: "rest-pipeline-js/react", replacement: src("plugins/react/index.ts") },
      { find: "rest-pipeline-js", replacement: src("index.ts") },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts"],
    typecheck: {
      include: ["tests/**/*.test-d.ts"],
      // The root tsconfig.json is a `composite: true` project-references config
      // (paired with src/tsconfig.json) meant for editor tooling, not standalone
      // checking — running tsc against it directly fails with TS6305 because its
      // `outDir` declaration outputs were never built via `tsc --build`. Point
      // typecheck at a dedicated, non-composite config instead.
      tsconfig: "./tsconfig.typecheck.json",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
      // Thresholds are set a few points below the currently measured coverage
      // (see `npm run test:coverage`: ~84% stmts / ~83% branches / ~81% funcs /
      // ~86% lines as of this baseline, up from ~72/75/59/74 before the
      // request-executor/cache/hooks coverage pass — see CHANGELOG) so CI
      // catches regressions without blocking on the remaining gap (mainly
      // pipeline-orchestrator's less-common branches and the React/Vue
      // usePipelineRun hooks' error paths). Ratchet these up as coverage
      // improves; don't lower them to make a failing build pass.
      thresholds: {
        statements: 82,
        branches: 80,
        functions: 78,
        lines: 83,
      },
    },
  },
});
