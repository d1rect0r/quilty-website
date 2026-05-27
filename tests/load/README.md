# Load testing (k6)

> k6 1.0+ TypeScript-native scenarios. Local-only at pre-launch; CI-graduation
> sequence + thresholds documented below.

## Scenarios

| File                                   | Workload                         | SLO tier     | When to run                      |
| -------------------------------------- | -------------------------------- | ------------ | -------------------------------- |
| `scenarios/homepage-burst.k6.ts`       | 0 → 100 RPS ramp, hold 5 min     | static_html  | PR + pre-deploy                  |
| `scenarios/contact-submission.k6.ts`   | 2 RPS for 10 min (form post)     | form_post    | PR + pre-deploy                  |
| `scenarios/portal-session-chain.k6.ts` | 20 VUs × 50 iters (auth refresh) | auth_refresh | PR + pre-deploy                  |
| `soak/homepage-soak.k6.ts`             | 50 RPS for 4 hours               | static_html  | pre-launch + nightly post-launch |

## SLO thresholds (per-route-type)

| Tier           | p50 (ms) | p95 (ms) | p99 (ms) | Error rate |
| -------------- | -------- | -------- | -------- | ---------- |
| `static_html`  | 100      | 300      | 800      | 0.001      |
| `ssr_dynamic`  | 200      | 800      | 1500     | 0.005      |
| `form_post`    | 300      | 1000     | 2000     | 0.005      |
| `auth_refresh` | 150      | 500      | 1200     | 0.001      |

Source-of-truth: `tests/load/lib/thresholds.ts`. Tweak there; every scenario
picks up automatically.

## How to run

### Local dev server

```bash
# Terminal 1
pnpm dev

# Terminal 2 (k6 must be installed: brew install k6)
RATELIMIT_BYPASS_TOKEN=devsecret \
  k6 run tests/load/scenarios/homepage-burst.k6.ts \
  --env QUILTY_SITE_URL=http://localhost:3000
```

### Against staging / preview

```bash
RATELIMIT_BYPASS_TOKEN=$(aws secretsmanager get-secret-value \
    --secret-id quilty/staging/ratelimit-bypass --query SecretString -r) \
  k6 run tests/load/scenarios/contact-submission.k6.ts \
  --env QUILTY_SITE_URL=https://staging.my-quilty.com
```

## Rate-limit bypass

`/api/contact` reads `X-Load-Test-Bypass` and matches against the
`RATELIMIT_BYPASS_TOKEN` env var. The match is constant-time (no length /
char leak); when the env is unset (production), the header is inert.

Rotation cadence: quarterly, per `docs/runbook/trigger-watchlist.md` TW-026.
Production environments MUST leave the env unset.

## CI graduation sequence

Per the M1.6 plan-doc + trigger watchlist:

1. **Day-one of CI** (already armed): pre-deploy synthetic smoke profile —
   `homepage-burst` capped at 30s / 10 RPS, against the preview deploy URL.
   Thresholds in `tests/load/lib/thresholds.ts` are not yet PR-blocking
   (warn-only).
2. **30 days of stable threshold values** (TW-017): flip to PR-blocking.
3. **Post-launch + real-traffic baseline** (TW-018): nightly soak runs
   `soak/homepage-soak.k6.ts` against production at a 50 RPS / 4h profile
   in the low-traffic window.

## Fixtures

`fixtures/contact-submissions.json` (gitignored — generated offline) holds
pre-signed CSRF tokens, time tokens, captcha tokens, and idempotency UUIDs
sized for the per-VU iteration budget. Until `@quilty/test-fixtures`
exports a load-test factory (TW-025), scenarios authoring CONTACT-flow
fixtures must hand-roll the JSON.

## Why k6 (not Artillery / Locust / Vegeta)

- **TypeScript-native** at 1.0+ — no Lua / Python transcription tax.
- **Grafana-acquired** (Sept 2023); long-term support runway aligns with
  the project's "no abandonware" deferral discipline.
- **Distributed mode** via k6 Cloud or self-hosted operator when we
  outgrow single-machine load generation (post-launch).

Alternatives + why rejected: Artillery (test files in YAML, harder to
share helpers); Locust (Python runtime, scenario sharing across mobile
QA harder); Vegeta (HTTP-only, no scenario primitive).
