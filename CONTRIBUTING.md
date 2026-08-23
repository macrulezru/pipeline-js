# Contributing

Thanks for considering a contribution to `rest-pipeline-js`.

## Setup

```bash
git clone https://github.com/macrulezru/pipeline-js.git
cd pipeline-js
npm install
```

## Before opening a PR

Run the same checks CI runs:

```bash
npm run lint          # eslint .
npm run build          # tsc (esm + cjs) + postbuild
npm run verify:esm     # native Node ESM load check for every entry point
npm test               # vitest run
npm run test:types     # vitest --typecheck (tests/**/*.test-d.ts)
npm run test:coverage  # vitest run --coverage, enforces thresholds in vitest.config.ts
npm run size            # size-limit, enforces bundle-size budgets in .size-limit.json
```

All of the above run in `.github/workflows/ci.yml` on Node 20/22/24 for every push and PR.

## Guidelines

- **Tests.** New behavior needs a test in `tests/`. If you touch `src/http/rest-client.ts`,
  `src/pipeline/pipeline-orchestrator.ts`, or `src/http/request-executor.ts`, prefer adding
  cases to the existing `*.test.ts` file for that module rather than a new file,
  unless the addition is a distinct feature area.
- **Coverage thresholds.** `vitest.config.ts` enforces minimum coverage. Don't
  lower the thresholds to make a failing build pass — raise the actual coverage,
  or ask in the PR description if a threshold genuinely needs to move.
- **Bundle size.** `.size-limit.json` enforces a brotli-compressed ceiling per
  entry point (core / `/vue` / `/react`, plus a much smaller one for
  `/testing`). If a change grows a bundle meaningfully, say so in the PR
  description and explain why. The core/`/vue`/`/react` ceiling was raised
  from 25 KB to 28 KB in `[Unreleased]` (see `CHANGELOG.md`) after the
  WebSocket stage brought actual size to ~24.3 KB, leaving almost no margin
  under the old limit — bump it again the same way (a deliberate, documented
  change) rather than letting CI block on organic growth from real features;
  don't bump it just to make a failing build pass without explaining why.
- **Types.** This is a TypeScript-first library — new public APIs need proper
  types, not `any`. `pipe().step()` chains rely on `TPrev` inference; if you
  touch `src/pipeline/pipeline-builder.ts` or `src/types.ts`, run `npm run test:types`
  and consider adding a case to `tests/pipe.test-d.ts`.
- **Breaking changes.** Avoid them where possible. If unavoidable, document the
  old vs. new behavior and the migration path in `CHANGELOG.md` under a new
  `### Breaking` section, the same way past breaking changes are documented
  there — explain *why*, not just *what*.
- **Changelog.** Any user-visible change (new option, fixed bug, behavior
  change) gets an entry in `CHANGELOG.md` under `[Unreleased]` (create that
  section if it doesn't exist yet). Follow the existing format: a bold summary
  of the change, then a sentence or two of *why* it matters and what it
  replaces/fixes.
- **Commit messages / PR titles.** Short, imperative, specific
  (`Add stale-while-revalidate cache strategy`, not `update cache.ts`).

## Reporting bugs / requesting features

Open a GitHub issue using the provided templates. For security issues, see
[SECURITY.md](./SECURITY.md) instead — do not open a public issue.

## Code style

`eslint.config.mjs` is the source of truth; `npm run lint` must pass with no
errors (warnings, e.g. the existing `@typescript-eslint/no-explicit-any`
backlog, are tolerated but please don't add new ones in code you're touching).
