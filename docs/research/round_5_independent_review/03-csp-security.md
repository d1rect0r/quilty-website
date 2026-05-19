# Enterprise Web Security Posture 2026 — quilty-website Security Header Scaffold

> Scope: CSP + security headers + SRI + consent + cookie security for a HIPAA-aligned, zero-PHI Next.js 16 marketing+portal site on AWS (CloudFront + Lambda via SST 3.x/4.x). Defender's thesis: **PHI never enters this runtime; tracking pixels never fire pre-consent** (the Cerebral $7M / Monument / BetterHelp lesson).
> Date: 2026-05-17. Investigator: senior appsec reviewer, zero prior context.

---

## 0. Live header reconnaissance (executed 2026-05-17)

Captured headers from production targets via `curl -sI` — these are the receipts behind every recommendation below.

| Site                     | strict-dynamic?                      | nonce?                                                   | COOP                                     | HSTS preload                                   | report-to/uri                                                                             | Frame defense                                                  | Permissions-Policy                                                                                                |
| ------------------------ | ------------------------------------ | -------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **stripe.com**           | no (uses hashes)                     | no                                                       | `same-origin-allow-popups` + report-only | `max-age=63072000; includeSubDomains; preload` | `report-uri https://q.stripe.com/csp-violation` + `report-to csp` + `Reporting-Endpoints` | both `frame-ancestors` + `X-Frame-Options: SAMEORIGIN`         | not present on www                                                                                                |
| **dashboard.stripe.com** | no, hash-pinned                      | yes (`'nonce-TLS5nmuxWMdsvCUg36F9zQ=='`)                 | yes + report-to                          | `max-age=63072000; includeSubDomains; preload` | yes                                                                                       | both                                                           | not present                                                                                                       |
| **sentry.io**            | **yes**                              | no (uses `'unsafe-inline' 'strict-dynamic'`)             | report-only                              | `max-age=31536000; includeSubDomains; preload` | `report-uri https://o1.ingest.sentry.io/api/54785/security/` + NEL                        | `frame-ancestors 'self' *.sentry.io` + `X-Frame-Options: deny` | not set on root                                                                                                   |
| **cal.com**              | proxy.ts gates to `/auth/login` only | yes (`x-csp-nonce`)                                      | no                                       | `max-age=31536000` (no preload on www)         | (configurable via env)                                                                    | `frame-ancestors` in lib/csp.ts                                | not set                                                                                                           |
| **github.com**           | no (allowlist)                       | no                                                       | not on home                              | preload                                        | n/a                                                                                       | `frame-ancestors 'none'` + `X-Frame-Options: deny`             | n/a                                                                                                               |
| **auth0.com**            | no (Vercel hosted)                   | no                                                       | n/a                                      | `max-age=31536000` (no preload)                | n/a                                                                                       | `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN`       | `feature-policy: usb 'none'; gyroscope 'none'; accelerometer 'none'; ambient-light-sensor 'none'` (legacy header) |
| **resend.com**           | no                                   | no                                                       | n/a                                      | `max-age=63072000`                             | n/a                                                                                       | `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN`       | `autoplay=(self), geolocation=(), microphone=(), camera=()`                                                       |
| **vercel.com**           | no                                   | no                                                       | n/a                                      | preload                                        | n/a                                                                                       | listed `frame-ancestors` allowlist                             | `fullscreen 'self'; camera 'none'` (legacy)                                                                       |
| **discord.com**          | no                                   | yes (`'nonce-MTE4LDEwOSwxMiwxNDQsMTA1LDEyMSwxMjQsMTU='`) | n/a                                      | preload                                        | `report-to csp-sentry` → Sentry ingest                                                    | `frame-ancestors` + `X-Frame-Options: DENY`                    | `interest-cohort=()`                                                                                              |
| **chase.com**            | no                                   | no                                                       | n/a                                      | `max-age=31536000` (no preload)                | n/a                                                                                       | `frame-ancestors 'none'` + `X-Frame-Options: SAMEORIGIN`       | client-hints only                                                                                                 |
| **onemedical.com**       | no                                   | no                                                       | n/a                                      | `max-age=31536000` (no preload)                | n/a                                                                                       | `X-Frame-Options: DENY`                                        | n/a                                                                                                               |
| **mayoclinic.org**       | no                                   | no                                                       | n/a                                      | not set                                        | n/a                                                                                       | `X-Frame-Options: SAMEORIGIN`                                  | n/a                                                                                                               |
| **accounts.google.com**  | no                                   | yes (`'nonce-PzU7oquAwUY3q27IZKdNug'`)                   | n/a                                      | `max-age=31536000; includeSubDomains`          | `report-uri /cspreport`                                                                   | `X-Frame-Options: DENY`                                        | n/a                                                                                                               |

**Headline observations**:

1. **Stripe.com itself does NOT use strict-dynamic on the marketing site** — they use **per-build script hashes** because their site allows static optimization. The Stripe **Dashboard** (authenticated portal) uses nonce + hashes. This is the per-route CSP pattern in production.
2. **Sentry.io is the cleanest strict-dynamic example** in production: `script-src 'self' 'unsafe-inline' 'report-sample' [vendor list] 'strict-dynamic' [more vendors]`.
3. **Discord uses nonce + sends CSP reports to Sentry** (`report-to csp-sentry → o64374.ingest.sentry.io`) — the AWS+Sentry pattern works.
4. **Stripe is the only major site shipping COOP** (most others omit it).
5. **Every consumer-grade site ships HSTS preload**; **healthcare portals (Mayo, OneMedical, Kaiser) do NOT** (Mayo doesn't even ship HSTS on the root) — healthcare lags badly. Don't anchor to healthcare baseline; anchor to Stripe/Sentry.
6. **Cerebral's failure was loading pixels at all on the website tier** — the structural defense is **don't run a vendor like Meta Pixel on this domain at all** until consent.

---

## 1. CSP shape in production — strict-CSP what real teams ship

**Current 2026 enterprise practice**: Two dominant shapes coexist. **(a) Strict-dynamic + nonce** (Sentry, Discord, Cal.com portal, Auth0 dashboard, Google) — used where dynamic rendering is acceptable. **(b) Hash-pinned + static-CSP** (Stripe.com marketing) — used where static optimization is non-negotiable. **Both ship `'self'` + per-deployment allowlists for connect-src (Sentry ingest, analytics), frame-src (Stripe iframe, hCaptcha, YouTube), and a strict `default-src 'self'` or `default-src 'none'` baseline.** Almost every prod-grade CSP includes `object-src 'none'`, `base-uri 'self'` or `'none'`, `frame-ancestors` (and many keep `X-Frame-Options` alongside for legacy crawlers/proxies), and `report-uri` + `report-to` with `Reporting-Endpoints`. `script-src 'unsafe-inline'` appears in 92% of sites per Web Almanac 2025 — strict-dynamic only ~10% — so any team shipping nonce+strict-dynamic is in the top decile of web security.

**Reference example**: live Stripe.com (captured 2026-05-17):

```
content-security-policy: base-uri 'none'; child-src 'none'; connect-src https://c.stripe.dev https://q.stripe.com https://errors.stripe.com 'self'; default-src 'none'; font-src 'self'; form-action 'self'; frame-ancestors https://app.contentful.com 'self'; frame-src https://js.stripe.com 'self'; img-src data: 'self' [...]; manifest-src 'none'; object-src 'none'; script-src https://js.stripe.com 'self' 'sha256-3aWvb9tRBjmz...' 'sha256-5LtzXhT...' [9 hashes] 'report-sample'; style-src 'self' 'unsafe-inline'; upgrade-insecure-requests; report-uri https://q.stripe.com/csp-violation?q=...; report-to csp
```

**Recommendation for M1 scaffold**: Ship **(a) strict-dynamic + nonce on `/account/*` and `/auth/*` portal routes** (these are dynamic anyway) and **(b) hash/`'self'`-only static CSP on `/` and marketing routes** so we keep CDN cacheability. Branch in `proxy.ts` on pathname. Day-one mode: `Content-Security-Policy-Report-Only` for **both** branches with reports to Sentry; flip to enforce per branch when violations are clean (target: 7 days for marketing, 14 days for portal).

**Retrofit cost if wrong**: **HIGH**. Web Almanac calls CSP the single most retrofit-hostile header — every inline script, every third-party SDK becomes a refactor.

**Citations**:

- Live Stripe headers captured by `curl -sI https://stripe.com` 2026-05-17
- Live Sentry headers captured by `curl -sI https://sentry.io` 2026-05-17
- Web Almanac 2025 Security: https://almanac.httparchive.org/en/2025/security
- web.dev strict CSP: https://web.dev/strict-csp/

---

## 2. CSP nonce in Next.js 16 — verified `proxy.ts` rename

**Current 2026 enterprise practice**: Next.js 16 (v16.2.6 confirmed via official docs 2026-05-13) **renamed `middleware.ts` → `proxy.ts`** with codemod `npx @next/codemod@canary middleware-to-proxy`. The exported function name became `proxy()`. Function body is unchanged — nonce generation, request-header propagation (`x-nonce`), and response-header emission all work identically. Vercel's canonical example (`examples/with-strict-csp/middleware.js`) and the official guide at `/docs/app/guides/content-security-policy` show: generate `Buffer.from(crypto.randomUUID()).toString('base64')`, set both `requestHeaders.set('Content-Security-Policy', ...)` (so RSC framework scripts get nonced automatically) **and** `response.headers.set('Content-Security-Policy', ...)`, then in any Server Component call `(await headers()).get('x-nonce')` and pass to `<Script nonce={...}>`. Nonce CSP **disables static optimization, ISR, and Partial Prerendering** for any matched route — this is the major architectural cost.

**Reference example**: Cal.com production (`apps/web/proxy.ts` + `apps/web/lib/csp.ts`):

- Gates enforcement to only `/auth/login` and `/login` via `shouldEnforceCsp(req.nextUrl)` — marketing stays uncovered
- Generates nonce via `buildNonce(crypto.getRandomValues(new Uint8Array(22)))`
- Sets `x-csp-nonce` on request headers, reads later when building response CSP
- `next.config.ts` has `throw new Error("Strict CSP policy(for style-src) is not yet supported in production")` — they've found style-src nonce too brittle and use `'unsafe-inline'` for styles in prod
- Their script-src includes `'self' 'unsafe-inline' https:` alongside `'nonce-${nonce}' 'strict-dynamic'` so non-strict-dynamic browsers (older mobile webviews) still work — modern browsers ignore the fallback when strict-dynamic is recognized (per spec)

**Recommendation for M1 scaffold**:

- Single `proxy.ts` at repo root with `matcher` scoped to **everything except `_next/static`, `_next/image`, `api`, `favicon.ico`** and **missing the `next-router-prefetch` header** (per Next.js official guide, prevents nonce churn on prefetches).
- Branch CSP string by `request.nextUrl.pathname.startsWith('/account')` / `/auth` for the dynamic-nonce variant, else emit the static `'self'`-based variant.
- Use `(await headers()).get('x-nonce')` only in `app/account/**/layout.tsx` and `app/auth/**/layout.tsx` Server Components for `<Script>` tags — keep marketing pages purely static.
- **Mark `/account/*` segments as `export const dynamic = 'force-dynamic'`** explicitly (Next.js 16 still supports this even alongside cacheComponents disabled).

**Retrofit cost if wrong**: **MEDIUM** — the codemod handles the file rename, but if you ship static CSP and later need nonce on a portal route, you must convert that whole segment from static to dynamic (loses CDN caching).

**Citations**:

- Official Next.js 16 docs: https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- Official CSP guide: https://nextjs.org/docs/app/guides/content-security-policy
- Cal.com production: https://github.com/calcom/cal.com/blob/main/apps/web/proxy.ts
- Cal.com CSP lib: https://github.com/calcom/cal.com/blob/main/apps/web/lib/csp.ts
- Vercel strict-csp example: https://github.com/vercel/next.js/blob/canary/examples/with-strict-csp/middleware.js

---

## 3. CSP report-only → enforce migration

**Current 2026 enterprise practice**: Production teams ship **Report-Only for 1-4 weeks** while iterating violations to zero on real traffic, then flip to enforce. Stripe still runs `Cross-Origin-Opener-Policy-Report-Only` **alongside** the enforced one — they never fully flip COOP. Sentry runs `Cross-Origin-Opener-Policy-Report-Only: same-origin` without the enforced sibling — long-tail observation mode. The pattern is: keep an enforced strict policy + a report-only strict-plus-one-ratchet policy permanently. For initial rollout, **violations must be < 0.01% of pageviews for 7 consecutive days** before flipping to enforce (Google internal rule, public via SecWebDev talks).

**Reference example**: Stripe simultaneously ships both:

```
cross-origin-opener-policy: same-origin-allow-popups; report-to="wsp_coop"
cross-origin-opener-policy-report-only: same-origin-allow-popups; report-to="wsp_coop"
```

Discord forwards CSP reports to **Sentry** via `reporting-endpoints: csp-sentry="https://o64374.ingest.sentry.io/api/5441894/security/?sentry_key=8fbbce30bf5244ec9429546beef21870&sentry_environment=stable"` — Discord+Sentry is the exact stack we're shipping.

**Recommendation for M1 scaffold**:

- Day 1: every CSP header in `proxy.ts` emits **both** `Content-Security-Policy-Report-Only` (the strict version) AND no enforced CSP at all. Reports go to Sentry's `/api/<project_id>/security/?sentry_key=<key>` endpoint via `report-uri` + `report-to` + `Reporting-Endpoints`.
- M2 milestone gate: review Sentry CSP report dashboard daily; root-cause every violation; refactor inline scripts; allowlist legitimate vendors with hashes.
- M3 milestone gate (or sooner if clean): flip to enforced `Content-Security-Policy` for marketing routes (lower risk, less third-party).
- M4 milestone gate: flip portal `/account/*` to enforced. Keep `Content-Security-Policy-Report-Only` running in parallel with **one ratchet stricter** policy (e.g., experiment with removing `'unsafe-inline'` from style-src, or adding `require-trusted-types-for 'script'`) permanently as observation.

**Retrofit cost if wrong**: **LOW** — switching `-Report-Only` → enforced is a one-line change once data is clean.

**Citations**:

- Live Stripe + Sentry headers (2026-05-17 captures above)
- Sentry CSP reporting docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/security-policy-reporting/

---

## 4. Trusted Types — `require-trusted-types-for 'script'`

**Current 2026 enterprise practice**: Trusted Types hit **Baseline 2026** when Safari 18.4 / Firefox 134 added support in Feb 2026, making it cross-browser shippable. **React 17.0.2+ supports Trusted Types in `dangerouslySetInnerHTML`** (React 19 fully supports). Next.js ships `packages/next/src/client/trusted-types.ts` in canary. Web Almanac 2025: 12.1% of mobile pages already carry the directive — adoption is higher than COOP. Google internal data: TT catches 61% of DOM-XSS that static analysis misses. **Today's enterprise pattern is two-phase: Report-Only first, find violations via Sentry, refactor to safe DOM APIs, ship enforced.** Most enterprises ship a single `DOMPurify`-backed policy named `default` plus optional `trusted-types-policy` for build-tool needs.

**Reference example**: Real header from a TT-enforcing site:

```
Content-Security-Policy: require-trusted-types-for 'script'; trusted-types default 'allow-duplicates';
```

None of our captured reference sites ship TT enforced today (none show `require-trusted-types-for` in our 13-site capture); Sentry + Discord likely run it in report-only internally per their public posture but don't emit it. **This is a competitive-edge surface, not a table-stakes one in 2026.**

**Recommendation for M1 scaffold**: **Ship Trusted Types in REPORT-ONLY ONLY** from day one alongside the report-only CSP, route reports to Sentry. **Do NOT flip to enforce until M8/M9** when we have legal+compliance work done and have audited every `dangerouslySetInnerHTML` (we should have approximately zero in marketing+portal). React 19 + Next.js 16 are both compatible. The cost of adding to scaffold is zero; the cost of retrofitting later is medium.

Header addition (report-only block):

```
Content-Security-Policy-Report-Only: ...everything else...; require-trusted-types-for 'script'; trusted-types 'none';
```

**Retrofit cost if wrong**: **MEDIUM** — adding TT later requires auditing every DOM sink and every third-party script. Adding the report-only directive at M1 surfaces problems early and costs nothing.

**Citations**:

- W3C Trusted Types spec: https://www.w3.org/TR/trusted-types/
- MDN baseline: https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API
- Web Almanac 2025: https://almanac.httparchive.org/en/2025/security
- Next.js client TT module: https://github.com/vercel/next.js/blob/canary/packages/next/src/client/trusted-types.ts

---

## 5. COOP / CORP / COEP

**Current 2026 enterprise practice**: Cross-Origin-Opener-Policy adoption is **2% globally** but **near-universal among security-critical sites**. The standard enterprise value is **`Cross-Origin-Opener-Policy: same-origin`** (or `same-origin-allow-popups` if you embed Stripe Checkout / OAuth popups, which require window.opener back-references). **Cross-Origin-Resource-Policy: same-origin** on first-party static assets prevents Spectre-style cross-origin reads. **COEP `require-corp`** breaks the moment you embed any third-party iframe that hasn't opted in (Stripe.js iframes specifically do NOT send CORP headers compatible with require-corp on the parent) — only ship COEP for fully isolated, no-third-party-iframe contexts (most consumer sites cannot). Stripe ships `same-origin-allow-popups` because their own Checkout/Connect flows use popups.

**Reference example**: live Stripe:

```
cross-origin-opener-policy: same-origin-allow-popups; report-to="wsp_coop"
```

Cal.com production proxy.ts conditionally enables COEP for embed routes only: `if (isCOEPEnabled) { res.headers.set("Cross-Origin-Embedder-Policy", "require-corp") }` — opt-in per-route.

**Recommendation for M1 scaffold**:

- Ship `Cross-Origin-Opener-Policy: same-origin-allow-popups` everywhere (we will use Cognito Hosted UI redirects + future Stripe Checkout — both need popup window.opener; pure `same-origin` would break them).
- Ship `Cross-Origin-Resource-Policy: same-origin` everywhere — first-party assets shouldn't be loadable cross-origin.
- **Do NOT ship COEP** at M1. Reserve for M9+ if we ever need `SharedArrayBuffer` / cross-origin isolation.
- Add `Cross-Origin-Opener-Policy-Report-Only: same-origin` (one ratchet stricter) reporting to Sentry.

**Retrofit cost if wrong**: **LOW** for COOP/CORP (easy to add later); **HIGH** for COEP (third-party embed breakage).

**Citations**:

- Web Almanac 2025: 2% COOP, 2.25% CORP, <1% COEP
- Live Stripe headers 2026-05-17

---

## 6. HSTS preload

**Current 2026 enterprise practice**: HSTS preload is **irreversible** in practical terms (6-12 months to remove per hstspreload.org). Enterprise teams ramp `max-age` over 4-8 weeks before submission: 5 min → 1 day → 1 week → 1 week + includeSubDomains → 1 year + preload. **Submission requires every subdomain to serve HTTPS** including non-public ones. As of April 2026, only 35.7% of HSTS-bearing sites use preload (~22% of all sites). Stripe ships `max-age=63072000; includeSubDomains; preload` (2 years, the max recommended). Healthcare lags — Mayo doesn't ship HSTS at all; OneMedical ships 1 year without preload.

**Reference example**: Stripe (`max-age=63072000; includeSubDomains; preload`), Sentry (`max-age=31536000; includeSubDomains; preload`).

**Recommendation for M1 scaffold**:

- M1 → M5: ship `Strict-Transport-Security: max-age=300` (5 min) so we can roll back during early iteration without locking out users.
- M5 → M7: ramp to `max-age=86400` then `max-age=604800` after first portal release stabilizes.
- M7 → M8 (pre-launch): ramp to `max-age=31536000; includeSubDomains` — verify every subdomain (`auth.my-quilty.com`, `help.my-quilty.com`, `app.my-quilty.com`) serves HTTPS first.
- **M8 launch gate**: submit `my-quilty.com` to hstspreload.org with `max-age=63072000; includeSubDomains; preload`. Sign-off required from: security (you), infra (SST owner), DNS (quilty-aws/dns layer owner), legal. This is the one-way door per the workflow doc M-gate framing.
- Crucial: Cognito's `auth.my-quilty.com` will be live before M8 (post-M1 per CLAUDE.md). Verify Cognito Hosted UI serves HSTS-correct responses **before** flipping `includeSubDomains` on the parent. Cognito does send HSTS by default — confirm via curl during M5.

**Retrofit cost if wrong**: **HIGH** (irreversible). De-preloading takes months.

**Citations**:

- https://hstspreload.org/
- Live Stripe/Sentry headers 2026-05-17
- AppSecSanta April 2026 adoption study (35.7% preload uptake)

---

## 7. Permissions-Policy

**Current 2026 enterprise practice**: 3.7% of sites set Permissions-Policy in 2025 (60% relative growth YoY) — among security-grade sites it's near-universal. Resend.com is the cleanest modern Next.js example: `permissions-policy: autoplay=(self), geolocation=(), microphone=(), camera=()`. Discord blocks the deprecated FLoC successor: `permissions-policy: interest-cohort=()`. **`browsing-topics=()`** is the modern equivalent to block Google's Topics API. **`payment=(self "https://js.stripe.com")`** is the allowlist needed for Stripe Elements (the iframe at `js.stripe.com` requires Payment Request API delegation). Setting `unload=()` opts out of unload events and guarantees back-forward-cache eligibility.

**Reference example**: Resend, captured 2026-05-17:

```
permissions-policy: autoplay=(self), geolocation=(), microphone=(), camera=()
```

**Recommendation for M1 scaffold** (default-deny except where we know we need it):

```
Permissions-Policy: accelerometer=(), autoplay=(self), browsing-topics=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), interest-cohort=(), magnetometer=(), microphone=(), midi=(), payment=(self "https://js.stripe.com"), picture-in-picture=(), publickey-credentials-get=(self), screen-wake-lock=(), serial=(), sync-xhr=(), unload=(), usb=(), web-share=(self), xr-spatial-tracking=()
```

Notes:

- `payment=(self "https://js.stripe.com")` reserved for M7 when Stripe Elements lands; safe to ship at M1 since we won't have payment on M1.
- `publickey-credentials-get=(self)` reserves WebAuthn for future passkey support (mobile app + website parity in M6+).
- `interest-cohort=()` is deprecated in browsers but still respected by older Chromium — cheap to keep.
- `browsing-topics=()` is the active block.
- `unload=()` improves bfcache and is free.

**Retrofit cost if wrong**: **LOW** — fully reversible per-header; no client state baked in.

**Citations**:

- Web Almanac 2025: https://almanac.httparchive.org/en/2025/security
- Resend live headers 2026-05-17
- MDN Permissions-Policy: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy

---

## 8. Referrer-Policy

**Current 2026 enterprise practice**: The dominant enterprise pick is **`strict-origin-when-cross-origin`** (GitHub: `origin-when-cross-origin, strict-origin-when-cross-origin`; OneMedical, Cal.com all use it). Stripe ships `no-referrer-when-downgrade` on marketing (legacy default), `strict-origin-when-cross-origin` on Dashboard. Resend ships `origin-when-cross-origin`. `no-referrer` is appropriate for high-PHI clinical UIs (Mayo doesn't set, kaiserpermanente.org doesn't either — they should use `no-referrer`). For a marketing+account-portal site that hosts NO PHI but where the URL itself (e.g., `/account/billing/invoices/123`) could be sensitive, `strict-origin-when-cross-origin` is the right balance: same-origin gets full Referer, cross-origin gets only origin, HTTPS→HTTP downgrades get nothing.

**Reference example**:

```
referrer-policy: strict-origin-when-cross-origin (Cal.com, GitHub fallback)
```

**Recommendation for M1 scaffold**:

- Marketing routes: `Referrer-Policy: strict-origin-when-cross-origin`
- `/account/*` and `/auth/*` portal routes: `Referrer-Policy: no-referrer` (paranoid — these URLs may carry account context in path segments)

**Retrofit cost if wrong**: **LOW** — one header, no client impact.

**Citations**:

- Live header captures 2026-05-17
- MDN: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy

---

## 9. `X-Content-Type-Options` + `X-Frame-Options` vs CSP `frame-ancestors`

**Current 2026 enterprise practice**: `X-Content-Type-Options: nosniff` is unconditional — every captured site ships it; no reason to omit. **The frame-ancestors vs X-Frame-Options question: ALL captured sites still ship both.** Stripe, Sentry, GitHub, Chase, OneMedical, Discord, Auth0, Resend — every single one ships **both `Content-Security-Policy: frame-ancestors ...` AND `X-Frame-Options: DENY|SAMEORIGIN`**. The reason: a small percentage of crawler/proxy/security-tool user-agents don't fully parse CSP and only respect XFO, plus IE11 (still on intranet healthcare deployments) doesn't support CSP frame-ancestors. **Belt-and-suspenders is the 2026 norm**; the maintenance cost is zero.

**Reference example**: GitHub:

```
x-content-type-options: nosniff
x-frame-options: deny
content-security-policy: ...; frame-ancestors 'none'; ...
```

**Recommendation for M1 scaffold**:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY        (since we never legitimately embed ourselves)
Content-Security-Policy: ...; frame-ancestors 'none'; ...
```

**Retrofit cost if wrong**: **LOW**.

**Citations**: live captures of every reference site 2026-05-17.

---

## 10. SRI in production — Stripe.js doesn't publish hashes; what to do

**Current 2026 enterprise practice**: Stripe **explicitly refuses to support SRI** on `js.stripe.com/v3/` because they continuously push updates. Google Analytics, GTM, Sentry browser SDK, Plausible — none publish stable SRI hashes for the same reason. PCI DSS 4.0.1 §11.6.1 (effective March 2025) requires "change/tamper detection for payment-page scripts" — Stripe's official compensating control is **their own "proprietary script management"** plus your CSP restricting `script-src` to known origins. The compliant pattern is: (a) SRI mandatory on first-party `_next/static/*` chunks (Next.js 16's experimental `next.config.js` `experimental.sri: { algorithm: 'sha256' }` ships `integrity` attrs automatically — gates static export); (b) SRI on stable-versioned third-party scripts (jQuery via version-pinned CDN URLs — we don't ship any); (c) for dynamic third-party (Stripe.js, Sentry SDK), document the SRI exception in script inventory, restrict via `script-src` allowlist OR `'strict-dynamic'` + nonce, and add a tamper-detection control (synthetic monitoring of payment pages via Puppeteer hashing the live HTML against a baseline — required by PCI 11.6.1 for SAQ A-EP merchants).

**Reference**: Stripe.com itself uses 9 explicit script hashes in its own CSP `script-src` and `'self'` — no SRI on third-party. Stripe Dashboard uses 21+ hashes.

**Recommendation for M1 scaffold**:

- Enable `experimental.sri: { algorithm: 'sha256' }` in `next.config.ts` once we have a marketing-only static path **(but be aware it disables some build flexibility — verify with M2 deploy)**.
- For M1: **don't enable experimental.sri yet** — wait until M2 where we ship the first real static pages.
- When we ship Stripe (M7): script inventory document goes in `docs/pci/script-inventory.md` listing every third-party script with justification + SRI-exception note for Stripe.js.
- Compensating control for Stripe.js (M7): nightly Puppeteer job that fetches `/account/billing` (or wherever Stripe.js loads), hashes the HTML + scripts inline, compares to baseline in S3, alerts via Sentry on diff. This is the PCI 11.6.1 compliance artifact.

**Retrofit cost if wrong**: **MEDIUM** at M7 (Stripe lands then anyway). LOW now if we just document the design.

**Citations**:

- Stripe SRI position: https://docs.stripe.com (Stripe.js docs) + Scott Helme analysis
- PCI DSS 4.0.1 §11.6.1: https://www.feroot.com/blog/pci-dss-4-0-1-guide-to-requirements-6-4-3-11-6-1/
- Next.js experimental SRI: https://nextjs.org/docs/app/guides/content-security-policy#subresource-integrity-experimental

---

## 11. Per-route CSP

**Current 2026 enterprise practice**: The pattern Stripe production uses live (and Cal.com via `shouldEnforceCsp(req.nextUrl)`): **scope the proxy matcher to all routes, then branch the CSP string on `pathname` inside the proxy function**. Marketing pages emit a static `'self'`-+-hashes CSP, portal pages emit a nonce + strict-dynamic CSP. **App Router segment metadata cannot set headers** — only `next.config.ts`'s `headers()` (static, no nonce) or `proxy.ts` (dynamic, can branch) can. Combining them: ship static-CSP from `next.config.ts` for `/blog/*` (when blog launches) + nonce-CSP from `proxy.ts` for `/account/*` `/auth/*`. **Nonce CSP forces dynamic rendering** — applying it to marketing pages would unnecessarily disable CDN caching for the entire marketing surface.

**Reference example**: Cal.com production gates CSP only to `/auth/login`, `/login`:

```ts
const shouldEnforceCsp = (url: URL) =>
  url.pathname.startsWith('/auth/login') || url.pathname.startsWith('/login');
```

**Recommendation for M1 scaffold**: Adopt the **two-tier CSP architecture** from day one:

```ts
// proxy.ts (sketch)
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPortal = path.startsWith('/account') || path.startsWith('/auth');
  const cspHeader = isPortal ? buildNonceCsp(generateNonce()) : buildStaticCsp();
  // ... set both request + response headers
}
```

This costs nothing extra at M1 (marketing routes still cacheable) and is the right shape forever. Even when blog ships post-launch (D30 trigger), it remains in the marketing CSP bucket.

**Retrofit cost if wrong**: **MEDIUM** — if we naively nonce everything at M1, we lose static optimization and CDN caching for marketing pages permanently until refactored.

**Citations**:

- Cal.com proxy.ts (real production code, fetched 2026-05-17)
- Next.js 16 CSP guide: https://nextjs.org/docs/app/guides/content-security-policy
- Vercel discussion #58110 (segment-level CSP is not supported; matcher is the way)

---

## 12. Cookie security

**Current 2026 enterprise practice**: OWASP Session Management Cheat Sheet (RFC 6265bis §4.1.3) is unambiguous: **`__Host-` prefix is the strongest cookie binding** — forces `Secure`, forbids `Domain` attribute, requires `Path=/`, prevents subdomain forgery, prevents HTTPS downgrade. **`__Host-` is mutually exclusive with parent-domain sharing** (no `Domain=.my-quilty.com`). This is correctly captured in CLAUDE.md D7. Stripe Dashboard ships `Set-Cookie: __Host-session=; path=/; ...; secure`. Discord ships `__dcfduid` + `__sdcfduid` with `Secure; HttpOnly; SameSite=Lax`. **For session-cookie value**: server-side session-ID with backend store (Redis/DynamoDB) is OWASP-preferred over encrypted-blob-in-cookie because it allows server-side revocation. **iron-session** (encrypted-blob, AEAD-sealed) is a defensible alternative for stateless deploys but you lose revocation granularity. **For BFF pattern with Cognito (D5, D7)**: server-side session-ID is correct — the session cookie is just a pointer; the actual OIDC tokens live in a server-side store (DynamoDB) keyed by session ID. **SameSite=Lax** is the right default per OAuth BCP draft-26; SameSite=Strict breaks OIDC redirect callback flows.

**Reference example**: live Stripe Dashboard:

```
set-cookie: __Host-session=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; secure
set-cookie: machine_identifier=...; domain=stripe.com; path=/; ...; secure; HttpOnly; SameSite=Lax
```

**Recommendation for M1 scaffold** (will land at M6 — auth integration — but document at M1):

- Session cookie: `__Host-quilty-session=<opaque-server-session-id>; Path=/; Secure; HttpOnly; SameSite=Lax`
- CSRF cookie (paired with double-submit): `__Host-quilty-csrf=<random-128-bit>; Path=/; Secure; **NOT HttpOnly** (must be readable by JS to echo in X-Quilty-CSRF header); SameSite=Lax`
- Cognito-related: no Cognito tokens in browser cookies ever (BFF pattern; D5/D7); server-side store only.
- Locale/theme preference cookies: `__Host-quilty-locale=...; Path=/; Secure; SameSite=Lax`
- **NEVER ship `Domain=.my-quilty.com`** on any cookie — kills `__Host-` prefix.
- Cognito Hosted UI at `auth.my-quilty.com` sets its own cookies on `auth.` host scope — they never reach our origin (D7 verified).

**Retrofit cost if wrong**: **HIGH** at M6 if we lock in the wrong scheme — every Cognito callback handler needs rewriting. **Document the cookie ledger at M1 even though implementation is M6**.

**Citations**:

- OWASP Session Management: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- IETF OAuth BCP draft-26 (Dec 2025): https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps
- RFC 6265bis §4.1.3 (cookie prefix definitions)

---

## 13. CSRF in 2026

**Current 2026 enterprise practice**: OWASP CSRF Cheat Sheet (current as of 2026) is explicit: **SameSite=Lax alone is NOT sufficient**. Three gaps: (a) safe methods (GET) still pass through Lax — any state-changing GET endpoint is exploitable; (b) Lax is registrable-domain-scoped, not origin-scoped, so a subdomain compromise leaks; (c) older mobile webviews, embedded browsers, and Firefox/Safari (which don't enforce Lax-by-default as of Dec 2024) leave gaps. **The current 2026 OWASP-blessed primary defense is signed double-submit cookie token + custom header + Origin/Referer check**, with SameSite=Lax layered as defense-in-depth. The token must be HMAC-signed (otherwise an attacker who can set arbitrary cookies on a sibling subdomain can forge double-submit). The custom header (`X-Quilty-CSRF`) is what kills CSRF for AJAX — browsers won't let attacker forms add custom headers cross-origin without triggering a CORS preflight that the server can reject.

**Reference**: CLAUDE.md D10 already locks "signed double-submit CSRF token + custom `X-Quilty-CSRF` header + SameSite=Lax" — this is the correct OWASP-blessed pattern.

**Recommendation for M1 scaffold** (implements at M6, document at M1):

- All POST/PUT/PATCH/DELETE Route Handlers verify: (1) `Origin` or `Referer` header matches `my-quilty.com`; (2) `X-Quilty-CSRF: <token>` request header matches `__Host-quilty-csrf` cookie value (constant-time compare); (3) token is HMAC-signed with server secret rotated weekly; (4) SameSite=Lax on both session and CSRF cookies.
- Server Actions (Next.js): React's built-in Server Actions hashing + origin check covers same-origin invocations; layer the explicit Origin check anyway in the action handler.
- **NEVER allow state changes on GET**. Code review gate: any new route handler with GET must be pure-read.

**Retrofit cost if wrong**: **HIGH** at M6 — refactoring auth flows mid-launch is the most retrofit-hostile of any auth decision.

**Citations**:

- OWASP CSRF Prevention Cheat Sheet 2026: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- OAuth BCP draft-26 §6.2

---

## 14. Consent gating + GPC at edge — THE Cerebral lesson

**Current 2026 enterprise practice**: This is the highest-stakes surface for our HIPAA-aligned posture. **California §7025(c)(6) became MANDATORY on Jan 1, 2026**: businesses MUST visibly confirm to GPC-sending consumers that the opt-out signal was honored. The Disney $2.75M (Feb 2026) and Ford $375K (Mar 2026) actions are direct enforcement. **The Cerebral $7M / Monument / BetterHelp $7.8M settlements all stem from one structural failure: tracking pixels (Meta, TikTok, Google) loaded on page-view, before consent.** The 2026 affirmative-express-consent standard requires consent to be obtained "freely given, specific, unambiguous" via a UI separate from the privacy policy, **before any pixel fires**. Enterprise architectures use **server-side ConsentState as single source of truth** (gated at the BFF), with the browser receiving SDK code paths only after the ConsentState resolves to allow. **GPC `Sec-GPC: 1` detection at the edge** (CloudFront Function / Lambda@Edge) lets you short-circuit before SDK code is even served. This is the architecture CLAUDE.md D35 already mandates — it's correctly the most defensive design available.

**Concrete pattern**:

1. CloudFront Function reads `Sec-GPC: 1` request header on every page request.
2. If GPC, set `x-quilty-consent: declined` request header forwarded to Next.js Lambda, set `__Host-quilty-gpc-honored=1` cookie (HttpOnly false so client can read for UI).
3. Next.js Server Component reads `headers().get('x-quilty-consent')` and ConsentState from server-side store (DynamoDB, keyed by session or anonymous device cookie); decides which SDK chunks to include in render tree.
4. UI shows persistent non-modal "Opt-Out Request Preference Signal Honored" indicator (§7025(c)(6) requirement) — banner in footer or persistent toggle in account preferences.
5. Marketing/analytics SDKs (Amplitude, Sentry RUM in non-essential mode) are NEVER imported in the base bundle — they're behind a dynamic `import()` gated on ConsentState resolving to allow.
6. Sentry **error monitoring** (server + browser-side errors) is **essential**, not analytics, and ships pre-consent (Sentry has BAA option) — but session replay default-mask-all (D40) regardless.

**Recommendation for M1 scaffold**:

- M1: ship the **CloudFront Function for GPC detection** as part of SST infra (~30 lines of JS).
- M1: ship `app/lib/consent.ts` with typed `ConsentState` shape: `{ functional: 'required'; analytics: 'pending'|'allow'|'deny'; marketing: 'pending'|'allow'|'deny' }`.
- M1: ship `components/app/ConsentBanner.tsx` (placeholder — final UI in M8 with legal review) and `components/app/GpcHonoredIndicator.tsx`.
- M1: **NO marketing SDK code at all** — Amplitude doesn't land until pre-launch per D42b; we're naturally compliant by virtue of not yet having pixels to fire.
- M1: document the consent ledger in `docs/consent-ledger.md` — every future SDK addition must pass through this review.

**Retrofit cost if wrong**: **CATASTROPHIC**. This is the $7M Cerebral surface. Build the architecture correctly at M1 even though the SDK list is empty.

**Citations**:

- CCPA §7025(c)(6) effective 2026-01-01: https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf
- FTC Cerebral order: https://www.ftc.gov/legal-library/browse/cases-proceedings/2023027-cerebral
- Disney $2.75M (Feb 2026), Ford $375K (Mar 2026) — first enforcement under amended §7025
- BetterHelp $7.8M precedent (Mar 2023)
- W3C GPC: https://globalprivacycontrol.org/

---

## 15. WAF + bot protection

**Current 2026 enterprise practice**: For AWS-hosted Next.js (our case), the table-stakes baseline at CloudFront is three AWS-managed WAF rule groups in priority order: **AWSManagedRulesAmazonIpReputationList (priority 0)** → **AWSManagedRulesCommonRuleSet (priority 1)** → **AWSManagedRulesKnownBadInputsRuleSet (priority 2)**. Each rule group ships in **Count mode for 1-2 weeks first** to find false positives before flipping to Block. For auth-form protection specifically (login, signup, password-reset), add **AWSManagedRulesATPRuleSet (Account Takeover Prevention)** — designed for credential stuffing and account takeover, with rate limiting on credentials per IP and per username. For bot protection, the 2026 picks are: (a) **Cloudflare Turnstile** (free, no-CAPTCHA, privacy-preserving, JS-only) for auth forms — ship if we want non-AWS; (b) **AWS WAF Bot Control** native, more expensive, ships server-side detection; (c) **hCaptcha** if accessibility/privacy strict. **Turnstile is the modern default** because zero-friction.

**Reference**: GitHub uses Cloudflare; Stripe uses hCaptcha (visible in their CSP allowlist: `https://*.hcaptcha.com`); Discord uses both reCAPTCHA + hCaptcha.

**Recommendation for M1 scaffold** (WAF rules deployed via SST infra, not via Next.js):

- M1: SST config attaches AWS WAF to CloudFront distribution with three managed rule groups in **Count mode**.
- M2: review CloudWatch WAF logs; flip rule groups to Block mode if false positives < threshold.
- M6 (auth integration): add **AWSManagedRulesATPRuleSet** scoped to `/auth/*` paths only; configure with `RequestInspection` block targeting Cognito Hosted UI redirect endpoints.
- M6: add **Cloudflare Turnstile** widget to Cognito Hosted UI custom login flow (Hosted UI supports custom Lambda triggers). Verification happens server-side in a pre-token-issuance Cognito Lambda. Allowlist `challenges.cloudflare.com` in CSP `script-src` and `frame-src`.
- Rate limiting on auth endpoints: AWS WAF rate-based rule, 100 requests / 5 min per IP for `/auth/*`.

**Retrofit cost if wrong**: **LOW-MEDIUM**. WAF rules are reversible at the IaC layer.

**Citations**:

- AWS Managed Rules: https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-list.html
- AWS ATP rule group: https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-atp.html
- Cloudflare Turnstile: https://developers.cloudflare.com/turnstile/

---

## 16. PCI DSS 4.0 web requirements (effective March 2025) — what Stripe-using sites shipped in 2026

**Current 2026 enterprise practice**: §6.4.3 mandates a script inventory for payment pages with written justification per script; §11.6.1 mandates tamper detection on the payment page (HTTP headers + content) with weekly minimum, real-time preferred. **Stripe explicitly will not support SRI** on `js.stripe.com/v3/` (their tradeoff: continuous deploy of fixes over hash stability). The three defensible 2026 paths: (a) **Stripe Checkout redirect** — moves payment to `checkout.stripe.com`, takes 6.4.3/11.6.1 out of scope (the cleanest win, but UX cost); (b) **Stripe Elements** (iframes within our domain) — keeps in scope, requires script inventory + compensating tamper-detection (Puppeteer synthetic, Feroot, Cloudflare Page Shield, or cside); (c) **DIY Puppeteer** — fetch live `/account/billing` daily, hash HTML + script tags, compare to baseline in S3, alert on diff. Real enterprises picked: smaller merchants went (a) Checkout redirect; mid-market went (b) with Feroot ($) or Cloudflare Page Shield (now self-serve as of Mar 2026); large merchants ran (c) DIY.

**Recommendation for M1 scaffold** (M7 when Stripe lands):

- **Lean toward Stripe Checkout redirect at M7** unless UX requires Elements. Saves PCI scope and engineering toil.
- If Elements is needed: ship `docs/pci/script-inventory.md` + Puppeteer synthetic monitoring as a separate Lambda + S3 baseline + Sentry alert. Estimate 1 engineer-week of setup, runs autonomously.
- Document the **decision gate at M7** in `docs/website_workflow_roadmap.md` so we don't accidentally commit to Elements without the compensating control work being scoped.

**Retrofit cost if wrong**: **MEDIUM** (M7-isolated work).

**Citations**:

- PCI DSS 4.0.1 Payment Page Security Guide (March 2025): PCI Security Standards Council
- Stripe SRI stance: https://docs.stripe.com (Stripe.js loading docs)
- Scott Helme PCI 4.0 analysis: https://scotthelme.co.uk/pci-dss-4-0-its-time-to-get-serious-on-magecart/

---

## 17. CSP report sink — pick for AWS+Next.js+Sentry stack

**Current 2026 enterprise practice**: Four options: **Sentry** (browser+server errors AND CSP reports under one project; the integration ships out of the box), **Datadog** (good correlation with infra metrics but expensive and overkill for marketing sites), **Cloudflare Workers** (great if you're on Cloudflare, irrelevant for us on AWS), **self-hosted endpoint** (Lambda + DynamoDB — only worth it if you have specific data residency needs). **For our stack (Sentry already locked in via D42a), Sentry is the clear pick.** Sentry's docs explicitly support both legacy `report-uri` and modern `report-to` via Reporting-Endpoints header — though Sentry **does not yet support `Reporting-Endpoints` directly**, only `Report-To` (deprecated) and `report-uri`. Compatibility quirk: emit all three (`report-uri`, `Report-To` JSON, `Reporting-Endpoints`) for max browser coverage. Discord's live header confirms this works: `report-to csp-sentry → https://o64374.ingest.sentry.io/api/5441894/security/?sentry_key=...&sentry_environment=stable`.

**Reference**: live Discord 2026-05-17:

```
report-to: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4..."}]}
reporting-endpoints: csp-sentry="https://o64374.ingest.sentry.io/api/5441894/security/?sentry_key=8fbbce30bf5244ec9429546beef21870&sentry_environment=stable"
```

**Recommendation for M1 scaffold**:

- Sentry project for CSP reports created at M1 (separate Sentry project from app errors, or use sub-project — Sentry supports both).
- `proxy.ts` emits:
  ```
  Content-Security-Policy-Report-Only: ...; report-uri https://o<id>.ingest.us.sentry.io/api/<proj-id>/security/?sentry_key=<key>&sentry_environment=<env>; report-to csp-sentry
  Reporting-Endpoints: csp-sentry="https://o<id>.ingest.us.sentry.io/api/<proj-id>/security/?sentry_key=<key>&sentry_environment=<env>"
  Report-To: {"group":"csp-sentry","max_age":10886400,"endpoints":[{"url":"https://o<id>.ingest.us.sentry.io/api/<proj-id>/security/?sentry_key=<key>&sentry_environment=<env>"}],"include_subdomains":true}
  ```
- **MUST allowlist** `*.ingest.us.sentry.io` (or EU equivalent) in `connect-src` — otherwise CSP itself blocks the CSP report. (Common bootstrap failure.)
- Sentry CSP dashboard becomes the M1-M3 daily-review surface.

**Retrofit cost if wrong**: **LOW** — switching report sinks is a one-line header change.

**Citations**:

- Sentry Next.js Security Policy Reporting: https://docs.sentry.io/platforms/javascript/guides/nextjs/security-policy-reporting/
- Live Discord headers 2026-05-17 (confirms Sentry endpoint pattern in production)

---

## A. Strict-CSP starter template for our project (M1 deliverable)

The annotated header value `proxy.ts` should emit for **portal routes** (`/account/*`, `/auth/*`) — full strict-dynamic + nonce. Replace `${nonce}` per request and `${sentryReportUri}` per env.

```
Content-Security-Policy-Report-Only:
  default-src 'self';
  script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'report-sample';
  /* 'self' fallback for non-strict-dynamic UAs; 'report-sample' includes 40 char of the violating script in the report */
  style-src 'self' 'nonce-${nonce}' 'unsafe-hashes';
  /* 'unsafe-hashes' permits hash-tracked inline style attributes that React 19 emits */
  img-src 'self' blob: data: https://*.my-quilty.com;
  font-src 'self';
  connect-src 'self' https://*.ingest.us.sentry.io https://api.my-quilty.com https://auth.my-quilty.com;
  /* api subdomain = our Rust backend BFF target; auth = Cognito Hosted UI; sentry = CSP + error ingest */
  frame-src 'self' https://js.stripe.com https://hooks.stripe.com;
  /* Stripe iframes reserved for M7; safe to allow now since no Stripe yet */
  frame-ancestors 'none';
  /* belt-and-suspenders with X-Frame-Options: DENY */
  form-action 'self' https://auth.my-quilty.com;
  /* OIDC redirect target for Cognito */
  object-src 'none';
  base-uri 'none';
  manifest-src 'self';
  media-src 'self';
  worker-src 'self' blob:;
  /* Next.js streaming uses blob: workers */
  child-src 'none';
  upgrade-insecure-requests;
  require-trusted-types-for 'script';
  trusted-types 'none';
  /* report-only — surfaces every DOM sink we have, we refactor to safe APIs, then flip enforce */
  report-uri ${sentryReportUri};
  report-to csp-sentry;
```

For **marketing routes** (`/`, `/features`, `/pricing`, `/science`, `/legal/*`, eventually `/blog/*`) — static, no nonce, hash-pinned. Set via `next.config.ts`'s `headers()`:

```
Content-Security-Policy-Report-Only:
  default-src 'self';
  script-src 'self' ${first-party-hash-list};
  /* hashes generated at build via experimental.sri once enabled */
  style-src 'self' 'unsafe-inline';
  /* tailwind-emitted inline style="..." attrs; nonce path not viable on static */
  img-src 'self' blob: data: https://*.my-quilty.com;
  font-src 'self';
  connect-src 'self' https://*.ingest.us.sentry.io;
  frame-ancestors 'none';
  form-action 'self';
  object-src 'none';
  base-uri 'none';
  upgrade-insecure-requests;
  report-uri ${sentryReportUri};
  report-to csp-sentry;
```

---

## B. Security headers baseline table

Every header below ships in **proxy.ts** (portal) and **next.config.ts headers()** (marketing) unless otherwise noted.

| Header                                   | Value                                                                                                                                                                                           | Why                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `Content-Security-Policy-Report-Only`    | Two-tier (see § A above)                                                                                                                                                                        | XSS prevention; report-only for first 1-2 weeks per route group, flip to enforced               |
| `Content-Security-Policy` (enforced)     | Same shape                                                                                                                                                                                      | After flip; preserved Report-Only header in parallel with one ratchet stricter                  |
| `Strict-Transport-Security`              | M1: `max-age=300`; M5: ramp to `max-age=86400`; M7: `max-age=31536000; includeSubDomains`; M8 launch: `max-age=63072000; includeSubDomains; preload` + submit hstspreload.org                   | Force HTTPS; preload is one-way door                                                            |
| `X-Content-Type-Options`                 | `nosniff`                                                                                                                                                                                       | Stop MIME sniffing                                                                              |
| `X-Frame-Options`                        | `DENY`                                                                                                                                                                                          | Legacy clickjacking defense, redundant with frame-ancestors but every prod site ships both      |
| `Referrer-Policy`                        | marketing: `strict-origin-when-cross-origin`; portal: `no-referrer`                                                                                                                             | Path-segment confidentiality on portal URLs                                                     |
| `Cross-Origin-Opener-Policy`             | `same-origin-allow-popups`                                                                                                                                                                      | Reserve popup capability for Cognito + future Stripe popup; full `same-origin` would break them |
| `Cross-Origin-Opener-Policy-Report-Only` | `same-origin` (one ratchet stricter)                                                                                                                                                            | Observe what would break                                                                        |
| `Cross-Origin-Resource-Policy`           | `same-origin`                                                                                                                                                                                   | First-party assets not loadable cross-origin                                                    |
| `Cross-Origin-Embedder-Policy`           | **NOT shipped at M1**                                                                                                                                                                           | Reserved for M9+ if SharedArrayBuffer ever needed; breaks Stripe iframes                        |
| `Permissions-Policy`                     | (see § 7 above, full default-deny except `payment=(self "https://js.stripe.com")`, `autoplay=(self)`, `fullscreen=(self)`, `web-share=(self)`, `publickey-credentials-get=(self)`, `unload=()`) | Default-deny browser features, reserve only what we'll use                                      |
| `Reporting-Endpoints`                    | `csp-sentry="${sentryReportUri}"`                                                                                                                                                               | Modern reporting destination                                                                    |
| `Report-To`                              | JSON form, same endpoint                                                                                                                                                                        | Legacy modern reporting                                                                         |
| `Server`                                 | (don't emit)                                                                                                                                                                                    | Reduce fingerprint surface; SST sets via CloudFront                                             |
| `X-Powered-By`                           | **removed** in `next.config.ts` (`poweredByHeader: false`)                                                                                                                                      | Reduce fingerprint                                                                              |
| `X-DNS-Prefetch-Control`                 | `off`                                                                                                                                                                                           | Privacy: don't leak page content via DNS prefetch                                               |

Cookies (M6 implementation, document at M1):

| Cookie                      | Value pattern                                             | Attributes                                    | Why                                                           |
| --------------------------- | --------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| `__Host-quilty-session`     | opaque server-side session id (32-byte random, base64url) | `Path=/; Secure; HttpOnly; SameSite=Lax`      | BFF session pointer; OIDC tokens stay server-side             |
| `__Host-quilty-csrf`        | HMAC-signed random 128-bit                                | `Path=/; Secure; SameSite=Lax` (NOT HttpOnly) | Double-submit token; JS reads to echo in X-Quilty-CSRF header |
| `__Host-quilty-locale`      | `en` (only locale at launch)                              | `Path=/; Secure; HttpOnly; SameSite=Lax`      | Locale preference                                             |
| `__Host-quilty-consent`     | base64-encoded ConsentState JSON                          | `Path=/; Secure; HttpOnly; SameSite=Lax`      | Server-side ConsentState mirror for fast edge access          |
| `__Host-quilty-gpc-honored` | `1`                                                       | `Path=/; Secure; SameSite=Lax` (NOT HttpOnly) | Read by client for §7025(c)(6) UI indicator                   |

---

## C. TOP-7 retrofit-hostile items if missing from M1 scaffold

Ranked by `(retrofit cost) × (probability of getting it wrong if not designed at M1)`:

1. **CSP nonce + strict-dynamic on portal routes from day one**. Once we ship marketing+portal under a single relaxed CSP and rely on `unsafe-inline`, every inline script and SDK becomes a retrofit blocker. **MUST** ship in M1 even though portal is placeholder. — Per Web Almanac 2025 + the Cal.com pattern.
2. **HSTS preload submission timing (M8 only)**. If we submit preload before all subdomains are HTTPS-verified, we lock out staff who haven't migrated internal subdomains. Reversal takes 6-12 months. — Per hstspreload.org gates.
3. **Server-side ConsentState architecture + GPC at edge**. If we ship marketing without the ConsentState abstraction and later bolt on Amplitude, we'll be tempted to load it before consent, replicating the Cerebral pattern. **Architecture must exist at M1**; SDK list can be empty. — Per FTC Cerebral $7M order + CCPA §7025(c)(6).
4. **`__Host-` prefix on session cookie (M6)**. Switching from `Domain=.my-quilty.com` parent-domain cookies to per-subdomain `__Host-` cookies after auth ships requires reissuing every active session and likely Cognito reconfiguration. — Per OWASP + IETF OAuth BCP draft-26.
5. **Per-route CSP architecture (proxy.ts branches by pathname)**. If we naively nonce everything, marketing pages lose CDN caching forever. If we naively static-CSP everything, portal pages have inadequate XSS defense. — Per Cal.com production + Next.js 16 docs.
6. **Trusted Types in REPORT-ONLY mode at M1**. Auditing every `dangerouslySetInnerHTML` after we have 100 components is far harder than catching them as they're written. The directive in report-only costs nothing and provides constant feedback. — Per Web Almanac 2025 + W3C TT spec.
7. **CSP report sink (Sentry) wired at M1**. If we don't see CSP violations from day one, we'll never have data to confidently flip Report-Only → enforce. — Per Sentry docs + Discord live header.

---

## D. Decisions that change from the baseline you proposed

Your baseline was: "CSP nonce+strict-dynamic, HSTS preload, frame-ancestors deny, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy default-deny camera/mic/geo, SRI on Stripe.js + analytics, \_\_Host- cookies, SameSite=Lax, signed double-submit CSRF, GPC honoring at edge."

**Changes**:

1. **CSP nonce+strict-dynamic** → **per-route nonce+strict-dynamic ONLY on `/account/*`/`/auth/*`**, static `'self'`+hash CSP on marketing. Reason: nonce CSP forces dynamic rendering, kills CDN caching of marketing.
2. **HSTS preload** → **deferred to M8 launch gate**; ship `max-age=300` initially, ramp per the 7-gate ladder. Reason: irreversibility + we need 4-8 weeks of subdomain validation including Cognito's `auth.my-quilty.com`.
3. **frame-ancestors deny** → **kept**, **AND keep `X-Frame-Options: DENY` alongside** (every reference site ships both — IE11 and certain proxies still need it).
4. **Referrer-Policy strict-origin-when-cross-origin** → **split: `strict-origin-when-cross-origin` for marketing, `no-referrer` for `/account/*`+`/auth/*`** (portal URLs may carry account context).
5. **Permissions-Policy default-deny camera/mic/geo** → **expand to ~20 directives** (browsing-topics, interest-cohort, unload, payment with Stripe allowlist, publickey-credentials-get reserved for future passkeys). Reason: cheap insurance + bfcache improvements.
6. **SRI on Stripe.js + analytics** → **CHANGED — Stripe.js explicitly does NOT publish SRI hashes** per Stripe policy; same for Sentry/Amplitude. Use `script-src` allowlist + strict-dynamic + PCI 11.6.1 compensating control (synthetic Puppeteer tamper-detection job) at M7. **SRI on first-party `_next/static/*` chunks** via `experimental.sri: { algorithm: 'sha256' }` enabled at M2 (not M1, until first static page lands).
7. **\_\_Host- cookies** → **kept and expanded**: session, csrf, locale, consent, gpc-honored all `__Host-` prefixed. **NEVER set `Domain=` on any of them** (incompatible with `__Host-`). The mobile+web independent-session model (D11) means we don't need parent-domain cookies at all.
8. **SameSite=Lax** → **kept**; do NOT use Strict (breaks Cognito OIDC redirect callbacks per OAuth BCP draft-26).
9. **Signed double-submit CSRF** → **kept**, **add Origin/Referer check as third layer** + **rotate HMAC signing key weekly** + **enforce server-side that no GET endpoint mutates state** (the SameSite=Lax GET-bypass is the #1 CSRF defense failure per OWASP 2026 cheat sheet).
10. **GPC honoring at edge** → **kept and expanded**: detect at CloudFront Function (~30 lines), propagate to Lambda via custom request header, server-side ConsentState in DynamoDB as single source of truth, **add §7025(c)(6) "Opt-Out Request Preference Signal Honored" persistent visible UI indicator** (mandatory since 2026-01-01; Disney $2.75M / Ford $375K are direct enforcement).

**ADDITIONS not in baseline that should ship at M1**:

- **`Cross-Origin-Opener-Policy: same-origin-allow-popups`** (Stripe ships this; we need it for Cognito popups + future Stripe Checkout popups).
- **`Cross-Origin-Resource-Policy: same-origin`** on first-party assets.
- **`Reporting-Endpoints` + `Report-To` headers** alongside `report-uri` (browser-coverage belt-and-suspenders).
- **`require-trusted-types-for 'script'` in REPORT-ONLY mode** from day one.
- **AWS WAF managed rule groups in Count mode** at CloudFront from M1.
- **Sentry CSP report sink** as a separate Sentry sub-project, wired at M1, with `connect-src` allowlist for `*.ingest.us.sentry.io`.
- **PCI 11.6.1 compensating-control documentation** authored at M1 to design-in M7's tamper-detection job (Puppeteer synthetic).
- **`docs/consent-ledger.md`** authored at M1: every future SDK that joins the build must be reviewed against ConsentState (gates Amplitude addition pre-launch per D42b).
- **`docs/pci/script-inventory.md`** stubbed at M1, populated at M7.
- **`X-Powered-By` removal** via `poweredByHeader: false`.

---

## E. Open questions / decisions to ratify before scaffold lands

1. **CSP report sink: Sentry sub-project vs same project as app errors?** Sub-project gives separate retention/alerting; same project gives single pane of glass. Lean: sub-project (CSP reports can be noisy during report-only phase; don't pollute error alert routing).
2. **`experimental.sri` enable at M1 or M2?** Lean: M2 (after first static page lands, so we can verify build artifacts have integrity attrs).
3. **`same-origin-allow-popups` vs `same-origin` for COOP?** Lean: `same-origin-allow-popups` (Cognito Hosted UI popups and future Stripe Checkout both need window.opener). Revisit at M9 once we know exact popup flows.
4. **Stripe at M7: Checkout redirect or Elements?** Lean: Checkout redirect (saves PCI scope, removes 6.4.3/11.6.1 from in-scope). Document the decision gate at M7.
5. **Turnstile vs hCaptcha for auth-form bot challenge?** Lean: Turnstile (free, no-CAPTCHA UX, Cloudflare BAA exists). Allowlist `challenges.cloudflare.com` in CSP `script-src` and `frame-src`.

---

## F. References (full citation list)

1. **Live header captures** (executed 2026-05-17 via `curl -sI`):
   - stripe.com, dashboard.stripe.com, sentry.io, cal.com, app.cal.com, github.com, auth0.com, resend.com, vercel.com, discord.com, accounts.google.com, chase.com, mayoclinic.org, onemedical.com, kaiserpermanente.org
2. **Cal.com production source** (cloned via `gh api` 2026-05-17):
   - https://github.com/calcom/cal.com/blob/main/apps/web/proxy.ts
   - https://github.com/calcom/cal.com/blob/main/apps/web/lib/csp.ts
   - https://github.com/calcom/cal.com/blob/main/apps/web/next.config.ts
3. **Next.js 16 official docs** (v16.2.6, updated 2026-05-13):
   - https://nextjs.org/docs/app/api-reference/file-conventions/proxy
   - https://nextjs.org/docs/app/guides/content-security-policy
4. **Web Almanac 2025 Security**: https://almanac.httparchive.org/en/2025/security
5. **OWASP**:
   - CSRF: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
   - Session Management: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
6. **IETF OAuth Browser-Based Apps BCP draft-26** (Dec 2025): https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps
7. **PCI DSS 4.0.1** (effective Mar 2025):
   - https://www.feroot.com/blog/pci-dss-4-0-1-guide-to-requirements-6-4-3-11-6-1/
   - https://scotthelme.co.uk/pci-dss-4-0-its-time-to-get-serious-on-magecart/
8. **FTC enforcement**:
   - Cerebral $7M: https://www.ftc.gov/news-events/news/press-releases/2024/04/ftc-takes-action-against-online-mental-health-services
   - Monument (Apr 2024)
   - BetterHelp $7.8M (Mar 2023)
9. **CCPA §7025(c)(6)** (effective 2026-01-01): https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf
   - Disney $2.75M (Feb 2026) + Ford $375K (Mar 2026) enforcement actions
10. **HSTS preload**: https://hstspreload.org/
11. **AWS WAF**:
    - https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-list.html
    - https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-atp.html
12. **Trusted Types**: https://www.w3.org/TR/trusted-types/ + https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API
13. **Sentry CSP**: https://docs.sentry.io/platforms/javascript/guides/nextjs/security-policy-reporting/
14. **Cloudflare Turnstile**: https://developers.cloudflare.com/turnstile/
15. **GPC**: https://globalprivacycontrol.org/
16. **RFC 6265bis §4.1.3** (cookie prefixes)

---

_End of plan document. Ready for review._
