# Enterprise 2026 Auth Posture for quilty-website (Cognito + Next.js 16 BFF + SST + HIPAA-aligned)

> **Scope:** BFF auth pattern + cookie security + session management + CSRF + logout + mobile-web session join + Cognito 2026 capabilities. **Not in scope:** CSP, consent state, WAF (covered separately).
>
> **Anchor specs:** IETF OAuth Browser-Based Apps BCP **draft-26** (Dec 2025); OIDC Back-Channel Logout 1.0 (Final); OIDC Core 1.0; RFC 9470 (OAuth 2.0 Step-Up); RFC 7636 (PKCE); RFC 9700 (OAuth Security BCP).
>
> **Verdict in one sentence:** Cognito is good enough as the IdP for Phase 0–1 of a HIPAA-aligned consumer site **only if you build a strict BFF in front of it, build your own session store for "sign out everywhere", and accept that several OIDC niceties (back-channel logout, acr/amr claims, RP-initiated logout discovery, `max_age`/`prompt=login` precision) are missing and must be polyfilled in the BFF layer.** If you ever need standards-compliant back-channel SLO or RFC 9470 step-up — you replace Cognito or front it with an auth server (Authlete-style). Plan for that.

---

## Q1. BFF pattern in Next.js 16 App Router 2026

**Current 2026 enterprise practice.** BCP draft-26 §6 ("Backend-For-Frontend") is the canonical pattern: a confidential OAuth client lives server-side, takes the redirect from the AS, runs PKCE, exchanges code → tokens, and exposes only a sealed cookie to the browser. The BFF is also the _only_ component that talks to the resource server with `Authorization: Bearer …`. In Next.js 16 the canonical shape is: **Route Handlers** at `/api/auth/login`, `/api/auth/callback`, `/api/auth/logout`, `/api/auth/refresh`; a **server-side session library** (`iron-session` or `jose` directly) doing AEAD-sealed cookies; **`proxy.ts`** (the renamed `middleware.ts`, Next.js 16) for _optimistic_ cookie-presence redirects only — never for authorization decisions — because **CVE-2025-29927** (March 2025) showed the `x-middleware-subrequest` header could be spoofed to bypass middleware. Defense-in-depth means every Server Component / Server Action / Route Handler re-validates session via a `getSession()` helper called from the Data Access Layer. Cal.com follows the equivalent shape (session resolved in `getServerSession` per request; middleware only redirects unauthenticated browsers).

**Cognito 2026 status.** Cognito does not provide the BFF — you build it. Cognito is the AS only. _Supports_ PKCE (`code_challenge_method=S256`; `plain` not supported), confidential clients with `client_secret`, refresh-token rotation, `prompt=login` for forced re-auth.

**Reference example(s).**

- BCP draft-26 §6.1: "The BFF interacts with the AS as a confidential OAuth client. The BFF manages OAuth access and refresh tokens in the context of a cookie-based session, avoiding the direct exposure of any tokens to the browser-based application."
- AWS Cognito `/oauth2/authorize` PKCE example: https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html
- Next.js 16 proxy.ts: https://nextjs.org/docs/messages/middleware-to-proxy and https://nextjs.org/blog/next-16
- CVE-2025-29927 postmortem: https://vercel.com/blog/postmortem-on-next-js-middleware-bypass

**Recommendation for our scaffold.**

- Five Route Handlers under `apps/web/app/api/auth/*`:
  - `GET /api/auth/login` — generates `state`, `nonce`, `code_verifier`; stashes them in a short-lived signed cookie (`__Host-quilty.oauth_tx`, 10-minute TTL); redirects to `https://auth.my-quilty.com/oauth2/authorize?...&code_challenge=…`.
  - `GET /api/auth/callback` — validates `state`, exchanges `code` for tokens via `/oauth2/token`, verifies `id_token` (signature via JWKS + `iss`, `aud`, `exp`, `nonce`), creates/refreshes server-side session record, sets `__Host-quilty.sid`.
  - `POST /api/auth/refresh` — server-only; called by the BFF token-broker, never by browser code. Uses `GetTokensFromRefreshToken` (refresh-token rotation requires this API; see Q4).
  - `POST /api/auth/logout` — calls Cognito `RevokeToken` + `GlobalSignOut`, deletes the server session row, clears `__Host-quilty.sid`, then 303-redirects to Cognito `/logout?client_id=…&logout_uri=…`.
  - `POST /api/auth/backchannel-logout` — kept reserved for the day Cognito ships OIDC Back-Channel Logout, **today** wired to an internal event-bus consumer (see Q8) so other surfaces (mobile etc.) can publish "kill sid X" events.
- `apps/web/proxy.ts` — only does: "if path is under `/account/*` and no `__Host-quilty.sid` cookie, 302 to `/api/auth/login`." Nothing else. Authorization happens in the route's `getSession()`.
- Single `lib/auth/session.ts` exposing `getSession()` (reads cookie, validates against server store, returns typed `Session | null`) and `requireSession()` (throws redirect). Every protected RSC/Action/Route Handler calls one of these. **Don't trust middleware/proxy.**
- BFF API proxy: `apps/web/app/api/proxy/[...path]/route.ts` — server-only handler that re-attaches `Authorization: Bearer <access_token from session>` to outbound calls to the Rust backend over API Gateway, plus mutual `X-Quilty-Internal-Auth` (SigV4-signed or shared secret from Parameter Store).

**Retrofit cost if wrong.** **High.** Picking Auth.js v5 instead of a thin iron-session BFF locks you into a session shape and provider abstraction you'll fight against when you (a) want a server-side session map for "sign out everywhere", (b) need PHI-zero discipline in token handling, or (c) need to swap Cognito later. Auth.js maintainers themselves are now steering new projects to Better Auth; that's a noisy signal.

---

## Q2. Cookie shape

**Current 2026 enterprise practice.** BCP draft-26 §6.1.3.2 (cookie security) requires `Secure` and `HttpOnly` (MUST), and recommends (SHOULD) `SameSite=Strict`, `Path=/`, no `Domain` attribute, and the `__Host-` prefix; for client-side sessions containing tokens, the BFF **SHOULD encrypt** the cookie contents. Two real-world patterns: (a) **sealed-cookie/iron-session** — entire session state AEAD-encrypted into the cookie itself, no server store, stateless and scalable but unrevocable until expiry; (b) **opaque session-id + server store** — cookie holds only a random 128-bit ID, server-side row in DynamoDB / Valkey / Redis carries `access_token`, `refresh_token`, `sid` from Cognito, `user_id`, `created_at`, `last_seen`, `acr`, `auth_time`. The opaque-ID pattern is what Stripe, Discord, WorkOS, and Cal.com use, because it makes session revocation _immediate_ (key for HIPAA-aligned posture and the "sign out everywhere" feature). The hybrid — sealed cookie carrying the `sid` plus a short-TTL access token cached server-side — is what most senior implementations land on.

**Cognito 2026 status.** N/A — cookie is the BFF's; Cognito only issues OAuth tokens + its own _managed-login_ session cookie (which lives on `auth.my-quilty.com`, not on `my-quilty.com`).

**Reference example(s).**

- BCP draft-26 §6.1.3.2 (verbatim above).
- iron-session source: https://github.com/vvo/iron-session (AEAD via `@hapi/iron`, recommended by Next.js docs).
- Cookie prefix definition: RFC 6265bis-draft (`__Host-` requires `Secure`, `Path=/`, **no `Domain`**).

**Recommendation for our scaffold.**

- **Use the opaque-session-ID + server-store pattern.** Cookie: `__Host-quilty.sid` (value = 128-bit random base64url). Server-side store: **DynamoDB** single-table `quilty_web_sessions` (partition key `sid`, attributes `user_sub`, `cognito_sid`, `access_token_ciphertext` (KMS-encrypted), `refresh_token_ciphertext`, `acr`, `auth_time`, `expires_at` (TTL attribute for automatic eviction), `last_seen_at`, `ua_fingerprint`, `created_at`, `ip_class`). TTL = refresh-token max lifetime (default 30 days; we set it to 8 hours initially, see Q10).
- Attributes: `Secure; HttpOnly; SameSite=Lax; Path=/; __Host- prefix`. No `Domain`. (We use Lax not Strict — see Q6 for why per-subdomain `__Host-` cookies are the right pick, which also means SameSite=Lax keeps the OAuth callback redirect working with no Strict regression.)
- Cookie value MUST be a random ID, **not** a serialized session — that keeps PHI/PII at zero risk in the cookie even if a future logging middleware accidentally captures `Set-Cookie`.
- Why opaque + store instead of iron-session encrypted blob: revocation (Q8) is the requirement that breaks sealed-cookie ergonomics. A HIPAA-aligned posture cannot have a "valid until JWT expires" failure mode.

**Retrofit cost if wrong.** **High.** Migrating from sealed-cookie to opaque-ID after launch invalidates every active session. Get this right at M1.

---

## Q3. CSRF in 2026

**Current 2026 enterprise practice.** BCP draft-26 §6.1.3.3 names three CSRF defenses; in 2026 the industry consensus is **defense-in-depth using all three layers**: (1) **`SameSite=Lax` cookies** (Strict breaks the OIDC redirect from Cognito so it's avoided on the session cookie itself; the OAuth transaction cookie _can_ be Strict); (2) **Origin / Sec-Fetch-Site header check** on every state-changing request — server rejects if `Origin` is missing or not in the allow-list (`https://my-quilty.com`); (3) **double-submit token with a custom header** — server issues a short-lived signed CSRF token in a readable cookie (`__Host-quilty.csrf`, **not** HttpOnly so JS can read it), client echoes it as `X-Quilty-CSRF` header on every non-GET request, server validates HMAC + binding to `sid`. The custom-header trick triggers a CORS preflight, blocking forged simple POSTs from third-party origins. Auth.js v5 implements roughly this; Cal.com implements an equivalent (CSRF token from session, sent as `csrfToken` field or header).

**Cognito 2026 status.** Cognito has its own `state` parameter handling on the `/oauth2/authorize` and `/logout` endpoints (the AS-side CSRF defense), which we use. CSRF on application requests is **our** responsibility, not Cognito's.

**Reference example(s).**

- BCP draft-26 §6.1.3.3 (Origin check + custom header SHOULD).
- Cognito `state` parameter on authorize: https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html
- Cognito `state` on logout: https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html
- Auth.js v5 CSRF approach (env-driven): https://authjs.dev/getting-started/migrating-to-v5

**Recommendation for our scaffold.**

- **Triple layer:**
  1. `__Host-quilty.sid` → `SameSite=Lax`. Cookie carries only the session ID, so even cross-site GET that leaks it is mitigated by the server-side store + state-changing operations requiring CSRF token.
  2. **Origin allow-list check** in a shared `lib/auth/csrf.ts` helper called from every non-GET Route Handler and Server Action: reject if `Origin` is absent or not in `{https://my-quilty.com, https://www.my-quilty.com}`.
  3. **Signed double-submit token**: on session creation, generate `csrfToken = HMAC-SHA256(server_secret, sid || nonce)`, set in `__Host-quilty.csrf` (Secure, **not** HttpOnly, SameSite=Lax). Browser reads it, attaches to `X-Quilty-CSRF` header. Server re-derives and compares. Reject on mismatch.
- On the OAuth callback, validate the `state` parameter against `__Host-quilty.oauth_tx`. `state` MUST contain at least 128 bits of entropy (per OIDC Core §3.1.2.1).
- Server Actions: Next.js 15+ auto-generates an action ID per call, which provides limited CSRF resistance, **but do not rely on it for cross-origin defense.** Run the same triple check.

**Retrofit cost if wrong.** **Medium.** CSRF infra can be added later, but every protected endpoint must be retrofit-touched. Building the helper at M1 and forcing all `POST/PUT/DELETE` Route Handlers through it costs ~1 day; retrofitting later costs ~1 week and bug risk.

---

## Q4. AWS Cognito 2026 capability inventory (CRITICAL)

This is the load-bearing section. Each row is verified against AWS docs.

| Capability                                                                              | Status                                                                                                                                                                                                                                                                                         | Details                                                                                                                                                                                                                                                                                                                                                                                                | Source                                                                                                                                                   |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OIDC Back-Channel Logout** (POST signed `logout_token` with `sid` to RP)              | **DOES NOT SUPPORT**                                                                                                                                                                                                                                                                           | Cognito's `.well-known/openid-configuration` omits `backchannel_logout_supported` and `backchannel_logout_session_supported` — per OIDC BCL §2.1, absent = false. No `backchannel_logout_uri` registration on app clients. AWS has not announced support as of May 2026.                                                                                                                               | https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints.html (lists endpoints — no BCL)                                           |
| **RP-initiated logout** (`end_session_endpoint`)                                        | **PARTIAL / proprietary**                                                                                                                                                                                                                                                                      | Cognito has `/logout` with `redirect_uri`/`logout_uri` and `state`, but it is NOT advertised in discovery as `end_session_endpoint`. Must be hardcoded in BFF config. No `id_token_hint` support.                                                                                                                                                                                                      | https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html                                                                           |
| **`sid` claim in ID tokens**                                                            | **DOES NOT EMIT**                                                                                                                                                                                                                                                                              | Cognito ID tokens contain `sub`, `aud`, `iss`, `iat`, `exp`, `token_use`, `auth_time`, `cognito:username`, `nonce` — no `sid`. Confirmed against ID-token reference.                                                                                                                                                                                                                                   | https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-id-token.html                                              |
| **Passkeys / WebAuthn in Managed Login**                                                | **SUPPORTS** (GA Nov 22 2024)                                                                                                                                                                                                                                                                  | Available out-of-the-box in Managed Login (the post-Nov-2024 redesign) **not** the classic Hosted UI. Requires **Essentials** or Plus tier. Choice-based `USER_AUTH` flow, `WEB_AUTHN` in `AllowedFirstAuthFactors`. Up to 20 passkeys per user.                                                                                                                                                       | https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow-methods.html and `WebAuthnConfigurationType` API |
| **TOTP MFA**                                                                            | **SUPPORTS**                                                                                                                                                                                                                                                                                   | All tiers including Lite. Standard `SOFTWARE_TOKEN_MFA`.                                                                                                                                                                                                                                                                                                                                               | https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html                                                                    |
| **SMS MFA**                                                                             | **SUPPORTS**                                                                                                                                                                                                                                                                                   | All tiers. Note SMS fraud prevention guidance — toll-fraud risk.                                                                                                                                                                                                                                                                                                                                       | Same URL                                                                                                                                                 |
| **Email MFA**                                                                           | **SUPPORTS**                                                                                                                                                                                                                                                                                   | Requires **Essentials** or Plus tier (new in the 2024 redesign).                                                                                                                                                                                                                                                                                                                                       | Same URL                                                                                                                                                 |
| **Backup codes (native)**                                                               | **DOES NOT SUPPORT**                                                                                                                                                                                                                                                                           | No native backup-code feature. Standard pattern is admin-mediated recovery via `AdminSetUserMFAPreference` or Lambda trigger.                                                                                                                                                                                                                                                                          | (gap, no doc URL)                                                                                                                                        |
| **Managed Login vs Classic Hosted UI parity**                                           | **Managed Login is the strict superset in 2026.**                                                                                                                                                                                                                                              | Classic Hosted UI: no passkeys, no choice-based auth, no email MFA, no `prompt` parameter, no localization. Managed Login (Nov 2024 redesign, in Essentials+) is what you want.                                                                                                                                                                                                                        | https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-managed-login.html                                                          |
| **Custom UI (build your own)**                                                          | **SUPPORTS**                                                                                                                                                                                                                                                                                   | Via `InitiateAuth`/`AdminInitiateAuth` SDK calls. Feature parity is close; you handle MFA challenge round-trips yourself. Often higher build cost; recommended only if Managed Login branding is insufficient.                                                                                                                                                                                         | https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow-methods.html                                     |
| **Plus tier threat-protection**                                                         | **SUPPORTS** (paid uplift over Essentials)                                                                                                                                                                                                                                                     | Adds: (a) compromised-credentials detection (haveibeenpwned-style at sign-up/sign-in/password-reset); (b) adaptive auth (risk score per session, optional force-MFA on high risk); (c) detailed user-activity logs exportable to S3 / CloudWatch Logs / Firehose.                                                                                                                                      | https://docs.aws.amazon.com/cognito/latest/developerguide/feature-plans-features-plus.html                                                               |
| **Adaptive auth / risk-based MFA**                                                      | **SUPPORTS** (Plus tier only)                                                                                                                                                                                                                                                                  | "Full-function" enforcement mode in threat protection settings; emits a risk score per request. Requires submitting browser context data (encoded via Cognito JS module).                                                                                                                                                                                                                              | https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pool-settings-adaptive-authentication.html                                        |
| **PKCE for public clients**                                                             | **SUPPORTS** (S256 only)                                                                                                                                                                                                                                                                       | `plain` method rejected. Mandatory for native/mobile, strongly recommended for our BFF (defense in depth even with confidential client).                                                                                                                                                                                                                                                               | https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html                                                                    |
| **Refresh-token rotation**                                                              | **SUPPORTS**                                                                                                                                                                                                                                                                                   | App-client setting `RefreshTokenRotation.Feature = ENABLED`, with `RetryGracePeriodSeconds` up to 60. **Forces use of `GetTokensFromRefreshToken` API** (not the legacy `REFRESH_TOKEN_AUTH` flow, which is incompatible with rotation). Adds `origin_jti` + `jti` claims to access/ID tokens.                                                                                                         | https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-refresh-token.html                                         |
| **Token revocation**                                                                    | **SUPPORTS**                                                                                                                                                                                                                                                                                   | (a) `/oauth2/revoke` endpoint per RFC 7009. (b) `GlobalSignOut` (user-authorized, with access token) invalidates ALL tokens for the user across devices. (c) `AdminUserGlobalSignOut` (AWS-credential-authorized, by `sub`) — same effect, admin-initiated. **Caveat:** `GlobalSignOut` does NOT clear the managed-login session cookie at `auth.my-quilty.com` — you must also redirect to `/logout`. | https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_GlobalSignOut.html                                                       |
| **CloudTrail audit depth**                                                              | **PARTIAL**                                                                                                                                                                                                                                                                                    | CloudTrail captures _management-plane_ events (CreateUserPool, UpdateUserPoolClient, AdminUserGlobalSignOut). **Authentication events** (sign-in, MFA challenge, token issuance) require the **Plus tier** user-activity log export to S3/CloudWatch — they are NOT in CloudTrail. **This is a HIPAA audit-log gap** if you stay on Essentials and rely on CloudTrail alone.                           | https://docs.aws.amazon.com/cognito/latest/developerguide/feature-plans-features-plus.html "user activity logging"                                       |
| **HIPAA eligibility / BAA**                                                             | **SUPPORTS**                                                                                                                                                                                                                                                                                   | Cognito is on the AWS HIPAA-eligible services list. BAA covers it. Confirmed in Feb 2026 update.                                                                                                                                                                                                                                                                                                       | https://aws.amazon.com/compliance/hipaa-eligible-services-reference/                                                                                     |
| **`acr` / `amr` claims in tokens**                                                      | **DOES NOT EMIT in ID tokens**                                                                                                                                                                                                                                                                 | Cognito does not emit `acr` or standard `amr` values in user-pool ID tokens. The `amr` claim semantics in Cognito only apply to **identity-pool** tokens (`authenticated` vs `unauthenticated`). For step-up assurance signal, you must either (a) inject via Pre-Token-Generation Lambda trigger (Essentials+), or (b) front Cognito with an OIDC AS that does (Authlete pattern).                    | https://docs.aws.amazon.com/cognito/latest/developerguide/iam-roles.html (identity pool `amr` only)                                                      |
| **`auth_time` claim**                                                                   | **SUPPORTS**                                                                                                                                                                                                                                                                                   | Present in ID tokens; can be used by BFF for "how recently did this user authenticate?" gating.                                                                                                                                                                                                                                                                                                        |
| **`max_age` / `prompt=login` request params**                                           | **SUPPORTS `prompt=login`** in Managed Login (Essentials+ only, not classic Hosted UI). `max_age` is **not honored** — Cognito does not force re-auth when `auth_time + max_age < now`. Workaround: BFF inspects `auth_time` itself, redirects to `/oauth2/authorize?prompt=login` if too old. | https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html (prompt section)                                                                                                                                                                                                                                                                                                 |
| **RFC 9470 step-up (`insufficient_user_authentication` error, `acr_values` parameter)** | **DOES NOT SUPPORT NATIVELY**                                                                                                                                                                                                                                                                  | Cognito has neither `acr_values` request param honoring nor RFC 9470 error response. Step-up requires custom Lambda triggers or BFF-side re-auth. AWS sample: aws-samples/step-up-auth.                                                                                                                                                                                                                | https://github.com/aws-samples/step-up-auth                                                                                                              |
| **OIDC Native SSO for mobile↔web**                                                      | **DOES NOT SUPPORT**                                                                                                                                                                                                                                                                           | OpenID Connect Native SSO for Mobile Apps 1.0 (draft 07) only standardizes mobile-to-mobile. Mobile-to-web is explicitly out of scope per IETF OAuth WG Feb 2026 thread. Vendors (Okta, Connect2id) ship proprietary extensions. Cognito does not.                                                                                                                                                     | https://openid.net/specs/openid-connect-native-sso-1_0.html                                                                                              |
| **Cognito custom-domain ACM cert**                                                      | **CONSTRAINT**                                                                                                                                                                                                                                                                                 | ACM cert for `auth.my-quilty.com` MUST live in `us-east-1` regardless of user-pool region (Cognito uses CloudFront under the hood).                                                                                                                                                                                                                                                                    | https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-add-custom-domain.html                                                      |
| **WAF integration on Managed Login**                                                    | **SUPPORTS**                                                                                                                                                                                                                                                                                   | WAF web ACL associates with user pool; protects `/login`, `/signup`, `/forgotPassword`, `/oauth2/*` endpoints. Rate-based rules, CAPTCHA action, IP reputation lists.                                                                                                                                                                                                                                  | https://aws.amazon.com/blogs/security/protect-your-amazon-cognito-user-pool-with-aws-waf/                                                                |

---

## Q5. Cognito as 2026 enterprise choice — opinionated take

**Current 2026 enterprise practice.** B2C identity in 2026 has stratified: **WorkOS / Clerk / Stytch** for high-touch consumer UX with passkeys, magic links, organizations; **Auth0** for enterprise-grade compliance + B2B SSO/SCIM combined; **Cognito** for AWS-native, BAA-covered, low-cost-at-scale CIAM with acceptable-but-not-best UX. The November 2024 Managed Login redesign closed roughly 70 percent of the historical Cognito UX gap (passkeys, branding editor, choice-based auth, email MFA, localization), but Cognito remains a **second-tier consumer-UX provider** behind Clerk/WorkOS on time-to-passkey-prompt and friction. The Cognito advantage is the BAA + the AWS-native KMS/IAM/CloudTrail/SCP integration + cost (Essentials at scale is ~30–50 percent of Auth0 list price for consumer tiers).

**Cognito 2026 status.** Right call **for our specific situation**: (a) we already have a Cognito user pool in `quilty-aws` (locked at D6), (b) we need BAA coverage with no extra vendor contract, (c) mobile is already on Cognito so the _Phase 0 mobile-web join_ problem is internal to one IdP, (d) we are pre-revenue so the cost arithmetic favors Cognito by an order of magnitude. The retrofit trigger is **scaling out beyond ~20K MAU AND needing standards-compliant SLO** or RFC 9470 step-up — at which point the conversation becomes "WorkOS or front Cognito with Authlete," not "rewrite the BFF." Lock-in is **medium** because the OIDC code-flow boundary is identical across providers; only the user-pool data + non-standard quirks (refresh-rotation API, `/logout` shape) leak.

**Reference example(s).**

- HIPAA eligible: https://aws.amazon.com/compliance/hipaa-eligible-services-reference/
- 2024 Managed Login + passkeys + tiers announce: https://aws.amazon.com/blogs/aws/improve-your-app-authentication-workflow-with-new-amazon-cognito-features/

**Recommendation for our scaffold.**

- **Keep Cognito** at M1. Provision on **Essentials tier** (enables Managed Login + passkeys + email MFA + choice-based auth + Lambda Pre-Token-Generation for custom claims). **Plan a tier evaluation gate at M6** (real auth integration): if compromised-credentials detection / adaptive auth / user-activity-log export to CloudWatch becomes audit-required, upgrade to **Plus** (additional ~$0.005 / MAU). Don't preemptively pay for Plus before the audit case is made.
- Architect the BFF to be **provider-agnostic at the OIDC boundary**: the `lib/auth/oidc-client.ts` adapter takes `issuer`, `client_id`, `client_secret`, `scope`, `redirect_uri` — no Cognito-specific imports. Swap-out cost stays low.
- **Do not** adopt Auth.js's Cognito provider — it would couple our session and provider layer together and remove the swap-out flexibility.

**Retrofit cost if wrong.** **Medium** (vs Cognito → Auth0/WorkOS later): you'd run a parallel-write window + user migration job — Cognito has an export pattern (custom Lambda + paginated `ListUsers`) and most providers ingest a bcrypt-hash CSV.

---

## Q6. Per-subdomain `__Host-` cookies vs parent-domain cookies

**Current 2026 enterprise practice.** Per BCP draft-26 §6.1.3.2, the SHOULD is `__Host-` prefix + `Path=/` + no `Domain` attribute. The `__Host-` prefix is **mutually exclusive** with parent-domain sharing (`Domain=.my-quilty.com` would violate the prefix's "no Domain attribute" requirement). Safari ITP / Intelligent Tracking Prevention 2.x makes long-lived parent-domain cookies cross-subdomain effectively unreliable for first-party auth too. The 2026 enterprise consensus is: **each subdomain gets its own session boundary**, joined via OIDC code flow per subdomain, with cross-subdomain SSO achieved via Cognito's _managed-login session cookie_ at `auth.my-quilty.com` serving silent re-auth (`prompt=none`) when the user lands on a different subdomain. That second hop is invisible to users (one extra HTTP round trip).

**Cognito 2026 status.** Cognito sets its own session cookie on `auth.my-quilty.com` after first sign-in; that cookie supports `prompt=none` silent re-auth for any RP under any subdomain. Cognito does **not** set anything at `my-quilty.com` apex.

**Reference example(s).**

- BCP draft-26 §6.1.3.2.
- Cognito managed-login session cookie: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-managed-login.html
- Safari ITP behavior: WebKit blog (3rd-party cookies, then long-lived 1st-party tracking limited to 7 days).

**Recommendation for our scaffold.**

- **Per-subdomain `__Host-` cookies.** `my-quilty.com` has `__Host-quilty.sid`, `app.my-quilty.com` (when it ships) has its own `__Host-app.sid`. No parent-domain cookie.
- Use Cognito's managed-login session cookie at `auth.my-quilty.com` as the **SSO substrate**: when the user navigates from `www.my-quilty.com` to `app.my-quilty.com`, the latter's BFF kicks off `/oauth2/authorize?prompt=none` — if the managed-login session is alive, Cognito redirects back with code, no UI shown.
- `__Host-` requires Secure + Path=/ + no Domain. **Codify** this in the cookie-write helper so it can't be misconfigured.

**Retrofit cost if wrong.** **High.** Setting parent-domain cookies at launch and then trying to migrate to per-subdomain is a logout-everyone-and-rebuild-sessions event. Lock per-subdomain at M1.

---

## Q7. Mobile-web session join

**Current 2026 enterprise practice.** OpenID Connect Native SSO for Mobile Apps 1.0 sits at **draft 07** (stable for impl, OIDF WG, not IETF), and the IETF OAuth WG explicitly noted (Feb 2026 thread) that **mobile-to-web** session join is out of scope for that spec — only mobile-to-mobile is standardized. Vendors (Okta, Connect2id, Authlete) ship proprietary extensions. The enterprise B2C pattern that actually ships is: **independent sessions per surface, joined logically by Cognito `sub` + a logical session-id (`sid`) you mint yourself, with a server-side fan-out on logout / password-change / MFA-change events via an event bus** (EventBridge in AWS). The mobile app's session lives in the OS keychain (refresh token, native flow per RFC 8252 with PKCE); the web app's session lives in the BFF store. Both authenticate via the same Cognito user pool, but their tokens, refresh schedules, and revocation lifecycles are independent. "Sign out everywhere" is **not** OIDC native SSO — it's an internal event saying "revoke all sessions for sub X" propagated to both surfaces' session stores.

**Cognito 2026 status.** **Does not support** OIDC Native SSO. Mobile and web each go through Cognito Hosted UI / SDK independently. `GlobalSignOut` is the closest "kill all tokens for this user" primitive, but it does not clear the managed-login session cookie at `auth.my-quilty.com` — the redirect-to-`/logout` step does.

**Reference example(s).**

- OIDC Native SSO draft 07: https://openid.net/specs/openid-connect-native-sso-1_0.html
- IETF OAuth WG Feb 2026 thread (mobile→web out of scope): http://www.mail-archive.com/oauth@ietf.org/msg25600.html

**Recommendation for our scaffold.**

- **Independent sessions, joined by `cognito_sub` (Cognito's `sub`) + a `quilty_sid` you mint.** The session row in DynamoDB stores both. Mobile app has its own session row (or the existing mobile state).
- **No OIDC Native SSO.** It's not standardized for our case and Cognito doesn't support it. Re-evaluate in 2-3 years.
- **Fan-out via EventBridge.** On `POST /api/auth/logout?everywhere=true`: BFF calls `GlobalSignOut` (Cognito side), deletes all DynamoDB session rows for that `cognito_sub` (web side), and publishes an EventBridge event `quilty.auth.sessions_revoked` with `{sub, revoked_at, reason}`. Mobile backend (Rust crate) subscribes via SQS, force-refreshes its token cache, push-notifies the mobile app to re-auth.
- Backend services validate access tokens **AND** check a `revocation_cache` (Valkey/ElastiCache, TTL = token max-age) populated from the same event — closes the "JWT valid until expiry" gap without N+1 calls to Cognito.

**Retrofit cost if wrong.** **Medium-High.** Adding the event-bus fan-out post-launch is feasible but requires a coordinated mobile + web release. Reserve the EventBridge bus + IAM policy at M1 (sst.config); wire the publisher at M6 alongside real auth.

---

## Q8. "Sign out everywhere" implementation

**Current 2026 enterprise practice.** Because Cognito lacks OIDC Back-Channel Logout and `sid`-in-ID-token, you cannot rely on the standard "OP pushes signed `logout_token` to every RP's `backchannel_logout_uri`" pattern. Three realistic enterprise patterns: (a) **server-side session map + immediate revocation** — every request validates session via store lookup (no JWT-only auth), so deleting the row signs you out immediately. The cost is per-request DynamoDB/Redis read (~1ms with DAX or hot cache). This is what Stripe, GitHub, Discord, WorkOS all do. (b) **Short-lived access tokens + revoked-token cache** — accept tokens valid for ≤5 min, check a revocation cache on every API gateway; refresh path goes through BFF which reads the session store. Compromise of revocation latency = access-token TTL. (c) **EventBridge fan-out** — emit `sessions_revoked` event, all surfaces (mobile, web, backend services) update local caches. (a) + (c) combined is the production pattern WorkOS publishes openly.

**Cognito 2026 status.** Primitives available: `GlobalSignOut` (user-initiated, via access token); `AdminUserGlobalSignOut` (admin/system-initiated, by `sub`); `/oauth2/revoke` (single refresh token). None of these revoke _active_ access tokens in real time (`GlobalSignOut` invalidates the **refresh** chain and the `aws.cognito.signin.user.admin`-scoped access tokens, but tokens used as bearers against your own resource server remain JWT-valid until expiry). Hence the need for the local revocation cache.

**Reference example(s).**

- `GlobalSignOut` API: https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_GlobalSignOut.html
- `AdminUserGlobalSignOut`: https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminUserGlobalSignOut.html
- WorkOS Sessions API "sign out everywhere" pattern: https://workos.com/blog/sign-out-everywhere-workos-sessions-api

**Recommendation for our scaffold.**

- **Pattern: server-side session map (a) + event bus fan-out (c).**
- Short access-token lifetime: **5 minutes** (down from Cognito default 1 hour). Refresh-token rotation enabled; rotation lifetime 30 days; grace period 10 seconds.
- On "Sign out everywhere":
  1. BFF calls `GlobalSignOut(access_token)` — kills Cognito refresh chain.
  2. BFF deletes all DynamoDB rows with `cognito_sub = current_user_sub`.
  3. BFF publishes `quilty.auth.sessions_revoked` EventBridge event.
  4. Rust backend's revocation-cache consumer marks the `sub` as revoked for `access_token_lifetime + 30s` clock skew.
  5. Redirect the _current_ browser to Cognito `/logout?client_id=…&logout_uri=https://my-quilty.com/`.
- On single-device logout (just this session):
  1. BFF deletes only **this** DynamoDB row (matched by `sid`).
  2. BFF calls `RevokeToken(refresh_token)` for just this device's refresh token.
  3. No event-bus broadcast (single-session logout shouldn't cascade).
  4. Redirect to Cognito `/logout` so the managed-login session cookie is also cleared.
- **Account page** surfaces "Active devices" (list of session rows + last seen + UA fingerprint) and per-row revoke buttons.

**Retrofit cost if wrong.** **High.** Short access-token TTLs and the revocation-cache contract on the Rust side need to be baked in from M6 onwards. You cannot retrofit "instant revocation" once the API contract assumes 1-hour bearer-only validation.

---

## Q9. Step-up auth surfaces

**Current 2026 enterprise practice.** The OIDC-canonical pattern is: BFF inspects `auth_time` on the session; if too old for a sensitive operation, the BFF kicks an authorize request with `acr_values=urn:mace:incommon:iap:silver` (or whatever ACR the AS supports) and/or `max_age=300`; the AS forces re-auth (MFA challenge); the new ID token carries the elevated `acr`/`amr` claims; the BFF marks the session as elevated for a short window (typically 5–15 min). RFC 9470 adds a standard error response (`insufficient_user_authentication`) for resource servers to demand step-up.

**Cognito 2026 status.** **Partial / workaround required.**

- `auth_time` IS in the ID token. The BFF can read it.
- `max_age` request parameter is **not** honored by Cognito.
- `acr_values` request parameter is **not** honored.
- `prompt=login` IS honored (Managed Login, Essentials+) and forces re-auth interactively. **This is the polyfill.**
- `acr` / `amr` are **not** emitted by Cognito in user-pool ID tokens. Inject via Pre-Token-Generation Lambda trigger if needed.
- RFC 9470 error response is not supported by Cognito's `userInfo` or by API Gateway Cognito authorizer.

**Reference example(s).**

- aws-samples step-up: https://github.com/aws-samples/step-up-auth
- Authorize endpoint `prompt=login`: https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html

**Recommendation for our scaffold.**

- Maintain a server-side **`session.elevated_until`** timestamp. Sensitive operations (`/account/email-change`, `/account/delete`, `/account/payment-method`, `/account/mfa/*`, `/account/subscription/cancel`) call a `requireElevated()` helper.
- `requireElevated()` checks `elevated_until > now() - 5m`. If not, redirects to `/api/auth/step-up?return=…` which:
  - Hits Cognito `/oauth2/authorize?prompt=login&...` with a fresh `state`/`code_verifier`.
  - On callback, the new `auth_time` is within 5s; the BFF sets `elevated_until = new_auth_time + 5min` and redirects to `return`.
- **No reliance on `acr`/`amr`.** We polyfill via `auth_time` + server-side flag. If we later move to Authlete or WorkOS, swap the helper to read `acr` and the rest of the app is unchanged.
- Pre-Token-Generation Lambda (Essentials+) can also inject a `quilty_acr` custom claim if Rust backend wants the signal; that's a small add and avoids needing to call back to the BFF for elevation status.

**Retrofit cost if wrong.** **Medium.** The pattern is additive; you can introduce step-up at M6 alongside real auth. But the resource-side `requireElevated()` helper needs to exist from the moment any sensitive op ships.

---

## Q10. Session refresh in Next.js 16 App Router

**Current 2026 enterprise practice.** The "silent refresh" pattern: BFF stores both access + refresh tokens server-side; on every Server Component render or Route Handler call, `getSession()` checks if `access_token.exp - now < 60s` (or it's expired); if so, awaits a single inflight refresh promise (per-`sid` lock to avoid thundering-herd refreshes when multiple parallel requests race), exchanges refresh token via `GetTokensFromRefreshToken`, persists new tokens, returns the updated session. The browser never sees a refresh. Flicker-free SSR works because the refresh happens inside the same RSC render — if the refresh succeeds the page renders with valid session; if refresh fails (rotation race, refresh token revoked, expired), `getSession()` returns `null` and the request 302s to `/api/auth/login`.

**Cognito 2026 status.** Refresh-token rotation **IS supported**, with two API choices: `GetTokensFromRefreshToken` (required when rotation is enabled — `REFRESH_TOKEN_AUTH` is incompatible) and the OAuth `/oauth2/token` endpoint with `grant_type=refresh_token`. The latter is preferred by BFF because it's a clean OAuth boundary. Rotation grace period: up to 60 seconds — set it to 10 to absorb network retries without keeping stale refresh tokens valid long.

**Reference example(s).**

- Refresh tokens + rotation: https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-refresh-token.html
- BCP draft-26 §6.1.2.2 (BFF SHOULD configure cookie-session lifetime ≈ refresh-token max lifetime).

**Recommendation for our scaffold.**

- Access-token TTL: **5 minutes**. ID-token TTL: 5 minutes. Refresh-token TTL: **8 hours** initially (we re-evaluate at M7 once user behavior is observable; 30 days is the default but feels too long for a HIPAA-aligned posture pre-Plus-tier-logging).
- Refresh-token rotation: **enabled**, grace **10s**.
- Per-`sid` in-process refresh lock to coalesce parallel renders.
- On refresh failure (any reason): delete the session row, clear cookies, return `null` from `getSession()`. The caller's `requireSession()` will redirect to login.
- All token bytes stay server-side; the cookie is just the opaque `sid`. The browser cannot trigger a refresh — only the BFF can.
- The proxy.ts file does **not** do refresh (CVE-2025-29927 + perf). Refresh is per-request in the Data Access Layer.

**Retrofit cost if wrong.** **Medium.** TTLs are tunable. Switching from `REFRESH_TOKEN_AUTH` to `GetTokensFromRefreshToken` later requires only an adapter swap; not hard.

---

## Q11. OAuth scopes + audience configuration

**Current 2026 enterprise practice.** For a web BFF to a custom resource server, the canonical Cognito app-client shape: **confidential client** (with `client_secret` stored in AWS Secrets Manager, never in env vars committed to repo), grant type `authorization_code` only (disable `implicit`, disable `client_credentials` for this client), PKCE required (S256), refresh-token rotation enabled, callback URL is exactly `https://my-quilty.com/api/auth/callback` (one entry; no wildcards; HTTPS-only; no fragment), sign-out URL `https://my-quilty.com/` (and `/account` once portal is live). Scopes: `openid` (mandatory for ID token), `profile`, `email`, **plus custom scopes** for the Rust backend's resource server (e.g., `https://api.my-quilty.com/account.read`, `account.write`, `subscription.manage`). Audience is set via **RFC 8707 resource binding** — pass `resource=https://api.my-quilty.com` on `/oauth2/authorize` and Cognito sets `aud` on the access token to that resource ID; the Rust backend verifies `aud` matches its identifier. Avoid `aws.cognito.signin.user.admin` scope for the access token sent to your Rust backend — it's needed only if you call Cognito self-service APIs from the BFF (you will, for `GlobalSignOut`, so keep a separate token or accept dual scopes).

**Cognito 2026 status.** **Supports all of the above.** RFC 8707 resource binding via `resource` parameter on authorize is a recent Cognito addition (works in Managed Login, Essentials+).

**Reference example(s).**

- Resource server + RFC 8707: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html
- Authorize `resource` param: https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html

**Recommendation for our scaffold.**

- **Two resource servers** in the user pool:
  - `https://api.my-quilty.com` — Rust backend. Scopes: `account.read`, `account.write`, `subscription.read`, `subscription.manage`, `billing.read`. (Coordinate the exact list with the Rust crate that owns it.)
  - `https://auth.my-quilty.com` (the Cognito user-pool self-service) — keep `aws.cognito.signin.user.admin` for the BFF only when needed.
- **One app client** for the web BFF: confidential, code grant + PKCE, refresh-rotation on. Callback `https://my-quilty.com/api/auth/callback`. Sign-out `https://my-quilty.com/`.
- Use `resource=https://api.my-quilty.com` on every authorize call so the access token's `aud` is correctly bound.
- Client secret in **AWS Secrets Manager** with KMS encryption, fetched at SST stack init; never committed.

**Retrofit cost if wrong.** **Medium.** Adding/removing scopes triggers user re-consent in some flows; resource-server identifiers in `aud` checks need backend coordination. Get the list right at M6 (real auth) when the Rust API surface stabilizes.

---

## Q12. Cloudflare Turnstile (or alternative) on auth/signup

**Current 2026 enterprise practice.** AI scraping fleets + residential-proxy credential-stuffing have made IP-reputation alone insufficient (Cloudflare 2025 data: 65 percent increase in credential-stuffing 2024→2025). The 2026 layered pattern: **WAF rate-limit + IP rep at the edge** (managed rule groups, 100 req/5min per IP on `/oauth2/*`); **invisible CAPTCHA** on signup/login/forgot-password forms (Turnstile preferred — free tier, no Google data-flow concerns, drop-in for reCAPTCHA); **server-side token verification** via `siteverify` endpoint **before** forwarding to Cognito; **PreSignUp Lambda trigger** validates the verified flag in `ClientMetadata` to reject signups that bypass the form. Some teams skip the Lambda and verify on the BFF (since signup goes through BFF first), which is simpler.

**Cognito 2026 status.** Managed Login does not natively integrate Turnstile, but it **does** integrate AWS WAF with a built-in CAPTCHA action (different mechanism — AWS Cloud's CAPTCHA, not Turnstile). For Turnstile specifically, you must front the signup form with a custom UI page (or wrap the Managed Login signup in your own onboarding wizard that submits to Cognito's SDK).

**Reference example(s).**

- AWS WAF + Cognito: https://aws.amazon.com/blogs/security/protect-your-amazon-cognito-user-pool-with-aws-waf/
- Turnstile siteverify: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

**Recommendation for our scaffold.**

- **Layer 1: WAF** web ACL on the Cognito user pool — rate-based rule (100 req/5min per IP) + AWS Managed IP-reputation list + AWS Managed Anonymous-IP list (Tor / VPN gating: set to Count first, escalate to Block once you have 30 days of false-positive data).
- **Layer 2: Turnstile** on our own signup-wizard form (we will own the signup UI for branding regardless; we use Managed Login only for the sign-**in** loop and forgot-password). Turnstile widget invisible mode; server-side `siteverify` in `/api/auth/signup` Route Handler before calling `SignUp` via SDK.
- **Layer 3: PreSignUp Lambda trigger** as belt-and-suspenders — rejects if `ClientMetadata.turnstile_verified !== "true"` (we pass it through from BFF). This makes direct SDK calls (bypassing our form) also fail.
- Defer Turnstile keys/Lambda to M2-M3 (when signup is real); WAF baseline at M1.

**Retrofit cost if wrong.** **Low.** All three layers are additive and don't change the auth contract.

---

## Q13. Account recovery / "I lost my MFA"

**Current 2026 enterprise practice.** The defensible enterprise flow has four tiers: (1) **Backup codes** generated at MFA enrollment (10 single-use codes, hashed at rest); (2) **Secondary factor recovery** — recovery email or recovery SMS that's distinct from the primary MFA channel; (3) **Support-mediated recovery** with identity proofing (gov ID + photo, KYC vendor like Persona or Stripe Identity, mandatory waiting period 24–72h); (4) **Account-locked path** for high-stakes accounts: must re-create. WorkOS, Clerk, Auth0 all ship (1) natively; Cognito does not.

**Cognito 2026 status.** **Partial.** Cognito has `AccountRecoverySetting` on the user pool (default order: verified email → verified phone). No native backup codes. `AdminSetUserMFAPreference` is the admin override path. Forgot-password flow goes through verified-email/SMS automatically.

**Reference example(s).**

- `AccountRecoverySetting`: https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AccountRecoverySettingType.html
- AWS pattern for backup codes: build in DynamoDB + custom Lambda (no native).

**Recommendation for our scaffold.**

- **Implement backup codes ourselves** at M6 alongside MFA: at MFA enrollment, generate 10 codes (`crypto.randomBytes(10).toString('base32')`-style), hash with Argon2id, store hashed in DynamoDB table `quilty_mfa_backup_codes` (`sub`, `code_hash`, `used_at`). Show codes once to user; they download. On "I lost my MFA" flow: prompt for backup code, Argon2id-verify, mark `used_at`, allow MFA reset.
- **Don't ship support-mediated identity proofing at launch.** It's a runbook + Zendesk ticket flow (D44 reserved subdomain `help.my-quilty.com`). For M6–M8 we are small enough to handle these by hand with a documented "support engineer re-enables, audited" path that touches CloudTrail-logged `AdminSetUserMFAPreference` calls.
- Configure `AccountRecoverySetting` order: `verified_email` priority 1, `verified_phone_number` priority 2 — only if user has both verified.

**Retrofit cost if wrong.** **Medium.** Backup codes need to exist before MFA is mandatory; otherwise users lock themselves out and we have no recourse but support tickets. Ship them with M6 MFA, not later.

---

## Q14. OIDC `acr` + `amr` claims for auth assurance level

**Current 2026 enterprise practice.** Enterprise teams propagate "user authenticated with MFA in last 5 min" downstream via either (a) `acr`/`amr` claims in the access token consumed by resource servers, or (b) a custom claim like `quilty_auth_level` injected by the AS. Auth0, WorkOS, Okta, PingFederate all emit standard `acr`/`amr`. Cognito does not.

**Cognito 2026 status.** **Does not natively emit** `acr` or standard `amr` in user-pool ID/access tokens. The `amr` claim Cognito sets only applies to **identity-pool** tokens (`authenticated` / `unauthenticated` for IAM role trust). For user-pool tokens, you inject via **Pre-Token-Generation Lambda trigger** (Essentials tier and up, $0 incremental cost over Essentials baseline). The trigger receives `event.request.userAttributes` and `event.request.groupConfiguration` and can read MFA status via `event.callerContext` partially — but for real MFA-recency signal you must maintain server state.

**Reference example(s).**

- Pre-Token-Generation trigger v2: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-token-generation.html

**Recommendation for our scaffold.**

- **Do not** rely on Cognito-emitted `acr`/`amr`.
- BFF synthesizes a `quilty_assurance` field in the session: enum `{password_only, mfa, mfa_recent_5m, mfa_recent_1m}`. Updated at sign-in and after step-up (Q9). Passed to Rust backend as `X-Quilty-Assurance` header on proxied requests (BFF-signed, since the backend trusts the BFF).
- Reserve `acr`/`amr` injection via Pre-Token-Generation Lambda for **post-launch (M9+)** if the Rust backend ever needs the assurance claim _inside_ the JWT (e.g., for non-BFF API consumers).

**Retrofit cost if wrong.** **Low.** Header-based assurance signal is trivially replaceable with JWT claim later.

---

## Q15. OAuth state parameter handling

**Current 2026 enterprise practice.** Per OIDC Core §3.1.2.1 and BCP draft-26 §7.1: `state` MUST have ≥128 bits of entropy, MUST be CSRF-bound to the user agent (cookie or session-store entry), MUST be single-use, MUST be validated on callback. `nonce` MUST be ≥128 bits, MUST be sent on authorize, MUST be validated against `nonce` claim in ID token to prevent replay. `code_verifier` (PKCE) MUST be ≥43 chars high-entropy, kept server-side, sent only on the token exchange. Real impls: store `{state, nonce, code_verifier, return_to, created_at}` keyed by a short-lived cookie ID (`__Host-quilty.oauth_tx`, 10-minute TTL) — _not_ in localStorage, _not_ in URL-encoded ciphertext. Validate all three on callback, then delete the entry (single-use).

**Cognito 2026 status.** **Supports all of the above.** `state`, `nonce`, `code_challenge` are validated by Cognito as specified. `nonce` claim is emitted in ID tokens (Managed Login). Cognito's `/logout` endpoint also supports `state` and `nonce`.

**Reference example(s).**

- BCP draft-26 §7.1.
- Cognito authorize parameters: https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html (state, nonce, code_challenge sections).

**Recommendation for our scaffold.**

- Implement in `lib/auth/oauth-tx.ts`:
  - `startTx({return_to})` → generates `state` (32 bytes), `nonce` (32 bytes), `code_verifier` (96 bytes), stores `{state, nonce, code_verifier, return_to, created_at}` in DynamoDB `quilty_oauth_tx` table (TTL 10 min), sets `__Host-quilty.oauth_tx = tx_id` cookie.
  - `validateTx(callback_state, cookie_tx_id)` → reads row, asserts `state` matches, deletes row (single-use). Returns `{code_verifier, nonce, return_to}`.
  - On token exchange, send `code_verifier` to `/oauth2/token`.
  - On ID-token validation, assert `nonce` claim matches.
- Single-use enforcement via DynamoDB conditional `Delete` — if already gone, treat as replay attack, log + 4xx.

**Retrofit cost if wrong.** **High.** Auth replay / CSRF holes at the callback are the most embarrassing pre-launch bugs. Get this right at M1.

---

## Cognito 2026 capability matrix (verified)

| Feature                                             | Supported?              | Detail                                                                                           | Source URL                                                                                                           |
| --------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| OIDC Authorization Code + PKCE (S256)               | ✅ Yes                  | `code_challenge_method=S256` only; `plain` rejected                                              | https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html                                |
| OIDC Back-Channel Logout                            | ❌ No                   | `backchannel_logout_supported` absent from discovery; per OIDC BCL §2.1, absent = false          | https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints.html                                  |
| RP-Initiated Logout (`end_session_endpoint`)        | ⚠️ Proprietary          | Has `/logout` with `redirect_uri`/`logout_uri`/`state`; not advertised as `end_session_endpoint` | https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html                                       |
| `sid` claim in ID token                             | ❌ No                   | Cognito ID token has no `sid`                                                                    | https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-id-token.html          |
| Passkeys / WebAuthn (Managed Login)                 | ✅ Yes (GA Nov 22 2024) | Essentials tier+; up to 20 per user; choice-based `USER_AUTH` only                               | https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow-methods.html |
| TOTP MFA                                            | ✅ Yes                  | All tiers                                                                                        | https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html                                |
| SMS MFA                                             | ✅ Yes                  | All tiers (toll-fraud risk)                                                                      | Same                                                                                                                 |
| Email MFA                                           | ✅ Yes                  | Essentials+ only                                                                                 | Same                                                                                                                 |
| Backup codes (native)                               | ❌ No                   | Build in DynamoDB + Lambda                                                                       | (gap)                                                                                                                |
| Adaptive auth / risk-based MFA                      | ✅ Yes                  | Plus tier only                                                                                   | https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pool-settings-adaptive-authentication.html    |
| Compromised-credentials detection                   | ✅ Yes                  | Plus tier only                                                                                   | https://docs.aws.amazon.com/cognito/latest/developerguide/feature-plans-features-plus.html                           |
| Refresh-token rotation                              | ✅ Yes                  | `RefreshTokenRotation.Feature=ENABLED`; forces `GetTokensFromRefreshToken` API                   | https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-refresh-token.html     |
| `RevokeToken` API                                   | ✅ Yes                  | Per RFC 7009; revokes refresh + chained access                                                   | https://docs.aws.amazon.com/cognito/latest/developerguide/revocation-endpoint.html                                   |
| `GlobalSignOut`                                     | ✅ Yes                  | User-authorized; doesn't clear Managed Login cookie                                              | https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_GlobalSignOut.html                   |
| `AdminUserGlobalSignOut`                            | ✅ Yes                  | AWS-credential-authorized; for cross-device sign-out by `sub`                                    | https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminUserGlobalSignOut.html          |
| Pre-Token-Generation Lambda v2 (custom claims)      | ✅ Yes                  | Essentials+ tier; can inject `acr`/`amr` equivalents                                             | https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-token-generation.html                 |
| `acr` / `amr` claim emission                        | ❌ No                   | Not native in user-pool tokens; identity-pool only                                               | https://docs.aws.amazon.com/cognito/latest/developerguide/iam-roles.html                                             |
| `prompt=login`                                      | ✅ Yes                  | Managed Login (Essentials+) only — not classic Hosted UI                                         | https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html                                |
| `prompt=none` silent auth                           | ✅ Yes                  | Managed Login                                                                                    | Same                                                                                                                 |
| `max_age` request param                             | ❌ No                   | Not honored                                                                                      | (gap; verify in BFF code)                                                                                            |
| RFC 9470 step-up error responses                    | ❌ No                   | Not supported by Cognito or API Gateway authorizer                                               | (gap)                                                                                                                |
| OIDC Native SSO (mobile↔web)                        | ❌ No                   | Not supported; spec doesn't cover mobile↔web anyway                                              | https://openid.net/specs/openid-connect-native-sso-1_0.html                                                          |
| Custom domain (e.g., `auth.my-quilty.com`)          | ✅ Yes                  | ACM cert MUST live in us-east-1                                                                  | https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-add-custom-domain.html                  |
| RFC 8707 resource binding (`resource` on authorize) | ✅ Yes                  | Managed Login, Essentials+                                                                       | https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html            |
| WAF integration                                     | ✅ Yes                  | Web ACL on user pool; CAPTCHA action, rate-based rules, IP rep                                   | https://aws.amazon.com/blogs/security/protect-your-amazon-cognito-user-pool-with-aws-waf/                            |
| Cloudflare Turnstile native integration             | ❌ No                   | Build via custom signup form + PreSignUp Lambda                                                  | (gap)                                                                                                                |
| HIPAA-eligible / BAA coverage                       | ✅ Yes                  | On AWS HIPAA-eligible list (Feb 2026 update)                                                     | https://aws.amazon.com/compliance/hipaa-eligible-services-reference/                                                 |
| CloudTrail auth-event audit logs                    | ⚠️ Partial              | Mgmt-plane only in CloudTrail; auth events require Plus tier user-activity logs                  | https://docs.aws.amazon.com/cognito/latest/developerguide/feature-plans-features-plus.html                           |
| `auth_time` claim in ID token                       | ✅ Yes                  | Used for step-up polyfill                                                                        | https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-id-token.html          |
| Confidential client + client_secret                 | ✅ Yes                  | Stored in Secrets Manager, never in repo                                                         | https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-security-best-practices.html                     |

---

## The auth/session architecture diagram (prose)

**Cookies on `my-quilty.com` (the web BFF):**

| Cookie                   | Lifetime                         | Attrs                                             | Contents              | Purpose                                                        |
| ------------------------ | -------------------------------- | ------------------------------------------------- | --------------------- | -------------------------------------------------------------- |
| `__Host-quilty.sid`      | Session-store TTL (8h initially) | `Secure; HttpOnly; SameSite=Lax; Path=/`          | Random 128-bit ID     | Maps to DynamoDB session row                                   |
| `__Host-quilty.csrf`     | Same as sid                      | `Secure; SameSite=Lax; Path=/` (NOT HttpOnly)     | HMAC-bound CSRF token | Double-submit token; readable by JS to echo as `X-Quilty-CSRF` |
| `__Host-quilty.oauth_tx` | 10 min                           | `Secure; HttpOnly; SameSite=Lax; Path=/api/auth/` | OAuth tx ID           | Carries the in-flight `state`/`nonce`/`code_verifier` lookup   |

**Cookies on `auth.my-quilty.com` (Cognito managed-login):**

| Cookie                               | Set by                | Purpose                                                                   |
| ------------------------------------ | --------------------- | ------------------------------------------------------------------------- |
| Cognito Managed Login session cookie | Cognito after sign-in | SSO substrate; enables `prompt=none` silent re-auth across our subdomains |

**Server-side stores (DynamoDB):**

| Table                                                      | Keys                    | TTL                    | Purpose                                                                                                                                                         |
| ---------------------------------------------------------- | ----------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quilty_web_sessions`                                      | PK=`sid`                | `expires_at`           | Session record: `cognito_sub`, encrypted `access_token`, encrypted `refresh_token`, `auth_time`, `elevated_until`, `last_seen_at`, `ua_fingerprint`, `ip_class` |
| `quilty_oauth_tx`                                          | PK=`tx_id`              | 10 min                 | In-flight OAuth: `state`, `nonce`, `code_verifier`, `return_to`                                                                                                 |
| `quilty_mfa_backup_codes`                                  | PK=`sub`+SK=`code_hash` | (none)                 | Argon2id-hashed backup codes; `used_at` marks single-use                                                                                                        |
| `quilty_revocation_cache` (in ElastiCache/Valkey, NOT DDB) | `cognito_sub`           | access-token TTL + 30s | "Revoked since": used by Rust backend revocation check                                                                                                          |

**Endpoints (Route Handlers in `apps/web/app/api/auth/*`):**

| Method + Path                       | Purpose                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/auth/login`               | Start OAuth tx, generate state/nonce/PKCE, redirect to Cognito `/oauth2/authorize`                                                               |
| `GET /api/auth/callback`            | Validate state, exchange code, verify id_token (sig + iss + aud + exp + nonce), create session row, set cookies, redirect to `return_to`         |
| `POST /api/auth/refresh`            | Server-only; rotates tokens via `GetTokensFromRefreshToken`                                                                                      |
| `POST /api/auth/logout`             | Single-device or `?everywhere=true`; revokes Cognito tokens, deletes session row(s), publishes EventBridge event, redirects to Cognito `/logout` |
| `POST /api/auth/step-up`            | Force `prompt=login` re-auth for sensitive surfaces                                                                                              |
| `POST /api/auth/signup`             | Custom signup form: Turnstile verify → `SignUp` SDK call → confirm-email flow                                                                    |
| `POST /api/auth/backchannel-logout` | Reserved for future Cognito BCL; today wired to internal EventBridge consumer                                                                    |

**Flows:**

- **Sign-in (cold):** browser visits `/account/x` → proxy.ts sees no `sid` → 302 `/api/auth/login` → 302 to `auth.my-quilty.com/oauth2/authorize?...&code_challenge=...&resource=https://api.my-quilty.com` → Managed Login shows passkey/password choices → user authenticates → Cognito 302 to `/api/auth/callback?code=&state=` → BFF exchanges code, verifies tokens, writes session row, sets `__Host-quilty.sid` + `__Host-quilty.csrf` → 302 to `/account/x`.

- **Sign-in (warm, different subdomain):** if `auth.my-quilty.com` already has a managed-login session, the authorize call with `prompt=none` returns a code immediately, no UI shown. Total latency: one extra round trip.

- **Refresh (silent):** RSC render calls `getSession()` → access token expires in <60s → in-memory per-sid lock acquired → BFF POST `/oauth2/token` with `grant_type=refresh_token` (rotation on, so gets new refresh too) → update session row → return updated session. Browser sees nothing.

- **Sign-out (single device):** browser POSTs `/api/auth/logout` → BFF calls `/oauth2/revoke` (kills refresh token), deletes this `sid` row, redirects to `auth.my-quilty.com/logout?client_id=…&logout_uri=https://my-quilty.com/` to clear the Managed Login cookie.

- **Sign-out everywhere:** browser POSTs `/api/auth/logout?everywhere=true` → BFF calls `GlobalSignOut(access_token)`, deletes ALL session rows for that `cognito_sub`, publishes `quilty.auth.sessions_revoked` EventBridge event → Rust backend's consumer marks `cognito_sub` revoked in Valkey for 5min + clock skew → BFF redirects to Cognito `/logout` → user is signed out everywhere within seconds, mobile gets push to re-auth.

- **Step-up:** Action handler calls `requireElevated()` → `session.elevated_until < now - 5min` → 302 `/api/auth/step-up?return=/account/email-change` → 302 to Cognito `/oauth2/authorize?prompt=login&...` → user re-authenticates with MFA → callback updates `session.auth_time` and `session.elevated_until = now + 5min` → 302 to `return`.

---

## TOP-7 retrofit-hostile auth gaps to close in M1 scaffold

If we miss any of these at M1, the post-launch cost is high. In ranked order:

1. **Per-subdomain `__Host-` cookies (Q6).** Reversing to parent-domain cookies later requires logging everyone out and rebuilding session contract. **Lock at M1.**
2. **Opaque session-ID + server-side store (Q2/Q8).** Sealed-cookie ergonomics can't deliver instant revocation later. The whole "sign out everywhere" + HIPAA audit posture depends on this. **Lock at M1.**
3. **CSRF triple-layer helper (Q3) used by every non-GET handler.** Retrofitting CSRF into existing handlers is bug-prone. **Helper at M1, enforcement at PR review forever.**
4. **OAuth state/nonce/PKCE single-use store with DynamoDB conditional delete (Q15).** A replay-able callback is the worst class of pre-launch bug. **Lock at M1.**
5. **OIDC client wrapper provider-agnostic (Q1/Q5).** Coupling to Auth.js or to Cognito-specific APIs at the call site costs months when we swap. **Lock at M1.**
6. **Short access-token TTL (≤5 min) + refresh-token rotation forced via `GetTokensFromRefreshToken` (Q10).** Going from 1h tokens to 5min later requires Rust backend revocation-cache work _and_ observation of refresh storms. **Lock app-client config at M1, even before real auth is wired in M6.**
7. **EventBridge bus + IAM policy provisioned (Q7/Q8).** SST stack should declare the bus from M1 even if no publisher/consumer is wired yet. Naming it later requires renames across mobile + backend. **Provision empty at M1.**

---

## Decisions that change (or stay) from baseline

| Baseline decision                                                           | Verdict            | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cognito Hosted UI at `auth.my-quilty.com` (D6)                              | **CHANGE WORDING** | "Cognito Managed Login (Nov 2024 redesign) at `auth.my-quilty.com`, Essentials tier" — Hosted UI = classic; Managed Login = new. Passkeys, email MFA, choice-based auth, `prompt=login`, branding editor all require Managed Login, not classic.                                                                                                                                                                                                     |
| `__Host-` cookies per subdomain (D7)                                        | **CONFIRMED**      | Locked.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `SameSite=Lax` on session cookie (D8)                                       | **CONFIRMED**      | Lax is correct — Strict would break the OAuth redirect from Cognito. We polyfill the CSRF gap via Origin check + double-submit token + custom header.                                                                                                                                                                                                                                                                                                |
| OIDC Backchannel Logout with `sid` claim (D9)                               | **CHANGE**         | Cognito does not support OIDC Back-Channel Logout, and does not emit `sid`. **Replace D9 with:** "EventBridge-fanout 'sign out everywhere' via internal `quilty.auth.sessions_revoked` event consumed by web BFF session store and Rust backend revocation cache. Polyfill until Cognito ships OIDC BCL (no timeline; not on AWS roadmap as of May 2026)." Wire endpoint `POST /api/auth/backchannel-logout` reserved for future direct BCL support. |
| Double-submit CSRF + custom header (D10)                                    | **CONFIRMED**      | Add explicit Origin allow-list check as third layer (triple defense per BCP draft-26 §6.1.3.3).                                                                                                                                                                                                                                                                                                                                                      |
| Mobile-web sessions independent, joined by `sid` + backchannel logout (D11) | **CHANGE WORDING** | "Independent sessions joined by `cognito_sub` + locally-minted `quilty_sid`, cross-surface revocation via EventBridge fan-out, NOT OIDC Native SSO (out of scope per OIDF draft 07 for mobile↔web) and NOT OIDC Back-Channel Logout (not supported by Cognito)." Functionally identical to D11 intent; spec/mechanism corrected.                                                                                                                     |

**New decisions to lock (proposed D50–D55):**

- **D50:** Cognito user pool on **Essentials tier** at M1. Plus-tier evaluation gate at M6 (real auth) based on whether compromised-credentials detection / adaptive auth / Cognito user-activity log export becomes audit-required.
- **D51:** **Opaque session-ID cookie + DynamoDB session store** (`quilty_web_sessions`) — never sealed-cookie. Encrypted token columns via KMS.
- **D52:** **Access-token TTL = 5 min**, refresh-token TTL = 8h initially, refresh-token rotation **enabled** with 10s grace, **`GetTokensFromRefreshToken` API** (not `REFRESH_TOKEN_AUTH`).
- **D53:** **Pre-subdomain `__Host-` cookies; SameSite=Lax;** CSRF defense = Origin check + signed double-submit + custom `X-Quilty-CSRF` header.
- **D54:** **Step-up via `prompt=login` + server-side `elevated_until` flag** (polyfill for RFC 9470 / `acr`/`max_age`). 5-minute elevation window. Required surfaces: email change, account delete, payment method, subscription cancel, MFA management.
- **D55:** **Backup codes implemented in-app (Argon2id, DynamoDB)**, not in Cognito. Shipped with M6 MFA enablement.

---

## Sources

- IETF: https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps (BCP draft-26)
- OpenID Foundation: https://openid.net/specs/openid-connect-backchannel-1_0.html
- OpenID Foundation: https://openid.net/specs/openid-connect-native-sso-1_0.html
- IETF: https://datatracker.ietf.org/doc/html/rfc9470 (Step-Up)
- IETF: https://datatracker.ietf.org/doc/html/rfc7636 (PKCE)
- AWS: https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints.html
- AWS: https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html
- AWS: https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html
- AWS: https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-refresh-token.html
- AWS: https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow-methods.html
- AWS: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-sign-in-feature-plans.html
- AWS: https://docs.aws.amazon.com/cognito/latest/developerguide/feature-plans-features-plus.html
- AWS: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pool-settings-adaptive-authentication.html
- AWS: https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_GlobalSignOut.html
- AWS: https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_WebAuthnConfigurationType.html
- AWS: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-add-custom-domain.html
- AWS: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html
- AWS Blog (Nov 2024 Managed Login + passkeys): https://aws.amazon.com/blogs/aws/improve-your-app-authentication-workflow-with-new-amazon-cognito-features/
- AWS Blog (WAF + Cognito): https://aws.amazon.com/blogs/security/protect-your-amazon-cognito-user-pool-with-aws-waf/
- AWS HIPAA: https://aws.amazon.com/compliance/hipaa-eligible-services-reference/
- AWS sample step-up: https://github.com/aws-samples/step-up-auth
- Next.js 16: https://nextjs.org/blog/next-16 + https://nextjs.org/docs/messages/middleware-to-proxy
- CVE-2025-29927: https://vercel.com/blog/postmortem-on-next-js-middleware-bypass
- WorkOS sign-out-everywhere: https://workos.com/blog/sign-out-everywhere-workos-sessions-api
- iron-session: https://github.com/vvo/iron-session
- Auth.js v5: https://authjs.dev/getting-started/migrating-to-v5
