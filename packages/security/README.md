# @quilty/security

PHI sanitizer + CSP + security headers + redirect validator + forms primitives (CSRF, honeypot, time-trap stubs).

This is the **chokepoint primitive** for the modular monolith. Per D67, the Sanitizer port is the single boundary every user-typed value passes through before exiting the runtime via any vendor SDK (Sentry, Amplitude, AWS SES, CloudWatch, etc.). Other packages (`@quilty/observability`, `@quilty/email`) compose their factory wrappers around this package's `Sanitizer`.

## Ports

| Port                | Purpose                                                          | Decision |
| ------------------- | ---------------------------------------------------------------- | -------- |
| `Sanitizer`         | PHI denylist + JWT redaction + UUID hashing + depth-16 recursion | D67, D91 |
| `RedirectValidator` | Open-redirect defense (allowlist-driven)                         | D92      |
| `CspBuilder`        | Two-tier CSP (marketing static + portal nonce)                   | D59, D93 |
| `HeadersBuilder`    | HSTS phase ramp + COOP + CORP + Permissions-Policy               | D60, D94 |

## Forms-canonical domain utilities

Three domain modules ship as typed-throwing stubs at the package-extraction commit and are filled in by the forms-canonical commit later in the sprint:

- `csrf.ts` — CSRF triple-layer (Origin/Referer + signed double-submit + custom `X-Quilty-CSRF` header) per D10 + D53
- `honeypot.ts` — D113 honeypot field generator + verifier
- `time-trap.ts` — D113 form-submission time-trap helper

Each stub exposes typed signatures so contract tests can lock the API surface before the implementation lands.

## Public API

```ts
import {
  // Sanitizer
  sanitize,
  sanitizeAsync,
  isSensitiveKey,
  assertNoPHI,
  // CSP
  buildMarketingCsp,
  buildPortalCsp,
  isPortalRoute,
  generateNonce,
  // Headers
  buildSecurityHeaders,
  buildHstsValue,
  currentHstsPhase,
  // Redirect
  isSafeRedirect,
  type RedirectValidatorOptions,
} from '@quilty/security';
```

Test fakes (the in-memory adapters that contract tests run against):

```ts
import { makeSanitizerFake, makeRedirectValidatorFake } from '@quilty/security/testing';
```

Deep imports into `src/` are forbidden by `.dependency-cruiser.cjs` rule `cross-package-imports-must-use-barrel`.

## Tests

Unit + parameterized contract tests live under `src/__tests__/`. Run with `pnpm --filter @quilty/security test`. Coverage targets:

- Line: ≥90% (load-bearing package; META-3 floor is 85% but Sanitizer is the Cerebral-lesson primitive — higher is appropriate).
- Branches: ≥85%.
- Functions: ≥90%.

The `csp-evaluator.test.ts` runs the Google CSP Evaluator library against both tiers and asserts no HIGH severity findings — guards against accidentally re-introducing `unsafe-inline` or `unsafe-eval` outside development mode.
