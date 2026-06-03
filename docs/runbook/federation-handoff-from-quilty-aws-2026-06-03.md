# Federation handoff from `quilty-aws` → `quilty-website` — 2026-06-03

> **Audience:** quilty-website platform team (M2 closeout + M5 BFF auth-callback work).
> **Author:** quilty-aws auth platform team (W3-F sub-wave closeout).
> **Scope:** every contract, surface, and constraint that the federated-auth substrate landing in `quilty-aws/auth/` today imposes on the website's BFF + `auth.my-quilty.com` Cognito Managed Login flow.
> **Companion docs (already exist in this repo):** `docs/runbook/sst-deploy.md` (deploy ceremony), `docs/runbook/first-dev-deploy.md` (one-time activation), `docs/runbook/cross-repo-dependencies.md` (what you ship that we depend on). **This doc is the inverse: what we shipped that you depend on.**
> **Spec reference (canonical, in `quilty-aws` repo):** `docs/auth/W3F_VERIFICATION_REPORT.md` + `docs/auth/W3F_LIVE_DEPLOY_VERIFICATION_2026-06-02.md` + per-handler spec cards under `docs/auth/handlers/spec_cards/H-FED-*.md`. Where this doc and a spec card disagree, the spec card wins.

---

## 0. Why this doc exists (read first)

We deployed the **W3-F federation substrate** to `quilty-prod` (account `975630231383`) on 2026-06-03 with one deliberate scope cut: `enable_custom_domain` stays `false` for now. The Cognito Hosted UI remains served from `https://quilty-prod.auth.us-east-1.amazoncognito.com` until your team lands `quilty-aws/website-baseline/` + first SST deploy + `dns/` apex-A-record PR.

This is **not** a shortcut. The substrate is fully built, IdPs are registered, the `mobile_federation` Cognito client exists, the W-024 cascade workers are live, the per-row encryption-context KMS binding is enforced (with `Null` guards on the IAM side after a pre-deploy audit caught the vacuous-truth bypass). The only thing waiting is the custom-domain flip, which is a one-line var change after your apex resolves. Apple Service ID + Google Web client have **both URLs pre-allowed** on the provider side (Cognito-default URL + future `auth.my-quilty.com` URL), so the cutover requires **zero Apple/Google reconfiguration**.

This doc tells you everything you need to know to:

1. Build `quilty-aws/website-baseline/` correctly (no shortcuts).
2. Ship the first SST deploy properly (it's the gate on Cognito custom-domain activation).
3. Implement the M5 BFF auth-callback against the real auth-user state model (not a simplified one).
4. Respect the AppConfig kill switches, rate-limit classes, and observability seams that are already live.
5. Avoid the four hidden integration traps we found while building W3-F (each gets its own section below).

It is intentionally long. Anywhere we say "do X exactly like this," we mean exactly. No shortcuts; no simplifications. The W3-F substrate cost two weeks of disciplined sub-wave work + 3-agent QA + pre-deploy audit; the seams matter.

---

## 1. State summary — what's live in `quilty-aws/auth/` as of 2026-06-03

**Source of truth:** `quilty-aws/docs/auth/W3F_VERIFICATION_REPORT.md` + per-handler spec cards. The list below is the inventory you need to know about. Each line points at the canonical artifact.

### 1.1 Cognito (us-east-1, user pool `aws_cognito_user_pool.main`)

| Surface                            | Identifier                                                                                                                                                    | Status                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| User pool ID                       | `us-east-1_<EXPORTED VIA SSM>` (read from `data.aws_ssm_parameter./quilty/auth/cognito-user-pool-id`)                                                         | LIVE                                       |
| Hosted UI domain (current)         | `quilty-prod.auth.us-east-1.amazoncognito.com` (resource: `aws_cognito_user_pool_domain.prefix`)                                                              | LIVE                                       |
| Hosted UI domain (future, gated)   | `auth.my-quilty.com` (resource: `aws_cognito_user_pool_domain.custom`, `count = var.enable_custom_domain ? 1 : 0`)                                            | NOT YET PROVISIONED — gated on your deploy |
| ACM cert for `auth.my-quilty.com`  | `aws_acm_certificate.auth_domain` (us-east-1, EC_prime256v1, DNS validation CNAME `_010b507bdc546e45dd80c6021e9368f4.auth.my-quilty.com` already in Route53)  | VALIDATED — ready for Cognito to consume   |
| App client `quilty-mobile`         | OAuth code-flow disabled (pre-existing client; in-app native flow only)                                                                                       | LIVE — DO NOT TOUCH                        |
| App client `verification-only`     | Test client for QA harness                                                                                                                                    | LIVE                                       |
| App client `m2m_partner_reserved`  | M2M reserved (no flows yet)                                                                                                                                   | LIVE                                       |
| App client `mobile_federation`     | OAuth code-flow ENABLED; `supported_identity_providers = ["Google", "SignInWithApple"]`; `callback_urls` sourced from `var.federation_redirect_uri_allowlist` | LIVE (today's deploy)                      |
| Identity provider: Google          | `aws_cognito_identity_provider.google`; `attribute_mapping.email = "email"`; `client_id` + `client_secret` from `secrets.auto.tfvars`                         | LIVE (today's deploy)                      |
| Identity provider: SignInWithApple | `aws_cognito_identity_provider.apple`; ES256 client_assertion JWT minted server-side; team_id/service_id/key_id/private_key from `secrets.auto.tfvars`        | LIVE (today's deploy)                      |

**Critical:** the `mobile_federation` client's `callback_urls` are `["https://my-quilty.com/auth/callback", "https://my-quilty.app/auth/callback"]` (per `var.federation_redirect_uri_allowlist`). These are the URLs Cognito will redirect the user-agent back to after the federation handshake completes — i.e., **what your BFF receives**.

The Hosted UI ↔ Google/Apple redirect step uses a different URL (`/oauth2/idpresponse`) which is invisible to the website BFF; it's purely Cognito ↔ IdP. **You only need to handle `/auth/callback` on your apex.**

### 1.2 New DDB entity: `FEDERATED_SESSION_TOKEN`

Per ADR 0063 (amended 2026-06-03) — `quilty-aws/docs/adr/0063-federated-session-token-storage.md`. Row shape:

```
PK = USER#{cognito_local_sub}
SK = FEDERATED_SESSION_TOKEN#{provider}    (provider ∈ {"google", "apple"})
provider              : string  (wire label)
encrypted_refresh_token: bytes (AES-256-GCM ciphertext)
encrypted_dek         : bytes  (KMS-encrypted DEK)
kms_key_id            : string (always the shared CMK ARN — not per-user)
encryption_context    : map    ({user_sub, provider})  — pinned at encrypt time
expires_at_epoch      : number (TTL — DDB auto-evicts)
last_used_at          : number
linked_at             : number
```

- **Single shared CMK** `alias/quilty-prod-federation-session-token` (Option B per ADR 0063 amend 2026-06-03; Option A per-user CMK rejected on cost grounds — $1M/month at 1M federated users vs $94/month for Option B).
- **Defense-in-depth:** AES-256-GCM at the application layer binds AAD to `{user_sub, provider}`; KMS `encryption_context` at the infrastructure layer binds the same pair. Either layer alone is sufficient; both layers must align for round-trip.
- **Crypto-shred semantic:** `DeleteItem` on the row is the operative crypto-shred (encrypted DEK + AES-GCM ciphertext only persist in that row; CMK is never deleted). Aligns with GDPR right-to-erasure + Apple App Store 5.1.1(v) account-delete.

**You will read FEDERATED_SESSION_TOKEN rows ONLY if your BFF implements the IdP-revoke cascade itself. Default architecture: don't.** The auth-user Lambda's `provider_unlink` handler does the cascade. Your BFF should call `DELETE /v1/auth/provider/unlink` and let auth-user handle FEDERATED_SESSION_TOKEN deletion, IdP revoke, and Quilty RT family revoke. See §5.4 below.

### 1.3 New handler: H-FED-008 `GET /v1/auth/me/identities`

ETag-cacheable for 60s. Returns:

```json
{
  "identities": [
    {
      "provider": "google",
      "linked_at": 1718000000,
      "last_used_at": 1718500000,
      "provider_email": "alice@gmail.com"
    },
    {
      "provider": "apple",
      "linked_at": 1718100000,
      "last_used_at": 1718600000,
      "provider_email": "relay-abc123@privaterelay.appleid.com"
    }
  ]
}
```

Auth header: standard JWT bearer. Rate-limit class: `MePerUser` (600 req/min Open). Cache headers: `Cache-Control: private, max-age=60, must-revalidate` + `ETag: <sha256>`. If you send `If-None-Match: <etag>` and the body hasn't changed, server returns 304.

**Use this endpoint on the `/account/security` page** to show the user their linked providers + raw provider emails (per D-201: user verifiability + match Stripe Dashboard pattern). The data is already encrypted at rest; the raw email is intentionally shown.

### 1.4 New EventBridge typed events (consumer surface for your BFF)

You may want to subscribe to these on your side (for analytics or user-facing notifications):

| EventType                   | Detail-type                                | Purpose                                                                                 |
| --------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `FederationLinked`          | `quilty.auth.federation.linked`            | First-time link of Google or Apple to a user account                                    |
| `FederationProviderRevoked` | `quilty.auth.federation.provider_revoked`  | provider_unlink cascade succeeded                                                       |
| `FederationSoftSevered`     | `quilty.auth.federation.soft_severed`      | W-024 multi-provider sever (Apple consent-revoked, other providers retained)            |
| `AppleHmeAutoRotated`       | `quilty.auth.federation.apple_hme_rotated` | Apple silent email rotation (SOCIAL_IDENTITY email_hash auto-updated; no SES per D-202) |
| `RiscCascadeExecuted`       | `quilty.auth.risc.cascade_executed`        | W-024 successfully processed a Google/Apple RISC SET                                    |

**Bus name:** `quilty-prod-auth-events` (production account). You will need cross-account `events:PutRule` from the development account → production bus to subscribe (the `website-baseline/` TF layer should vend the IAM grant).

### 1.5 Federation IdP-revoke crate

`lambdas/rust/crates/quilty-federation/` ships two helpers:

- `google_revoke(http, refresh_token)` → POST to `https://oauth2.googleapis.com/revoke` (form-urlencoded)
- `apple_revoke_with_client_assertion(http, key, team_id, service_id, key_id, refresh_token)` → mints ES256 JWT + POSTs to `https://appleid.apple.com/auth/revoke`

3x exponential backoff (2s, 4s, 8s) on 5xx. 400 ("token invalid / already revoked") falls through to `AdminDisableProviderForUser`. All retry attempts emit `federation_revoke_attempts_total{provider,attempt,outcome}` counter.

**Apple secret rotation:** Apple's private key rotates quarterly (Apple recommendation). The private key lives in Secrets Manager (`quilty/prod/apple/sign-in-private-key`) and is cached at Lambda cold-start. **You don't need to do anything for this** — it's an auth-platform operational ceremony.

### 1.6 W-024 cascade worker (`worker-risc-event-processor`)

Consumes Google + Apple RISC SETs from the EventBridge bus. Dispatches per Q-LOCKED-5 cascade table:

| Variant                                                           | Action                                                                  |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `SessionsRevoked` (Google)                                        | Revoke RT families for `auth_method = "federated:google"`               |
| `AccountDisabled` / `ConsentRevoked` (Apple, multi-provider user) | Soft-sever Apple link (preserve Google/password)                        |
| `AccountDisabled` / `ConsentRevoked` (Apple, sole-provider user)  | Schedule H-PRIVACY-007 hard-delete with 14-day grace per D-65           |
| `AccountPurged` (Apple)                                           | Schedule hard-delete (same as sole-provider consent-revoked)            |
| `AccountEnabled` (Apple)                                          | Audit-only                                                              |
| `CredentialChangeRequired`                                        | Set `AUTH_META.requires_step_up = true` → forced step-up at next signin |
| `Verification`                                                    | Health-check no-op                                                      |

**You should know this exists** because (a) a user who federation-revokes at Apple's side will lose their session within minutes (RISC SET → W-024 → RT family revoke), and (b) sole-provider users get a 14-day-grace hard-delete that emails them at the SES side (you do NOT send this email).

---

## 2. Critical-path deliverables YOU need to ship (in dependency order)

### 2.1 `quilty-aws/website-baseline/` Terraform layer (multi-day, you build it in `quilty-aws/`)

Your existing `docs/runbook/sst-deploy.md` already lists the prerequisite items. The list below is the auth-team's enriched view — **read it alongside the SST deploy runbook, not instead of**. Items marked **[AUTH-COORDINATED]** are seams where we need to align on the contract.

**Layer scope (development account `619758066987`):**

1. GitHub OIDC provider trust for `repo:<org>/quilty-website:ref:refs/heads/main` + `repo:<org>/quilty-website:pull_request`.
2. `quilty-website-deploy-dev` IAM role with permission boundary scoped to SST stage namespace.
3. `quilty-website-deploy-preview` IAM role (narrower preview-only permission boundary).
4. AWS WAF v2 Web ACL (managed rule groups: CommonRuleSet + KnownBadInputs + IpReputation + AmazonIpReputationList) associated with the CloudFront distribution via SST `transform.cdn` hook (Round-5 final-QA IaC C1).
5. SSM parameters consumed at SST deploy time:
   - `/quilty/website/hosted-zone-id` — `my-quilty.com` Route53 zone ID (cross-account replication from production OR manually entered)
   - `/quilty/website/waf-web-acl-arn` — output of step 4
   - `/quilty/website/kms-cmk-arn` — optional, for env-var encryption
   - **[AUTH-COORDINATED]** `/quilty/website/auth-config` — see §2.1.A below
6. **[AUTH-COORDINATED]** Cross-account `events:PutRule` grant: dev account → production `quilty-prod-auth-events` bus (only if you want to subscribe to FederationLinked/etc. typed events).

#### §2.1.A — `/quilty/website/auth-config` SSM parameter (NEW; auth-coordinated)

We recommend a structured JSON SSM SecureString that your BFF reads at cold-start. Shape:

```json
{
  "cognito_user_pool_id": "us-east-1_<id>",
  "cognito_region": "us-east-1",
  "cognito_hosted_ui_base": "https://quilty-prod.auth.us-east-1.amazoncognito.com",
  "cognito_hosted_ui_base_future": "https://auth.my-quilty.com",
  "cognito_app_client_id_web_bff": "<new client we will create per §2.5>",
  "auth_api_base": "https://api.my-quilty.app",
  "federation_redirect_uri_self": "https://my-quilty.com/auth/callback"
}
```

The BFF should use `cognito_hosted_ui_base_future` once `enable_custom_domain` flips. The simplest pattern: read both, prefer `_future` if reachable (HEAD `/.well-known/openid-configuration` with 200), else fall back to current. **Don't hardcode the URL in code; read it from SSM.**

**Why a separate Cognito app client for the web BFF (`cognito_app_client_id_web_bff`):** the `mobile_federation` client is the mobile-app client and has mobile-app callback URLs. The web BFF needs its own client with `https://my-quilty.com/auth/callback` (and `https://auth.my-quilty.com/...` if/when you change the BFF callback path). **We will create this client in `quilty-aws/auth/` when you're ready to deploy — see §5.1 for the spec.**

### 2.2 SST deploy from `quilty-website` (Phase 0, development account)

Your `docs/runbook/first-dev-deploy.md` covers this. Auth-side touchpoints:

- The SST stack's CloudFront distribution domain becomes the apex A-record ALIAS target in `quilty-aws/dns/`.
- **The SST app must NOT manage Route 53 records** (per U6 Pattern A: SST in dev account, DNS in prod account, manually coordinated). Confirm `sst.config.ts` does not call `aws.route53.Record(...)` against the `my-quilty.com` zone.
- **CSP nonce strategy for `/account/*`**: per D5 + D53, you ship CSP two-tier (marketing static hash, portal/auth nonce). The auth-callback at `/auth/callback` lives at the apex (not under `/account/*`) — confirm the CSP class for `/auth/callback` is the **nonce tier** (it executes inline script to set cookies + redirect; marketing-tier hash-CSP will block it).
- **Sentry stage tagging:** tag the SST stage in Sentry events (`environment: dev` for Phase 0). Auth-side Sentry events are tagged `environment: prod`. Don't cross the streams.

### 2.3 `quilty-aws/dns/` apex A-record PR (you coordinate, prod account)

After SST deploy succeeds and outputs the CloudFront distribution domain:

```hcl
# quilty-aws/dns/website_apex.tf (NEW)
resource "aws_route53_record" "website_apex_a" {
  zone_id = aws_route53_zone.com.zone_id
  name    = var.domain_com  # my-quilty.com
  type    = "A"
  alias {
    name                   = "<from SST output>.cloudfront.net"
    zone_id                = "Z2FDTNDATAQYW2"  # CloudFront global zone
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "website_apex_aaaa" {
  # IPv6 ALIAS — same target
}

resource "aws_route53_record" "website_www_cname" {
  # www.my-quilty.com → CloudFront
}
```

**This is the unblocker for Cognito custom-domain provisioning** — the apex A record is what Cognito's substrate check requires. As soon as this PR merges + applies, the next `terraform apply auth/` with `enable_custom_domain = true` will succeed.

### 2.4 `quilty-aws/auth/` re-apply with `enable_custom_domain = true` (we run this, after 2.3 lands)

One-line flip in `auth/secrets.auto.tfvars` (or `terraform.tfvars`):

```hcl
enable_custom_domain = true
```

Then `terraform apply auth/`. Cognito provisions the custom domain via CloudFront (15–60 minute propagation). `COGNITO_HOSTED_UI_URL` env var on `auth-user` + `auth-public` flips to `https://auth.my-quilty.com`.

**Smoke after apply:**

```bash
curl -sSL https://auth.my-quilty.com/.well-known/openid-configuration | jq .issuer
# Expected: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_<id>"
```

Apple + Google: **no action needed**. Both URLs were pre-allowed in the IdP consoles in step 2 of today's deploy ceremony.

### 2.5 BFF auth-callback implementation (M5, you build)

The existing `apps/web/app/api/auth/callback/route.ts` 501-stub is fine for M2. The real implementation is M5 work. **The contract spec is §5 below.** Do not implement until you've read §5 in full.

### 2.6 `/.well-known/openid-configuration` mirror on `auth.my-quilty.com` (your `cross-repo-dependencies.md` item 3)

Already documented on your side. Cognito auto-serves this; you just need to verify reachability + cache headers at custom-domain activation. **Add the verification step to your SST deploy runbook as a post-apply check.**

### 2.7 `/.well-known/change-password` mirror on `auth.my-quilty.com` (your `cross-repo-dependencies.md` item 2)

Already documented on your side. Lives in `quilty-aws/auth/`. We will ship this in a separate small PR before M-launch — file `D-AUTH-CHANGE-PASSWORD-WELLKNOWN` if not already filed.

---

## 3. The four hidden integration traps (each cost us QA time during W3-F)

These are the things you'd hit organically if we didn't tell you. We're telling you.

### 3.1 PKCE on the BFF auth-callback is MANDATORY (no fail-OPEN)

W3-F shipped PKCE S256 enforcement on the mobile `provider_link` flow as **fail-OPEN behind AppConfig flag `pkce_enforce` (default OFF)** — gated on mobile SDK updates per `D-W3F-FB1-PKCE-MOBILE-SDK-COORD`. **This fail-OPEN posture is intentional and temporary on the mobile side. It is NOT acceptable on the web BFF side from day 1.**

When the BFF auth-callback ships at M5:

- **MUST** generate a fresh `code_verifier` (43-128 char random) + compute `code_challenge = SHA256(code_verifier)` per request.
- **MUST** include `code_challenge` + `code_challenge_method=S256` in the authorize URL.
- **MUST** store `code_verifier` in the session-cookie-bound state until callback; verify at callback time.
- **MUST** reject the callback with HTTP 400 + `error=invalid_grant` if PKCE verification fails.
- **DO NOT** add a website-side fail-OPEN flag. The mobile-side flag exists because mobile clients ship SDK updates asynchronously; web BFFs do not have this problem.

**Why:** RFC 7636 §4 is the enterprise-standard defense against authorization-code interception. The BFF is server-side; there's no excuse to skip it.

### 3.2 The redirect-URI allowlist is exact-match, NOT prefix-match

Today's substrate hardcodes `var.federation_redirect_uri_allowlist = ["https://my-quilty.com/auth/callback", "https://my-quilty.app/auth/callback"]`.

If your BFF callback path ever moves (e.g., `/api/auth/callback` per current scaffold — which already differs from the allowlist's `/auth/callback`), the allowlist needs to be updated **before** the move. Otherwise Cognito will reject the redirect with `redirect_uri_mismatch`.

**Action:** confirm with us which callback path the BFF will use at M5 (`/auth/callback` apex-path vs `/api/auth/callback` API-route path). If different from the current allowlist, we update `var.federation_redirect_uri_allowlist` + the Cognito client's `callback_urls` in the same PR. **Do NOT add a prefix-match workaround on either side.**

Recommendation: use `/auth/callback` (matches the current allowlist; cleaner URL in OAuth consent prompts; the website strategy doc D6/D45 implies apex-path).

### 3.3 The BFF SHOULD NOT store IdP refresh tokens

`oauth-bootstrap` writes the FEDERATED_SESSION_TOKEN row at the Cognito side (TWI + encryption_context-bound). This row is the ONE place the federated refresh token lives. **Do not duplicate it on the BFF side.**

Why: (a) defense-in-depth crypto-shred semantic (one row delete → no recovery), (b) IAM least-privilege (your BFF should not have `kms:Decrypt` on the federation CMK), (c) the IdP-revoke cascade in `provider_unlink` already reads + decrypts + uses + deletes this row.

What the BFF SHOULD store:

- **Opaque session ID** (your D51 lock) — cryptographically random; reference to a DDB session record.
- **Cognito refresh token** (rotated per RFC 6749 — this is for the Cognito session, NOT the IdP session).
- Nothing else.

**Anti-pattern to avoid:** "I'll cache the Google refresh token in the user's session cookie so I can make Google API calls later." Don't. If the BFF needs to call Google's API on the user's behalf, use the Cognito-issued ID token + your own backend-to-Google service account. Federation is for **authentication**, not authorization-to-third-party-APIs.

### 3.4 `/me/identities` ETag MUST be respected client-side

H-FED-008 returns an ETag tied to the SHA-256 hash of the canonicalized response body. Your `/account/security` page should send `If-None-Match: <prior etag>` on revisit; server returns 304 if unchanged. Saves DDB read units + reduces tail latency.

Implementation guidance:

- Cache the ETag in browser `sessionStorage` (or your existing TanStack Query cache key).
- The server response carries `Cache-Control: private, max-age=60, must-revalidate` — respect `must-revalidate` (don't serve stale > 60s without revalidation).
- If you implement client-side polling (e.g., to detect a new link from another device), poll at ≥60s intervals + use `If-None-Match` to make most polls cheap.

---

## 4. Operational contracts you must respect

### 4.1 AppConfig kill switches (cross-handler, you must respect)

The auth-side fleet honors these AppConfig flags. The website BFF SHOULD also respect the ones marked **[BFF-RELEVANT]**.

| Flag                        | Default | Effect                                                              | BFF-relevant?                                                          |
| --------------------------- | ------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pkce_enforce`              | OFF     | Mobile `provider_link` fail-OPEN→CLOSED on missing PKCE             | NO — BFF must enforce regardless                                       |
| `federation_enabled`        | ON      | Master kill for `mobile_federation` client + `provider_link/unlink` | **YES** — if OFF, BFF should hide federation UI on signin/signup pages |
| `federation_google_enabled` | ON      | Provider-specific kill                                              | **YES** — hide Google button if OFF                                    |
| `federation_apple_enabled`  | ON      | Provider-specific kill                                              | **YES** — hide Apple button if OFF                                     |
| `me_identities_enabled`     | ON      | Master kill for H-FED-008                                           | **YES** — gracefully degrade `/account/security` if OFF                |

How to read AppConfig from the BFF: standard AWS SDK `AppConfigDataClient.getLatestConfiguration` with the application `quilty-auth` + environment `prod` + profile `kill-switches`. Cache at cold-start; refresh on a 30s timer (longer = staler kill; shorter = throttle risk).

**Why this matters:** when we ramp up federation post-launch, we may need to kill-switch a misbehaving IdP at sub-minute latency. If the BFF doesn't respect the flag, users see the button + click → 503 from Cognito (because the IdP got disabled at the user-pool level). UX regression. Respect the flag.

### 4.2 Rate-limit class allocation (BFF endpoints slot into auth-side taxonomy)

`quilty-auth-domain::rate_limit::classes` defines the canonical taxonomy. Existing classes you should map your BFF endpoints into:

| Class                  | Limit         | Use for                                                          |
| ---------------------- | ------------- | ---------------------------------------------------------------- |
| `MePerUser`            | 600/min Open  | `/api/auth/session`, `/api/auth/refresh`, `/me/*` reads          |
| `AuthSensitivePerIp`   | 30/min Closed | `/api/auth/callback` (federation completion)                     |
| `AuthSensitivePerUser` | 60/min Open   | post-callback authenticated routes                               |
| `OutboundEmailPerUser` | 5/min Closed  | transactional email triggers (don't bypass auth-user's SES path) |

**Anti-pattern:** "I'll just bypass the auth-user rate limits for my BFF's own callbacks." Don't. The rate limits exist to prevent enumeration attacks; bypassing them on the BFF side means the attack surface moves to your edge. Use the same classes.

**File a deferral if a BFF endpoint doesn't fit any existing class:** propose a new class, name it (`MePerUser` style), document the limit + justification, send a PR against `quilty-auth-domain::rate_limit::classes`.

### 4.3 Idempotency-Key header (Stripe pattern)

All POST/PUT/DELETE auth routes accept `Idempotency-Key: <client-generated UUIDv4>`. Replay-safe with 24h dedup window. **Your BFF SHOULD generate + forward this header for the callback exchange** to make the callback safely retryable on transient failure.

Pattern:

```typescript
const idempotencyKey = crypto.randomUUID();
const response = await fetch(`${authApiBase}/v1/auth/callback`, {
  method: 'POST',
  headers: {
    'Idempotency-Key': idempotencyKey,
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({ code, state, code_verifier }),
});
// Replay with the SAME Idempotency-Key on transient (5xx, network) failure.
```

The 24h dedup window catches accidental double-submits + duplicate-tab races without bothering the user.

### 4.4 Correlation ID propagation

Standard convention (W2-D D-67): every auth-side log line carries `x_trace_id`. Your BFF SHOULD:

1. Read `traceparent` header (W3C Trace Context) from the inbound request if present; else generate.
2. Forward as `traceparent` on the outbound call to `api.my-quilty.app`.
3. Tag Sentry events with the same trace ID (Sentry's built-in OTel integration handles this).
4. Log the trace ID at every structured log entry on your side.

Auth-side fleet uses `@vercel/otel` equivalent in Rust (`tracing` crate + `opentelemetry-otlp`). Honeycomb dataset: `quilty-prod-auth`. Sentry project: `quilty-auth-prod`. **Cross-stack trace correlation works automatically if you propagate `traceparent`.**

---

## 5. BFF auth-callback contract (the M5 deliverable spec)

This section is the contract for the BFF auth-callback implementation. **Read it in full before writing code.**

### 5.1 New Cognito app client (we create when you're ready)

When your BFF is ready to deploy, file `D-AUTH-WEB-BFF-COGNITO-CLIENT-PROVISION` and we'll add a new Cognito app client `web_bff` to `auth/auth_client.tf` with:

```hcl
resource "aws_cognito_user_pool_client" "web_bff" {
  name         = "web_bff"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret               = true   # BFF is confidential client — has a secret
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true
  enable_propagate_additional_user_context_data = true

  refresh_token_validity = 30
  access_token_validity  = 60
  id_token_validity      = 60
  token_validity_units {
    refresh_token = "days"
    access_token  = "minutes"
    id_token      = "minutes"
  }

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  allowed_oauth_flows_user_pool_client = true

  callback_urls = ["https://my-quilty.com/auth/callback"]
  logout_urls   = ["https://my-quilty.com/auth/signout"]
  supported_identity_providers = ["COGNITO", "Google", "SignInWithApple"]

  read_attributes  = ["email", "email_verified", "preferred_username"]
  write_attributes = ["email", "preferred_username"]
}
```

Client ID + secret will be exposed via:

- SSM `/quilty/auth/web-bff-client-id` (SecureString, cross-account readable from dev account)
- Secrets Manager `quilty/prod/auth/web-bff-client-secret`

**Action:** confirm the callback path (`/auth/callback` vs other) when filing the deferral. Confirm the logout path. Confirm whether you want `prompt=login` support (Managed Login feature) for re-auth scenarios.

### 5.2 Authorize URL construction

```typescript
function buildAuthorizeUrl(params: {
  state: string;
  codeChallenge: string;
  provider?: 'Google' | 'SignInWithApple';
}) {
  const url = new URL(`${authConfig.cognito_hosted_ui_base_future}/oauth2/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', authConfig.cognito_app_client_id_web_bff);
  url.searchParams.set('redirect_uri', 'https://my-quilty.com/auth/callback');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (params.provider) {
    url.searchParams.set('identity_provider', params.provider);
  }
  return url.toString();
}
```

**State token:** cryptographically random (≥128 bits), stored in a `__Host-quilty_state` cookie (HttpOnly, Secure, SameSite=Lax, Path=/, no Domain). Verified at callback; rejected if mismatched. Single-use (delete cookie on callback).

**`identity_provider` param:** include when the user clicks "Sign in with Google" or "Sign in with Apple" on a button (skips the Cognito Managed Login UI's IdP selection screen). Omit for "Sign in" flow that defaults to the Managed Login UI.

### 5.3 Callback handler logic

```typescript
// apps/web/app/auth/callback/route.ts (apex path /auth/callback)
export async function GET(req: Request) {
  // 1. Verify state cookie
  const stateCookie = req.cookies.get('__Host-quilty_state')?.value;
  const stateParam = new URL(req.url).searchParams.get('state');
  if (!stateCookie || !stateParam || !timingSafeEqual(stateCookie, stateParam)) {
    return errorResponse(400, 'invalid_state');
  }
  // (delete state cookie — single-use)

  // 2. Extract code + code_verifier
  const code = new URL(req.url).searchParams.get('code');
  const codeVerifier = req.cookies.get('__Host-quilty_cv')?.value;
  if (!code || !codeVerifier) return errorResponse(400, 'missing_code_or_verifier');

  // 3. Exchange code for tokens at Cognito's /oauth2/token endpoint
  //    (HTTP POST, basic auth = client_id:client_secret, form body)
  const tokenResponse = await exchangeCode({
    code,
    codeVerifier,
    redirectUri: 'https://my-quilty.com/auth/callback',
    clientId: authConfig.cognito_app_client_id_web_bff,
    clientSecret: await getClientSecret(), // from Secrets Manager (cached at cold-start)
  });
  // tokenResponse = { id_token, access_token, refresh_token, expires_in }

  // 4. Verify the ID token signature (Cognito's JWKS)
  //    Reject if iss/aud/exp/nonce don't match.
  const claims = await verifyCognitoIdToken(tokenResponse.id_token);

  // 5. Provision session — opaque session ID + DDB session record
  //    (your D51 lock: opaque ID; DynamoDB; KMS-encrypted at rest)
  const sessionId = await createSession({
    cognitoSub: claims.sub,
    cognitoRefreshToken: tokenResponse.refresh_token,
    expiresAt: Date.now() + tokenResponse.expires_in * 1000,
  });

  // 6. Set the session cookie
  const cookies = new Headers();
  cookies.append(
    'Set-Cookie',
    `__Host-quilty_sid=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${tokenResponse.expires_in}`,
  );
  cookies.append('Set-Cookie', `__Host-quilty_state=; Max-Age=0; Path=/`);
  cookies.append('Set-Cookie', `__Host-quilty_cv=; Max-Age=0; Path=/`);

  // 7. Redirect to the post-signin landing page (or the originally-requested URL captured in state)
  return Response.redirect('https://my-quilty.com/account', 303);
}
```

**Things to get right:**

- `__Host-` prefix on ALL session cookies (per D2). No `Domain=` attribute; forces same-origin.
- `SameSite=Lax` (not `Strict`) — `Strict` breaks the OAuth redirect chain (cross-site POST).
- The `state` cookie + the `state` URL param must use a **timing-safe** comparison. Don't `===`.
- The `code_verifier` cookie should be short-TTL (≤10 min) and Path-scoped to `/auth/callback`.
- Reject codes more than 5 minutes old (Cognito's authorization code TTL is 5 min; double-check before sending to `/oauth2/token`).

### 5.4 Provider-unlink delegation

When the user clicks "Unlink Google" or "Unlink Apple" on `/account/security`:

```typescript
// BFF route
export async function POST(req: Request, { params }: { params: { provider: string } }) {
  const sessionId = req.cookies.get('__Host-quilty_sid')?.value;
  if (!sessionId) return errorResponse(401, 'no_session');
  const session = await loadSession(sessionId);

  // Step-up if not in a fresh-auth window (D-W3F-FC2-TOCTOU mitigation already
  // landed in auth-user; this is a UX nicety, not a security requirement)
  if (Date.now() - session.lastStepUpAt > 5 * 60 * 1000) {
    return Response.redirect(buildStepUpUrl(req.url), 303);
  }

  // Delegate to auth-user — DO NOT call Google/Apple revoke yourself
  const response = await fetch(`${authConfig.auth_api_base}/v1/auth/provider/unlink`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${await mintAccessToken(session)}`,
      'Idempotency-Key': crypto.randomUUID(),
      'X-Provider': params.provider,
    },
  });
  // auth-user handles: IdP revoke → AdminDisableProviderForUser → RT family
  // revoke → FEDERATED_SESSION_TOKEN row delete → audit emit
  return response;
}
```

**Anti-patterns:**

- Calling Google's `/revoke` or Apple's `/auth/revoke` from the BFF.
- Mutating the FEDERATED_SESSION_TOKEN row from the BFF.
- Calling `AdminDisableProviderForUser` from the BFF.

Why: auth-user's `provider_unlink` handler is the ONLY place that knows the correct ordering (per RFC 7009 §2.1: IdP revoke FIRST, then Cognito disable, then local RT family revoke, all in a single TWI with audit emit). Bypassing it produces inconsistent state.

### 5.5 Backchannel-logout

`/api/auth/backchannel-logout` is already scaffolded on your side per D5. Auth-side will POST to it on:

- Account hard-delete (W3-G)
- Admin force-revoke
- W-024 cascade (Apple consent-revoked, sole-provider) → backchannel-logout broadcasts to all active sessions

JWT signed with the `quilty-prod-auth` signing key. Verify the JWT, look up the session by `sub` claim, invalidate it, return 200.

**Don't skip JWT signature verification.** A spoofed backchannel-logout could be used to DoS users.

---

## 6. Cross-account considerations + drift detection (we both need to think about this)

### 6.1 The U6 Pattern A "two-step PR dance" is operational risk

SST deploys to dev account 619758066987; `quilty-aws/dns/` writes apex records in prod account 975630231383. The coordination is manual: SST output → updated dns/ PR → reviewer approves → apply.

**What can go wrong:**

- SST stack rolls back AFTER `dns/` PR merges → apex points at non-existent CloudFront.
- `dns/` PR applies WITHOUT a corresponding SST deploy first → apex points at NXDOMAIN.
- Manual SST output copy-paste typo → wrong CloudFront target.

**Mitigations to land BEFORE first cutover:**

1. **CloudWatch synthetic canary** in production account that GETs `https://my-quilty.com/` every 5 min + alarms on non-200.
2. **Pre-deploy check** in `dns/` plan: `dig +short <cloudfront-target>` must return at least one IP. If it doesn't, the plan should fail.
3. **Drift detection** runbook: weekly `terraform plan dns/` in production account; alarm if apex A-record drifts.
4. **Rollback runbook:** the steps to point apex back at a placeholder (or remove the record) in <5 min if the SST stack is mid-failure. Document explicitly.

We can help draft (1)+(2)+(3) on the auth-platform side; (4) is yours.

### 6.2 Sentry stage isolation

Auth-side Sentry project: `quilty-auth-prod`, all events tagged `environment: prod`.
Website Sentry project: distinct (recommend `quilty-website-prod` once you cut over from dev).

**Anti-pattern:** sharing a single Sentry project across both. Quota gets noisy, on-call routing gets muddled, and the "PII never crosses environments" boundary blurs.

### 6.3 CloudWatch log forwarding

If you want cross-account log forwarding from dev → prod for SLO computation, you'd build it via CloudWatch Logs subscription filter → Kinesis Data Firehose → S3 in the production account. **Not required for M-launch**; flag as `D-WEBSITE-CROSS-ACCOUNT-LOG-FORWARDING` for later if SLO maturity demands it.

---

## 7. "No shortcuts" addenda — things NOT to simplify

This is the explicit list. Each item, we considered the shortcut and rejected it. **Do the proper thing.**

| Shortcut                                                         | Why we reject it                                                                                                            | What to do instead                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| "Skip PKCE on the web BFF"                                       | Server-side BFFs are not exempt from authorization-code interception (network-layer adversary, malicious browser extension) | Implement PKCE S256 from day 1 (§3.1)                                                         |
| "Use prefix-match on `federation_redirect_uri_allowlist`"        | Open-redirect vector; bypasses Auth0/PingIdentity recommended exact-match pattern                                           | Add the BFF callback URL to the allowlist before the BFF deploys (§3.2)                       |
| "Cache the IdP refresh token in a cookie"                        | Crypto-shred breaks; IAM least-privilege violation; threat model violation                                                  | Use opaque session ID + Cognito refresh token; never touch IdP refresh tokens from BFF (§3.3) |
| "Just hardcode `https://auth.my-quilty.com`"                     | Breaks dev/preview environments; breaks the pre-custom-domain test phase                                                    | Read from SSM `/quilty/website/auth-config` (§2.1.A)                                          |
| "Reuse the `mobile_federation` Cognito client for the web BFF"   | Different callback URLs; different IdP UX patterns; secret-rotation patterns differ                                         | Provision a dedicated `web_bff` client (§5.1)                                                 |
| "Skip the Idempotency-Key header on the callback exchange"       | Transient retries become double-spend (double session creation, double audit emit)                                          | Include Idempotency-Key on every POST/PUT/DELETE (§4.3)                                       |
| "Bypass the auth-side rate-limit classes for BFF-internal calls" | Enumeration-attack surface moves to your edge                                                                               | Use the existing class taxonomy; propose a new class if none fit (§4.2)                       |
| "Implement IdP revoke from the BFF directly"                     | Wrong RFC 7009 ordering; FEDERATED_SESSION_TOKEN state inconsistency; audit-emit gap                                        | Delegate to auth-user's `DELETE /v1/auth/provider/unlink` (§5.4)                              |
| "Ignore the AppConfig kill switches"                             | Loses sub-minute kill capability at production incident time                                                                | Read AppConfig at cold-start; 30s refresh timer; respect (§4.1)                               |
| "Skip ETag handling on `/me/identities`"                         | DDB read amplification at scale                                                                                             | Implement `If-None-Match` flow client-side (§3.4)                                             |
| "Skip JWT signature verification on backchannel-logout"          | Spoofed logout = DoS vector                                                                                                 | Verify against `quilty-prod-auth` signing key (§5.5)                                          |
| "Use a single shared Sentry project for website + auth"          | PII boundary blurring, quota noise, on-call routing                                                                         | Distinct projects; tag environment correctly (§6.2)                                           |
| "Manage the `my-quilty.com` apex record from SST"                | Violates U6 Pattern A; cross-account state confusion                                                                        | Apex record stays in `quilty-aws/dns/` (§2.2)                                                 |

---

## 8. Open questions we need YOU to answer

These are seams where we don't have a strong opinion and the website team's design decision drives ours.

1. **BFF auth-callback path:** `/auth/callback` (matches current `federation_redirect_uri_allowlist`) vs `/api/auth/callback` (matches current scaffold). We need to know before we provision the `web_bff` Cognito client. **Recommendation: `/auth/callback`** (cleaner OAuth consent prompts).

2. **Refresh strategy:** do you want a separate `/api/auth/refresh` BFF route that exchanges the Cognito refresh token for a new ID/access pair (then re-sets the session cookie), or do you want session continuity via the opaque session ID + server-side refresh? **Recommendation: opaque session + server-side refresh** (the BFF never exposes the Cognito refresh token to the client).

3. **`prompt=login` support:** Managed Login supports `prompt=login` to force re-auth. Want this for sensitive actions (account-delete, payment-method change)? **Recommendation: yes**; document the trigger UX.

4. **Identity selection UX:** when the user signs in, do you want a "Continue with Google" / "Continue with Apple" / "Continue with email" picker on your side, then redirect to Cognito with `identity_provider=Google/Apple` already set? Or punt to Cognito Managed Login's built-in picker? **Recommendation: your-side picker** (better UX, marketing brand consistency, lets you A/B test).

5. **Anonymous → federated upgrade:** if a user browses anonymously and then federates, do you carry their pre-auth state forward (e.g., a partial intake form, a session cart)? **Recommendation: yes** via a server-side guest-session bridge; document the contract before M5.

6. **MHMDA "sensitive action" gating:** the auth-side has a `requires_step_up` flag set on certain RISC SETs. Should the BFF check this on every `/account/*` route and force a step-up redirect if true? **Recommendation: yes, on `/account/security`, `/account/data`, `/account/delete`**.

File answers as inline replies to this doc + open a PR to amend.

---

## 9. Coordination touchpoints

- **Spec source of truth:** `quilty-aws/docs/auth/handlers/spec_cards/H-FED-*.md` for the federation handlers; `quilty-aws/docs/auth/DECISION_LOG.md` for the decision history; `quilty-aws/docs/auth/EVENT_TYPE_REGISTRY.md` for the typed events.
- **OpenAPI:** `quilty-aws/docs/auth/auth_v2_openapi.yaml` is the canonical OpenAPI. Generate your BFF's HTTP client types from this (the `@quilty/shared-types` package is the right target per your D26 OpenAPI codegen direction).
- **Cross-repo PR template:** when you open a PR that depends on an auth-side change, tag it with `cross-repo:auth` + link the auth-side PR. We'll mirror with `cross-repo:website`.
- **Escalation:** auth-platform Slack `#auth-platform` for non-urgent; `#auth-platform-oncall` for SEV2+.
- **Decision register inflation:** if a decision in this doc conflicts with one in your `docs/website_strategy_discussion.md`, file an `S-N` revision PR there + cite this doc.

---

## 10. Timeline (best estimate, no commitment)

| Milestone                                                      | Owner                              | Estimated wall-clock                                           |
| -------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| `quilty-aws/website-baseline/` TF layer scoped + built         | Website team (in `quilty-aws/`)    | 3–5 days                                                       |
| `quilty-aws/website-baseline/` review + apply                  | Joint                              | 1 day                                                          |
| First `pnpm sst deploy --stage dev`                            | Website team                       | 1 day (5 min apply + 15-60 min CloudFront propagation + debug) |
| `quilty-aws/dns/` apex A-record PR + apply                     | Joint (coordinated PR)             | 1 day                                                          |
| `quilty-aws/auth/` re-apply with `enable_custom_domain = true` | Auth team                          | 1 day (30-60 min Cognito provisioning + smoke)                 |
| `web_bff` Cognito client provision                             | Auth team (when website BFF ready) | 1 day                                                          |
| BFF auth-callback implementation (M5)                          | Website team                       | 5–8 days (real implementation, not stub)                       |
| Joint integration smoke (federation end-to-end via website)    | Joint                              | 1 day                                                          |

**Total: ~3 weeks of coordinated work, ~2 weeks of website-team's own engineering, with no shortcuts.**

We've front-loaded the substrate (today's W3-F deploy) so that NONE of this blocks the website team's own velocity. Your M3, M4, M5 internal work proceeds in parallel.

---

## 11. Source-of-truth artifacts (read these when in doubt)

### In `quilty-aws/`

- `docs/auth/W3F_VERIFICATION_REPORT.md` — wave-level closure report
- `docs/auth/W3F_LIVE_DEPLOY_VERIFICATION_2026-06-02.md` — live verification ledger
- `docs/auth/W3F_PRE_DEPLOY_AUDIT_2026-06-03.md` — pre-deploy audit + Track A fixes record
- `docs/auth/DECISION_LOG.md` — all D-200 through D-207 + W3-F amendments
- `docs/auth/EVENT_TYPE_REGISTRY.md` — typed event taxonomy
- `docs/auth/handlers/spec_cards/H-FED-*.md` — per-handler contracts
- `docs/adr/0063-federated-session-token-storage.md` — Option B amendment + cost analysis
- `docs/adr/0064-apple-hme-rotation-silent-update.md` — Apple HME silent-update policy
- `auth/kms_federation.tf` — single shared CMK + key policy (with `Null` guard)
- `auth/dns.tf` — Cognito custom-domain substrate
- `auth/variables.tf` — `enable_custom_domain` + `federation_redirect_uri_allowlist`
- `lambdas/rust/crates/quilty-federation/` — IdP-revoke helper
- `lambdas/rust/crates/quilty-persistence/src/ddb/federated_session.rs` — FEDERATED_SESSION_TOKEN row mgmt
- `lambdas/rust/crates/auth-user/src/routes/me_identities/` — H-FED-008 handler
- `lambdas/rust/crates/worker-risc-event-processor/` — W-024 cascade dispatch
- `docs/auth/DEFERRED_FOLLOWUPS.md` — every W3-F deferral with trigger conditions

### In `quilty-website/`

- `docs/runbook/cross-repo-dependencies.md` — what YOU ship that auth depends on (mirror of this doc, inverse)
- `docs/runbook/first-dev-deploy.md` — one-time SST activation
- `docs/runbook/sst-deploy.md` — ongoing SST operation
- `docs/website_strategy_discussion.md` — locked decisions D1–D175 + U1–U10
- `apps/web/app/api/auth/callback/route.ts` — current 501-stub (becomes the M5 implementation per §5)
- `sst.config.ts` — the SST stack definition (read the comments)
- `.github/workflows/deploy.yml` — CI/CD pipeline (gated on `DEPLOY_ENABLED`)

---

## 12. Changelog

| Date       | Author               | Change                                                                                  |
| ---------- | -------------------- | --------------------------------------------------------------------------------------- |
| 2026-06-03 | quilty-aws auth team | Initial handoff doc — W3-F substrate live; custom-domain flip deferred; BFF spec for M5 |

When this doc is revised, append to the changelog + bump the date in the front-matter. When the BFF auth-callback ships at M5, mark this doc as "Phase 1 complete" + open a Phase 2 successor for ongoing-ops handoff.

---

**End of doc.** Questions → `#auth-platform` Slack or inline-reply PR.
