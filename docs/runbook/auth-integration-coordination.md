# Auth integration coordination (website ⇄ quilty-aws)

> **Purpose:** the single living reference for the website↔backend auth integration — what the server ships for us, what we owe back, the ratified facts, and the locked execution sequencing. Consolidates the cross-repo recon (2026-05-30) + the structured decision pass (2026-06-03).
> **Companion docs:** `federation-handoff-from-quilty-aws-2026-06-03.md` (server → us, authoritative), `cross-repo-dependencies.md` (us → server, the `.well-known` surface), `first-dev-deploy.md` (one-time deploy ceremony).
> **Decision sources:** strategy doc D5/D6/D9/D11/D31/D35/D45/D51/D52/D63 + ADR-0002/0027/0028. Where a spec card in `quilty-aws/docs/auth/handlers/spec_cards/` disagrees with this doc, the spec card wins.

## Status snapshot (2026-06-03)

- **Server auth substrate is live in prod** (`quilty-aws`, account `975630231383`): the W3-F federation substrate deployed 2026-06-03 — `mobile_federation` Cognito client live, Google + Apple IdPs registered, W-024 RISC cascade workers live, 79-endpoint Rust auth tier in production.
- **AWS infra for the website is PARKED.** Account structure is in active talks with the AWS team (possible dedicated website account and/or shared-services tier). The `website-baseline` Terraform layer, SES/WAF ownership, and the first deploy all wait on that outcome.
- **The website cannot ship auth end-to-end until the deploy lands** — the Cognito custom-domain flip (`auth.my-quilty.com`) and the confidential `web_bff` client are both gated on our first deploy + apex DNS.

## Ratified server facts (2026-06-03, file:line evidence in quilty-aws)

- **Access-token TTL = 5 minutes** (Cognito minimum; `auth/client.tf`). Confirms **D52**. The `ACCESS_TOKEN_MAX_TTL_SECS ≤ 60` is a _future_ test-contract for an unimplemented PreTokenGen-V2 hard-cap, NOT a deployed TTL. Real sub-200ms revocation is via an **ElastiCache Valkey JTI denylist**, not token expiry.
- **Domain `.com` confirmed** (D45). The server's `federation_redirect_uri_allowlist` already includes `https://my-quilty.com/auth/callback`; the server will standardize `rpId`/deeplinks on `.com`.
- **Managed Login branding is NOT yet configured** (no `aws_cognito_managed_login_branding`); **no confidential `web_bff` client exists yet.** The existing federation client is **public** (no secret) and scoped for IdP linking, not general web-BFF auth.
- **`auth.my-quilty.com` custom domain** is declared but `enable_custom_domain=false` — flips after our apex A-record resolves.

## What the server must ship for us (the contract)

| Item                                                                                                                 | Status                                                                             | Owner                               | Phase       |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------- | ----------- |
| Confidential `web_bff` Cognito client (`generate_secret`, code flow, callback/logout, scopes) — spec in handoff §5.1 | provisioned when our BFF is ready (file `D-AUTH-WEB-BFF-COGNITO-CLIENT-PROVISION`) | quilty-aws                          | M5/M6       |
| Managed Login branding for that client                                                                               | not configured                                                                     | quilty-aws                          | M6          |
| `auth.my-quilty.com` custom-domain flip (`enable_custom_domain=true`)                                                | gated on our apex DNS                                                              | quilty-aws                          | post-deploy |
| OpenAPI completion: 15 missing ops + merge the standalone `/v1/auth/refresh` contract                                | partial (~half specced)                                                            | quilty-aws                          | pre-M6      |
| Cross-account `events:PutRule` grant (dev → `quilty-prod-auth-events`) if we subscribe                               | not vended                                                                         | quilty-aws (via `website-baseline`) | optional    |
| SSM `/quilty/website/auth-config` (pool id, hosted-UI bases, web client id) — handoff §2.1.A                         | spec'd                                                                             | joint                               | deploy      |
| `traceparent` propagation through API GW → Rust (D38)                                                                | correlation-id only today                                                          | quilty-aws                          | M6          |

## What we owe the server (from the federation handoff)

Authoritative list in `federation-handoff-from-quilty-aws-2026-06-03.md`. Headline deliverables, in dependency order:

1. `quilty-aws/website-baseline/` Terraform (we author; PARKED on AWS account-structure decision).
2. First SST deploy → unblocks the Cognito custom-domain flip.
3. `quilty-aws/dns/` apex A-record PR (Pattern A two-step ceremony).
4. BFF auth-callback (M5) per handoff §5 — **PKCE S256 mandatory, no fail-open**; opaque session-ID + DDB; never store IdP refresh tokens; delegate provider-unlink to auth-user.
5. Respect AppConfig kill switches, rate-limit classes, Idempotency-Key, `traceparent` (handoff §4).

### Open questions owed back to the server (handoff §8) — PENDING a dedicated decision pass

1. BFF callback path: `/auth/callback` (matches allowlist) vs `/api/auth/callback` (current scaffold). _Server recommends `/auth/callback`._
2. Refresh strategy: separate `/api/auth/refresh` route vs opaque-session + server-side refresh. _Server recommends opaque-session._
3. `prompt=login` support for sensitive actions. _Server recommends yes._
4. Identity-picker UX: our-side picker vs Cognito Managed Login built-in. _Server recommends our-side._
5. Anonymous → federated upgrade: carry pre-auth state forward? _Server recommends yes, via guest-session bridge._
6. MHMDA "sensitive action" step-up gating on `/account/security|data|delete`. _Server recommends yes._

→ These are NOT yet decided. Resolve them, then file answers as inline replies + an `S-N` revision to the strategy doc.

## Locked execution sequencing (2026-06-03)

1. **In-repo hardening first (~3–7 days), UI held until M3 identity locks.** Batch (one PR): OpenAPI codegen for the current spec · real Sentry project + DSN · Amplitude key consent-gated/OFF · repo fixes (incl. the `deploy.yml` bug where `QUILTY_PSEUDONYM_PEPPER` is never passed to either job's `env:`) · fail-closed prod guards on the in-memory rate-limiter + consent store.
2. **Meanwhile, the server team decides the AWS account structure** for the website.
3. **Then: deployment + the server's deliverables** (`website-baseline` → first deploy → DNS ceremony → custom-domain flip → BFF auth-callback at M5).
4. **Entity formation is not a near-term priority** (an existing LLC covers near-term contracting needs; C-Corp matters mainly for VC/QSBS/equity).
5. ADRs **0027 (zero-PHI / D31)** + **0028 (server-side ConsentState / D35)** committed (`9cbd8de`).
