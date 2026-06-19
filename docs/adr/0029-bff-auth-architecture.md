# ADR-0029: BFF auth architecture (token-handler flow)

- **Status:** Accepted
- **Date:** 2026-06-03
- **Last reviewed:** 2026-06-18 (see Addendum 2026-06-18 — enterprise validation)
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** `docs/website_strategy_discussion.md` § D5 (BFF via Next.js Route Handlers — README "planned-but-not-yet-written" item #1) + the `quilty-aws` federation handoff (`docs/runbook/federation-handoff-from-quilty-aws-2026-06-03.md` § 8 — six open questions) + the 2026-06-03 structured decision pass (3 web-research agents + AskUserQuestion ratification).
- **Related decisions:** D5 (BFF via Route Handlers — this ADR's canonical decision), D6 (Cognito Managed Login), D7 (`__Host-` per-subdomain cookies), D9 (Cognito-native logout + opaque session-ID), D11 (`quilty_sub`/`quilty_sid`), D44 (Sign in with Apple via Cognito federation), D51 (opaque session-ID + DynamoDB store), D52 (token TTLs — access 5 min / refresh 8h, confirmed 2026-06-03), **D54 (step-up via `prompt=login` + `elevated_until` — REVISED here: window 5 min → 10 min, action set + route gating specified)**, D31/ADR-0027 (zero-PHI), D35/ADR-0028 (ConsentState)
- **Related ADRs:** [ADR-0002](0002-session-cookie-pattern.md), [ADR-0005](0005-csp-two-tier.md), [ADR-0009](0009-hexagonal-by-boundary.md), [ADR-0010](0010-composition-root.md), [ADR-0011](0011-container-discriminated-union.md), [ADR-0028](0028-server-side-consentstate-single-source-of-truth.md)
- **Related research:** IETF "OAuth 2.0 for Browser-Based Apps" BCP (transparent BFF refresh); Curity token-handler pattern; RFC 9700 (OAuth Security BCP, Jan 2025 — refresh rotation + reuse detection); RFC 9470 (OAuth Step-Up Authentication Challenge); NIST SP 800-63B (reauthentication, AAL2); OWASP Authentication + Session Management Cheat Sheets; Auth0 `nextjs-auth0` v4 (`/auth/*` namespace default); Apple App Store Review Guideline §4.8; GitHub sudo-mode (2h) / Google reauth (15 min) windows; WA MHMDA + FTC HBNR (consumer-health consent + authentication duties)
- **Software versions assumed:** Next.js 16, AWS Cognito (Managed Login), `@quilty/api-client` 0.1, `@quilty/security` 0.1, `@quilty/consent` 0.1, DynamoDB, Node 24

## Context

The `quilty-aws` auth platform shipped its W3-F federation substrate to production on 2026-06-03 (`mobile_federation` Cognito client + Google/Apple IdPs + RISC cascade workers + a 79-endpoint Rust auth tier). Their handoff doc closed with **six open design questions** whose answers the server must know before it provisions the confidential `web_bff` Cognito client. This ADR records those six decisions plus the surrounding BFF token-handler architecture (D5), so the M5/M6 auth-callback work is review-locked before any code moves.

The topology (locked across D5/D7/D9/D51): the browser talks only to our Next.js BFF; **Cognito Managed Login** runs the OIDC authorization-code flow; the BFF exchanges the code, holds the Cognito tokens **server-side**, and mints an **opaque `__Host-` session cookie** backed by a DynamoDB session record. Tokens never reach the browser. The site is **zero-PHI** (D31/ADR-0027) and subject to multi-state consumer-health-data law (WA MHMDA, CA CMIA, MD MODPA, FTC HBNR — D177), which constrains step-up, sensitive-action gating, and any anonymous→authenticated state carry.

Each of the six questions had a server recommendation; each was validated against current (2024-2026) enterprise practice before locking. Two answers **modify** the server's recommendation (the step-up window, and the billing-gating scope); the rest **accept** it, two with a scope expansion.

## Decision

### Decision A — Unified `/auth/*` BFF namespace (Q1)

The entire token-handler surface mounts under a single **`/auth/*`** namespace — `/auth/login`, `/auth/callback`, `/auth/logout`, and the reserved 501-stub `/auth/backchannel-logout` (D9) — **not** under `/api/auth/*`. The current `/api/auth/{callback,logout,session,refresh}` 501-stubs relocate accordingly. `/auth/callback` matches the server's `federation_redirect_uri_allowlist` exactly (`https://my-quilty.com/auth/callback`), and `/auth/*` is the default namespace shipped by the leading purpose-built BFF SDK (Auth0 `nextjs-auth0` v4). The `/api/` prefix carries no security or functional weight in the App Router; consolidating the BFF boundary under one legible tree aids reviewers and `proxy.ts` CSP routing. Every `/auth/*` route is excluded from indexing via `robots.ts` + `X-Robots-Tag` (D146). A one-line comment in each route file + this ADR state explicitly that Quilty hand-rolls a token handler and does **not** use Auth.js, so the path is not "fixed" back to `/api/auth/` by muscle memory.

### Decision B — Transparent server-side refresh, no client refresh route (Q2)

Token refresh is **invisible to the browser**. There is no client-callable `/auth/refresh` route. Refresh happens **inline in the BFF proxy/data layer**, keyed on the opaque session ID: on each authenticated proxy call, if the cached access token is within its 5-min TTL skew, the BFF exchanges the Cognito refresh token (`GetTokensFromRefreshToken`, rotation enabled per RFC 9700), atomically updates the DynamoDB session record, and continues. On refresh failure (expired/revoked/reuse-detected) the BFF **deletes the session and returns 401**, and the SPA re-initiates login. This matches the IETF BFF BCP (refresh is an internal server concern) and Curity's token-handler pattern, and inherits instant-revocation from the server-side session (D51). **Concurrency:** two simultaneous calls on an expired token must not both refresh and trip Cognito reuse detection — a **single-flight lock per session** (conditional DynamoDB write / short lock item) ensures one refresh runs while the other call awaits the rotated token.

### Decision C — Our-side identity picker with shared config; App Store §4.8 parity (Q4)

We render our **own** "Continue with Google / Apple / email" buttons and deep-link to Cognito `/oauth2/authorize?identity_provider=<Provider>` (Managed Login stays the federation engine; no token handling moves into our tier). The `identity_provider` deep-link strings, scopes, and `redirect_uri` live in **one shared typed config consumed by both web and iOS** — not hand-built per button (a wrong `redirect_uri`/scope per button is the classic breakage, and centralization is what makes A/B testing safe). **Binding constraint:** because Quilty ships an iOS app sharing this Cognito pool, **Apple App Store §4.8** requires an equivalent privacy-respecting login wherever third-party social login is offered — **Sign in with Apple must appear wherever Google/social appears**, with visual parity, on both surfaces. Cross-surface button-set + ordering are kept in sync via the shared config.

### Decision D — Step-up via `prompt=login` + `elevated_until`, 10-minute fixed window (Q3, revises D54)

Sensitive actions require step-up: the BFF re-drives Cognito Managed Login with **`prompt=login` + `max_age=600`**, and on callback stamps **`elevated_until = now + 600s`** into the **DynamoDB session record** (never a cookie value). The window is **10 minutes, fixed per elevation (not rolling)** — this **revises D54's 5-minute figure**. Rationale: 5 min sits below every shipping enterprise window (GitHub sudo 2h, Google Cloud 15 min) and forces a full OIDC round-trip when a user edits two settings back-to-back; 10 min stays well under NIST AAL2's 30-min ceiling while cutting redundant re-auth (and the `prompt=login` round-trip re-rotates the 5-min access token, so elevation and token-freshness align). A **rolling** window (GitHub's model) was rejected as inappropriate for a health-adjacent surface. **Gated actions:** email change, password change, MFA management (enroll/remove authenticator, regenerate backup codes), account delete, payment-method change, **and completing a data export/download** (Google treats a bulk read of the user's own record as sensitive). Modeled on RFC 9470 even though Cognito is the AS: the BFF handles the step-up requirement server-side and keeps the browser stateless.

### Decision E — Sensitive-action route gating (Q6)

The BFF route-gates step-up on **`/account/security`, `/account/data` (export), and `/account/delete`** — the credential-control, health-data-export, and deletion surfaces that map to MHMDA's authenticate-before-access/deletion duty and OWASP's "re-auth before viewing/changing highly sensitive info." Billing is **not** route-gated: viewing invoices/plan status is low-risk and zero-PHI, so the gate sits on the **payment-method-change action only** (per Decision D), not the `/account/billing` view — MHMDA requires _proportionate_ controls and explicitly disfavors making rights harder to exercise. Additionally, the BFF reads a **`requires_step_up`** field from the DynamoDB session record (set by the backend's risk engine on certain RISC/W-024 events) and forces step-up **dynamically on any route** when set — so the backend risk engine stays authoritative rather than the gate being a per-route hardcode. This check lives in `proxy.ts`/the data layer, consistent with the zero-PHI BFF posture.

### Decision F — Anonymous → authenticated guest carrier; promotion bridge deferred (Q5)

We build the **thin guest-state carrier now**: an opaque `guest_sid` in a `__Host-`-prefixed cookie backed by a `guest_state` store (mirroring the opaque-session architecture), holding **only non-health UI/navigation state** (quiz step index, generic selections, UTM/referrer). The **promotion bridge** — stitching guest state onto the authenticated account — is **deferred to M5/M6**, because it crosses the OWASP-mandatory anonymous→authenticated privilege boundary and is meaningless until real auth + a real portal exist. Three constraints are locked now so the bridge is built correctly when it lands: (1) **at promotion, mint a new authenticated session ID and destroy the guest session record** server-side (OWASP session-fixation defense; distinct cookie names for guest vs authenticated); (2) **reconcile, do not inherit, consent** — the anonymous cookie-tier consent is not the authenticated record (D35/ADR-0028); re-derive consent from explicit acts, carry the _fact + timestamp_ of any pre-auth opt-in as provenance, honor GPC continuity; (3) **any pre-auth quiz answer that collects or infers health status is consumer-health-data** under WA MHMDA — it is gated behind explicit opt-in **before collection**, kept inside the zero-PHI server tier, out of any consent-gated SDK, and is **not** part of the generic carrier. Promotion is server-side and idempotent, keyed on the cookie-bound `guest_sid` (never a client-supplied id), and never touches `elevated_until` actions.

## Addendum (2026-06-18) — Enterprise validation: BFF account placement + cookie strategy

A 6-agent enterprise online-research pass (2026-06-18) validated the website↔AWS architecture end-to-end against 2025-2026 sources, triggered by the `quilty-aws` `aws_org_evolution_plan.md` discussion artifact, which raised an alternative ("Plan A") to this ADR's topology. Full findings + sources: `docs/research/enterprise_validation_2026-06-18.md`. Our response to the AWS-side open calls: `quilty-aws/docs/infrastructure/aws_org_evolution_plan_website_response_2026-06-18.md`. This addendum locks two points the original ADR left implicit.

### Decision G — BFF account placement: the Next.js BFF stays in the website (marketing-prod) account ("Plan B")

The BFF (this ADR's whole token-handler surface) runs **in the website account (marketing-prod), as part of the SST-deployed SSR Next.js app**, and calls the Rust backend at `api.my-quilty.app` (workloads-prod) over **HTTPS with bearer tokens — no cross-account IAM**, exactly as the mobile app does. The rejected alternative ("Plan A": marketing-prod static-only, BFF Lambdas relocated into the PHI account workloads-prod) is a **regression** for Quilty:

- The IETF browser-apps BCP (§6.1.2.5) explicitly allows the BFF+frontend as one service calling a resource server over the network — Plan B is the reference shape, not a Quilty-original. Curity/Duende/Auth0 constrain only the BFF↔**browser** (same-site cookie) relationship, never BFF↔API co-location.
- The same-site cookie requirement is satisfied **identically** under both plans (the browser cookie lives in the website account either way; it never touches workloads-prod). So Plan A buys **zero** cookie benefit while forfeiting SSR and dragging an internet-facing, refresh-token-holding, public-DNS component **into the PHI account** — against AWS SRA HIPAA account-isolation and the "refresh tokens must not sit next to the resource API" principle (D31/ADR-0027 blast-radius posture, the Cerebral lesson).
- Plan A's only real argument — token custody in the hardened account — is already mitigated by locked controls: 5-min access TTL (D52), refresh rotation + reuse detection (RFC 9700), Valkey JTI revocation, CMK-at-rest. Worst-case blast radius under Plan B is short-lived/rotating/revocable session tokens for one user, not the SCP-walled PHI store.

### Decision G.1 — Rendering split inside the website account (the real-world hybrid)

The enterprise optimization is **not** Plan A; it is **Plan B with a rendering split inside marketing-prod**: static-prerender/export the pure marketing routes to S3 + CloudFront (cheap, cacheable, WAF-fronted, CDN-served so they never invoke the SSR Lambda) while the authenticated portal + `/auth/*` + `/api/*` remain SSR Lambdas acting as the BFF — all under the same parent domain in the same account. This is the Curity/Duende "CDN serves static assets, same-parent-domain BFF serves the secured surface" pattern, and it maps onto our two-tier CSP (ADR-0005). Verify at build time that marketing routes are genuinely CDN-served (SEO/LCP), not SSR-per-request. (`output: export` for the whole app — losing portal SSR — remains rejected; the split is per-route, one deployment.)

### Decision H — Cookie strategy: host-only `__Host-` on the BFF origin

The opaque session cookie is **host-only `__Host-`** (Secure, HttpOnly, `Path=/`, **no `Domain` attribute**) on the BFF origin — the literal IETF browser-apps BCP recommendation. The `Domain=my-quilty.com` shared-cookie option is structurally impossible (`__Host-` forbids `Domain`) and reintroduces the cookie-tossing surface the prefix exists to close. The cross-subdomain "cookie problem" is a **non-issue**: after the OIDC redirect completes the app **never reads Cognito's `auth.my-quilty.com` cookie** — it reads only its own BFF session cookie; and the `my-quilty.com`↔`api.my-quilty.app` TLD split is irrelevant because BFF→API is server-to-server bearer, not cookies (it is, in fact, an extra isolation boundary). Per-subdomain separate cookies (Option C) are deferred unless a second real browser surface (e.g. `app.my-quilty.com`) ever ships.

**Open reconcile (tracked):** CLAUDE.md / D8 lock `SameSite=Lax`; the IETF browser-apps BCP recommends `SameSite=Strict` for the BFF session cookie. Lax is defensible for top-level login-redirect UX, but Strict is the spec default and the stronger posture for a health-adjacent surface. To be settled before the M5/M6 BFF cookie code lands (`D-AUTH-SAMESITE-LAX-VS-STRICT`).

### Validation outcome

Both core decisions of this ADR (BFF token-handler pattern; transparent server-side refresh) were independently re-validated as MATCHES-ENTERPRISE. No decision in this ADR is reversed by the 2026-06-18 pass; Decisions G/G.1/H make explicit what was previously implicit and answer the AWS-side fork.

## Consequences

### Positive

- **The server can provision `web_bff` deterministically.** Callback path (`/auth/callback`), scopes (`openid email profile`), and logout path are now fixed, unblocking handoff §5.1.
- **Refresh attack surface is minimized.** No client-reachable refresh endpoint; refresh lives where tokens live (server-side), with single-flight preventing reuse-detection self-DoS.
- **Cross-surface auth compliance is structural.** One shared identity config + the §4.8 parity rule prevents web/iOS drift that would fail App Review.
- **Step-up matches enterprise norms + CHD law.** 10-min fixed elevation + the OWASP/Google action set + MHMDA-mapped route gating + the dynamic `requires_step_up` flag is the proportionate sweet spot.
- **The guest carrier is conversion-positive without CHD risk.** Non-health state carries freely; health data is gated and the privilege-boundary code lands once, correctly, at M5/M6.

### Negative

- **`/auth/*` diverges from NextAuth muscle memory.** Most Next.js engineers expect `/api/auth/...`; mitigated by per-file comments + this ADR.
- **Transparent refresh adds a concurrency invariant.** The single-flight lock is mandatory, not optional — omitting it trips Cognito refresh-token-family revocation under parallel calls.
- **Owning the picker means owning §4.8 compliance.** Our buttons (not AWS) are what App Review judges; every new IdP/scope change must reflect in the shared config and both surfaces.
- **Step-up is friction.** Even at 10 min, sensitive flows cost an OIDC round-trip; over-gating (e.g., billing views) was deliberately avoided to keep this proportionate.
- **Consent reconciliation is subtle.** "Reconcile not inherit" + GPC continuity across the guest→account boundary is a Disney-class exposure if done wrong (ADR-0028); demands contract tests.

### Neutral

- **DynamoDB-backed fields are staged.** `elevated_until`, `requires_step_up`, and `guest_state` all need DynamoDB, which is AWS-parked. Per the repo pattern, these ship now as **port + in-memory adapter + cookie plumbing + a fail-closed prod guard** (throw in production unless the real adapter is wired); the DynamoDB adapter activates when the website's AWS account placement is decided. Contracts are locked, so activation is an adapter swap (ADR-0009).
- **This ADR revises D54's window** (5 → 10 min) but does not change D54's mechanism. The strategy-doc D54 entry is annotated accordingly.
- **The `/auth/*` relocation is a stub move at M2** (the routes are 501 until M6), so the churn is cheap now and avoided later.

## Alternatives considered

- **`/api/auth/callback` (current scaffold) / split namespace** — rejected: diverges from the server allowlist + the modern BFF default; a split `/auth/callback` + `/api/auth/*` tree is less legible than one namespace.
- **Dedicated client-callable `/auth/refresh` route** — rejected: adds a CSRF-reachable endpoint + a round-trip for zero benefit in a topology where the browser never holds tokens; relocates (doesn't avoid) the refresh race.
- **Cognito Managed Login built-in IdP picker** — rejected for the top-of-funnel: lower-maintenance + auto-compliant-ish, but costs conversion, brand, and A/B control. (Remains the fallback page.)
- **Server's 5-minute step-up window / rolling window** — 5 min rejected as below every enterprise norm + MFA-fatigue-inducing; rolling rejected as inappropriate for a health-adjacent surface.
- **Blanket-gating `/account/billing`** — rejected: over-rotates on a zero-PHI, low-risk view; MHMDA wants proportionate controls.
- **Inherit pre-auth consent / carry health-quiz data in the generic bridge** — rejected: violates MHMDA consent-before-collection + the ADR-0028 reconcile-not-inherit rule; FTC HBNR (GoodRx/Premom) unauthorized-disclosure exposure.

## Compliance / Verification

Verification lands with the M5/M6 BFF implementation; the design contracts are locked now:

- **`/auth/*` namespace + no-index:** Playwright security/SEO specs assert `/auth/*` returns `X-Robots-Tag: noindex` and is absent from `sitemap.ts`; the existing `/api/auth/*` 501-stubs relocate with a regression smoke test.
- **CSP tier for `/auth/callback`:** confirm `proxy.ts` classes `/auth/callback` as the **nonce + strict-dynamic (portal) tier** — it runs inline script to set cookies + redirect, which the marketing static-hash tier would block (handoff §2.2).
- **Transparent refresh + single-flight:** contract test in `@quilty/api-client` for the refresh path (rotation, 401-on-failure → session delete, single-flight lock under concurrent calls).
- **Step-up:** unit tests for `elevated_until` (10-min fixed, server-stored, `max_age=600`) + the gated-action set; integration test that a gated action without elevation triggers `prompt=login`.
- **Route gating + `requires_step_up`:** `proxy.ts` test that the three routes + the payment-method-change action force step-up, billing views do not, and a session-record `requires_step_up: true` forces step-up on any route.
- **Guest carrier:** contract test that promotion mints a new session ID + destroys the guest record (OWASP), and that consent is reconciled (not inherited) with GPC continuity (shared with ADR-0028 migrate tests); a guard test that health-flavored payloads never reach a consent-gated SDK.
- **`sst.config.ts` Route 53 check:** confirm the SST stack does **not** manage the `my-quilty.com` zone records (Pattern A, handoff §2.2).

## Revisit triggers

- **`web_bff` Cognito client provisioned** (`D-AUTH-WEB-BFF-COGNITO-CLIENT-PROVISION`) — verify callback/logout/scopes match Decisions A + C.
- **Cognito ships native OIDC Back-Channel Logout** — activate the `/auth/backchannel-logout` stub (D9).
- **Apple changes Guideline §4.8** — re-check the social-login parity rule (Decision C).
- **State CHD-law amendment** changing authentication/step-up/consent-carry duties — review Decisions D, E, F.
- **Pre-auth quiz/intake flow is actually scoped** — build the promotion bridge (Decision F) under the locked constraints.
- **FTC / state-AG enforcement against a peer** for a refresh/step-up/guest-carry failure pattern — audit against the new facts.
- **AWS account placement decided** — wire the DynamoDB adapters for `elevated_until` / `requires_step_up` / `guest_state` and retire the in-memory fail-closed guards.
- **`SameSite` Lax vs Strict** (`D-AUTH-SAMESITE-LAX-VS-STRICT`) — settle the session-cookie `SameSite` value before the M5/M6 BFF cookie code lands (Addendum Decision H; reconcile D8's Lax against the IETF browser-apps BCP's Strict).
- **PrivateLink for BFF→API** — Phase-1 hardening: move the BFF→`api.my-quilty.app` hop onto a PrivateLink `execute-api` interface endpoint (off the public internet); public HTTPS + WAF + bearer is the launch posture.

## References

- IETF OAuth 2.0 for Browser-Based Apps (BFF transparent refresh): <https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps>
- Curity token-handler pattern: <https://curity.io/resources/learn/the-token-handler-pattern/>
- RFC 9700 (OAuth 2.0 Security Best Current Practice, 2025-01): <https://datatracker.ietf.org/doc/rfc9700/>
- RFC 9470 (OAuth 2.0 Step-Up Authentication Challenge): <https://www.rfc-editor.org/rfc/rfc9470.html>
- NIST SP 800-63B (reauthentication / AAL2): <https://pages.nist.gov/800-63-3/sp800-63b.html>
- OWASP Authentication Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>
- OWASP Session Management Cheat Sheet (renew session ID on privilege change): <https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html>
- Auth0 `nextjs-auth0` v4 default `/auth/*` routes: <https://github.com/auth0/nextjs-auth0>
- Apple App Store Review Guideline §4.8: <https://developer.apple.com/app-store/review/guidelines/>
- GitHub sudo mode (2-hour window): <https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/sudo-mode>
- WA MHMDA consumer rights + authentication duty: <https://hintzelaw.com/blog/wa-my-health-my-data-act-pt6-consumer-rights>
- FTC Health Breach Notification Rule (2024 amendments): <https://www.ftc.gov/news-events/news/press-releases/2024/04/ftc-finalizes-changes-health-breach-notification-rule>
- Federation handoff (server reverse-contract): `docs/runbook/federation-handoff-from-quilty-aws-2026-06-03.md`
- Strategy doc D5 + D6 + D9 + D44 + D51 + D52 + D54: `docs/website_strategy_discussion.md`
- Enterprise validation pass (2026-06-18, full findings + sources): `docs/research/enterprise_validation_2026-06-18.md`
- Website-team response to the AWS org-evolution open calls: `quilty-aws/docs/infrastructure/aws_org_evolution_plan_website_response_2026-06-18.md`
