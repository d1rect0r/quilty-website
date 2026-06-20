# Rollback Runbook — website (SST 4.x / OpenNext on AWS)

> **Audience:** web platform + infra on-call.
> **Scope:** reverting a BAD website DEPLOY (regression, error spike, broken
> release) for the SST-deployed Next.js app — CloudFront + SSR Lambda + S3.
> For a full-stack LOSS event (region down, state/secret loss) use
> [`dr.md`](./dr.md). For deploy mechanics see [`sst-deploy.md`](./sst-deploy.md);
> for alert→page mapping see [`oncall-trigger.md`](./oncall-trigger.md).
> **Key fact:** SST 4.x (Ion / Pulumi engine) has **no native one-click
> rollback** — no CloudFormation-style automatic stack rollback. The primary
> path is _roll forward from the last known-good Git SHA_.

|                  |                                             |
| ---------------- | ------------------------------------------- |
| **Owner**        | web platform on-call                        |
| **Last updated** | 2026-06-19                                  |
| **Last tested**  | never (exercise in a GameDay before launch) |
| **Version**      | 1.0                                         |

## 1. Severity + trigger (decision tree)

| Severity | Definition (concrete)                                                              |
| -------- | ---------------------------------------------------------------------------------- |
| SEV-1    | Site fully unreachable, or 5xx rate > 5% for > 2 min, or a data-exposure risk      |
| SEV-2    | Material degradation: a key route/flow broken, error rate elevated but site usable |
| SEV-3    | Minor/cosmetic regression, single non-critical route                               |

Authorization: **SEV-1 requires incident-commander approval** before rollback;
SEV-2/3 the web on-call may self-authorize. Record the decision + timestamp in
the incident channel. Escalation: if not converging within **30 min**, page the
engineering lead.

Invoke this runbook when a regression is attributable to a recent deploy
(see [`oncall-trigger.md`](./oncall-trigger.md) for which alert paged you):

| Trigger                                                                    | Mechanism (§4)                                                                |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Error/5xx spike or functional regression after a deploy                    | A (git revert + redeploy) — primary                                           |
| Bad release, last-good SHA known, CI healthy                               | A                                                                             |
| `sst deploy` fails citing **state** errors / drift                         | C (SST state restore)                                                         |
| `sst deploy` fails with "state locked"                                     | see [`dr.md`](./dr.md) §4E (`sst unlock`)                                     |
| CloudFront behavior/cache misconfig (4xx/5xx from the edge)                | D                                                                             |
| Wrong index posture shipped (noindex at launch / indexable in placeholder) | A — flip the `SITE_FORCE_NOINDEX` repo var + redeploy (the SEO gate confirms) |

## 2. Decide first: fix-forward vs roll back

Before rolling back, pose the explicit question: **can this be fixed forward in
≤ 20 min** (a one-line hotfix)? If yes, hotfix — a rollback of a multi-commit
range can itself introduce regressions. If no, or if SEV-1 and the cause is
unclear, proceed to §4A. Confirm the regression actually post-dates the last
deploy (compare incident start to the last CI/SST-Console deploy time) — a
regression that predates it is NOT a rollback candidate; treat as an incident.
If the issue is config/secret (rotated `CSRF_SECRET`, missing
`WAF_WEB_ACL_ARN`), rolling back code won't fix it — see [`dr.md`](./dr.md).

## 3. Prerequisites

- AWS CLI authenticated for the website account (Phase 0: `development`;
  `aws sts get-caller-identity` to confirm) — for read/verify steps.
- Git access; last known-good SHA from `git log --oneline -20`.
- SST/Pulumi passphrase only if doing Mechanism C — in 1Password
  (`quilty-1password`); SSM path in [`dr.md`](./dr.md) §Annex.
- A CloudWatch/Sentry view of the triggering metric, to confirm recovery.

## 4. Procedures

### 4A — Git revert + redeploy (PRIMARY, ~10–20 min)

The website is stateless (no DB owned here), so redeploying a known-good build
is the safe, fast path.

1. Identify the bad commit(s): `git log --oneline -20`.
2. Revert (preserves history — never `reset --hard` on `main`):
   `git revert --no-edit <bad-sha>` (or a range).
3. Push to `main`. NOTE: `ci.yml` (typecheck/lint/test/build) and `deploy.yml`'s
   `deploy-prod` fire **in parallel** — `deploy-prod` does NOT wait for CI
   (branch protection gates PR _merge_, not a direct push). The deploy itself
   runs `sst deploy --stage dev` → SEO gate. Watch the CI run alongside; if CI
   fails on the reverted tree, investigate immediately.
4. The deploy's `invalidation: { wait: true }` (sst.config.ts) purges the edge
   before the job completes — no manual CloudFront invalidation needed.
5. Proceed to §5 (verification).

> If CI/pipeline can't produce a deploy, fall back to a local operator deploy
> from the known-good SHA per [`sst-deploy.md`](./sst-deploy.md) — requires the
> deploy role + four env vars: `SST_DEPLOY_GATE_PASSED=true`,
> `NEXT_PUBLIC_SENTRY_DSN`, `WAF_WEB_ACL_ARN`, `QUILTY_PSEUDONYM_PEPPER`
> (without the gate var the deploy is a silent no-op).

### 4B — SST Console redeploy (if available)

Re-trigger a prior successful deployment for the stage from the SST Console —
only if it targets the exact known-good Git ref; otherwise prefer 4A so the
revert is recorded in `main`.

### 4C — SST state restore (state corruption ONLY)

Use only when `sst deploy` fails with state inconsistency and 4A will not
converge. SST 4.x has no `state import`; the real tools are `sst state export`
(backup), `sst state repair` (reconcile a corrupt state), `sst refresh`
(reconcile state against live AWS), and S3 object-version restore of the
`sst-state-*` bucket. This can recreate resources — review `sst diff` first.

1. Back up current state first: `pnpm sst state export > state-now.json`.
2. Try the SST-native reconcile: `pnpm sst state repair`, then
   `pnpm sst refresh --stage dev`.
3. If still broken, restore the prior state object from the **versioned**
   `sst-state-*` S3 bucket (`aws s3api list-object-versions` → restore the
   last-good version), then `pnpm sst refresh --stage dev`.
4. `pnpm sst diff --stage dev` to confirm the plan before any apply.
5. Run a normal deploy (4A) to converge.

### 4D — CloudFront config revert + invalidation

For an edge-only misconfig (bad cache behavior / header). The CDN is
Pulumi-managed via `sst.config.ts`, so the correct revert is 4A (revert the
sst.config change + redeploy). Only touch the distribution directly via
console/CLI as an emergency stop-gap — and first **pause CI deploys** (so an
in-flight `sst deploy` doesn't race/overwrite the manual edit or refuse on
drift). After the stop-gap, reconcile via 4A and resume CI. After any direct
edit: `aws cloudfront create-invalidation --distribution-id <id> --paths '/*'`.

> Lambda alias-based instant rollback is NOT available: the SST `Nextjs`
> component does not publish/alias the SSR function version. Roll forward via 4A.

## 5. Verification (all must pass before declaring resolved)

- [ ] `curl -sS -o /dev/null -w '%{http_code}' https://my-quilty.com/api/health` → `200`.
- [ ] The triggering metric back to baseline for ≥ 5 min (CloudFront 5xx /
      Sentry error rate / Lambda errors).
- [ ] Smoke 3 routes in a browser: `/en`, `/en/features`, `/en/legal/privacy`.
- [ ] Index posture correct for the phase (placeholder → `/en` carries
      `X-Robots-Tag: noindex`; launched → absent) — the deploy SEO gate asserts
      this; re-confirm with `curl -sI https://my-quilty.com/en | grep -i x-robots-tag`.
- [ ] No new error patterns in CloudWatch Logs Insights for the SSR function.

If any check still fails after ~5 min: re-run §4A from an earlier known-good
SHA, or escalate to the IC. Do NOT declare resolved on a partial pass.

## 6. Rollback-of-rollback (escape hatch)

If the rollback itself regresses: do NOT redeploy the bad version. Escalate to
the IC, and roll FORWARD with a targeted hotfix from the last known-good base.
Log: "rolled back to `<sha>`; that introduced `<X>`; forward-fix `<Y>` applied."

## 7. Communications

- On initiation: incident channel — "Rollback initiated for the website
  (deploy `<sha>`). ETA ~15 min."
- During: updates every ~15 min.
- On resolution: "Resolved; monitoring. Root cause under investigation;
  post-mortem to follow."

## 8. Post-incident

- File a blameless post-mortem within 24h (SEV-1) / 48h (SEV-2): detection
  time, rollback start, resolution, actual MTTR.
- Why did CI/tests not catch it? Add the missing regression test.
- [ ] Runbook accuracy confirmed or updated (do it before the next deploy).

---

_Related: [`dr.md`](./dr.md), [`sst-deploy.md`](./sst-deploy.md),
[`oncall-trigger.md`](./oncall-trigger.md), [`sentry-monitors.md`](./sentry-monitors.md)._
