# Sentry Monitors — activation runbook (D124)

> Runbook for wiring Sentry Uptime + Sentry Cron monitors to the
> `/api/health` + `/api/ready` Route Handlers. NOT TF-codified at
> this phase — Sentry monitors live as dashboard config, not
> infrastructure-as-code. This runbook is the source of truth for
> the manual activation steps; future Terraform via
> [sentry-kit](https://github.com/jianyuan/terraform-provider-sentry)
> is a deferred future option.

---

## Why Sentry Uptime over Pingdom / Better Uptime / Cronitor

The 2026 enterprise canon for a Sentry Business-tier site converges on
Sentry Uptime Monitoring (GA mid-2025) because:

- **Cost.** Bundled in the existing Sentry Business plan; no
  additional vendor BAA negotiation surface.
- **Integration.** Alerts route via the existing Sentry-to-Discord
  webhook + the same project's release-tagging + error-grouping.
  One pane of glass for both error reports + uptime alerts.
- **Multi-region polling.** Sentry's uptime monitor polls from
  3+ regions (US-East, EU-West, AP-South) without per-region setup
  effort. Regional outage detection is automatic.
- **Sentry Crons.** Same vendor surface for scheduled-job heartbeats
  (today: no scheduled Lambdas; documented activation path below).

Pingdom is being phased out in favour of Better Stack; Better Uptime

- Cronitor are stronger on alert-routing UX but adding a separate
  vendor BAA at this scale is more friction than the routing
  improvement is worth.

---

## /api/health — uptime monitor activation

### Pre-conditions

- Sentry Business project exists + Quilty Engineering BAA covering
  Sentry Uptime is countersigned.
- `/api/health` is deployed + accessible at
  `https://my-quilty.com/api/health`.
- Verified the endpoint returns `{ status: 'ok', version, timestamp }`
  - `X-Robots-Tag: noindex, nofollow` + `Cache-Control: no-store`.

### Manual setup (Sentry dashboard, 2026 UI)

1. Navigate to **Insights → Uptime** in the Sentry web UI for the
   project.
2. Click **Create Monitor**.
3. Configure:
   - **Name:** `quilty-website-health`
   - **URL:** `https://my-quilty.com/api/health`
   - **Method:** `GET`
   - **Interval:** `5 minutes` (300 seconds).
   - **Regions:** `US East (Virginia)` + `EU West (Ireland)`. Two
     regions catch regional Lambda failures without the cost of
     all-3-region polling.
   - **Failure threshold:** `2 consecutive failures` (one transient
     failure does not page; two indicates real degradation).
   - **Alert rules:** route to the Discord webhook the existing
     Sentry-to-Discord integration uses (`#quilty-incidents`
     channel). The on-call posture in
     `docs/runbook/oncall-trigger.md` documents the response
     SLA target (30 min during the solo-founder phase).
4. **Expected response:** status 200, body matches the
   `{ status: 'ok' }` regex. Sentry Uptime validates HTTP status by
   default; the body regex is the extra defense against a Lambda
   returning 200 with a degraded body shape.
5. **Save monitor.** First check fires within 5 minutes; subsequent
   checks at the configured interval.

### Verification

Within 10 minutes of saving the monitor, the Sentry Insights →
Uptime tab should show the monitor in `OK` state with at least
two successful check records.

---

## /api/ready — uptime monitor activation (post-DynamoDB)

DEFERRED. Activate after the deletion-flow milestone provisions the
DynamoDB tables (consent-store, rate-limit, idempotency) + Sentry
Business BAA covers the synthetic-probe traffic against Sentry
ingest. Same shape as the /api/health monitor with three deltas:

- **URL:** `https://my-quilty.com/api/ready`.
- **Interval:** `15 minutes` (900 seconds — the 5-minute polling
  used on `/api/health` would be overkill against the deeper
  readiness probe; readiness drift is a slower-moving signal than
  liveness and the deeper probe touches DynamoDB + Sentry ingest
  per request).
- **Failure threshold:** `1 consecutive failure` (a 503 from
  /api/ready is a real dependency outage, not a transient blip;
  page on the first failure).

The activation gate also wires the live dependency checks per
`apps/web/app/api/ready/route.ts` — pre-activation today the
endpoint returns `synthetic-ok` for every dependency.

---

## Sentry Crons — scheduled-job monitoring (deferred)

DEFERRED. No scheduled Lambda jobs exist today. When the first
scheduled job ships (anticipated targets: DSAR-erasure-TTL job at
the deletion-flow milestone; consent-expiry sweep at consent
banner activation; BAA-renewal calendar reminder), wire it to
Sentry Crons:

1. Inside the Lambda handler, call
   `Sentry.captureCheckIn({ monitorSlug, status: 'in_progress' })`
   at start + `Sentry.captureCheckIn({ ..., status: 'ok' })` at end.
2. Configure the monitor in the Sentry dashboard. The 2026 Sentry
   UI exposes Crons under **Crons → Create Monitor** (formerly
   nested under "Performance → Crons" in 2024 + "Insights → Crons"
   in early 2025; the standalone Crons section consolidated in
   the May 2025 redesign). Verify the path matches the live UI on
   first activation; if Sentry moves it again the screenshot in
   this runbook stays the authoritative reference.
   - **Name:** `quilty-website-<job-name>` (e.g., `quilty-website-dsar-ttl`).
   - **Schedule:** match the EventBridge cron expression.
   - **Failure rule:** missed-heartbeat threshold = `2x interval`
     by default. Calibrate per job: a daily job tolerates a single
     missed beat (48h threshold); an hourly job should fail on the
     first miss (2h threshold). Quilty calibration table when the
     first jobs ship.
   - **Environment:** match the Sentry release tag (`production`,
     `staging`, etc.); pre-activation Sentry Crons only fires on
     the production release.

Reference: Sentry Crons docs at
[docs.sentry.io/product/crons/](https://docs.sentry.io/product/crons/)
(the 2024 URL `sentry.io/product/cron-monitoring/` redirects to
the current docs path; verify on activation).

---

## Incident response when a monitor fires

See `docs/runbook/oncall-trigger.md` (on-call posture) and
`docs/runbook/incidents/sev-taxonomy.md` (SEV1-4 classification +
escalation rules). Uptime failures are SEV1 when sustained over
15 minutes (full-site outage), SEV2 when intermittent.

---

## Decision bindings

- D124 — Sentry Uptime monitoring lock (2026 enterprise canon).
- D42a — Sentry Business tier from day one.
- HIPAA §164.312(b) — audit controls. Sentry Uptime monitor logs
  count as audit records for the "is the website reachable" SLA
  the BAA covers.

---

## Cross-references

- `apps/web/app/api/health/route.ts` — liveness probe target.
- `apps/web/app/api/ready/route.ts` — readiness probe target.
- `docs/runbook/oncall-trigger.md` — on-call posture (D125).
- `docs/runbook/incidents/sev-taxonomy.md` — SEV1-4 classification (D130).
- `docs/runbook/baa-inventory.md` — Sentry Business BAA state.
