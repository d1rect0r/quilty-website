# Disaster Recovery Runbook — website (SST 4.x / OpenNext on AWS)

> **Audience:** infra platform + web platform on-call.
> **Scope:** recovery from a full-stack LOSS event for the SST-deployed website
> (CloudFront + SSR Lambda + S3 + the Pulumi state that manages them). For
> reverting a bad DEPLOY use [`rollback.md`](./rollback.md).
> **Strategy:** the website tier is **stateless and reproducible from Git +
> IaC** — recovery is "rebuild from code," not "restore data." The DR surface
> is the small set of NON-reproducible artifacts in §3.

|                  |                                                   |
| ---------------- | ------------------------------------------------- |
| **Owner**        | infra platform on-call                            |
| **Last updated** | 2026-06-19                                        |
| **Last tested**  | never (run GameDay scenario 1 before launch — §7) |
| **Version**      | 1.0                                               |

## 1. Strategy & RTO/RPO

DR posture per AWS Well-Architected: **Backup & Restore**, trending to Pilot
Light as traffic grows. Compute (CloudFront, Lambda) is serverless + multi-AZ;
every resource is declared in `sst.config.ts` and redeployable via
`sst deploy`. No PHI and no first-party user database live in this tier
(D31 / ADR-0027), so there is little "data" to lose (near-zero RPO by design).

| Phase                                       | RTO       | RPO    | Strategy                                 |
| ------------------------------------------- | --------- | ------ | ---------------------------------------- |
| Phase 0 (pre-launch, `development` account) | 48h       | 24h    | Backup & Restore from Git + state backup |
| Launched (early)                            | 2h        | 1h     | Backup & Restore + verified state backup |
| Growth                                      | 30–60 min | 15 min | Pilot Light; runbook-driven              |

BIA rationale: Phase 0 is pre-revenue and pre-launch — prolonged downtime has
no direct customer or revenue impact, hence relaxed targets. Tighten at launch
(downtime affects acquisition + brand) and again at revenue. Revise per phase.

## 2. DR scenarios (trigger → procedure)

| Scenario                                        | Trigger                                                        | Procedure                      |
| ----------------------------------------------- | -------------------------------------------------------------- | ------------------------------ |
| AWS region impairment                           | AWS Health shows us-east-1 impaired; site unreachable > 15 min | §4A                            |
| Pulumi/SST state lost or corrupt                | `sst deploy` fails "state not found" / passphrase error        | §4B                            |
| State **passphrase** lost                       | state undecryptable; secrets in state unrecoverable            | §4B (note)                     |
| GitHub Actions secrets/vars lost or compromised | CI deploy fails auth; rotation required                        | §4C                            |
| State S3 bucket deleted                         | state export fails; bucket missing                             | §4B + §4D                      |
| **State locked** (stale lock)                   | `sst deploy` fails "state is locked" / lock timeout            | §4E                            |
| Total loss (account / all state)                | nothing deployable; resources orphaned                         | §4D                            |
| Single-deploy regression                        | (not a DR event)                                               | [`rollback.md`](./rollback.md) |

## 3. Non-reproducible state inventory (the actual DR surface)

Everything else rebuilds from `git` + `pnpm sst deploy`. These do NOT:

| Artifact                    | Where                                       | Why non-reproducible                                                               | Backup / recovery                                                                        |
| --------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| SST/Pulumi **state**        | `sst-state-*` S3 bucket (website account)   | Maps resource URNs/IDs; loss => reconcile or recreate (new IDs)                    | S3 versioning ON; periodic `sst state export` to a separate bucket                       |
| SST/Pulumi **passphrase**   | SSM SecureString (set by SST)               | **Irreversible** — without it state is undecryptable                               | **Back up to 1Password (`quilty-1password`) — REQUIRED.** Record the SSM path in §Annex  |
| GitHub Actions secrets      | repo / env (`production`, `preview`)        | `AWS_DEPLOY_ROLE_ARN_DEV/_PREVIEW`, `SENTRY_AUTH_TOKEN`, `QUILTY_PSEUDONYM_PEPPER` | Source of truth in `quilty-aws/website-baseline/` (roles) + AWS Secrets Manager (pepper) |
| GitHub Actions vars         | repo / env                                  | `WAF_WEB_ACL_ARN`, `NEXT_PUBLIC_SENTRY_DSN`, `SITE_FORCE_NOINDEX`                  | Re-derivable from SSM (`/quilty/website/*`) + Sentry                                     |
| `QUILTY_PSEUDONYM_PEPPER`   | AWS Secrets Manager (vended by quilty-aws)  | log-side HMAC salt; rotating it re-keys pseudonyms                                 | Owned by `quilty-aws/website-baseline/`; never in this repo                              |
| CloudFront distribution ID  | CloudFront (recreated by deploy)            | a recreated dist = new ID + DNS propagation delay                                  | Record current ID in §Annex; DNS alias updated via `quilty-aws/dns/` (Pattern A)         |
| ACM cert (`my-quilty.com`)  | ACM **us-east-1** (CloudFront requirement)  | recreatable but needs DNS validation again                                         | DNS validation records persist in `quilty-aws/dns/`; cert auto-renews                    |
| `my-quilty.com` hosted zone | Route 53 in the **quilty-aws prod account** | not owned by this repo                                                             | DR owned by `quilty-aws`; this tier only consumes it (cross-account access — §Annex)     |

## 4. Recovery procedures

### 4A — Region impairment / full redeploy from Git

1. Declare the incident; assign IC + comms.
2. Confirm scope at the AWS Health Dashboard — is it regional?
3. Short regional event (< RTO): monitor and wait — serverless + CloudFront
   recover automatically; don't add risk.
4. If recovery is needed, redeploy from the last known-good SHA per
   [`sst-deploy.md`](./sst-deploy.md): restore the passphrase if needed (§4B),
   then `pnpm sst deploy --stage dev`.
5. **ACM is regional:** the cert MUST be in `us-east-1` for CloudFront. If the
   cert/distribution was recreated, re-add the DNS validation CNAME via
   `quilty-aws/dns/` before CloudFront can serve HTTPS.
6. If the distribution was recreated (new ID), update the apex/www alias via
   `quilty-aws/dns/` (Pattern A two-step) and wait for propagation.
7. Verify (§5).
8. **Fail-back:** once the primary region recovers, re-run a normal deploy and
   re-point DNS to the primary distribution; re-verify (§5). Decommission any
   temporary DR resources.

> Multi-region active-active is out of scope (Track 4) — not justified at DTC
> Phase 0–1 traffic.

### 4B — State / passphrase recovery

SST 4.x has no `state import`. Recovery uses `sst state repair` (reconcile a
corrupt state), `sst refresh` (reconcile state against live AWS), and
S3 object-version restore of the versioned `sst-state-*` bucket.

1. Passphrase intact (state corrupt/lost): try `pnpm sst state repair` then
   `pnpm sst refresh --stage dev`; if needed, restore the prior state object
   from the versioned `sst-state-*` bucket (`aws s3api list-object-versions` →
   restore last-good) and `sst refresh`. Always `pnpm sst diff --stage dev`
   before an apply.
2. **Passphrase lost:** the encrypted state cannot be decrypted or adopted
   back. Cleanest recovery: redeploy from Git into a fresh state — resources
   get NEW IDs — then re-point the apex/www alias via `quilty-aws/dns/`
   (Pattern A) and manually delete the orphaned old CloudFront/Lambda/S3 from
   the console. The tier is stateless, so a clean rebuild is safe. **Prevention
   is the real fix — keep the passphrase in 1Password (`quilty-1password`).**

### 4C — GitHub Actions secret/var rotation

1. Re-issue the affected credential at source (deploy roles via
   `quilty-aws/website-baseline/`; pepper via Secrets Manager; Sentry token in
   Sentry).
2. Update the repo/environment secret or var (keep `production` reviewer-gated).
3. Trigger a test preview deploy to validate before touching prod.
4. Revoke the old credential.

> ⚠ Do NOT rotate `QUILTY_PSEUDONYM_PEPPER` unless it is unrecoverably
> compromised — rotation permanently breaks correlation of historical log
> pseudonyms (the salt changes, so old and new hashes no longer match).
> Confirm with the engineering lead before rotating; prefer recovering the
> existing value from Secrets Manager / 1Password.

### 4D — Total loss / orphaned resources

1. Enumerate any surviving live resources (CloudFront, Lambda, S3) in the AWS
   console; note IDs (for later cleanup).
2. Deploy from the known-good SHA into a fresh state — the tier is stateless,
   so a clean rebuild is safe and far simpler than adopting orphans (SST 4.x
   has no first-class resource-import path). Resources get NEW IDs.
3. Re-point the apex/www alias via `quilty-aws/dns/` (Pattern A) to the new
   distribution.
4. Manually delete the orphaned old CloudFront/Lambda/S3 from step 1.
5. Verify (§5).

### 4E — Stale state-lock removal

A failed/interrupted deploy can leave the app state locked; subsequent
`sst deploy` fails with a lock error. This is NOT state corruption — do not
run `state repair`.

1. Confirm no deploy is genuinely in flight (check CI — a concurrent run holds
   a legitimate lock; wait for it).
2. Clear the stale lock: `pnpm sst unlock --stage dev`.
3. Retry the deploy (§4A).

## 5. Verification (all must pass)

- [ ] `https://my-quilty.com/api/health` → 200.
- [ ] CloudFront distribution present; SSR Lambda invoking (CloudWatch Logs).
- [ ] 3 key routes load: `/en`, `/en/features`, `/en/legal/privacy`.
- [ ] Index posture correct for the phase (SEO gate / `curl -sI .../en`).
- [ ] ACM cert valid + not expired (us-east-1); `dig my-quilty.com` resolves to
      CloudFront.
- [ ] No active CloudWatch alarms; a test preview deploy succeeds (CI/state OK).

## 6. Communications

- On declaration: IC posts "DR initiated for the website. Est. restore: `<RTO>`."
- Cadence: update every ~15 min during active DR.
- On restore: "Service restored; root-cause investigation underway;
  post-mortem within 24h."

## 7. GameDay cadence

Per AWS Well-Architected REL12 + practice:

- Phase 0 (pre-revenue): **annual** drill minimum; quarterly runbook review.
- Launched (revenue): **quarterly** drill; monthly review.
- Rotate scenarios: (1) redeploy from scratch into a throwaway account;
  (2) state-bucket deletion + restore; (3) rotate all GitHub Actions secrets;
  (4) distribution recreation + DNS re-point; (5) stale state-lock (`sst unlock`).
  **Scenario 1 (clean rebuild) must pass before first production launch** — do
  not defer it to the annual cadence. Measure recovery time vs. RTO; update this
  runbook with any gap.

## 8. Annex — reference data (fill in at first deploy)

- SST state bucket name: `sst-state-…` (record actual)
- SST passphrase SSM path: `…` (value backed up in 1Password — `quilty-1password`)
- CloudFront distribution ID (current): `…`
- ACM cert ARN (**us-east-1**, required for CloudFront): `…`
- Website AWS account ID (Phase 0 `development`): `619758066987`
- `my-quilty.com` hosted-zone account: quilty-aws prod — **cross-account
  access:** who holds emergency access + how to obtain it (1Password vault /
  break-glass role) MUST be documented here so DNS cutover isn't blocked at 2am;
  see `quilty-aws` DR docs.
- GitHub env secrets/vars: see [`sst-deploy.md`](./sst-deploy.md) §Prerequisites

---

_Related: [`rollback.md`](./rollback.md), [`sst-deploy.md`](./sst-deploy.md),
[`log-retention.md`](./log-retention.md), [`oncall-trigger.md`](./oncall-trigger.md)._
