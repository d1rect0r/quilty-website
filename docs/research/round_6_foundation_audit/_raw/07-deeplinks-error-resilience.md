# Round 6 Foundation Audit — Agent E: Deeplinks, Cross-Device, Error & Resilience

**Date:** 2026-05-19
**Agent:** `deeplinks-cross-device-error-resilience`
**Track:** Track 2 — Foundation completeness sweep
**Sources:** 2025-2026 enterprise-pattern + AWS reference implementations + IETF RFCs + Vercel/Next.js production docs + peer-product behaviour (Stripe, Linear, Cal.com, Clerk, Stytch, Better Auth, Headspace).

---

## 1. Executive summary

Quilty's M1 scaffold has the right structural bones for deeplinks and resilience — `.well-known/apple-app-site-association` + `assetlinks.json` are committed with correct `Content-Type: application/json` headers, root `app/error.tsx` + `global-error.tsx` + `not-found.tsx` exist, and the five OIDC route-handler stubs are wired with explicit 501 responses + ADR-0002 references. But the **shape** of those bones is M1-correct, not M6-correct, and the rest of the URL contract — the auth surface the mobile app, email backend, and Cognito Managed Login will all bind to — is undeclared. AASA currently claims `/auth/*`, `/reset-password`, `/verify-email`, `/magic-link` but **none of those URLs exist** in `app/` and the AASA path patterns will diverge from whatever the actual route shape ends up being unless we lock the URL contract now. Per-route-group `error.tsx` + `loading.tsx` boundaries are absent (the marketing-vs-portal distinct UX requirement in D67 + U1 has no expression). Open-redirect validation for `from=` parameters has no shared utility. Service Worker decision is undeclared and we recommend **not** shipping one at M1.5. This report proposes **9 new decisions (D75-D83)** plus 4 sequencing locks, and identifies **2 file-state inconsistencies** between current AASA and the intended Next.js 16 route tree that need cleanup before M2 ships any URL externally.

---

## 2. Deeplink interception strategy

### 2.1 Current state inventory

The currently-deployed AASA claims four path patterns:

```json
"paths": ["/auth/*", "/reset-password", "/verify-email", "/magic-link"]
```

The `components` array is a partial superset (only auth/\*, reset-password, verify-email are component-mapped; `/magic-link` is in `paths` but not in `components`, which makes iOS 13+ ignore it on devices that read the components form). Three bundle IDs are declared (`.staging`, `.dev`, prod) which is correct for environment isolation.

**Gap 1** (TIER A) — `paths` and `components` diverge for `/magic-link`. iOS 13+ ignores `paths` when `components` is present per Apple's substitution-variable docs; the result is that `/magic-link` quietly **does not deeplink** on any modern iOS device.

**Gap 2** (TIER A) — none of the four claimed paths exist as routes in `app/`. Every iOS click that the AASA promises to intercept currently lands on `app/[locale]/(marketing)/...` → 404. The `not-found.tsx` is brand-safe but the deeplink expectation is broken silently.

**Gap 3** (TIER B) — AASA does not match query-string token format. Per the 2026 AASA components spec, a 36-character UUID token should be declared with `?token: "????????-????-????-????-????????????"` (or a wildcard with length constraint). Current AASA accepts `?token=*` which means iOS will deeplink ANY value to the app — including malformed/forged tokens — when the better posture is "only deeplink if the token shape is plausibly valid; otherwise serve the web fallback for token-error UX."

**Gap 4** (TIER B) — no `applinks.substitutionVariables` declared. When we add `/en/auth/...` (locale-prefixed routes), AASA needs `${LOCALE}` substitution to avoid hand-listing every locale × path combo.

**Gap 5** (TIER C) — no fragment-mode (`#`) interception declared. We have not yet decided whether magic-link tokens travel in `?token=` (server-loggable) or `#token=` (client-only). See § 3.

### 2.2 Recommended URL-pattern split

**Routes that SHOULD deeplink** (app installed → app handles):

| URL pattern                   | Why                                  |
| ----------------------------- | ------------------------------------ |
| `/en/auth/sign-in?from=*`     | Cross-device sign-in resume          |
| `/en/auth/verify?token=*`     | Magic link / email verification      |
| `/en/auth/reset?token=*`      | Password reset confirmation          |
| `/en/auth/mfa-enroll?token=*` | TOTP / passkey enrollment from email |
| `/en/account/share/*`         | Shared-content deeplinks (future)    |
| `/en/account/redeem/:code`    | Subscription / referral redeem       |

**Routes that MUST NOT deeplink** (always serve web):

| URL pattern                                                                                                               | Why                                                                                |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `/en` (homepage)                                                                                                          | Marketing — point of acquisition, web is the surface                               |
| `/en/features`, `/en/pricing`, `/en/science`, `/en/about`, `/en/contact`, `/en/for-business`, `/en/customers`, `/en/help` | Marketing                                                                          |
| `/en/legal/*`                                                                                                             | Legal pages — must render in browser for screenshot/audit                          |
| `/en/blog/*`, `/en/changelog/*`, `/en/customers/*` (MDX-driven)                                                           | Content surface — SEO + AI-crawler citation target                                 |
| `/en/account/*` (non-deeplink)                                                                                            | Portal — bind the user to web so DOM-based assertions hold for HIPAA-aligned audit |
| `/.well-known/*`                                                                                                          | Apple/Google verification endpoint                                                 |
| `/api/*`                                                                                                                  | BFF surface                                                                        |

**Rationale** — deeplinking marketing URLs is a UX anti-pattern: it makes "I want to read your pricing page" require app install before content renders. Stripe, Linear, Notion, Headspace, Calm all narrow AASA to auth + share + redeem paths. Per the Just-Eat Takeaway "Universal Links at Scale" Jan-2026 retrospective, the #1 universal-link production issue at scale is over-broad AASA path claims producing broken deeplinks for content that the app does not actually handle.

### 2.3 Smart App Banner posture

Apple's `<meta name="apple-itunes-app">` Smart App Banner is **not deprecated as of 2026**. Per Apple developer docs, it remains the supported in-Safari install-prompt mechanism, and Safari additionally renders the smaller "Universal Links banner" automatically when AASA is valid and the app is installed (this second banner cannot be disabled).

Recommendation: emit Smart App Banner only on auth-flow URLs (`/en/auth/sign-in`) where converting a web user to the installed app makes product sense; do **not** emit on marketing pages. Android has no native equivalent (Chrome's Native App Install Prompt is moribund per 2026 surveys); for Android we can rely on `assetlinks.json` doing its job in the App Link flow and skip a JS-based smart banner library (smartbanner.js, Branch, Adjust) at M1.5 — defer to M9+ when conversion-rate-optimisation analytics fire.

### 2.4 AASA caching reality

Per Apple's 2025-2026 documentation: Apple's AASA CDN caches the file independently of any TTL we set; "every few hours" is the documented refresh cadence. The current `Cache-Control: public, max-age=300` in `next.config.ts` is correct in principle but only governs the BROWSER cache, not Apple's CDN. Operational implications for M6 cutover:

- Any AASA change requires waiting for Apple's CDN to re-crawl.
- Universal-link verification on a freshly-installed device re-uses the CDN-cached AASA, not our origin response.
- Apple's `?mode=developer` debug flag bypasses the CDN — Quilty's mobile team must add this to their dev builds.

---

## 3. Auth flow URL contracts

The current OIDC route-handler stubs return 501. This is structurally correct (per ADR-0002), but the **URL contracts** they will bind to remain undeclared. The mobile team, the email-template team, and the Cognito app-client configuration all need the URL list LOCKED before M3 marketing pages start linking to them (M2 risk: marketing CTA "Sign up free" with a hard-coded URL drift target).

### 3.1 Locked URL surface (proposed for D75)

```
PUBLIC ENTRY POINTS (no auth required)
  GET  /en/auth/sign-in            — sign-in landing (renders Cognito-redirect button + magic-link form)
  GET  /en/auth/sign-up            — sign-up landing (variant for new-user copy + benefits)
  GET  /en/auth/forgot-password    — request-reset form
  GET  /en/auth/check-email        — "we sent you a link" landing (sets expectation, no token here)

CALLBACK + CONFIRMATION TARGETS (token-bearing, single-use, time-limited)
  GET  /en/auth/verify?token=*     — magic-link sign-in OR email-verification token landing
  GET  /en/auth/reset?token=*      — password-reset token landing (renders new-password form)
  GET  /en/auth/mfa-enroll?token=* — TOTP/passkey enrollment from email
  GET  /en/auth/recover?code=*     — backup-code recovery entry (D55)

BFF API SURFACE (called by Server Components / browser fetch)
  GET  /api/auth/callback          — OIDC redirect_uri (Cognito returns here with ?code & ?state)
  POST /api/auth/logout            — server-side session teardown + EventBridge fan-out
  GET  /api/auth/session           — session metadata for client consumption
  POST /api/auth/refresh           — refresh-token rotation (D52)
  POST /api/auth/backchannel-logout— RESERVED 501 stub for when Cognito ships OIDC BCL (D9)
  POST /api/auth/magic-link        — magic-link request (rate-limited: 1/min, 5/hr per email)
  POST /api/auth/verify-token      — server-side single-use token check (Server Action target)
  POST /api/auth/step-up           — elevated-session re-auth trigger (D54)

SIGNED-IN-ONLY (require valid __Host-quilty_sid)
  GET  /en/account                 — portal home
  GET  /en/account/security        — MFA mgmt + backup codes + active sessions list
  GET  /en/account/security/sign-out-everywhere?confirm=1 — explicit "sign out everywhere" landing
  GET  /en/account/delete          — Apple/Google-required deeplink deletion landing (already in roadmap)
  GET  /en/account/subscription    — subscription mgmt
  GET  /en/account/data            — data export / DSR

STEP-UP REDIRECT TARGETS (used when elevated_until expires mid-flow)
  GET  /en/auth/step-up?from=<encoded-internal-url>
```

### 3.2 State-machine description

```
                    [Anonymous]
                        |
            +-----------+-----------+
            |                       |
       sign-in.click           magic-link.email-arrives
            |                       |
            v                       v
       Cognito Managed Login    /en/auth/verify?token=...
       (auth.my-quilty.com)         |
            |                       | server-side verify-token
       302 to /api/auth/callback    v
            |                  [Authenticated:basic]
            v                       |
       state+PKCE validate          |
            |                       |
            v                       |
       token exchange               |
            |                       |
            v                       |
       set __Host-quilty_sid <------+
            |
            v
       302 to (validated) from= OR /en/account
            |
            v
       [Authenticated:basic]
            |
            +--- sensitive-action.click ---> Cognito (prompt=login)
            |                                    |
            |                                    v
            |                              elevated_until = now+5min
            |                                    |
            |                                    v
            |                              [Authenticated:elevated]
            |                                    |
            +<-----------------------------------+
            |
       sign-out.click
            |
            v
       /api/auth/logout
            |
            v
       DynamoDB session row DELETE
       __Host-quilty_sid clear
       AdminUserGlobalSignOut(cognito_sub)
       EventBridge.put('quilty.auth.sessions_revoked', {sub, sid})
            |
            v
       302 to /en?signed-out=1  (homepage with toast)
```

### 3.3 Cross-device sign-out propagation

When the mobile app or another browser triggers logout, EventBridge fans out and the web BFF's consumer Lambda invalidates the matching DynamoDB session row. The user-facing UX on the affected tab is:

1. Next page navigation hits proxy.ts → Server Component reads session store → row missing.
2. Server Component renders `/en/auth/sign-in?reason=signed-out-elsewhere&from=<current-encoded>`.
3. Sign-in page renders a non-alarming banner: "You were signed out because you signed out on another device. Sign in to continue where you left off."

This is the well-trodden Duende-BFF + AWS-EventBridge-fan-out pattern documented in OneUpTime's Mar-2026 Redis-session-revocation guide adapted for DynamoDB (D51).

### 3.4 Cross-device sign-in continuation (NEW)

Stripe Atlas + Linear both ship a QR-code-on-laptop → scan-with-phone resume flow. The IETF Cross-Device Flows BCP (draft-26, Q1 2026) formalises this via the OAuth Device Authorization Grant (RFC 8628) **and warns explicitly about Cross-Device Session Phishing (CDSP)** — the unauthenticated channel between Consumption Device and Authorization Device is socially-engineerable.

For Quilty M6+: defer QR/device-authorization sign-in continuation to M9+ when the mobile app's passkey/hybrid-transport (caBLE) story is ready. The Corbado Q1-2026 benchmark shows hybrid-transport completion at 60-86% on web — meaningful drop-off vs. same-device passkey at 79-98%. Not worth the auth-team-complexity at M1.5.

### 3.5 Magic-link token transport

**Recommendation: query parameter (`?token=...`), not fragment (`#token=...`).**

Reasoning:

1. AASA-components matching is mature for `?token` and the iOS dev community has well-tested patterns; fragment-mode (`#`) matching is newer and less-exercised by mobile QA teams.
2. The PHI-sanitizer chokepoint (D67) already strips `token`-shaped values from logs by name. The "fragments don't reach server logs" argument is moot if the sanitizer is the load-bearing control.
3. Cognito's authorization-code grant uses query-string `?code=` exclusively — fragment-mode is forbidden on the callback URL per Cognito docs. Keeping magic-link tokens on the same transport as OAuth codes is a consistency win.
4. Single-use + 5-15-minute expiry + KMS-signed (per amazon-cognito-passwordless-auth reference impl) makes "the token leaked to a log" a survivable event (token is invalidated on first use OR after expiry).

**However** — every `token=*`-bearing URL MUST be excluded from analytics page-view URL capture. The Amplitude pageview SDK has a documented `excludeUrlParameters` config; the wrapper at `lib/observability/track.ts` must include `'token', 'code', 'state', 'sid'` in that list before any auth-flow URL ships.

### 3.6 Magic-link rate limiting

Per AWS amazon-cognito-passwordless-auth reference: DynamoDB-backed enforcement of (a) single-use (atomic conditional write), (b) ONE outstanding link per email, (c) 60-second cooldown between requests. Layer above: WAF rule on `/api/auth/magic-link` at 5 req/hour/IP. This is rate-limit pattern is well-attested as 2026 industry standard.

### 3.7 Email verification

Cognito Essentials (D50) supports email-verified-on-signup natively. The custom flow we'll need to write at M6 is:

- Verification email sent via SES (Cognito-triggered, custom Lambda).
- Token URL = `https://my-quilty.com/en/auth/verify?token=<KMS-signed-UUID>`.
- Until verified, portal shows a banner ("Verify your email to unlock subscription management") but does not block read-only access.
- Re-send link UX in account/security with the same 60s cooldown.

### 3.8 Phone / SMS MFA

D52-D55 lock TOTP + backup codes; SMS is NOT a primary MFA factor for Quilty (SIM-swap defense + cost). Defer to M6+; if regulatory pressure emerges, prefer Twilio Verify over Cognito-Pinpoint SMS purely for vendor-flexibility reasons (Cognito's SMS pricing in 2026 is comparable but locks us to AWS for the comms layer).

---

## 4. Error + loading boundary plan

### 4.1 Files to create at M1.5

```
apps/web/app/
├── error.tsx                            (EXISTS — root catch-all)
├── global-error.tsx                     (EXISTS — root layout crash)
├── not-found.tsx                        (EXISTS — root 404)
├── loading.tsx                          (NEW — top-level skeleton fallback)
└── [locale]/
    ├── error.tsx                        (NEW — locale-level catch)
    ├── loading.tsx                      (NEW — locale-level skeleton)
    ├── not-found.tsx                    (NEW — locale-level 404 with locale-aware copy)
    ├── (marketing)/
    │   ├── error.tsx                    (NEW — branded 500 + "go home" + Sentry digest ref)
    │   ├── loading.tsx                  (NEW — Hero-block skeleton matching block library)
    │   └── not-found.tsx                (NEW — marketing-flavoured 404 with popular-links nav)
    └── (account)/
        ├── error.tsx                    (NEW — portal 500: preserve nav chrome + "report issue" + retry)
        ├── loading.tsx                  (NEW — portal skeleton: nav + content skeleton)
        └── not-found.tsx                (NEW — portal 404: keep PortalNav, "page not found in account")
```

### 4.2 Per-group error UX intent

**(marketing) error.tsx**

- Renders inside MarketingLayout (Header + Footer cascade), so the user keeps the nav.
- Body: "Something went wrong loading this page." + `Try again` button + `Go home` link.
- Sentry digest shown in `<code>` for support escalation.
- Background: subtle illustration matching brand tone (M3 deliverable). At M1.5 a clean neutral colour suffices.

**(account) error.tsx**

- Renders inside AccountLayout (PortalNav cascades), so signed-in context is preserved — the user does not "lose" their session UX-wise.
- Body: "We couldn't load this page." + `Try again` + `Report issue` (mailto: with prefilled subject containing digest) + link to `/en/account` (portal home).
- The chrome cascade is critical: if the user is mid-flow editing subscription settings and a transient failure fires, the AccountLayout staying intact reassures them the broader session is healthy.

**(marketing) loading.tsx**

- Hero + ValueProp + FeatureGrid block skeletons matching the typed-block library (D65). Pre-built skeleton components colocated with each block per skill-frontend-design convention.
- `aria-busy="true"` on the `<main>`. Static SVG placeholders, no animations beyond CSS shimmer (respects `prefers-reduced-motion`).

**(account) loading.tsx**

- PortalNav rendered immediately (it's a Server Component reading session-meta synchronously from cookies once that lands at M6).
- Content area shows a "card skeleton" matching the typical account page layout.

### 4.3 Status-code page conventions

The not-found.tsx files produce 404 via Next.js's `notFound()` helper. For 410 / 451 / 403 / 429 / 503 we need either:

1. A Route Handler emitting the status explicitly, OR
2. A platform-level (CloudFront Function) rule, OR
3. proxy.ts conditional via `NextResponse` with status override.

Per the Next.js Discussion #18684 and Apr-2026 DEV post: Next.js App Router does NOT support `gone()` / status-override via the `notFound()` helper. proxy.ts is the cleanest in-Next.js answer.

---

## 5. Status code matrix

| Status    | Use case                                 | M1.5 impl path                                                                                    | Trigger                                             |
| --------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 200       | Default                                  | Normal route render                                                                               | Standard                                            |
| 301       | Permanent URL move                       | `next.config.ts` `redirects()` `permanent: true`                                                  | Locked URL rename                                   |
| 302 / 307 | Temp redirect                            | `next.config.ts` `permanent: false` OR `redirect()` in handler                                    | from=, logout flow                                  |
| 403       | Forbidden (signed-in, wrong-permissions) | Server Component throws `forbidden()` (Next.js 16 helper) — renders `/forbidden.tsx`              | Account page accessed without sufficient role (M5+) |
| 404       | Not found (default)                      | `notFound()` → `not-found.tsx`                                                                    | Any miss                                            |
| 410       | Gone (permanently removed)               | proxy.ts allowlist → `new NextResponse('Gone', { status: 410 })`                                  | Retired marketing campaigns (M9+ trigger)           |
| 429       | Too many requests                        | Route Handler returns `NextResponse.json({...}, { status: 429, headers: {'Retry-After': '60'} })` | Magic-link rate limit                               |
| 451       | Unavailable for legal reasons            | proxy.ts allowlist → `new NextResponse('Unavailable for Legal Reasons', { status: 451 })`         | GDPR erasure target URL, court-order takedown       |
| 503       | Maintenance mode                         | CloudFront Function returns hardcoded HTML + 503                                                  | Pre-announced deploy windows                        |

Rationale per `gautamkhorana.com` Apr-2026 and `digitalapplied.com`:

- 410 > 404 for de-indexing speed (typically days not weeks).
- 451 specifically required for GDPR right-to-erasure and DMCA takedowns to maintain audit defensibility.
- Never use 200 for "no results found" empty pages (Google soft-404 trap — already covered in current not-found.tsx comment).

### 5.1 Open-redirect validation utility (NEW)

The `from=` parameter on `/en/auth/sign-in?from=...` and the `redirect=` on logout must be validated against open-redirect attack per OWASP A01:2025 + Next.js Authgear 2026 guide.

**Proposed shared utility** `lib/auth/validate-redirect.ts`:

```ts
// Allowlist + URL parsing per OWASP. Reject:
//   - absolute URLs with hostname != my-quilty.com
//   - protocol-relative URLs (//evil.com)
//   - non-https: schemes (javascript:, data:, ftp:)
//   - URLs with userinfo (https://trusted.com@evil.com)
//   - URL-encoded variants of the above
//
// Accept:
//   - relative paths starting with exactly one '/' (not '//')
//   - absolute https://my-quilty.com/* URLs
//   - absolute https://app.my-quilty.com/*  (reserved for D45 subdomain)
//
// Default-on-reject: '/en/account'
```

Server-side ONLY — never validated client-side because the client can be bypassed (per OWASP 2026 guidance).

---

## 6. Service Worker decision

**Recommendation: do NOT ship a Service Worker at M1.5. Re-evaluate at M9+.**

### Reasoning

1. **Marketing site doesn't need it.** Per `progressier.com` + `thenodeblox.com` 2026 PWA reviews: SW + offline shell is high-value for sites with retained-user behavior (Pinterest, Twitter PWA cases). A consumer-mental-health marketing surface where 90%+ of visits are first-touch acquisition gets marginal value from SW caching.
2. **The risk-reward is poor for HIPAA-aligned products.** SW caching of any URL that COULD eventually serve user-data (even a stale 404 from a removed `/account/share/X` page) adds an audit-defense surface area. Peer consumer-health products (Headspace, Calm, BetterHelp, Talkspace) do not ship SW on their marketing/portal web tier per public-source inspection in May 2026.
3. **Implementation costs are non-trivial.** Workbox 7 + cache versioning + activate-event cleanup + dev/staging cache-bust ceremonies adds 3-5 dev-days per `magicbell.com` 2026 retrospective. None of that work is sunk-cost-recoverable when D63 ConsentState flips the offline cache to "must not serve cached account content if consent revoked."
4. **Next.js 16 has no first-party Service Worker integration story** (next-pwa is community-maintained, version-lag-prone, and shows incompatibility issues with the 16.x renamed `proxy.ts` file convention).
5. **Performance gains are achievable without SW.** CloudFront caching + `next/image` priority + HTTP/2 push + `next/font` self-hosting + brotli + the D71 size-limit budget hit the CWV gates that SW would address. The marginal LCP win from SW pre-cache is <100ms in a Lighthouse-CI synthetic on a competent CDN.

### Network-failure UX without SW

For the in-portal "transient fetch failure" case (Half-2 item 17), the typed Server Action Result envelope (D78 — see § 8) plus a global toast component handles this. We render an explicit `{ ok: false, retryable: true }` toast with a `Retry` button. No background sync, no SW.

### `navigator.onLine` + visibility API (Half-2 item 21)

Ship a small `useOnlineStatus()` client hook in `components/site/OnlineStatusToast.tsx` at M5 (portal). For the marketing tier, defer — visitors rarely lose connectivity mid-marketing-read.

---

## 7. Gap list classified

### TIER A — must fix at M1.5 or block M2

| #   | Gap                                                                                                        | Justification                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | AASA `paths`/`components` diverge for `/magic-link`; iOS 13+ ignores the path. Either reconcile or remove. | Already-shipped file. Silent failure.                                                                                                             |
| A2  | AASA claims 4 paths that don't exist as Next.js routes.                                                    | Mobile QA will fail at first end-to-end test.                                                                                                     |
| A3  | Locked URL contract for auth flow (§ 3.1).                                                                 | Mobile + email templates need to bind before M3 marketing CTA copy ships.                                                                         |
| A4  | Shared `validateRedirect()` utility for `from=` params.                                                    | OWASP A01:2025; required before any redirect-bearing URL ships.                                                                                   |
| A5  | Per-route-group `error.tsx` (marketing + account).                                                         | D67 + ADR-0002 audit posture requires distinct error UX per surface.                                                                              |
| A6  | Per-route-group `loading.tsx`.                                                                             | Vercel Issue #69625 in-group navigation bug means root `app/loading.tsx` alone has known failure modes; per-group is the documented 2026 pattern. |

### TIER B — should fix at M1.5 or block M3

| #   | Gap                                                                                           | Justification                                                         |
| --- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| B1  | AASA query-string token-format constraint (`?token: "????????-????-????-????-????????????"`). | Tightens the deeplink trust envelope.                                 |
| B2  | AASA `substitutionVariables` for `${LOCALE}`.                                                 | Needed before second locale (D25) lands.                              |
| B3  | 410 / 451 / 503 handler patterns in proxy.ts.                                                 | Required posture for GDPR-erasure response (M8 legal review trigger). |
| B4  | Cross-device sign-out user-facing toast on signed-out-elsewhere.                              | Required for "signed out everywhere" UX (D51).                        |
| B5  | Token-bearing URL exclusion list in `lib/observability/track.ts`.                             | PHI-sanitizer chokepoint hardening.                                   |

### TIER C — defer to M3-M6 trigger

| #   | Gap                                                 | Justification                                                                 |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| C1  | Smart App Banner on auth landings.                  | Conversion-rate-optimisation play; not load-bearing.                          |
| C2  | QR-code cross-device sign-in resume.                | Defer to M9+ post-mobile-passkey-readiness.                                   |
| C3  | Service Worker / offline shell.                     | Per § 6 recommendation.                                                       |
| C4  | Maintenance-mode CloudFront Function.               | Defer until first scheduled-maintenance event is anticipated.                 |
| C5  | Android Smart Banner library (smartbanner.js etc.). | Defer; assetlinks.json + App Link verification covers the installed-app case. |

---

## 8. Conflicts with existing D-decisions

### D6 (Cognito Managed Login at auth.my-quilty.com)

**No conflict.** Cognito's authorization endpoint at `https://auth.my-quilty.com/oauth2/authorize` returns to `/api/auth/callback` per § 3.1. The custom-domain redirect rules apply; per the `oneuptime.com` 2026 guide, custom-domain Cognito Managed Login requires Auth distribution + ACM cert in us-east-1 (consistent with U5 cutover plan).

### D9 + D11 (Cognito doesn't support OIDC BCL or emit sid)

**No conflict.** Backchannel-logout route stays 501 per current scaffold. EventBridge fan-out for sessions_revoked is the canonical pattern per OneUpTime Mar-2026 + Duende-BFF Q1-2026 docs.

### D52-D55 (Access-token 5min, refresh 8h, step-up `prompt=login`, backup codes Argon2id-in-DynamoDB)

**Reinforced.** Step-up flow needs an explicit URL contract — proposed `/en/auth/step-up?from=<encoded>` (§ 3.1). The 5-min `elevated_until` window means the user might encounter elevated-required midway through editing payment method; the redirect target must preserve the in-progress form state via `from=` + form-state-in-sessionStorage. This is **not** a conflict but a tightening — D75 proposed below.

### D67 (PHI sanitizer chokepoint)

**Reinforced.** Token-bearing URL exclusion (Tier B5) is a sanitizer-extension, not a conflict.

### D32 + D59 + D67 (CSP + two-tier + PHI)

**No conflict.** The auth pages live in (auth) group → portal-tier CSP (nonce + strict-dynamic). The marketing pages stay on static-hashed CSP. AASA + assetlinks are served from `.well-known/` which proxy.ts already excludes from CSP.

### D45 + U5 (custom domain cutover at M1)

**No conflict.** Auth route handlers reserve URLs at `my-quilty.com` (the BFF); Cognito Managed Login lives at `auth.my-quilty.com`. Two-domain pattern is intact.

### D5 (BFF — tokens never reach browser)

**Reinforced.** All token exchange happens inside `/api/auth/callback` Route Handler. The opaque `__Host-quilty_sid` cookie is the only thing the browser sees.

---

## 9. Recommended new D-decisions (D75-D83)

### D75 — Locked auth URL surface (per § 3.1)

The 7 public sign-in/up entry points, 8 BFF API endpoints, and 4 token-bearing landing pages enumerated above. Bind: mobile app deep-link table, email template URL builders, Cognito app-client config, marketing-page CTA copy, ESLint rule denying hard-coded auth URLs outside `lib/auth/urls.ts`. **Rationale:** URL contracts that bind cross-team/cross-product surfaces must be locked at scaffold to avoid 301-chain hell at M6.

### D76 — Magic-link tokens via query string (`?token=`), not fragment

Justified per § 3.5. Defends via single-use + 5-min expiry + KMS-signed (per amazon-cognito-passwordless-auth reference) + PHI sanitizer + token-param analytics exclusion.

### D77 — AASA narrowed to auth + share + redeem; marketing routes never deeplink

Per § 2.2. Mobile-handlers list = `{/en/auth/verify, /en/auth/reset, /en/auth/sign-in?from=*, /en/auth/mfa-enroll, /en/account/share/*, /en/account/redeem/:code, /en/account/delete}`. All other paths (marketing, legal, blog, MDX content, root `/account` portal pages) explicitly excluded from AASA components. Smart App Banner emitted only on `/en/auth/*` URLs.

### D78 — Typed Server-Action Result envelope at M5

Discriminated union `Result<T, E>` returned from every Server Action. `next-safe-action` 8.x as the M5 adoption candidate (verified compatible with React 19 + Next.js 16). useOptimistic + useActionState pairing per Sitepoint May-2026 + DEV-To Apr-2026 guidance. Visible toast on `{ ok: false }` (silent rollback is a documented UX failure mode per React-19 production patterns).

### D79 — Shared `validateRedirect()` utility lands at M1.5

Allowlist + URL parsing pattern per OWASP A01:2025. Hosts allowed = `{my-quilty.com, app.my-quilty.com}`. Default fallback = `/en/account`. Server-side only. Vitest test asserting 16+ known-bypass payloads (`//evil.com`, `https://trusted.com@evil.com`, URL-encoded variants, mixed-case `javascript:`, etc.) reject correctly.

### D80 — Per-route-group `error.tsx` + `loading.tsx` files at M1.5

File list per § 4.1. Marketing tier and account tier get distinct UX. Test coverage = a Playwright test triggering throw in each group via a `?force-error=1` query param (dev-only).

### D81 — Status-code expansions handled via proxy.ts allowlist

410 + 451 + 503 implemented via proxy.ts URL allowlists (Map<string, number>) returning `new NextResponse(text, { status })`. 503 maintenance mode = CloudFront Function override at M7 deploy when first true downtime window is needed. **Not** implemented in Route Handlers (CVE-2025-29927 keeps auth-relevant logic out of proxy.ts but pure HTTP-status emission is safe).

### D82 — No Service Worker at M1.5; re-evaluate at M9+ if PWA installability becomes a goal

Per § 6 analysis. Reasoning: marginal CWV win, HIPAA audit-surface inflation, peer-consumer-health products do not ship SW, Next.js 16 has no first-party SW story. Trigger to revisit: install-prompt analytics show >5% intent OR mobile PWA install becomes a documented growth lever.

### D83 — Cross-device sign-out propagation UX

When EventBridge `quilty.auth.sessions_revoked` arrives at the web-BFF Lambda consumer, the matching DynamoDB session row is deleted. The next navigation hits proxy.ts → Server Component reads missing-row → redirects to `/en/auth/sign-in?reason=signed-out-elsewhere&from=<current-encoded>`. The sign-in page renders a non-alarming banner: "You were signed out because you signed out on another device. Sign in to continue where you left off." NOT a fullscreen warning, NOT a Sentry-loggable event (legitimate user action).

---

## 10. Sequencing locks (suggested U9-U12)

### U9 — AASA / assetlinks reconciliation BEFORE first Cognito Managed Login cutover

Cleanup TIER-A1 + A2 + B1 + B2 before U5 (Cognito custom-domain flip at M1 cutover). Otherwise iOS users clicking the first verification email will silently NOT deeplink → app QA blocks U5.

### U10 — Locked URL surface (D75) reviewed by mobile team + email-template owner before M3

Mobile + email teams need the URLs to bind to. Lock D75 before M3 marketing pages start linking. ESLint rule denying hard-coded URLs lands the same day D75 lands.

### U11 — Per-route-group error/loading files land in same PR as the locked-URL surface

Reduces PR churn; M1.5 closes with all of TIER-A done in one milestone-boundary push.

### U12 — Service Worker decision (D82) revisited at M9+ post-launch retention review

Trigger condition: 12-week post-launch retention data + install-prompt-intent analytics. Re-evaluate via standalone ADR.

---

## 11. Open scope questions

The following remain undecided after this audit and need human input before M1.5 closes:

### Q1 — Marketing-tier `loading.tsx` skeleton fidelity

Two options:

- **(a)** Generic content skeleton (gray-shimmer blocks). Cheaper to build, less brand impression.
- **(b)** Per-block skeletons matching D65 typed-block library (Hero-skeleton, ValueProp-skeleton, etc.). Higher build cost; first-paint matches eventual content layout (zero CLS gain).

Recommendation: **(b)** — the D65 block library naturally scaffolds the skeleton variants. Ship Hero + ValueProp skeletons at M1.5; rest at M3.

### Q2 — Smart App Banner copy on `/en/auth/sign-in`

The `<meta name="apple-itunes-app">` `app-argument` field passes data to the iOS app on tap. Possible:

- **(a)** No `app-argument`; deeplink to app home.
- **(b)** Pass current URL so app continues exactly where the user was.
- **(c)** Pass an internal action verb (`open-sign-in`, `open-magic-link-prompt`).

Recommendation: **(b)** — the app's URL handler already parses `https://my-quilty.com/...` per AASA; pass through.

### Q3 — `/en/auth/verify` failure-modes UX

When the token is expired/used/invalid, three options:

- **(a)** Show inline error + "Send new link" form.
- **(b)** Auto-request new link and show "We've sent you a new link" (silent retry).
- **(c)** Redirect to `/en/auth/check-email?reason=token-expired`.

Recommendation: **(a)** — user is on the verify page intentionally; silent retry confuses; redirect adds a third state to debug. Per Stytch + Better Auth + Auth0 2026 docs, inline error + explicit re-request is the convention.

### Q4 — Step-up `from=` round-tripping

When user hits step-up mid-form, the form's in-progress data is lost on `prompt=login` round-trip. Two options:

- **(a)** Accept the loss; user retypes after re-auth (simple, slightly annoying).
- **(b)** Auto-persist form state to sessionStorage before redirect; restore on return.

Recommendation: **(b)** at M6+ when first step-up flow ships. M1.5 stub is fine without this complexity.

### Q5 — Sentry digest visibility on user-facing error pages

Current `app/error.tsx` shows `error.digest` as `<code>`. Two options:

- **(a)** Keep — useful for support escalation.
- **(b)** Hide unless `?debug=1` — cleaner UX, support has to ask user for screenshot.

Recommendation: **(a)** — Linear, Vercel, Stripe all show error references on user-facing 500 pages. The risk is low (digest is opaque hash, not PHI-bearing).

### Q6 — `/en/account/delete` SEO posture

Apple + Google require deeplinkable deletion landing pages. Question: should `/en/account/delete` be indexable (SEO + AI-crawler discoverable so "how to delete my Quilty account" searches surface it)?

Recommendation: index = true, follow = true. Defeats the (account) layout's blanket noindex inheritance — explicit metadata block at `/en/account/delete/page.tsx` per the cascade rule documented in `app/[locale]/(account)/layout.tsx`. This is the Apple-required pattern and improves account-deletion discoverability (positive signal to App Store Review).

---

## 12. Closing posture

Every deeplink + cross-device flow in M6 + M7 binds to URLs that need to be locked at M1.5. Every error/loading surface in M2 + M5 needs per-group boundaries that don't exist yet. The current scaffold is well-structured but ships 5 TIER-A items, 5 TIER-B items, and 5 TIER-C items that are unaddressed. Closing the TIER-A list at M1.5 is the cheapest moment in the project lifecycle to lock these contracts; doing it during or after M6 means migrations + 301-chains + mobile QA cycles instead of file creations + scaffold tests.

The 9 proposed D-decisions (D75-D83) and 4 sequencing locks (U9-U12) are all narrow, well-bounded, and individually committable in <2 dev-days. Recommend bundling D75 + D77 + D80 in a single M1.5 commit (the URL+AASA+per-group-error trifecta) since they share file-edit blast radius. D76 + D78 + D79 can land independently. D81 + D82 + D83 are conceptual locks with no immediate code (the actual implementations land at M3, M5, M6+ respectively).

---

## Sources

### Next.js 16 + App Router patterns

- [Common mistakes with the Next.js App Router and how to fix them — Vercel](https://vercel.com/blog/common-mistakes-with-the-next-js-app-router-and-how-to-fix-them)
- [Next.js Getting Started: Error Handling](https://nextjs.org/docs/app/getting-started/error-handling)
- [Next.js File-system conventions: Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups)
- [App router loading.tsx does not work as expected across routing groups — vercel/next.js Issue #69625](https://github.com/vercel/next.js/issues/69625)
- [Next.js 16 App Router: The Complete Guide for 2026 — Craftly Blog](https://getcraftly.dev/blog/nextjs-16-app-router-guide)
- [Next.js App Router: The Patterns That Actually Matter in 2026 — DEV Community](https://dev.to/teguh_coding/nextjs-app-router-the-patterns-that-actually-matter-in-2026-146)
- [Next.js 16 App Router: Production Patterns and Pitfalls — ECOSIRE](https://ecosire.com/blog/nextjs-16-app-router-production)

### iOS Universal Links + AASA

- [Universal Links At Scale: The Challenges Nobody Talks About — Just Eat Takeaway-tech / Alberto De Bortoli (Jan 2026)](https://medium.com/justeattakeaway-tech/universal-links-at-scale-the-challenges-nobody-talks-about-bab45d557d8b)
- [Universal & Deep Links: 2026 Complete Guide — prototyp](https://prototyp.digital/blog/universal-links-deep-linking-2026)
- [What Are iOS Universal Links? Complete Guide (2026) — Smler](https://app.smler.io/blogs/deep-linking/ios/what-are-ios-universal-links-complete-guide-2026)
- [Apple Developer: Universal Links — App Search Programming Guide](https://developer.apple.com/library/archive/documentation/General/Conceptual/AppSearch/UniversalLinks.html)
- [Apple Developer Forums: Universal app link with query parameters](https://developer.apple.com/forums/thread/755872)
- [Promoting Apps with Smart App Banners — Apple Developer Docs](https://developer.apple.com/documentation/webkit/promoting-apps-with-smart-app-banners)
- [How to Set Up An iOS and Android Smart App Banner — Branch](https://www.branch.io/resources/blog/how-to-setup-an-ios-and-android-smart-app-banner-with-deep-linking-and-download-tracking/)

### OAuth + Cognito + BFF + cross-device

- [Amazon Cognito: The redirect and authorization endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html)
- [Using PKCE in authorization code grants — Amazon Cognito](https://docs.aws.amazon.com/cognito/latest/developerguide/using-pkce-in-authorization-code.html)
- [User pool managed login — Amazon Cognito](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-managed-login.html)
- [How to Use a Custom Domain for Cognito Hosted UI — OneUpTime (Feb 2026)](https://oneuptime.com/blog/post/2026-02-12-custom-domain-cognito-hosted-ui/view)
- [How to secure the Cognito login flow with a state nonce and PKCE — Advanced Web Machinery](https://advancedweb.hu/how-to-secure-the-cognito-login-flow-with-a-state-nonce-and-pkce/)
- [amazon-cognito-passwordless-auth — AWS Samples (Magic Links docs)](https://github.com/aws-samples/amazon-cognito-passwordless-auth/blob/main/MAGIC-LINKS.md)
- [Implementing passwordless email authentication with Amazon Cognito — AWS Mobile Blog](https://aws.amazon.com/blogs/mobile/implementing-passwordless-email-authentication-with-amazon-cognito/)
- [draft-ietf-oauth-cross-device-security-16 — Cross-Device Flows: Security Best Current Practice (IETF)](https://datatracker.ietf.org/doc/draft-ietf-oauth-cross-device-security/)
- [Cross-Device Sign-In — Passkey Central](https://www.passkeycentral.org/design-guidelines/optional-patterns/cross-device-sign-in)
- [WebAuthn Passkey QR Codes & Bluetooth: Hybrid Transport — Corbado](https://www.corbado.com/blog/webauthn-passkey-qr-code)

### Magic-link patterns + auth providers

- [Magic link — Better Auth](https://better-auth.com/docs/plugins/magic-link)
- [Authenticate Magic Link — Stytch](https://stytch.com/docs/api/authenticate-magic-link)
- [Magic links — Clerk](https://clerk.com/docs/custom-flows/magic-links)
- [Passwordless Authentication with Magic Links — Auth0 Docs](https://auth0.com/docs/authenticate/passwordless/authentication-methods/email-magic-link)
- [Are Magic Links Secure: A Technical Deep Dive — MojoAuth](https://mojoauth.com/blog/are-magic-links-secure-technical-deep-dive)
- [The Truth About Magic Links: UX, Security, and Growth Impacts for SaaS Platforms — Baytech Consulting](https://www.baytechconsulting.com/blog/magic-links-ux-security-and-growth-impacts-for-saas-platforms-2025)
- [Magic Links, Passkeys, OTP, and Social Login — Security Boulevard (Mar 2026)](https://securityboulevard.com/2026/03/magic-links-passkeys-otp-and-social-login-which-passwordless-method-fits-your-application/)

### Server Actions + Result envelope + optimistic UI

- [next-safe-action](https://next-safe-action.dev/)
- [React useOptimistic: Production Patterns for Instant UI Updates — Sitepoint](https://www.sitepoint.com/react-useoptimistic-production-patterns-for-instant-ui-updates/)
- [Optimistic Updates in Next.js 14: useOptimistic, Server Actions, and Automatic Rollback — DEV Community](https://dev.to/whoffagents/optimistic-updates-in-nextjs-14-useoptimistic-server-actions-and-automatic-rollback-5hbl)
- [How to Handle Server Actions in Next.js 14 — OneUpTime (Jan 2026)](https://oneuptime.com/blog/post/2026-01-24-handle-server-actions-nextjs-14/view)

### Security: open-redirect, CSRF, rate-limit, session

- [Open Redirect — OWASP Foundation](https://owasp.org/www-community/attacks/open_redirect)
- [How to Fix 'Open Redirect' Vulnerabilities — OneUpTime (Jan 2026)](https://oneuptime.com/blog/post/2026-01-24-fix-open-redirect-vulnerabilities/view)
- [Next.js Security Best Practices: Complete 2026 Guide — Authgear](https://www.authgear.com/post/nextjs-security-best-practices/)
- [How to Fix 'CSRF Token Mismatch' Errors — OneUpTime (Jan 2026)](https://oneuptime.com/blog/post/2026-01-24-fix-csrf-token-mismatch/view)
- [HTTP 429 Too Many Requests: Rate Limiting — How HTTP Works](https://howhttpworks.com/status-codes/429)
- [How to Implement Session Revocation (Logout All Devices) with Redis — OneUpTime (Mar 2026)](https://oneuptime.com/blog/post/2026-03-31-redis-session-revocation-logout-all-devices/view)
- [How to Build a Secure Next.js BFF with Session Cookies — Cybersierra](https://cybersierra.co/blog/secure-nextjs-bff-sessions/)
- [BFF Logout Endpoint — Duende Software Docs](https://docs.duendesoftware.com/bff/fundamentals/session/management/logout/)
- [Web App Security, Understanding the Meaning of the BFF Pattern — DEV Community](https://dev.to/damikun/web-app-security-understanding-the-meaning-of-the-bff-pattern-i85)

### EventBridge fan-out

- [The Secret Life of AWS: Event-Driven Architecture (Amazon EventBridge) — Tech Reader Blog (Mar 2026)](https://www.tech-reader.blog/2026/03/the-secret-life-of-aws-event-driven.html)
- [Leveraging Amazon EventBridge's Fan-Out Pattern — Ashik M Hussain / Medium](https://medium.com/@ashikmhussain.a/leveraging-amazon-eventbridges-fan-out-pattern-for-scalable-resilient-event-driven-architectures-5a7cb815024f)

### Status codes (410 / 451) + maintenance mode

- [410 vs 404 Status Codes for SEO (2026) — Gautam Khorana](https://gautamkhorana.com/blog/410-vs-404-status-codes-for-seo/)
- [How to Return HTTP 410 (Gone) Status in Next.js App Router: Two Workarounds — DEV Community](https://dev.to/alessandro-grosselle/how-to-return-http-410-gone-status-in-nextjs-app-router-two-workarounds-2f0g)
- [HTTP Status Codes: Complete 2026 SEO Reference Guide — DigitalApplied](https://www.digitalapplied.com/blog/http-status-codes-complete-reference-seo)
- [What is 451 Unavailable for Legal Reasons? — RankTracker](https://www.ranktracker.com/seo/glossary/451-unavailable/)
- [Returning HTTP status 410 Gone for particular paths — vercel/next.js Discussion #18684](https://github.com/vercel/next.js/discussions/18684)
- [Best way to switch to maintenance mode — vercel/next.js Discussion #12850](https://github.com/vercel/next.js/discussions/12850)
- [Maintenance Page — Vercel Template](https://vercel.com/templates/next.js/maintenance-page)

### Service Worker + PWA decision

- [PWA & Service Workers: Making a website work offline — The Valley of Code](https://thevalleyofcode.com/lesson/pwa/offline-website/)
- [Behind the Offline Magic: PWAs and Service Workers Explained — Bootcamp / Medium (Feb 2026)](https://medium.com/design-bootcamp/behind-the-offline-magic-pwas-and-service-workers-explained-4b85fcd2a6b0)
- [Progressive Web Apps in 2026: Service Workers Explained — jsmanifest](https://jsmanifest.com/service-workers-pwa-guide)
- [Progressive Web Apps (PWAs): When and Why to Use Them — TheNodeBlox](https://thenodeblox.com/progressive-web-apps/)
- [Offline-First PWAs: Service Worker Caching Strategies — MagicBell](https://www.magicbell.com/blog/offline-first-pwas-service-worker-caching-strategies)
