# ADR-0004: Observability stack — Sentry + Amplitude (web + mobile) + CloudWatch + Sentry-owned OpenTelemetry

- **Status:** Accepted 2026-05-17; **analytics / flags / experiments / replay vendor + OTel transport REVISED 2026-06-04** (see Revision note below)
- **Date:** 2026-05-17 (locked via Round-5 audit); revised 2026-06-04
- **Deciders:** Volodymyr Petrychenko + Round-5 observability-analytics-flags research agent
- **Related decisions:** D31 (zero-PHI), D38 (W3C traceparent), D40 (replay mask-all), D41 (server-side flag eval), D42a (Sentry errors+RUM), **D42b _revised_ (Amplitude all-in for web + mobile — was PostHog-for-web)**, D42c (resolved by D68), D42d (CloudWatch + structured JSON), **D43 _revised_ (flags stay env-var/typed; PostHog flags dropped)**, **D56 _revised_ (OTel owned by the Sentry SDK; `@vercel/otel` removed)**, D67 (PHI sanitizer + no-console + ban direct vendor SDK imports), D68 (Sentry error-triggered replay; Amplitude Session Replay rejected), D176-D178 (vaping-cessation framing reconciliation)
- **Related ADRs:** [ADR-0002 Session cookie pattern](0002-session-cookie-pattern.md) (PHI hash in logs), [ADR-0005 Two-tier CSP](0005-csp-two-tier.md) (Sentry as CSP report-uri sink)
- **Related research:** `docs/research/round_5_independent_review/05-observability-analytics-flags.md`

## Revision note (2026-06-04)

The original decision below selected **PostHog Cloud Boost** for web analytics +
flags + experiments + consent-gated replay. That selection has been **reversed**.
The body and alternatives are retained as the historical record of the Round-5
reasoning; the **current** observability stack is:

- **Product analytics: Amplitude, all-in for web + mobile** (D42b-revised) — one
  vendor across both platforms rather than PostHog-web + Amplitude-mobile. Wired
  via the `Analytics` port through the `wrapAnalytics` consent/PHI chokepoint:
  `amplitude-browser.ts` (Browser SDK 2, client), `amplitude-node.ts` (Node SDK,
  server), and the no-network log adapter on the edge tier. SDK import is
  confined to those adapter files (D67); consent + GPC gate upstream (D35).
- **Session replay: Sentry only** (D68) — error-triggered, mask-all. PostHog
  replay is dropped along with PostHog; **Amplitude** Session Replay remains
  rejected (the HTML-attribute leak documented below is unchanged).
- **Feature flags: typed env-var module** (`lib/flags/features.ts`) — the
  PostHog-flags pivot (D43) is dropped; flags stay the safe-by-default typed
  module until a real flag-vendor trigger fires.
- **Distributed tracing: OWNED BY THE SENTRY SDK** (D56-revised) — `@sentry/nextjs`
  v10 instruments OpenTelemetry itself, so the standalone `@vercel/otel`
  dependency was **removed** (see the Item-2 Sentry-wiring change + the strategy
  doc update-log). Business logic still uses the vendor-neutral
  `@opentelemetry/api`; Sentry is the OTel SDK provider rather than a span
  consumer behind `@vercel/otel`.

Net effect: **two analytics/observability vendors (Sentry + Amplitude) + AWS
CloudWatch**, not three. The PHI-sanitizer chokepoint, zero-PHI posture, and
OTel-first business-logic rule (everything below) are **unchanged** — only the
vendor identities for analytics/flags/replay/tracing-transport moved.

## Context

The website needs to capture errors + RUM + product analytics + feature flags

- session replay + server logs + distributed tracing, all under HIPAA-aligned
  posture (BAA-eligible vendors, mask-all-by-default replay, no PHI in logs).

Forces:

- **Three vendor economic realities verified Round 5:**
  - Sentry BAA available **self-serve at Business tier ($80/mo)**. Enterprise
    required only for negotiated/modified BAA terms.
  - Amplitude HIPAA BAA available **only at Enterprise tier** ($20K–$100K+/yr
    custom-quote floor). Plus/Growth/Starter tiers contractually cannot
    handle PHI.
  - PostHog BAA available on **Cloud + Boost ($250/mo) add-on**. Covers
    analytics + replay + flags + experiments + error tracking under one
    contract.
- **Amplitude Session Replay has a documented privacy bug** (GitHub issue
  #887 + Amplitude's own docs): the "Conservative" privacy level masks text
  content + form inputs but **does not mask HTML attribute values** —
  `alt`, `title`, `placeholder`, `aria-label`, `value`, and `data-*`
  remain visible in replays. For a clinical surface with autocompletes,
  symptom checkers, condition pickers, this is a non-starter.
- **Sentry's JS SDK is OTel-native** under the hood since 2024-2025
  (verified at docs.sentry.io). Writing OTel-first via `@vercel/otel` costs
  zero today + future-proofs every vendor swap.
- **LaunchDarkly Oct 20 2025 outage** (verified at launchdarkly.com/blog):
  AWS us-east-1 took down LD's control plane; LD's recovery action triggered
  a thundering herd that took down the data plane. FireHydrant deployed
  emergency PRs to hardcode flags because the `false` default wasn't safe
  for their code paths. Lesson: safe-by-default flag fallbacks + bake
  snapshot into deploy artifact + `/tmp` cache across Lambda warm cycles +
  monitor flag vendor as first-class infra dependency.
- **Cerebral $7M FTC settlement** is the load-bearing reminder that PHI
  control is structural (the code can't capture it), not policy ("we'll
  remember to sanitize at call sites"). The PHI defense lives in
  `lib/observability/sanitize.ts` — single chokepoint, enforced by ESLint.
- **Mobile** is locked on Amplitude (existing contract per D42b retained for
  mobile only). Cross-platform identity is reconciled in the data warehouse
  at trigger via the shared `user_id` from the Rust backend — not by
  forcing both platforms onto the same analytics vendor.

What happens if we don't decide: ship Amplitude on web because "mobile uses
it" (Cerebral pattern + Enterprise cost cliff), OR delay observability to
"after launch" (which is when you actually need it to debug launch issues),
OR adopt vendor SDKs piecemeal without a sanitizer chokepoint (every log
call becomes a PHI leak risk).

## Decision

> **Superseded in part (2026-06-04):** the PostHog + `@vercel/otel` specifics
> below are historical. See the **Revision note** at the top for the current
> stack (Sentry + Amplitude + CloudWatch; Sentry-owned OTel). The
> chokepoint/zero-PHI/OTel-first principles remain in force.

**We will run Sentry Business for errors + RUM + error-triggered replay, PostHog Cloud Boost for analytics + consent-gated replay + flags + experiments, and CloudWatch for server logs — all funneled through `apps/web/lib/observability/` single-chokepoint adapters with PHI sanitizer + OpenTelemetry-first instrumentation.**

Specifically:

1. **Errors + RUM (D42a):** Sentry Business tier from M1.
   - `sentry.client.config.ts`, `sentry.server.config.ts`,
     `sentry.edge.config.ts` initialize the SDK.
   - Replay mask-all-by-default (`maskAllText: true`, `blockAllMedia: true`,
     `maskAllInputs: true`) + error-triggered only
     (`replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 1.0`).
   - `beforeSend` hook runs every payload through `sanitize()` before send.
2. **Product analytics + replay + flags + experiments (D42b + D43):**
   PostHog Cloud Boost ($250/mo) activated post-ConsentState (M3).
   - Adapter at `lib/observability/track.ts` consent-gates the SDK.
   - PostHog replay consent-gated, sampled, with `block`-class on every
     clinical-state-implying control (per D68 + the "Exclude beats Mask"
     lesson).
   - PostHog flags adapter activates at the trigger condition (D43).
3. **Server logs (D42d):** CloudWatch + structured JSON via
   `lib/observability/logger.ts`. Single chokepoint; calls `sanitize()`
   before every emission. Log retention: 30d dev / 90d prod / 7yr S3
   Glacier for security-event audit trail (per HIPAA).
4. **Distributed tracing (D38 + D56):** OpenTelemetry-first via
   `@vercel/otel` in `instrumentation.ts`. W3C `tracecontext` + `baggage`
   propagators only (no B3 / Jaeger). Sentry SDK auto-consumes OTel spans —
   no Sentry-proprietary span APIs in business logic.
5. **CSP report sink (D61):** Sentry's `/api/<project>/security/` endpoint
   via `report-uri`. Same triage workflow as JS errors.
6. **Feature flags day-one (D43):** typed `lib/flags/features.ts` env-var
   module. At trigger point (runtime toggle / non-dev flipping / A/B
   testing), `flag()` adapter pivots to PostHog flags.

7. **PHI defense (D67):**
   - `lib/observability/sanitize.ts` — single chokepoint, runs on every log
     emission, every analytics event, every error payload. Strips known-PHI
     keys (`email`, `phone`, `dob`, `address`, `diagnosis`, `condition`,
     `medication`, `notes`), redacts JWT shapes, replaces user UUIDs with
     SHA256 hashes (so logs are still joinable on hashed ID for debugging).
   - `lib/observability/assertNoPHI.ts` — runtime dev assertion throws on
     suspicious payload shapes in `NODE_ENV !== 'production'`.
     Belt-and-suspenders catch during development.
   - ESLint custom rule: `no-console` (error) + `no-restricted-imports`
     blocking `@sentry/*`, `posthog-js`, `amplitude-js` outside
     `apps/web/lib/observability/`. Forces every observability call through
     the adapter layer.
   - **Relationship to [ADR-0002](0002-session-cookie-pattern.md):** the
     session-store ADR handles **storage** PHI via KMS CMK encryption at
     rest; this ADR handles **emission** PHI via the sanitizer chokepoint.
     Together they cover the data lifecycle.
8. **Cost envelope at 1-eng pre-launch:** ~$340-390/mo (Sentry $80 + PostHog
   Boost $250 + CloudWatch ~$5-30 + AWS infra ~$5-30). Worst-case (Amplitude
   Enterprise on web) is $2,000+/mo for no offsetting capability gain.

## Consequences

### Positive

- **Single BAA per vendor** — three total: Sentry, PostHog, AWS (CloudWatch
  via existing AWS BAA). Mobile carries its own Amplitude contract.
- **PHI cannot leak** through normal call paths — the adapter layer is the
  only way to emit anything to a vendor. Lint rules + runtime assertions
  catch bypass attempts.
- **OTel-first** means vendor swaps are contained in `lib/observability/`
  for the application code. Backend swaps stay vendor-neutral too.
- **PostHog single platform** for web analytics + flags + experiments +
  replay simplifies identity model, dashboards, BAA management, support.
- **Sentry replay error-triggered** keeps the replay volume low → BAA
  liability surface is minimal but debug visibility is preserved.
- **LaunchDarkly outage lesson absorbed** — flag defaults are safe-by-default;
  PostHog snapshot is baked into the SST deploy artifact; `/tmp` cache
  spans Lambda warm cycles; kill-switch env-var override exists.
- **Cost is bounded** at $340-390/mo pre-launch, scaling linearly with usage.

### Negative

- **Three vendor portals** to manage (Sentry, PostHog, AWS Console) — but
  this is the floor; any consolidation that drops to two means giving up
  Sentry's debug-quality (PostHog error tracking is real but less mature)
  or giving up cross-platform mobile reconciliation.
- **OpenTelemetry learning curve** for engineers not familiar with the
  spec — but `@vercel/otel` is configuration-only; custom spans use the
  standard `@opentelemetry/api`.
- **PostHog activation deferred to M3** (after ConsentState is wired) — so
  analytics data has a gap from M1 → M3. Acceptable: there's no production
  traffic in that window.

### Neutral

- Mobile retains Amplitude — cross-platform analytics consolidation is a
  warehouse-tier concern at trigger, not a vendor-consolidation problem.
- A/B testing infrastructure is PostHog Experiments (activated at trigger
  per D43); no separate vendor needed.

## Alternatives considered

### Alternative A: Sentry + Amplitude + GrowthBook self-hosted (original D42b + D43)

- **What it is:** Three separate vendors, three BAAs, GrowthBook deployed
  on ECS for self-hosted flags.
- **Why rejected:** Amplitude HIPAA BAA is Enterprise-only ($20K-$100K+/yr).
  Amplitude Session Replay has the HTML-attribute-leak bug. GrowthBook
  self-hosted on ECS is real engineering work (Mongo, web service, scheduler,
  certs, monitoring) made unnecessary by PostHog flags. Three vendor portals
  vs three is the same operationally; cost is dramatically higher; privacy
  posture is worse.

### Alternative B: PostHog-only (drop Sentry)

- **What it is:** PostHog covers errors + replay + flags + experiments +
  analytics under one BAA.
- **Why rejected:** PostHog error tracking is real but its UI, grouping,
  source-map handling, and release-tracking workflow are less mature than
  Sentry's. For a HIPAA-aligned site where debugging is high-stakes, Sentry's
  release health + Spotlight-in-dev story + source-map upload via SST/CI is
  worth the $80/mo + the second BAA. Industry pattern at 5-30 eng converges
  on the Sentry + PostHog hybrid.

### Alternative C: Datadog RUM + APM

- **What it is:** Single-vendor full-stack observability (errors + RUM +
  APM + logs + flags via Datadog Feature Flags).
- **Why rejected:** Datadog cost at our scale is dramatically higher than
  Sentry + PostHog. Frontend-error tracking specifically: "Sentry vs Datadog
  in 2026 is not a tie" per industry comparisons — Sentry wins on issue
  grouping + source maps + DX. Datadog Feature Flags is a new product without
  the maturity of PostHog flags or LaunchDarkly.

### Alternative D: FullStory or LogRocket for session replay

- **What it is:** Use a dedicated replay vendor (FullStory or LogRocket) in
  addition to Sentry + PostHog.
- **Why rejected:** Both require a separate BAA. FullStory's three-tier
  Exclude/Mask/Unmask model is technically richer than Sentry's, but applying
  the "Exclude beats Mask" lesson to PostHog (via `block`-class) achieves
  the same defense without a third vendor.

### Alternative E: LaunchDarkly for flags

- **What it is:** Industry-standard flag platform with enterprise governance.
- **Why rejected:** Oct 2025 outage showed control-plane + data-plane
  coupling. SaaS-only (no self-host option). Pricing high. PostHog flags
  cover our needs without the operational dependency.

### Alternative F: Statsig for flags

- **What it is:** Acquired by OpenAI Sep 2025; still operating but strategic
  direction now serves OpenAI.
- **Why rejected:** Procurement risk for regulated workloads. Re-evaluate at
  the trigger if PostHog flags hit limits.

## Compliance / Verification

- **Sentry BAA accepted** at the Business tier via Sentry's Legal &
  Compliance UI before any traffic could plausibly enter a PHI-adjacent
  surface. Currently `2026-01-15` BAA v1.0.1 is the active text.
- **PostHog Boost BAA accepted** before first marketing-page traffic that
  allows form submission (likely M3, when ConsentState ships).
- ESLint custom rules enforced in CI: `no-console`, `no-restricted-imports`
  for `@sentry/*` + `posthog-*` + `amplitude-*` outside
  `apps/web/lib/observability/**`. CI fails on violation.
- Vitest unit tests on `sanitize.ts` cover every known-PHI key + JWT shape
  - UUID hashing.
- `assertNoPHI()` runtime check throws in dev tests; Playwright e2e at M2+
  asserts no PHI-shaped values appear in any captured network response.
- Sentry replay configuration committed in source; PR review enforces
  `maskAllText: true` cannot regress.
- CloudWatch log retention configured via SST per environment.
- BAA scope inventory (`docs/baa_scope.md` at M8) lists every vendor + tier
  - signed-date + masking-config summary.

## References

- Sentry pricing + Business tier: https://sentry.io/pricing/
- Sentry HIPAA BAA (v1.0.1, Jan 15 2026): https://sentry.io/legal/baa/
- Sentry BAA eligibility FAQ: https://sentry.zendesk.com/hc/en-us/articles/23858023552283-Will-you-sign-a-Business-Associate-Agreement
- Sentry Replay privacy + masking: https://docs.sentry.io/platforms/javascript/session-replay/privacy/
- Sentry OpenTelemetry for Next.js: https://docs.sentry.io/platforms/javascript/guides/nextjs/opentelemetry/
- Sentry CSP reporting endpoint: https://docs.sentry.io/security-legal-pii/security/security-policy-reporting/
- PostHog pricing + Cloud Boost: https://posthog.com/pricing
- PostHog HIPAA BAA (Cloud + Boost/Scale/Enterprise add-on only): https://posthog.com/docs/privacy/hipaa-compliance
- PostHog platform packages (Boost = $250/mo): https://posthog.com/platform-packages
- Amplitude pricing + HIPAA Enterprise-only: https://amplitude.com/pricing
- Amplitude Session Replay privacy (HTML-attribute leak documented): https://amplitude.com/docs/session-replay/manage-privacy-settings-for-session-replay
- Amplitude HTML-attribute-leak bug (GitHub issue #887, still open as of May 2026): https://github.com/amplitude/Amplitude-TypeScript/issues/887
- LaunchDarkly Oct 20 2025 outage postmortem: https://launchdarkly.com/blog/what-happened-what-we-learned-and-how-were-improving/
- FireHydrant Oct 20 2025 service-update (LD-dependent recovery): https://firehydrant.com/blog/service-status-update-october-20-2025/
- Statsig acquired by OpenAI (Sep 2025): https://www.statsig.com/blog/openai-acquisition
- OpenTelemetry spec: https://opentelemetry.io/docs/
- Next.js OpenTelemetry guide: https://nextjs.org/docs/app/guides/open-telemetry
- W3C Trace Context Recommendation: https://www.w3.org/TR/trace-context/
- web-vitals library: https://github.com/GoogleChrome/web-vitals
- Cerebral $7M FTC settlement (the load-bearing precedent for D31 + the PHI sanitizer): https://www.ftc.gov/news-events/news/press-releases/2024/04/ftc-cerebral-pay-more-7-million-disclosing-consumers-sensitive-mental-health-information

## Revisit triggers

- **Sentry deprecates self-serve BAA** or changes tier requirements →
  re-evaluate (unlikely; the trend is toward more self-serve).
- **PostHog adds error-tracking parity with Sentry** (release health, source
  maps, grouping) → consider dropping Sentry to single-vendor PostHog.
- **First B2B customer with their own observability vendor mandate** →
  may need to ship to Datadog or New Relic alongside.
- **Bundle size of Sentry + PostHog client SDKs exceeds 50 KB gzipped
  combined** → re-evaluate dynamic-import of non-critical SDK paths.
- **Mobile app considers leaving Amplitude** → re-evaluate cross-platform
  analytics consolidation (PostHog on both? Mixpanel on both?).
- **A/B testing volume justifies dedicated experimentation platform**
  (Eppo, Statsig, GrowthBook with Snowflake) — currently PostHog Experiments
  is sufficient.
