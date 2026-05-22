# Cross-repo dependencies runbook

> **Scope:** deliverables that complete the website crawler / credential-manager / federated-auth surface but cannot ship from this repo. Each item belongs to another repo in the Quilty fleet — usually `quilty-aws/` — and has a defined activation window.
> **Audience:** web platform + infra platform + the auth-integration coordinator.
> **Spec references inline per item.**

## Why this runbook exists

The website's `.well-known/` surface (security.txt, change-password, gpc.json, traffic-advice, apple-app-site-association, assetlinks.json, manifest, robots.txt) is the apex-host responsibility. Three sibling surfaces complete the picture for an enterprise consumer-health product:

1. **MTA-STS + TLS-RPT** on `mta-sts.my-quilty.com` — transactional-email transport integrity per RFC 8461.
2. **`/.well-known/change-password`** on `auth.my-quilty.com` — credential-manager parity at the OIDC auth subdomain (the apex redirect is shipped; the subdomain mirror is not).
3. **`/.well-known/openid-configuration`** reachability on `auth.my-quilty.com` — Cognito auto-serves this; the deploy gate confirms cache + reachability before federated clients depend on it.

Each item below names the owning repo, the activation window, the verification step, and the rollback procedure.

---

## 1. MTA-STS + TLS-RPT on `mta-sts.my-quilty.com`

**Owner:** the DNS TXT records belong in `quilty-aws/dns/` (which is DNS-only — Route 53 hosted zone + records + the wildcard ACM cert). The `mta-sts.my-quilty.com` HTTPS endpoint itself requires NEW infrastructure that does not exist in the `dns/` layer today — either an extension of `dns/` with a CloudFront + S3 stack, or a new `mta-sts/` layer, or a CloudFront Function on the existing apex distribution. Scope this as a 2-PR change against `quilty-aws/`: (1) provision the CloudFront + S3 stack; (2) publish the TXT records pointing at it.
**Activation gate:** before the first production transactional email leaves `noreply@my-quilty.com` or `security@my-quilty.com`.
**Specs:** RFC 8461 (MTA-STS), RFC 8460 (SMTP TLS Reporting).

### What ships

- A new public subdomain `mta-sts.my-quilty.com` — **infrastructure to be created** (CloudFront → hardened S3 bucket, OR a CloudFront Function that emits the static body inline). Serves `/.well-known/mta-sts.txt`:
  ```
  version: STSv1
  mode: enforce
  mx: feedback-smtp.us-east-1.amazonses.com
  mx: feedback-smtp.us-east-2.amazonses.com
  max_age: 86400
  ```
- DNS TXT record at `_mta-sts.my-quilty.com` pointing to the current policy ID:
  ```
  v=STSv1; id=20260521T120000Z;
  ```
- DNS TXT record at `_smtp._tls.my-quilty.com` for TLS-RPT:
  ```
  v=TLSRPTv1; rua=mailto:tlsrpt@my-quilty.com
  ```

### Activation prerequisite: `tlsrpt@my-quilty.com` mailbox

The TLS-RPT `rua` directive directs receivers to send daily TLS-handshake-failure reports to the named mailbox. The audit-loop HIPAA-alignment claim in the next section holds only if the mailbox is provisioned + monitored before the `_smtp._tls` TXT record is published. Provision the inbox via the managed-mailbox provider (M365 today per `docs/runbook/baa-inventory.md`; cross-repo provisioning under `quilty-m365/`), assign an owner on the security on-call rotation, and verify a test report parses cleanly. **Until the mailbox exists, omit the `rua=` directive from the TXT record** — `v=TLSRPTv1` alone is valid per RFC 8460 and avoids the silent-discard window.

### Why a separate subdomain

MTA-STS policy files MUST be served from `mta-sts.<recipient-domain>` per RFC 8461 §3.2 — the receiving SMTP server fetches `https://mta-sts.example.com/.well-known/mta-sts.txt` to authenticate the policy. Serving the file from the apex would be ignored.

### HIPAA-alignment rationale

Transactional emails to and from `my-quilty.com` carry account-related but non-PHI material (account-creation confirmation, security-alert notifications). RFC 8461 enforces TLS on every hop, eliminating opportunistic-TLS downgrade attacks. RFC 8460 (TLS-RPT) gives our security team daily reports on TLS-handshake failures — the failure signal that closes the audit loop on the BAA-scoped email transport.

### Verification

1. `dig +short TXT _mta-sts.my-quilty.com` returns the policy ID record.
2. `dig +short TXT _smtp._tls.my-quilty.com` returns the TLS-RPT record with the `rua` mailto.
3. `curl -I https://mta-sts.my-quilty.com/.well-known/mta-sts.txt` returns 200 + `Content-Type: text/plain`.
4. Run the Hardenize public checker at `https://www.hardenize.com/report/my-quilty.com/` — every MTA-STS row should be green.

### Rollback

If a misconfigured policy starts bouncing legitimate mail (symptoms: SES sends reach the queue but recipient bounces with `STS validation failed`):

1. Update the TXT record `_mta-sts.my-quilty.com` to `v=STSv1; id=<new-id>;` AND change the policy file's `mode` to `testing` (RFC 8461 testing mode logs but does not enforce).
2. Wait 24h for the prior policy's `max_age` window to expire on receiver caches.
3. Investigate via the TLS-RPT reports landing at `tlsrpt@my-quilty.com`.

---

## 2. `/.well-known/change-password` on `auth.my-quilty.com`

**Owner:** `quilty-aws/auth/` (the prod-account Cognito + Cognito-Managed-Login Terraform layer).
**Activation gate:** at the Cognito Managed Login custom-domain activation (`auth.my-quilty.com`) — same deploy that wires the OIDC client.
**Spec:** W3C webappsec-change-password-url.

### What ships

The `auth.my-quilty.com` host serves a 302 redirect from `/.well-known/change-password` to the actual change-password destination on that host. The apex `my-quilty.com/.well-known/change-password` is already shipped (302 → `/en/account/security`). The auth-subdomain mirror closes the gap for password managers that fetch the well-known URL on the OIDC auth host (1Password's recommended pattern; Apple Passwords + Bitwarden behave the same way).

### Why a sibling redirect

Credential managers fetch the well-known URL on the host where the credential is bound. A user with a saved credential for `auth.my-quilty.com` (where Cognito Managed Login renders) will issue the change-password discovery fetch against that subdomain, not the apex. Without the subdomain mirror the credential manager falls back to "no change-password URL discovered" and surfaces a generic warning.

### Implementation note

Cognito Managed Login does not natively serve `.well-known/` files. The CloudFront distribution Cognito provisions under `aws_cognito_user_pool_domain.custom` is AWS-managed — its ARN is surfaced as a Terraform output but the distribution itself cannot be modified by `aws_cloudfront_function` or Lambda@Edge association. Approaches that depend on owning that distribution are infeasible.

Operationally feasible patterns (pick one at activation):

- **S3-endpoint pattern (preferred):** stand up a small CloudFront + S3 stack under a parallel hostname (e.g. `auth-wellknown.my-quilty.com`) that serves only the `/.well-known/*` paths, then route `https://auth.my-quilty.com/.well-known/change-password` to it via DNS + CloudFront behaviors on a customer-owned distribution that fronts both Cognito and the S3 origin. This adds one CloudFront distribution + one S3 bucket to `quilty-aws/auth/`.
- **Double-distribution pattern:** introduce a customer-owned CloudFront distribution as the entry point for `auth.my-quilty.com` with Cognito's distribution as origin for everything other than `/.well-known/change-password` (which a CloudFront Function on the customer distribution redirects to the change-password destination). This conflicts with the existing Cognito custom-domain ALIAS in `quilty-aws/auth/dns.tf` and would require a coordinated DNS cut-over.

The destination URL: typically `https://auth.my-quilty.com/login?...&action=change-password` (Cognito's Managed Login deep-link form). Final URL form locks at the Cognito custom-domain activation when the Managed Login config is fully baked. Approach selection is a `quilty-aws/auth/` decision at activation time; this runbook documents the constraint set, not the final pick.

### Verification

1. `curl -I -o /dev/null -w "%{http_code} %{redirect_url}" https://auth.my-quilty.com/.well-known/change-password` returns `302 <change-password-deeplink>`.
2. The redirect carries `Cache-Control: no-store` (same rationale as the apex — password managers must always re-evaluate the current pointer).
3. The destination URL resolves (no 404).
4. Test in 1Password / Bitwarden — open the saved credential, click "Change password," confirm the manager opens the right Cognito flow.

### Rollback

If the deep-link form changes after credential managers have cached the redirect: the `Cache-Control: no-store` header eliminates the cache so corrections propagate immediately. Update the destination URL in the CloudFront Function and redeploy.

---

## 3. `/.well-known/openid-configuration` reachability on `auth.my-quilty.com`

**Owner:** `quilty-aws/auth/` — specifically the `auth-discovery` Rust Lambda (`quilty-aws/auth/discovery.tf`) fronted by API Gateway, NOT a native Cognito endpoint. The Cognito custom domain (`auth.my-quilty.com`) serves the Managed Login UI; it does not guarantee the discovery document under the branded issuer URL. The Lambda exists precisely to expose the discovery document at the branded `ISSUER_URL=https://auth.my-quilty.com` so federated OIDC clients see one issuer URL across discovery + token + userinfo.
**Activation gate:** at the Cognito custom-domain activation (same deploy as item 2).
**Spec:** OpenID Connect Discovery 1.0.

### What's served

The `auth-discovery` Lambda serves an OIDC discovery document at `https://auth.my-quilty.com/.well-known/openid-configuration` (and the matching `/.well-known/jwks.json`) via API Gateway + CloudFront. Contents include:

- `issuer`: `https://cognito-idp.<region>.amazonaws.com/<user-pool-id>`
- `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `revocation_endpoint`, `jwks_uri`
- Supported response types, scopes, claims, code challenge methods (PKCE)

**No website-repo code change is needed.** The runbook owns the **verification** that the discovery document is reachable, has the expected issuer URL, and is correctly cached at the CDN edge before federated clients (mobile app, third-party OAuth flows) depend on it.

### Verification

1. `curl https://auth.my-quilty.com/.well-known/openid-configuration | jq .issuer` returns the Cognito user-pool URL.
2. `jq '.authorization_endpoint, .token_endpoint, .userinfo_endpoint, .revocation_endpoint, .jwks_uri'` returns the five core endpoint URLs (every endpoint a federated OIDC client needs to drive an authorization-code-with-PKCE flow + token introspection + revocation).
3. `curl -I` confirms Cognito serves the file with `Content-Type: application/json` and a reasonable `Cache-Control` (Cognito's default).
4. Cross-check `jq .response_types_supported` includes `code` (authorization-code-flow per D5/D7).
5. Cross-check `jq .code_challenge_methods_supported` includes `S256` (PKCE).
6. Run the OpenID Foundation's certified-OP discovery validator at `https://openid.net/developers/certified-openid-connect-implementations/` to confirm Cognito's exact response shape matches the spec.

### Rollback

The `auth-discovery` Lambda ships the file deterministically; the "rollback" question is what to investigate if a downstream client cannot reach the endpoint. Order:

1. DNS resolution for `auth.my-quilty.com` (Route 53 ALIAS).
2. The `auth-discovery` Lambda is deployed + its API Gateway route is wired + the CloudFront distribution fronting it is `Deployed`.
3. The Cognito custom domain is in `ACTIVE` state (the Managed Login surface is separate but the issuer URL claim depends on the custom-domain being live).
4. The ACM certificate covering `auth.my-quilty.com` is valid.

---

## Cross-references

- Apex `change-password` redirect ships in this repo at `apps/web/proxy.ts` (intercepts `/.well-known/change-password`, redirects to `/en/account/security` with `Cache-Control: no-store`).
- Apex security.txt + gpc.json + traffic-advice + manifest + robots.txt all live in this repo's `apps/web/public/.well-known/` + the Route Handler under `apps/web/app/api/robots/route.ts`.
- HSTS preload submission is the partner gate to MTA-STS — see `docs/runbook/hsts-preload-gate.md`.
- Deeplink manifests (AASA + assetlinks) live in this repo per `docs/runbook/deeplink-manifests.md`.
