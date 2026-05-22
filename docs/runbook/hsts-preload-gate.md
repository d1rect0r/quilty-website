# HSTS preload submission gate

> **Audience:** infra platform + web platform; submission is a deliberate post-launch action with multi-month rollback latency.
> **Decision reference:** D60 (HSTS phased ramp `scaffold` → `short-ramp` → `medium-ramp` → `long-ramp` → `preload`).
> **Spec references:** RFC 6797 (HSTS), Chromium HSTS Preload List policy.

## Why this is its own runbook

HSTS preload submission is **irreversible on a meaningful timescale**. Once `my-quilty.com` lands on the Chromium HSTS preload list, removal takes **6–12 months** in browser-version-shipping cycles AND requires shipping a `Strict-Transport-Security: max-age=0` policy at the origin for the entire intervening window so that previously-visited browsers age out the preloaded entry. Any deploy mistake on a preloaded domain — accidentally serving over HTTP, accidentally serving an expired cert on a never-used subdomain — locks every prior-visitor's browser into a hard-fail state for the same 6–12 month duration.

For comparison, every other security-header gate in this codebase is reversible within a single deploy cycle. HSTS preload is the only one-way door.

This runbook is the pre-flight checklist. Submitting the domain is a separate, explicit action that consumes the runbook.

## The 5-tier ramp (D60 + Chromium policy)

The Chromium policy at `https://chromium.googlesource.com/chromium/hstspreload` requires the apex AND every subdomain under `includeSubDomains` to serve `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` for at least 1 production deploy cycle before submission. Quilty's ramp:

| Tier          | Emitted header value                           | When                                                        |
| ------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| `scaffold`    | `max-age=300`                                  | Scaffold phase — sub-5-minute rollback window               |
| `short-ramp`  | `max-age=86400`                                | First marketing-page content lands (1 day)                  |
| `medium-ramp` | `max-age=604800`                               | After 30 days clean at `short-ramp` (1 week)                |
| `long-ramp`   | `max-age=31536000; includeSubDomains`          | After 60 days clean at `medium-ramp` (1 year)               |
| `preload`     | `max-age=63072000; includeSubDomains; preload` | After 30 days clean at `long-ramp` + this gate is satisfied |

The phase value lives in env-var `HSTS_PHASE` (consumed by `buildHstsValue()` + `currentHstsPhase()` at `packages/security/src/domain/headers-builder.ts`; the resolved string is stamped on every response by `buildSecurityHeaders()` and applied via the `applySecurityHeaders()` wrapper in `apps/web/proxy.ts`). Tier flips happen in single env-var deploys, NOT code edits.

`includeSubDomains` first appears at the `long-ramp` tier — which is also when the subdomain HSTS coverage check (section 2 below) becomes mandatory rather than informational. The Chromium reviewer requires `includeSubDomains` to have been emitted in production before the preload directive is added.

## Pre-submission checklist

Every item in this checklist must be confirmed in writing (Slack thread or PR description is sufficient) before the actual submission action at `https://hstspreload.org/`.

### 1. HSTS phase is `long-ramp` for ≥ 30 days

Confirm `HSTS_PHASE=long-ramp` has been the deployed value across the apex + all subdomains for at least 30 consecutive days. The Chromium policy requires "at least the maximum age that you intend to be preloaded" — preload is `max-age=63072000` (2 years), but in practice the policy reviewer accepts a 30-day clean window at `long-ramp` (1 year) as sufficient evidence.

### 2. Every subdomain serves HSTS

Run the script (or one-liner) against every subdomain bound to `my-quilty.com`:

```bash
for host in my-quilty.com www.my-quilty.com auth.my-quilty.com mta-sts.my-quilty.com help.my-quilty.com app.my-quilty.com; do
  echo -n "$host: "
  curl -s -I "https://$host/" | grep -i strict-transport-security
done
```

Every line must return a `Strict-Transport-Security: max-age=…; includeSubDomains` header. **A subdomain that does not serve HSTS will fail the preload reviewer.**

Subdomains currently in scope:

- `my-quilty.com` (apex — website Lambda)
- `www.my-quilty.com` (redirect to apex)
- `auth.my-quilty.com` (Cognito Managed Login — D6)
- `mta-sts.my-quilty.com` (RFC 8461 — see `cross-repo-dependencies.md`)
- `help.my-quilty.com` (reserved; activate before submission)
- `app.my-quilty.com` (reserved; activate before submission)

A subdomain reserved but not yet serving traffic still needs HTTPS + HSTS. If a placeholder DNS record points at a CloudFront distribution returning 404, the distribution must still carry HSTS on its response headers. **`help.my-quilty.com` + `app.my-quilty.com` are reserved DNS-only today — no CloudFront distribution exists yet.** Before HSTS preload submission each reserved subdomain needs (a) a Route 53 ALIAS record, (b) a CloudFront distribution (even a minimal one returning 404), and (c) the distribution's response-headers policy set to emit `Strict-Transport-Security: max-age=…; includeSubDomains`. Owning layer: `quilty-aws/dns/` for the Route 53 record; the placeholder CloudFront distribution can live in `quilty-aws/dns/` or a new minimal layer at activation time.

### 3. HTTPS-only on every redirect chain

`curl -sIL http://my-quilty.com/` must produce a 301 → `https://my-quilty.com/...` redirect, never a 200 over HTTP. Repeat for every subdomain. The Chromium reviewer fetches every URL in the checklist and rejects submissions where any HTTPS upgrade is missing.

### 4. ACM certificate validity ≥ 30 days remaining

The HSTS preload entry is bound to the cert. If a cert expires within 30 days of submission AND the renewal fails for any reason, every prior visitor's browser hard-fails for the full preload window. Confirm:

```bash
for host in my-quilty.com www.my-quilty.com auth.my-quilty.com mta-sts.my-quilty.com help.my-quilty.com app.my-quilty.com; do
  echo -n "$host: "
  echo | openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null | openssl x509 -noout -dates
done
```

Every `notAfter` must be > 30 days from today. ACM auto-renews 60 days before expiry, but the gate is independent of the auto-renew schedule.

### 5. CAA records permit the issuer

```bash
dig +short CAA my-quilty.com
```

Confirm AT LEAST one issuer is permitted (Amazon for ACM, Let's Encrypt for the AWS-issued public cert path, etc.). An empty or restrictive CAA record will fail future cert renewals AFTER preload submission, which is the unrecoverable scenario.

### 6. hstspreload.org validator passes

`https://hstspreload.org/?domain=my-quilty.com` must return all-green. This is the live validator the Chromium reviewer uses — if it does not show "Eligible for preload," do not submit.

### 7. Submission is logged

Open a tracking issue in the internal infra board (or the repo's GitHub issues) recording:

- Submission date
- The exact `Strict-Transport-Security` header value at submission time
- The subdomain list submitted with `includeSubDomains`
- The reviewer-acknowledgement timestamp

This is the audit trail for the 6–12 month commitment.

## The submission action

```
1. Visit https://hstspreload.org
2. Enter "my-quilty.com" (apex form)
3. Tick: "max-age >= 18 weeks", "includeSubDomains", "preload directive sent"
4. Submit
5. Chromium reviewer responds within 1–2 weeks
6. The domain ships in the next Chromium / Firefox / Safari preload list update
```

## Rollback procedure (theoretical)

If a post-submission deploy mistake bricks production for visitors with cached preload entries:

1. **Immediate**: roll back the deploy that caused the breakage. The preload is irrelevant if the underlying configuration is restored.
2. **If the breakage cannot be reversed at origin** (e.g., a permanently-lost subdomain): submit a removal request via `https://hstspreload.org/removal/` AND ship `Strict-Transport-Security: max-age=0` on every still-serving surface. **The removal request takes 6–12 months to ship through browser-release cycles.** Visitors whose browsers cached the preload entry continue to hard-fail until that release ships AND those visitors revisit the site (so that the `max-age=0` is recorded by the browser).
3. Communicate the breakage scope to users via every non-website channel (mobile app push notifications, transactional email, SMS) — these are the only paths still working.

The above is the worst case. The point of this runbook is that it never happens. **Treat the submission action with the same operational care as an irreversible production database migration.**

## Cross-references

- D60 — HSTS phased ramp decision.
- `docs/runbook/cross-repo-dependencies.md` — MTA-STS is the partner control that must light up before email transit can be HSTS-equivalently hardened.
- `packages/security/src/domain/headers-builder.ts` — `buildHstsValue()` + `currentHstsPhase()` + `buildSecurityHeaders()`: the exported HSTS_PHASE consumption + emission path.
- `apps/web/proxy.ts` — `applySecurityHeaders()` is the file-internal wrapper that stamps the `buildSecurityHeaders()` baseline onto every response.
