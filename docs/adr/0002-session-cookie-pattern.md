# ADR-0002: Opaque session-ID cookie + DynamoDB store + EventBridge fan-out (NOT iron-session sealed cookies, NOT OIDC Back-Channel Logout)

- **Status:** Accepted
- **Date:** 2026-05-17 (locked via Round-5 audit)
- **Deciders:** Volodymyr Petrychenko + Round-5 auth-session-cognito research agent
- **Related decisions:** D5 (BFF), D7 (`__Host-` per-subdomain), D8 (SameSite=Lax), D9 (Cognito-native logout), D10 + D53 (CSRF triple-layer), D11 (mobile-web join via `cognito_sub` + `quilty_sid`), D51 (opaque session-ID + DynamoDB), D52 (token TTLs + rotation), D54 (step-up via `prompt=login`), D55 (backup codes in-app)
- **Related ADRs:** [ADR-0004 Observability stack](0004-observability-stack.md) (PHI redaction in logs)
- **Related research:** `docs/research/round_5_independent_review/04-auth-session-cognito.md`, `docs/research/auth_session_architecture.md` (round 2), [IETF OAuth Browser-Based Apps BCP draft-26 §6](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps)

## Context

The website is HIPAA-aligned: zero PHI on the web tier, but auth flows handle
email + name + potentially health-status flags. The mobile app and website
operate as independent OIDC clients against the same Cognito User Pool.

The original strategy doc (D9, locked round 2) called for "OIDC Back-Channel
Logout with `sid` claim wired day-one" as the cross-device sign-out
mechanism. The Round-5 auth agent verified directly against AWS Cognito docs
and the discovery endpoint:

- Cognito does **NOT** advertise `backchannel_logout_supported` in its OIDC
  discovery document.
- Cognito app-client configuration does **NOT** accept a `backchannel_logout_uri`
  registration.
- Cognito ID tokens do **NOT** emit the `sid` claim (they emit `origin_jti`,
  `jti`, `event_id`, `auth_time` — but not the spec-defined session ID).
- Cognito provides only **front-channel** `/logout` redirect + the
  `AdminUserGlobalSignOut` API (which revokes tokens server-side but does not
  clear the managed-login session cookie and does not notify the RP).

Forces:
- HIPAA-aligned posture mandates **immediate** session revocation across all
  devices when a user clicks "sign out everywhere" or when a security event
  (password change, MFA-factor change) requires it. The Cerebral $7M case is
  the reminder that "we'll get to it" is not a defense.
- Sealed-cookie patterns (iron-session, `@hapi/iron`) store the session
  payload encrypted in the cookie value. They are simple and stateless — but
  they cannot be revoked instantly because each device's cookie is a
  self-contained sealed envelope; revoking requires either short TTL +
  blacklist (still needs server-side state) or rotation of the master sealing
  key (which logs out every user).
- Per BCP draft-26 §6.2.2, the cookie value SHOULD be encrypted. In an
  opaque-session-ID model, the value is already opaque (a random UUID-style
  key); encryption is moot because the cookie reveals nothing without the
  DynamoDB row.
- Per BCP draft-26 §6.3, SameSite=Lax + double-submit CSRF token + custom
  header is the recommended posture for first-party auth.
- The Rust backend already has an ElastiCache Valkey JTI denylist (from the
  mobile auth path); we can re-use the primitive.

What happens if we don't decide: ship iron-session sealed cookies (simpler,
common Next.js pattern), then discover at M6+ that we cannot meet the HIPAA
incident-response SLO for forced session revocation. Refactor to opaque-ID
+ store mid-flight is a 2-3 week project that touches every Route Handler.

## Decision

**We will store session state in DynamoDB keyed by an opaque 256-bit session ID carried in a `__Host-quilty_sid` cookie, and propagate cross-device sign-out via EventBridge — explicitly rejecting iron-session sealed cookies and explicitly NOT depending on OIDC Back-Channel Logout (which Cognito does not support).**

Specifically:

1. **Cookie:** `__Host-quilty_sid` — HttpOnly, Secure, SameSite=Lax, Path=/,
   no Domain attribute (per D7 + `__Host-` prefix semantics). Cookie value is
   an **opaque session ID** (random URL-safe 256-bit identifier), not a
   token or JWT.
2. **Session store:** DynamoDB table `quilty-web-sessions` (TTL-enabled,
   sparse-GSI on `cognito_sub` for "list my sessions" UX), single-table
   schema. PK = session ID. Stores: `cognito_sub`, refresh token (encrypted
   at rest with KMS CMK), access token expiry, last-rotated timestamp,
   `elevated_until` step-up flag, IP / user-agent fingerprint, creation +
   last-seen timestamps, `device_label` (user-set).
3. **Token lifecycle (D52):** access token TTL 5 min; refresh token TTL 8h;
   refresh-token rotation enabled via `GetTokensFromRefreshToken`. Old
   refresh token revoked on rotation (Cognito Plus tier feature, gated to M6
   per D50).
4. **Cross-device sign-out (D9 revision):** when the user signs out from
   any device, the BFF (a) deletes the DynamoDB session row, (b) calls
   `AdminUserGlobalSignOut` to revoke all of that `cognito_sub`'s tokens at
   Cognito, (c) publishes a `quilty.auth.sessions_revoked` event to
   EventBridge with `{ cognito_sub, except_session_id?, reason }`. Web BFF
   + Rust backend both subscribe and invalidate their caches. Mobile app
   handles the EventBridge fan-out via the existing push channel.
5. **`/api/auth/backchannel-logout` Route Handler is reserved as a 501-stub**
   for the day Cognito ships native OIDC Back-Channel Logout. When that
   ships, we flip the implementation and retire the EventBridge fan-out
   (or keep both as defense-in-depth).
6. **CSRF triple-layer (D53):** Origin/Referer header check + signed
   double-submit token (HMAC over session ID) + custom `X-Quilty-CSRF`
   header on every state-changing request.
7. **Step-up auth (D54):** sensitive actions (email change, account delete,
   payment method change, MFA management) check the session row's
   `elevated_until` flag. If expired, redirect to Cognito Managed Login
   with `prompt=login` to force re-MFA. On callback success, set
   `elevated_until = now + 5 min`.
8. **Backup codes (D55):** in-app, Argon2id-hashed, stored in DynamoDB
   alongside session metadata. Cognito has no native backup-code surface;
   we own this layer end-to-end.
9. **Session identity (D11):** `cognito_sub` (the Cognito user identifier)
   identifies the user across mobile + web. `quilty_sid` (the opaque
   session ID) identifies the device/session. The OIDC spec's `sid` claim
   is NOT emitted by Cognito; we never depend on it.

## Consequences

### Positive

- Immediate session revocation on any device: deleting a DynamoDB row +
  publishing one EventBridge event is <100ms p99.
- HIPAA incident-response SLO for forced sign-out is meetable end-to-end.
- "Sign out everywhere" UX is a real feature, not a sealed-cookie workaround.
- BFF code stays simple: read cookie → look up DynamoDB row → use the
  refresh token → call Rust backend. No JWT-signature-verification logic.
- Cookie value reveals nothing without DB access — even if XSS exfiltrates
  the cookie, the attacker has only an opaque ID with no embedded data.
- Refresh-token rotation detects refresh-token theft (old token used after
  rotation → Cognito returns error → BFF invalidates all sessions for that
  user).
- EventBridge bus is naturally extensible to future consumers (audit
  pipeline, security-event SIEM, mobile push, breach-notification trigger).

### Negative

- DynamoDB read on every request (or cached at the BFF Lambda layer with
  short TTL — TBD at M6). At ~1ms per read this is acceptable; over-budget
  cases can adopt DAX or in-process LRU cache.
- Operational dependency on DynamoDB + EventBridge — both are AWS-managed
  with strong SLAs, but they're more moving parts than iron-session's
  stateless model.
- Cross-device sign-out is eventually-consistent on the mobile side
  (depends on push-channel deliverability). Web side is strongly
  consistent.

### Neutral

- Cookie pre-fix (`__Host-`) prohibits a `Domain` attribute, which means we
  cannot share cookies across `auth.my-quilty.com` (Cognito) and
  `my-quilty.com` (BFF) — this is the per-subdomain OIDC code flow pattern
  (D7) and is the correct trade-off vs Safari ITP cookie blocking.
- Session-list UX (a "your active sessions" page at `/account/security`)
  becomes a straightforward DynamoDB GSI query at M6.

## Alternatives considered

### Alternative A: iron-session sealed cookies (no server-side store)

- **What it is:** Encrypted JSON payload stored entirely in the cookie value.
  Decrypted on each request. Stateless, easy to deploy.
- **Why rejected:** No instant revocation. To force sign-out, you either (a)
  rotate the master key (logs out everyone), (b) keep a server-side blacklist
  of revoked sessions (defeats the statelessness), or (c) accept that
  revocation only happens at the next refresh boundary (incompatible with our
  HIPAA-aligned posture). Cerebral lesson: "intent ≠ enforcement."

### Alternative B: JWT-as-session-cookie (signed but not encrypted)

- **What it is:** Sign a session JWT, store it in the cookie. Verify
  signature on each request. No DB lookup.
- **Why rejected:** Same revocation problem as iron-session, plus the cookie
  value leaks user metadata (subject claim, scopes) on inspection.

### Alternative C: OIDC Back-Channel Logout (the originally-locked D9)

- **What it is:** Cognito POSTs a signed `logout_token` (containing `sid`)
  to a pre-registered `backchannel_logout_uri` on every sign-out.
- **Why rejected:** Cognito does not implement OIDC BCL (verified via
  discovery doc and AWS API ref). We reserve `/api/auth/backchannel-logout`
  as a 501-stub Route Handler for the day Cognito ships it.

### Alternative D: OIDC Native SSO (token sharing between mobile and web)

- **What it is:** Mobile and web clients share a refresh token via a
  cross-app token-bridge protocol (draft-ietf-oauth-native-sso).
- **Why rejected:** Enterprise-SSO complexity; premature for our scale. The
  spec is still draft. Independent sessions joined by `cognito_sub` give us
  the desired UX (one user, two devices) without the protocol burden.

### Alternative E: NextAuth.js v5 (Auth.js) DB session strategy

- **What it is:** Use Auth.js's "database session" mode (Prisma adapter or
  similar) instead of writing the BFF Route Handlers from scratch.
- **Why rejected:** Auth.js's abstractions assume a single-DB model and a
  specific schema layout that doesn't fit our Cognito + Rust + DynamoDB
  topology. We'd spend more time fighting the abstraction than writing the
  ~500 lines of BFF code ourselves. Auth.js remains a fallback if we ever
  introduce a third IdP that needs the multi-provider surface.

## Compliance / Verification

- ESLint rule: ban direct cookie-write outside `lib/auth/session.ts`
  (forces the session abstraction).
- Vitest unit tests on the session store wrapper: round-trip create →
  read → invalidate → assert downstream consumers get refresh failure.
- Playwright e2e at M6: sign in on browser-A, sign out on browser-B, assert
  browser-A receives 401 within 2s on its next mutating request.
- CloudWatch alarm on `quilty.auth.sessions_revoked` event-publish failures
  (this is the failure mode that breaks the SLO).
- BAA scope inventory (`docs/baa_scope.md` at M8) lists DynamoDB session
  table as in-scope; KMS CMK rotation is annual.
- DynamoDB session table is configured with **point-in-time recovery**
  enabled + **CMK encryption** + **deletion protection** in SST.

## References

- AWS Cognito `/logout` endpoint: https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html
- AWS Cognito `GlobalSignOut` / `AdminUserGlobalSignOut`: https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_GlobalSignOut.html
- AWS Cognito ID-token claims (no `sid` listed): https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-id-token.html
- **Re-verify Cognito BCL absence** (any future reader): `curl -s https://cognito-idp.us-east-1.amazonaws.com/<USER_POOL_ID>/.well-known/openid-configuration | jq 'keys'` — confirm `backchannel_logout_supported` is absent from the result.
- IETF OAuth Browser-Based Apps BCP draft-26 §6.2.2 (cookie encryption) + §6.3 (CSRF + SameSite): https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps#section-6
- OpenID Connect Back-Channel Logout 1.0 spec (reserved for the day Cognito ships): https://openid.net/specs/openid-connect-backchannel-1_0.html
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP CSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- Cerebral $7M FTC settlement (the load-bearing precedent): https://www.ftc.gov/news-events/news/press-releases/2024/04/ftc-cerebral-pay-more-7-million-disclosing-consumers-sensitive-mental-health-information
- Next.js CVE-2025-29927 — middleware/proxy authorization bypass (March 2025): https://nvd.nist.gov/vuln/detail/CVE-2025-29927 — authorization decisions must NEVER live in `proxy.ts` alone; every Server Component / Route Handler must re-validate via the session store.

## Revisit triggers

- **Cognito ships native OIDC Back-Channel Logout** — flip
  `/api/auth/backchannel-logout` from 501 to live handler; optionally
  retire the EventBridge fan-out (or keep as defense-in-depth).
- **DynamoDB read latency on session lookup exceeds 5ms p99** — introduce
  DAX or in-process LRU cache with 30-60s TTL.
- **First B2B SSO customer (SAML/OIDC federation)** — re-evaluate Auth.js
  for the multi-provider surface; keep the session-store layer.
- **>50K concurrent sessions** — re-evaluate DynamoDB partition strategy
  (currently single-partition keyed by `quilty_sid`).
- **Cognito Plus tier features needed** (adaptive auth threat protection) —
  flip pool tier at M6 per D50; reuse the same session-store layer.
