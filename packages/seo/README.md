# @quilty/seo

SEO + structured-data builders + Next.js metadata helpers.

## Public API

```ts
import {
  // Schema.org JSON-LD builders (D27)
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
  buildSoftwareApplicationJsonLd,
  buildBreadcrumbsJsonLd,
  buildMedicalWebPageJsonLd,
  buildFAQPageJsonLd,
  // Next.js Metadata helpers (D158)
  buildOpenGraphMetadata,
  buildIconMetadata,
  // Component
  JsonLd,
  // Types
  type Breadcrumb,
  type FaqEntry,
  type FAQPageInput,
  type MedicalWebPageInput,
  type JsonLdProps,
} from '@quilty/seo';
```

Deep imports into `src/` are forbidden by `.dependency-cruiser.cjs` rule `cross-package-imports-must-use-barrel`.

## Schema.org coverage

Per D27 (revised): Organization + SoftwareApplication + WebSite + BreadcrumbList carry SERP weight. MedicalWebPage on `/science` + FAQPage serve AI-overview citation graphs (Google retired FAQPage rich-result eligibility 2026-05-07; MedicalWebPage was never Google-rich-result-supported but ChatGPT/Claude/Perplexity weight JSON-LD heavily in 2026).

## CSP integration

`<JsonLd>` accepts an optional `nonce` prop. Portal routes pass the per-request nonce from `(await headers()).get('x-nonce')`; marketing routes use the static-hash CSP allowlist + omit the nonce. `safeStringify` escapes `<` / `>` / `&` / U+2028 / U+2029 to defend against `</script>` injection.

## Asset dimensions

`buildIconMetadata` accepts whatever URLs the caller supplies; the dimensions are the caller's responsibility. Stable canonical dimensions for the standard icon family:

| Asset                       | Dimensions                | Format       | D-decision |
| --------------------------- | ------------------------- | ------------ | ---------- |
| `apple-touch-icon`          | 180×180                   | PNG          | D108       |
| `favicon`                   | 32×32 multi-res `.ico`    | ICO          | D108       |
| `shortcut icon` (modern)    | 192×192 + 512×512 + 32×32 | PNG          | D108       |
| `mask-icon` (Safari pinned) | scalable                  | SVG          | D108       |
| OG image                    | 1200×630                  | PNG/JPG ≤1MB | D109       |

## Tests

Run with `pnpm --filter @quilty/seo test`. Coverage targets ≥85% / ≥80% (utility-package floor).
