# ADR-0005: Two-tier CSP — marketing static+hash-pinned, portal nonce+strict-dynamic, both report-only at M1 → enforce at M8 (NOT nonce-everywhere)

- **Status:** Accepted (architecture); report-only at M1, enforce at M8 launch gate
- **Date:** 2026-05-17 (locked via Round-5 audit)
- **Deciders:** Volodymyr Petrychenko + Round-5 CSP-security research agent
- **Related decisions:** D32 (CSP nonce + strict-dynamic plumbing day-one), D33 (security headers baseline), D34 (SRI on first-party only; Stripe/analytics rely on nonce+strict-dynamic), D35 (ConsentState + GPC), D57 (Trusted Types report-only at M1), D58 (COOP + CORP + nosniff additions), D59 (two-tier CSP per-route branching in `proxy.ts`), D60 (HSTS preload ramp deferred to M8), D61 (Sentry CSP endpoint as report-uri sink)
- **Related ADRs:** [ADR-0004 Observability stack](0004-observability-stack.md) (Sentry as CSP sink)
- **Related research:** `docs/research/round_5_independent_review/03-csp-security.md`, [Web Almanac 2025 Security chapter](https://almanac.httparchive.org/en/2025/security)

## Context

CSP is the **single most retrofit-hostile** header per Web Almanac 2025
(only ~22% of pages ship CSP; only ~10% strict-dynamic). The reason is
mechanical: every inline `<script>`, every analytics tag, every third-party
widget must be audited; retrofitting CSP to a year-old codebase is a 3-month
project. Building it in at scaffold is hours.

The naive enterprise pattern is "nonce + strict-dynamic everywhere." This is
correct for portal/auth pages (dynamic SSR per request) but **wrong for
marketing pages**: nonce-everywhere forces dynamic rendering and kills CDN
caching (CloudFront can't cache the response if the nonce changes per
request).

Forces:
- **Production CSP examples verified Round 5** via `curl -sI` on Stripe,
  Sentry, Cal.com, GitHub, Discord, Auth0, Resend, Vercel, accounts.google.com:
  - Stripe.com (marketing) → static + hash-pinned CSP (preserves CDN caching)
  - Stripe Dashboard (portal) → nonce + strict-dynamic CSP
  - Cal.com → CSP enforcement gated to `/auth/login` + `/login` only (other
    routes have no CSP at all — they're regressing in the opposite direction)
- **Next.js 16 renamed `middleware.ts` → `proxy.ts`** (file convention shift
  verified at nextjs.org/docs/app/api-reference/file-conventions/proxy).
- **Stripe explicitly does not publish SRI hashes** for `js.stripe.com/v3/`
  (continuous pushes for PCI/fraud). Same for GA/Tag Manager/Meta Pixel/
  Intercom/Hotjar. Adding SRI to these scripts will silently break payments.
  Compliant path per PCI DSS 4.0 §6.4.3 + §11.6.1: nonce + strict-dynamic
  + reporting as compensating control.
- **Sentry CSP endpoint** (`https://o<org>.ingest.sentry.io/api/<project>/security/`)
  is the natural report sink — Sentry is already in the stack for D42a,
  reports land alongside JS errors with grouping/release-tagging. The
  modern `report-to` directive doesn't support query strings (Sentry's
  endpoint requires `?sentry_key=`), so we ship both `report-uri` (works
  today) and `report-to` (forward-compat, currently can't target Sentry).
- **Trusted Types** (`require-trusted-types-for 'script'`) hit MDN Baseline
  in Feb 2026; React 19 supports; Web Almanac 2025 shows 12.1% of mobile
  pages already deploy. Cheap to add now while no `dangerouslySetInnerHTML`
  exists.
- **CCPA §7025(c)(6) effective 2026-01-01** mandates visible UI confirmation
  of honored GPC opt-outs (Disney $2.75M + Ford $375K enforcement Feb-Mar
  2026). The `<GpcHonoredIndicator>` component (D62) reads server-side
  ConsentState set at the CloudFront Function edge (D63) — this is a CSP-
  adjacent concern because the indicator must be allowed by the strict
  policy.
- **HSTS preload submission is irreversible** (6-12 months to remove from the
  browser preload list). Production-grade ramp: 5min → 1day → 1week → 1yr
  → 1yr+includeSubDomains → 2yr+preload. Submit to hstspreload.org only
  at M8 launch gate after every subdomain is verified HTTPS-only.

What happens if we don't decide: ship nonce-everywhere (kills marketing CDN
caching, makes Core Web Vitals 200-500ms worse for unauthenticated visitors),
OR ship CSP report-only forever without ever flipping enforce (Web Almanac
2025 data point: most sites do this), OR add SRI to Stripe.js (silently
breaks checkout on Stripe's next push), OR submit HSTS preload too early
(locks in subdomains before they're ready, requiring a year to undo).

## Decision

**We ship a two-tier CSP via per-route branching in `apps/web/proxy.ts`**:

1. **Marketing routes** (everything matching `/`, `/[locale]/(marketing)/*`):
   static `Content-Security-Policy-Report-Only` with hash-pinned inline
   allowlist. No nonce. Preserves CloudFront caching.
2. **Portal + auth routes** (`/[locale]/(account)/*`, `/api/auth/*`):
   nonce + strict-dynamic `Content-Security-Policy-Report-Only`. Nonce
   generated per request in `proxy.ts`, propagated via `x-nonce` request
   header, consumed in Server Components via `(await headers()).get('x-nonce')`.

**Both tiers ship report-only at M1**, with the same `report-uri` pointing
at the Sentry CSP endpoint. After 2-4 clean weeks of report-only data
(target M8 launch gate), we flip enforce mode. Trusted Types
`require-trusted-types-for 'script'` and HSTS follow the same ramp.

**Security headers baseline** (D33 + D58 — emitted on every response, both
tiers):

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=300` at M1; ramps to `max-age=63072000; includeSubDomains; preload` at M8 |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` (belt-and-suspenders with CSP `frame-ancestors 'none'`) |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` (avoids breaking OAuth pop-ups) |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` at M1 (M7 adds payment allowlist for Stripe) |
| `Content-Security-Policy-Report-Only` | per-tier (above) |

**SRI policy (D34 revised):** SRI ONLY on first-party `_next/static/*`
bundled at build time. Stripe.js + analytics scripts (PostHog, when it
activates at M3) load via nonce + strict-dynamic + CSP reporting. M7 adds
Puppeteer-based synthetic tamper-detection per PCI DSS 4.0 §11.6.1.

**CSP report sink:** Sentry's `https://o<org>.ingest.sentry.io/api/<project>/security/`
via `report-uri` directive. Allowlist `*.ingest.us.sentry.io` in `connect-src`
to avoid CSP-blocking-its-own-reports bootstrap failure.

## Consequences

### Positive

- **Marketing pages stay CDN-cacheable** — static CSP header is part of the
  CloudFront-cacheable response. INP/LCP/TTFB stay green for marketing.
- **Portal pages get the strictest CSP variant** (nonce + strict-dynamic)
  where the dynamic-SSR cost is already being paid anyway.
- **CSP report-only at M1** lets us catch violations during development +
  staging without breaking the dev loop. Real users hit it only in
  production where we already have weeks of report-only data to inform
  the enforce flip.
- **Trusted Types report-only** catches DOM-XSS sinks before they're
  introduced — cheap now while no `dangerouslySetInnerHTML` exists.
- **HSTS preload submission deferred** preserves option-value for
  subdomain reorganization; we submit only after every subdomain (auth,
  help, app) is HTTPS-final.
- **PCI DSS 4.0.1 compliant** SRI strategy: first-party SRI + nonce +
  strict-dynamic + reporting + synthetic tamper-detection at M7.
- **Sentry as report sink** = zero new infra. CSP violations land in the
  same triage workflow as JS errors.

### Negative

- **`proxy.ts` complexity** — two-tier branching is more code than
  nonce-everywhere. Mitigated by single `lib/security/csp.ts` module with
  `buildMarketingCsp()` + `buildPortalCsp(nonce)` builders + unit tests.
- **CSP enforce gate at M8** means M1-M7 are "report-only" with
  the operational risk that a real violation only gets caught when we
  flip enforce. Mitigated by aggressive Sentry alerting on CSP violations
  + staged enforce flips by route group.

### Neutral

- **`report-to` directive** (modern replacement for `report-uri`) can't yet
  target Sentry's endpoint due to query-string limitation — we ship both
  directives, with `report-uri` carrying the load. When Sentry supports a
  no-query-string CSP report endpoint, we can retire `report-uri`.

## Alternatives considered

### Alternative A: Nonce + strict-dynamic everywhere (naive enterprise pattern)

- **What it is:** Generate a per-request nonce, apply CSP with
  strict-dynamic to every route.
- **Why rejected:** Kills marketing CDN caching (response varies per
  request). For a marketing site that scales to thousands of pages, this is
  a 200-500ms p75 TTFB regression vs CDN-cached responses.

### Alternative B: Static CSP everywhere with hash-pinning (no nonces)

- **What it is:** Pre-compute SHA-256 hashes of every inline script at
  build time; ship them in a static CSP header.
- **Why rejected:** Portal pages render dynamic React content per session;
  inline scripts may vary by user (or be injected by analytics consent
  flow). Hash-pinning every possible variant is operationally untenable.

### Alternative C: CSP gated to specific auth routes only (Cal.com pattern)

- **What it is:** Apply CSP only to `/login` and `/auth/*`; let other routes
  ship without CSP.
- **Why rejected:** Cal.com is regressing in the wrong direction. CSP on
  marketing pages catches injected analytics tags before they exfiltrate
  PII (Cerebral pattern). The cost of a static marketing-CSP is near zero.

### Alternative D: Cloudflare as CSP report sink (separate vendor)

- **What it is:** Use a dedicated CSP reporting service (csp.withgoogle.com,
  Cloudflare Workers, csper.io).
- **Why rejected:** Sentry is already in the stack; same triage workflow.
  No second contract to manage.

### Alternative E: Skip Trusted Types at M1 (defer to M2+)

- **What it is:** Ship CSP without Trusted Types; add `require-trusted-types-for`
  later when there's actual surface area.
- **Why rejected:** Adding Trusted Types report-only at M1 costs one line
  of CSP header. The cost of retrofitting after `dangerouslySetInnerHTML`
  has been introduced into the codebase is "audit every component."

### Alternative F: HSTS preload at launch (no ramp)

- **What it is:** Ship `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  from M1 and submit to hstspreload.org immediately.
- **Why rejected:** Irreversible. Subdomain misconfiguration takes 6-12
  months to undo from the browser preload list. The 7-stage ramp catches
  HTTPS-readiness regressions per environment before we lock them in.

## Compliance / Verification

- `proxy.ts` is the **only** place CSP headers are constructed. Unit tests
  in `lib/security/__tests__/csp.test.ts` assert the marketing branch has
  no nonce + the portal branch has a nonce + both have the report-uri.
- Playwright e2e at M2 asserts:
  - `curl -sI http://localhost:3000/en/` returns marketing-tier CSP
  - `curl -sI http://localhost:3000/en/account/` returns portal-tier CSP
  - Trusted Types directive present in report-only header
  - All D33+D58 headers present
- Sentry alert on CSP-violation event volume + on enforce-mode regressions.
- HSTS preload submission gate: before submission, automated check confirms
  every subdomain has `Strict-Transport-Security` + valid TLS for ≥ 1 month.
- ESLint custom rule (Round 5 — to land at M1 Commit 9) bans
  `dangerouslySetInnerHTML` usage outside an allowlist.

## References

- Next.js 16 `proxy.ts` file convention (rename of `middleware.ts`): https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- Next.js CSP guide: https://nextjs.org/docs/app/guides/content-security-policy
- Web Almanac 2025 — Security chapter (CSP adoption + strict-dynamic stats): https://almanac.httparchive.org/en/2025/security
- Sentry CSP report-uri endpoint format: https://docs.sentry.io/security-legal-pii/security/security-policy-reporting/
- MDN CSP nonce + strict-dynamic guidance: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
- MDN Trusted Types: https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API
- W3C Trusted Types spec: https://www.w3.org/TR/trusted-types/
- PCI DSS 4.0.1 §6.4.3 + §11.6.1 (script management on payment pages): https://www.feroot.com/blog/pci-dss-4-0-1-guide-to-requirements-6-4-3-11-6-1/
- Sansec on CSP + SRI for Stripe-using sites: https://sansec.io/guides/csp-sri
- Bitsight cross-domain SRI exclusion list (vendors that don't publish SRI): https://help.bitsighttech.com/hc/en-us/articles/31777362565911-Cross-Domain-Subresource-Integrity-Exclusion
- CCPA §7025(c)(6) effective 2026-01-01 (visible GPC confirmation): https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf
- AWS WAF managed rules: https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-list.html
- Cloudflare Turnstile docs: https://developers.cloudflare.com/turnstile/get-started/
- HSTS preload list (submission gate, irreversible): https://hstspreload.org/
- Production header captures from Stripe / Sentry / Cal.com / GitHub / Discord / Auth0 / Resend / Vercel / accounts.google.com / OneMedical / Mayo / Kaiser / Stripe Dashboard are documented in `docs/research/round_5_independent_review/03-csp-security.md` § "Production CSP examples" with `curl -sI` outputs captured 2026-05-17.

## Revisit triggers

- **First B2B embed customer needs `frame-ancestors` allowlist for their
  domain** — relax CSP on a specific route group.
- **Stripe ships SRI hashes for js.stripe.com** (unlikely) — add SRI to
  Stripe.js per D34 original intent.
- **CSP report volume in Sentry exceeds 1000/day** — investigate; either
  add an allowlist for a legitimate source, or surface a real bug.
- **CSP enforce mode breaks production** after the M8 flip → roll back to
  report-only; spend a week investigating before re-flipping.
- **Next.js renames `proxy.ts` again** — update the file convention
  reference; behavior is unchanged.
- **`report-to` becomes the primary directive** (W3C deprecates `report-uri`)
  — re-evaluate Sentry endpoint compatibility.
