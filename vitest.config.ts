import { defineConfig } from "vitest/config";

export default defineConfig({
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
      exclude: ["src/vue-demo/**", "src/**/*.d.ts"],
      // Thresholds are set a few points below the currently measured coverage
      // (see `npm run test:coverage`: ~72% stmts / ~75% branches / ~59% funcs /
      // ~74% lines as of this baseline) so CI catches regressions without
      // blocking on the pre-existing gap — mainly the Vue/React hooks, which
      // are only smoke-tested for shape today, not full behavior. Ratchet these
      // up as coverage improves; don't lower them to make a failing build pass.
      thresholds: {
        statements: 70,
        branches: 72,
        functions: 55,
        lines: 72,
      },
    },
  },
});
