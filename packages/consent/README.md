# @quilty/consent

Cookie taxonomy + GPC detection + visible GPC-honored indicator + default-deny `ConsentReader`. Banner UI ships at the consent-banner activation; the package today exposes a renderless `<ConsentBanner />` stub so consumers can wire it into the layout from day one without an additional code change at activation.

## Architecture

`@quilty/consent` is the consent-surface module. The `ConsentReader` port itself is owned by `@quilty/observability` because the analytics wrapper consumes it; this package provides production-shape values that satisfy the port. `@quilty/consent` re-exports the port types as an ergonomic convenience so consumers don't need to import from two packages.

## Public API

### Universal — `@quilty/consent`

```ts
import {
  // GPC
  detectGpcFromHeaders,
  GpcHonoredIndicator,
  // Consent state
  makeDefaultDenyConsentReader,
  ConsentBanner,
  // Cookie taxonomy
  COOKIE_REGISTRY,
  DEFAULT_DENY_STATE,
  // Types (re-exported from @quilty/observability for convenience)
  type ConsentReader,
  type ConsentSnapshot,
  type CookieCategory,
  type ConsentCategoryState,
} from '@quilty/consent';
```

### Server-only — `@quilty/consent/server`

```ts
import { makeServerConsentReader } from '@quilty/consent/server';
```

The server entry depends on Next.js `headers()` + `cookies()` resolution. Importing it from a Client Component is a build error once the `server-only` activation wires the condition map.

### Test fakes — `@quilty/consent/testing`

```ts
import { makeInMemoryConsentReader } from '@quilty/consent/testing';
```

Deep imports into `src/` are forbidden by `.dependency-cruiser.cjs` rule `cross-package-imports-must-use-barrel`.

## Default-deny baseline

`makeDefaultDenyConsentReader()` is the safe production baseline today. It returns `{ analytics: false, marketing: false, preferences: false, gpc_detected: false }` for every `.read()` call. The composition root swaps it for `makeServerConsentReader()` (which respects the `Sec-GPC: 1` opt-out signal) at the server-side activation, and again for a real cookie-aware store at the consent-banner activation.

## GPC enforcement (D62)

CCPA §7025(c)(6) (effective 2026-01-01) requires a visible confirmation that a detected `Sec-GPC: 1` signal has been honored. `<GpcHonoredIndicator />` is the named Server Component that satisfies this requirement. Disney $2.75M (Feb 2026) + Ford $375K (Mar 2026) established the enforcement precedent — silent honoring is not enough; the user must see it.

## Cookie registry

The `COOKIE_REGISTRY` array is the source of truth for the `/legal/cookies` page table. Add cookies here when they are introduced — mismatches between the registry and actual cookies set in production are an audit gap and a direct enforcement risk.

## Tests

Run with `pnpm --filter @quilty/consent test`. Coverage targets ≥85% / ≥80% (utility-package floor; raise to ≥90% when the consent banner activation expands the surface).
