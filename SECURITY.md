# Security Policy

## Supported versions

Only the latest published `2.x` version on npm receives security fixes.
`1.x` is not maintained.

| Version | Supported |
| ------- | --------- |
| 2.x     | ✅        |
| < 2.0   | ❌        |

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, report privately using one of:

- [GitHub Security Advisories](https://github.com/macrulezru/pipeline-js/security/advisories/new)
  for this repository (preferred), or
- email macrulezru@gmail.com with a description of the issue, the affected
  version, and (if possible) a minimal reproduction.

Please include:

- The package version and entry point affected (core / `/vue` / `/react`).
- Whether the issue requires a specific configuration to trigger (e.g. a
  particular `cache.store`, `circuitBreaker`, or custom `HttpAdapter`).
- Potential impact (e.g. header/token leakage via `metrics` callbacks,
  cache-key collision, ReDoS in a parsing path).

You should receive an acknowledgement within a few days. A fix will be
released as a patch/minor version with a `CHANGELOG.md` entry; credit is
given in the release notes unless you ask not to be named.

## Scope notes

- This library sends requests via `axios` (or a caller-supplied `HttpAdapter`)
  and does not itself store credentials beyond an in-memory token cache
  (`AuthProvider.tokenTtlMs`). Vulnerabilities in `axios` itself should be
  reported upstream; a note here plus a dependency bump is still welcome if it
  affects this package's default configuration.
- `sanitizeHeaders` defaults to `true` specifically to reduce the risk of
  credential leakage through `metrics` callbacks — if you find a header or
  payload path that bypasses sanitization, that's a valid report.
