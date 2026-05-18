# Observability + Product Analytics + Feature Flags Architecture — Quilty Website 2026

> Senior review against enterprise-grade 2026 patterns (Discord / Stripe / Cal.com quality), HIPAA-aligned, Next.js 16 App Router on AWS (SST 4.x). Decisions anchor on `docs/website_strategy_discussion.md` D42a-D43 + D31-D35.

---

## Executive summary (read this first)

**The baseline strategy is broadly correct but needs three concrete adjustments:**

1. **Replace `Sentry Business + Amplitude + GrowthBook self-hosted` with `Sentry Business + PostHog Cloud (Boost add-on)` as the day-one HIPAA-covered stack** — single BAA, single platform for analytics + replay + flags + experiments, $250/mo Boost add-on covers BAA. Amplitude Enterprise is a $20K-100K+/yr cost cliff for BAA; PostHog Boost is $250/mo + usage. (Mobile keeps Amplitude — different question.)
2. **Adopt OpenTelemetry-first instrumentation at scaffold time** — Sentry's JS SDK is OTel-native under the hood since 2024-2025 (`The Sentry SDK uses OpenTelemetry under the hood`). Writing OTel-first is now zero-cost flexibility for the future; not doing it is retrofit-hostile.
3. **Ship the `logError()` + `track()` + `flag()` adapters in M1 even if vendors are stubs.** These thin wrappers + the PHI sanitizer + ESLint `no-console` + structured-log shape are the retrofit-hostile primitives. Vendor swap later is cheap; replacing scattered SDK calls + raw `console.log`s later is expensive.

**The retrofit-hostile items if missing from M1:** (1) PHI scrubber on the log path, (2) `mask-all-text` + `block-all-media` replay defaults, (3) W3C `traceparent` propagation in BFF fetch wrapper, (4) typed `features.ts` + typed `flag()` adapter, (5) ESLint rule banning bare `console.log` / direct SDK calls.

---

## Q1 — Sentry vs PostHog vs hybrid for 1-eng → 5-10 eng team

**Current 2026 enterprise practice.** Two patterns dominate. (a) The **best-of-breed stack** — Sentry (errors + replay + RUM) + Amplitude/Mixpanel (analytics) + LaunchDarkly/Statsig (flags) + Datadog (APM) — used by Stripe, Discord, Linear at >50-eng scale where each tool has owners. (b) The **PostHog single-platform consolidation** — analytics + replay + flags + experiments + error tracking + LLM observability in one product — increasingly chosen by 1-30 eng teams. PostHog cross-references all of: a session replay surfaces the user, the flag the user was in, the error they hit, and the product event that fired, in one timeline. The crossover point in 2026 is roughly 20-30 eng or when you have a dedicated growth/data team that needs warehouse-native experimentation (then GrowthBook + warehouse beats PostHog). For a 1 → 5-10 eng team on HIPAA-aligned consumer health, **PostHog Boost beats Sentry+Amplitude+GrowthBook on every axis: cost, BAA count, integration glue, time-to-first-insight.**

The Sentry+Amplitude+GrowthBook trio has three independent BAAs to maintain, three vendor portals, three SDK initialization paths, three sets of session-stitching keys to reconcile, and roughly $20-100K/yr Amplitude Enterprise floor. PostHog Boost is $250/mo on top of usage-based metering, with one BAA, one SDK, one user-identity model.

**Why keep Sentry alongside PostHog rather than fully consolidating.** PostHog error tracking is real but its UI, grouping, source-map handling, and release-tracking workflow are still less mature than Sentry's. Sentry's release health, source-map upload via SST/CI, and Spotlight-in-dev story are first-class. The hybrid that 5-30 eng consumer-health teams converge on in 2026 is **Sentry for errors + RUM + replay-of-error + CSP reporting (Business tier) AND PostHog for product analytics + flags + experiments + replay-on-trigger (Boost add-on).** This is two BAAs, not three, and each tool is best-in-class for its lane.

- **Reference:** PostHog single-platform pitch + add-on tiers — https://posthog.com/pricing , https://posthog.com/platform-packages , https://posthog.com/blog/posthog-vs-sentry , https://posthog.com/blog/best-error-tracking-tools
- **Recommendation for M1/M2:** Lock the hybrid: **Sentry Business + PostHog Boost.** Drop Amplitude from the web tier (mobile keeps Amplitude per D42b — see Q5). Drop GrowthBook from day-one plan (PostHog flags cover the trigger-point requirement of "non-eng flipping flags" + A/B testing).
- **Retrofit cost if wrong:** **Medium.** Vendor swap is contained inside `logError()` / `track()` / `flag()` adapters. Single-BAA → multi-BAA later is purely procurement, not code.

---

## Q2 — Sentry BAA at Business tier

**Verified May 2026.** Sentry's BAA (Business Associate Amendment 1.0.1, effective January 15, 2026) is **available at Business tier and above**, self-serve. Quote: *"The BAA is made available to all customers on a qualifying non-trial plan (Business tier or higher). If eligible, you'll find the BAA in the Legal & Compliance section of your organization's navigation menu... It can be accessed and accepted by any Owner or Billing Contact within your organization."* Enterprise is required only if you need negotiated/modified BAA terms (custom indemnification, scope changes). For a baseline consumer-health BAA, **Business tier is sufficient** — and Sentry's Business price is roughly **$80/mo** (annual billing) with 50k errors / 5M spans / 50 replays / unlimited dashboards / SAML+SCIM included.

Replay specifically: 50 replays/mo on Business is fine for error-triggered sampling but inadequate for sustained always-on replay. Pay-as-you-go applies above bundled limits. For a HIPAA-aligned site that masks aggressively (Q10), error-triggered replay sampling is the right posture anyway.

- **Reference:** https://sentry.io/legal/baa/ (BAA v1.0.1, Jan 15 2026) + https://sentry.zendesk.com/hc/en-us/articles/23858023552283-Will-you-sign-a-Business-Associate-Agreement + https://sentry.io/pricing/
- **Recommendation for M1/M2:** Provision Sentry Business tier in M1. Accept the self-serve BAA via the org Legal & Compliance menu before any traffic that could plausibly enter a PHI-adjacent surface. Keep replay sampling at error-trigger only, with `maskAllText: true` + `blockAllMedia: true` defaults.
- **Retrofit cost if wrong:** **Low.** Tier upgrade is a billing change.

---

## Q3 — Amplitude HIPAA BAA pricing 2026

**Verified May 2026.** Amplitude offers a BAA **only on the Enterprise plan**. Starter/Plus/Growth tiers *cannot legally handle PHI under any circumstances* per Amplitude's contract. Enterprise is custom-quoted, typically **$20K-$100K+/yr** depending on MTU volume and feature requirements. Session Replay on Amplitude is a separate metered add-on. For a pre-launch consumer-health site sitting in Workloads-NonHIPAA OU (D31, zero-PHI website), the BAA may technically not be required, but the **Cerebral $7M lesson** is that "we don't intend PHI to flow there" is not a defense — the FTC penalty was for *capability* and *configuration*, not intent. Honoring a BAA contractually creates a forcing function for the mask-all defaults and consent-gated load that you want anyway.

The realistic cost cliff: an Amplitude Plus account at ~$49/mo is **null and void the moment a user types something resembling PHI in any tracked form**, because the BAA doesn't exist below Enterprise. There is no graceful path from Plus to Enterprise other than re-procurement at the Enterprise pricing floor.

- **Reference:** https://amplitude.com/pricing + https://improvado.io/blog/hipaa-compliant-marketing-analytics-tools + https://posthog.com/blog/best-hipaa-compliant-analytics-tools
- **Recommendation for M1/M2:** **Drop Amplitude from the web tier.** Mobile keeps Amplitude (D42b) because the existing mobile contract is separate and the mobile app has different PHI scope. For the website, route product analytics through **PostHog Boost** at $250/mo + usage. Reconcile mobile↔web user identity downstream via the Rust backend's user-id, not by sharing an Amplitude project.
- **Retrofit cost if wrong:** **High.** Procurement, BAA, and per-event re-instrumentation if Amplitude is brought into the web tier later.

---

## Q4 — PostHog HIPAA BAA 2026

**Verified May 2026.** PostHog signs BAAs **only on PostHog Cloud** (not self-hosted hobby/OSS) for customers with a **Boost ($250/mo), Scale ($750/mo), or Enterprise ($2,000/mo) add-on on top of the Teams Plan**, generated and countersigned via the PostHog Legal section. Boost includes unlimited team members, unlimited projects, white-labeling, SSO enforcement, and the HIPAA BAA. Quote: *"PostHog only offers Business Associate Agreements (BAAs) for PostHog Cloud to users with Boost, Scale or Enterprise add-ons."*

Single-BAA cost comparison for our stack:

| Stack | Vendors with BAA | Monthly floor | Notes |
|---|---|---|---|
| **PostHog Cloud (Boost) only** | 1 | ~$250 + usage | Analytics + replay + flags + experiments + errors |
| **Sentry Business + PostHog Boost** *(recommended)* | 2 | ~$330 + usage | Sentry for errors/RUM, PostHog for everything else |
| Sentry Business + Amplitude Enterprise + GrowthBook self-hosted | 3 | $80 + $1,700+ + ECS infra | Three contracts, three SDKs |
| Sentry Business + Amplitude Plus | "1" but contractually broken | $80 + $49 | **Not HIPAA viable** — Amplitude needs Enterprise for BAA |

- **Reference:** https://posthog.com/docs/privacy/hipaa-compliance + https://posthog.com/platform-packages + https://posthog.com/baa
- **Recommendation for M1/M2:** PostHog Cloud, Teams plan + Boost add-on, BAA generated before first marketing-page traffic that allows form submission. Cloud (not self-hosted) — self-hosted PostHog at this team size is operationally premature, and the BAA does not apply.
- **Retrofit cost if wrong:** **Low → Medium.** PostHog → other-analytics swap is contained in `track()` adapter if it ships in M1.

---

## Q5 — Cross-platform analytics consolidation (mobile + web)

**Current 2026 enterprise practice.** Three patterns coexist. (a) **Single-vendor consolidation** — Cal.com, Resend, Linear-public-site put mobile + web on the same platform (PostHog or Mixpanel) to share user-identity, funnels, cohorts cleanly. (b) **Split with shared identity** — mobile on Amplitude, web on PostHog/Mixpanel, joined via a stable `user_id` from the backend (the auth subject claim) reconciled downstream in a warehouse (Snowflake/BigQuery). (c) **Warehouse-first** — mobile + web both send to Segment/Rudderstack, which fans out to multiple analytics tools and the warehouse simultaneously. Pattern (c) is overbuilt for 1-10 eng. Pattern (a) is what Cal.com / Linear / Cron-style consumer apps actually do in 2026 — the platform consolidation argument (one set of funnels, one user timeline) outweighs the "best tool per platform" argument once both platforms are non-trivial. Pattern (b) is the pragmatic compromise when a mobile Amplitude contract already exists.

For Quilty: mobile is locked on Amplitude (D42b). The cheapest path to one-user-one-timeline is to **reconcile in the warehouse** at the trigger point (when product needs cohort analysis spanning mobile + web). The Rust backend already has the canonical user id; mobile events and web events both ship a `user_id` field that the backend issues. Pre-warehouse, the gap is acceptable for a 1-eng → 5-eng team.

- **Reference:** https://posthog.com/blog/best-hipaa-compliant-analytics-tools + Linear / Cal.com engineering posts on analytics consolidation (search corpus)
- **Recommendation for M1/M2:** Web → PostHog Boost. Mobile stays on Amplitude. Defer the "should mobile move to PostHog?" decision to a later milestone after web data quality is proven. Ship `user_id` as a first-class event property in both apps now to keep the option open.
- **Retrofit cost if wrong:** **Low** if `user_id` is consistent from day one; **High** if mobile and web identity diverge and need backfill.

---

## Q6 — `logError()` + `track()` abstraction shape

**Current 2026 enterprise practice.** Direct vendor-SDK calls in app code (`Sentry.captureException`, `posthog.capture`, `amplitude.track`) are an anti-pattern at any team size beyond solo. The canonical Next.js 16 pattern is a thin typed adapter module per concern (errors, analytics, flags), exported from `apps/web/lib/observability/`, with:

- Typed event names + payloads via a discriminated union (so `track('checkout_started', { plan: 'pro' })` is type-safe and grep-able).
- A vendor-swap surface — the adapter calls Sentry today; replacing it tomorrow is a one-file edit.
- A PHI scrubber in the path — every payload passes through `sanitize()` before leaving the process.
- Server vs client variants — server `track()` ships via the BFF route, client `track()` ships via the PostHog browser SDK, both gated by consent.
- An `assertNoPHI(payload)` runtime check in dev that throws on suspicious keys (`email`, `phone`, `dob`, `ssn`, `diagnosis`, `condition`, free-text >N chars).

Real implementations to anchor against: Cal.com's `lib/telemetry.ts`, Resend's public-site error wrapper, Vercel's own `@vercel/otel` integration. The shape is consistent — adapter > facade > vendor.

```ts
// apps/web/lib/observability/track.ts (sketch — not for execution)
export type AnalyticsEvent =
  | { name: 'page_view'; props: { route: string; locale: string } }
  | { name: 'cta_click'; props: { cta_id: string; location: string } }
  | { name: 'signup_started'; props: { source: string } };

export async function track<E extends AnalyticsEvent>(
  event: E,
  ctx: { userId?: string; sessionId: string; consent: ConsentState }
): Promise<void> {
  if (!ctx.consent.analytics) return; // D35 gate
  const sanitized = assertNoPHI(scrub(event));
  await posthog.capture({ event: sanitized.name, properties: sanitized.props, distinct_id: ctx.userId ?? ctx.sessionId });
}
```

- **Reference:** https://posthog.com/docs/libraries/next-js + https://docs.sentry.io/platforms/javascript/guides/nextjs/ + Cal.com `lib/` patterns
- **Recommendation for M1/M2:** Ship `lib/observability/{logError,track,flag,sanitize,assertNoPHI}.ts` in M1 even with stub vendors. Type the event union from day one — adding events is cheap, retyping a sprawl of string-typed events later is expensive.
- **Retrofit cost if wrong:** **High** — every direct SDK call sprinkled in pages/components has to be hunted down later. This is the single highest-leverage M1 deliverable.

---

## Q7 — OpenTelemetry adoption in Next.js 16 in 2026

**Current 2026 enterprise practice.** OTel-first is now the enterprise default. The InfoQ Feb 2026 "Demystifying OpenTelemetry" guide, CNCF growth metrics (10,000 contributors / 1,200 companies / 18% YoY developer growth), and Sentry's own architecture decision (`The Sentry SDK uses OpenTelemetry under the hood`) all align. Next.js itself is OTel-instrumented out of the box — `instrumentation.ts` is auto-detected from Next.js 15, and `@vercel/otel` is the canonical bootstrap. The 2026 litmus test for vendor neutrality is **"are you pushing OTLP from the edge?"** — if yes, vendors compete on backend features and you can swap at the gateway/collector layer without re-instrumenting code.

Sentry's 2026 posture is critical: Sentry auto-captures any OTel spans emitted by instrumentation without configuration, and lets you bring your own OTel setup. This means **writing OTel-native code today gives you Sentry today AND any OTel backend (Datadog, Honeycomb, SigNoz, Grafana Tempo, AWS X-Ray) tomorrow with no code change.**

The cost in M1 is essentially zero: use `@vercel/otel` + `@opentelemetry/api` for spans, let Sentry pick them up. Vendor-specific (Sentry-only) custom instrumentation is the trap to avoid.

- **Reference:** https://opentelemetry.io/docs/ + https://nextjs.org/docs/app/guides/open-telemetry + https://docs.sentry.io/platforms/javascript/guides/nextjs/opentelemetry/ + InfoQ Feb 2026 OTel article (https://www.infoq.com/news/2026/02/opentelemetry-observability/)
- **Recommendation for M1/M2:** Bootstrap with `@vercel/otel` in `instrumentation.ts`. Use `@opentelemetry/api` for custom spans (BFF → Rust calls, auth callbacks). Let Sentry SDK consume OTel spans automatically. Do **not** call Sentry's `startSpan()` API directly in business logic — use `tracer.startActiveSpan()` from `@opentelemetry/api`.
- **Retrofit cost if wrong:** **High.** Custom Sentry-API spans scattered through the codebase have to be rewritten when (not if) you add a second backend or migrate.

---

## Q8 — W3C traceparent propagation cross-language

**Current 2026 enterprise practice.** W3C Trace Context (Recommendation since Nov 2021, still v1 in 2026) defines two headers — `traceparent` (mandatory) and `tracestate` (vendor data). Format: `version-trace_id-parent_id-trace_flags`, e.g., `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`. Modern OTel SDKs propagate this automatically when you use the SDK's `fetch` instrumentation (`@opentelemetry/instrumentation-fetch`) or the Sentry-wrapped fetch. The cross-language story for our chain (Browser → CloudFront → API Gateway → Lambda TS BFF → API Gateway → Rust) requires:

1. **Browser** — OTel JS SDK or Sentry browser SDK auto-injects `traceparent` on `fetch()` to same-origin BFF.
2. **CloudFront** — passes headers through (verify the `traceparent`/`tracestate` headers are in the cache key allowlist if needed; for non-cached BFF routes, this is automatic).
3. **API Gateway → Lambda TS BFF** — APIGW v2 (HTTP API) preserves headers. Lambda runtime extracts `traceparent` via the OTel HTTP instrumentation. AWS X-Ray's `X-Amzn-Trace-Id` is a *parallel* header; OTel propagates both via the `awsxray` propagator if you want X-Ray integration too.
4. **Lambda TS BFF → API Gateway → Rust** — TS BFF's outgoing `fetch()` must re-inject `traceparent` (OTel fetch instrumentation does this) so the Rust service sees the continuation.
5. **Rust backend** — uses `tracing-opentelemetry` + `opentelemetry-http` crates to extract `traceparent` from the inbound request and continue the span.

The pattern Cal.com / Sentry's own dogfooding use: rely on the OTel SDK's automatic context propagation, set the W3C propagator explicitly (`new W3CTraceContextPropagator()`), avoid the deprecated B3 / Jaeger headers, and ensure every async boundary uses `context.with()` so the span context survives. Cross-language correctness then comes for free.

```ts
// instrumentation.ts (sketch)
import { registerOTel } from '@vercel/otel';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

export function register() {
  registerOTel({
    serviceName: 'quilty-web',
    propagators: ['tracecontext', 'baggage'], // W3C only — no B3
  });
}
```

- **Reference:** https://www.w3.org/TR/trace-context/ + https://opentelemetry.io/docs/specs/otel/context/api-propagators/ + https://docs.rs/opentelemetry-http/
- **Recommendation for M1/M2:** Pin `tracecontext` + `baggage` propagators (W3C only). Wire the BFF's outbound `fetch` to use OTel-instrumented fetch from M1, even if the Rust backend hasn't yet wired tracing-opentelemetry — the headers flow harmlessly until the receiver is ready. Document the propagator setup in an ADR.
- **Retrofit cost if wrong:** **High.** Adding cross-language tracing after the fact requires touching every service entrypoint, every outbound HTTP call, every Lambda handler. Doing it in M1 is one file in `instrumentation.ts`.

---

## Q9 — web-vitals + Sentry RUM, 75th percentile dashboarding

**Current 2026 enterprise practice.** The 75th-percentile rule is non-negotiable — Google's CrUX scores a page "good" only when p75 of visits across mobile + desktop hits all three Core Web Vitals. **Hard production budgets, separately for mobile and desktop:** p75 LCP ≤ 2.5s, p75 INP ≤ 200ms, p75 CLS ≤ 0.1, p75 TTFB ≤ 0.8s (supporting, not Core). Warn at ~85-90% of ceiling, error at ceiling. INP cannot be measured in lab (Lighthouse) — only RUM gives real numbers. CLS in lab is also misleadingly low because Lighthouse doesn't scroll/interact.

Implementation: use Google's `web-vitals` library (which Next.js's `useReportWebVitals` hook calls under the hood) to capture `onLCP`, `onINP`, `onCLS`, `onTTFB`. Ship each metric to Sentry via `Sentry.metrics.distribution()` *or* — preferred OTel-first — emit as OTel metrics via `@opentelemetry/api` and let Sentry consume. The `web-vitals` library reports each metric **once per page lifecycle** (don't call `onINP()` twice — memory leak risk). Send via `navigator.sendBeacon()` on `visibilitychange === 'hidden'` to survive page unload.

Dashboard discipline: dimension every CWV metric by `{ route, device_class: mobile|tablet|desktop, navigation_type: navigate|reload|bfcache }`. The p75 by route is where regressions hide — a sitewide p75 that's green can mask a single PDP route that's red.

- **Reference:** https://github.com/GoogleChrome/web-vitals + https://web.dev/articles/vitals + https://nextjs.org/docs/pages/api-reference/functions/use-report-web-vitals + https://docs.sentry.io/platforms/javascript/tracing/web-vitals/
- **Recommendation for M1/M2:** Wire `useReportWebVitals` in `apps/web/app/layout.tsx`. Route to OTel histogram metrics (vendor-agnostic) consumed by Sentry today. Dashboard p75 by route + device class. Set CI budgets in M2 once we have baseline numbers — don't pre-commit to thresholds without data.
- **Retrofit cost if wrong:** **Low** — adding RUM later is a single layout change. But the *budget regression catch* you miss between M1 and "later" is real product debt.

---

## Q10 — Sentry session replay privacy posture

**Current 2026 enterprise practice.** Sentry's replay defaults *are* aggressive: `maskAllText: true`, `blockAllMedia: true`, `maskAllInputs: true` ship out of the box. Three CSS class patterns:
- `sentry-mask` / `data-sentry-mask` → text replaced with asterisks (still captures shape)
- `sentry-block` / `data-sentry-block` → element rendered as empty placeholder (no shape, no interaction)
- `sentry-ignore` / `data-sentry-ignore` → form input events excluded entirely

**Adequate for HIPAA-aligned, but not by default — adequate only with disciplined configuration.** Sentry's own docs warn: *"Before enabling Session Replay in production, verify your masking configuration to ensure no sensitive data is captured."* The defaults handle text and media but **do not address HTML attribute leakage** the way the Amplitude bug does (Q11). The Cerebral lesson is that intent ≠ enforcement — the FTC penalty came from configuration, not intent.

Concrete posture for Quilty: stay at the aggressive defaults; do NOT loosen `maskAllText` globally; explicitly add `sentry-block` to any element that could contain clinical state (mood pickers, symptom checkers, free-text reflection inputs, even on signed-in surfaces). Use error-triggered replay sampling (Sentry's default sampling on `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 1.0`) so most sessions never produce a replay at all — minimum-PHI-exposure surface area.

Sentry's replay is **not** in their explicit BAA exclusion list (some vendors carve replay out of BAA scope; Sentry's BAA v1.0.1 covers it as part of the platform), but the customer's burden is to configure it correctly. Document the masking config in your BAA scope record.

- **Reference:** https://docs.sentry.io/platforms/javascript/session-replay/privacy/ + https://sentry.io/legal/baa/
- **Recommendation for M1/M2:** `replaysSessionSampleRate: 0` + `replaysOnErrorSampleRate: 1.0` in M1 (error-only replay). `maskAllText: true`, `blockAllMedia: true`, `maskAllInputs: true`. Add a `data-sentry-block` audit step to the `/scaffold-component` skill checklist for any component handling user input. Document allowlist of explicitly-unmasked elements (CTA button text, public nav, prices) in `docs/observability_masking_inventory.md`.
- **Retrofit cost if wrong:** **High in compliance dollars**, low in code. Cerebral $7M-class risk if a single non-blocked PHI element ships and a replay is captured.

---

## Q11 — Amplitude session replay privacy (HTML attribute leakage)

**Verified May 2026.** Amplitude's Session Replay **does not mask HTML attribute values** even at the strictest "Conservative" privacy level. Quote from Amplitude docs: *"Session Replay masking applies to text content and form inputs, but doesn't mask HTML attribute values. Attributes such as `alt`, `title`, `placeholder`, `aria-label`, `value`, and custom `data-*` attributes remain visible in replays even when you enable masking. If your application stores sensitive information in HTML attributes, remove or obfuscate that data before it reaches Session Replay."*

A known bug (GitHub issue #887, still open as of search): even placeholder text in inputs is not masked by `Conservative` or `.amp-mask` — particularly painful for searchable dropdowns where a placeholder dynamically updates to the user's typed text. Cross-origin iframes also don't inherit parent privacy config.

This is a **non-trivial leak for a clinical surface.** An autocomplete listing condition names in `aria-label`, a placeholder updating with typed search text ("anxi…"), or a `data-condition-id` on a list item — all show up in Amplitude replays despite masking being "on." Mitigation:
1. Audit DOM for sensitive `aria-label`, `placeholder`, `title`, `alt`, `value`, `data-*` and remove/obfuscate before render.
2. Use `.amp-block` (full element replacement with placeholder rectangle) rather than `.amp-mask` for any clinical region.
3. Configure iframe privacy independently (parent settings don't propagate).
4. Treat any attribute-bound user-typed text as PHI by default — including search-as-you-type.

- **Reference:** https://amplitude.com/docs/session-replay/manage-privacy-settings-for-session-replay + https://github.com/amplitude/Amplitude-TypeScript/issues/887
- **Recommendation for M1/M2:** This is a **major** reason to keep Amplitude off the website tier. Mobile keeps Amplitude but the mobile app's attribute surface is far smaller. For web, PostHog replay or Sentry replay (both better-defaults) handle this more cleanly. If Amplitude ever lands on web, the `assertNoPHI()` linter rule has to extend into attribute scanning.
- **Retrofit cost if wrong:** **High.** Discovering this leak post-launch is a Cerebral-class incident.

---

## Q12 — FullStory / LogRocket replay alternatives

**Current 2026 enterprise practice.** FullStory's three-tier model — **Exclude > Mask > Unmask** — is more nuanced than Sentry's or Amplitude's. The critical distinction for clinical surfaces: **Mask hides text but still captures clicks/changes; Exclude drops both.** FullStory itself documents the clinical attack: *"If part of the interface were to contain checkboxes for capturing the presence of certain medical conditions, it would not be enough to simply obscure the text content in session replay. Because masked elements collect interaction data, it would be possible for someone with good working knowledge of the product to understand which health issues a user was checking the boxes for."* FullStory's default Form Privacy ruleset therefore *excludes* (not masks) `input[type=radio]` and `input[type=checkbox]` to defeat this attack. Their "Private by Default" mode allowlists rather than denylists capture.

FullStory and LogRocket both sign BAAs, but FullStory's contract still says *"Customers shall not send any sensitive data, such as medical records, diagnostic data, or any other PHI."* So the BAA is "we'll protect what shouldn't have been sent in the first place." This is functionally equivalent to PostHog/Sentry's posture — the technical controls + the BAA are both load-bearing.

For a HIPAA-aligned consumer health site, none of FullStory / LogRocket / Hotjar offer a clear advantage over **PostHog replay + aggressive masking** or **Sentry replay + error-trigger only**, and they add another BAA and another contract. The "Exclude beats Mask" insight is the load-bearing lesson — apply it to whichever vendor you pick.

- **Reference:** https://help.fullstory.com/hc/en-us/articles/4408633932439-Form-Privacy + https://www.paubox.com/blog/is-fullstory-hipaa-compliant-1
- **Recommendation for M1/M2:** Do not introduce FullStory/LogRocket. Use **Sentry replay (error-triggered)** + **PostHog replay (consent-gated, session-sampled)** — with Exclude-equivalent (`sentry-block`, PostHog's `data-ph-no-capture` / `.ph-no-capture` mask class) on every checkbox, radio, condition-picker, and clinical-state-implying control. Add a unit test that asserts `[role="radiogroup"]`, `input[type=checkbox]`, `input[type=radio]` always carry the block class on clinical routes.
- **Retrofit cost if wrong:** **Medium** — masking class audit can be done late but tests catch this in the right place.

---

## Q13 — Replay vendor pick for HIPAA-aligned consumer health

**Recommendation.** **Sentry replay (error-triggered, mask-all-default) + PostHog replay (consent-gated, sampled, mask-all-default).** Both inside their respective BAAs. Both with `block`-class (full exclusion, not text-mask) on every clinical-state-implying control. Do not adopt FullStory or LogRocket. Do not pay Amplitude Enterprise to use Amplitude replay on the web — the attribute leakage is a non-starter and the Enterprise cliff is unjustifiable when PostHog Boost covers replay at $250/mo.

Sentry replay is for *debugging an error* — when something blew up, you can see what the user did. PostHog replay is for *understanding behavior* — funnel drop-offs, UX confusion, onboarding friction. Different jobs. Both at low sample rates pre-launch.

- **Reference:** Q10 + Q11 + Q12 evidence
- **Recommendation for M1/M2:** Sentry replay configured in M1 (off by default, error-triggered), PostHog replay activated in M2-M3 once we have meaningful UX surfaces and ConsentState wired.
- **Retrofit cost if wrong:** **Low** — adding a different replay vendor later is contained in the adapter; ripping out an entrenched one is harder.

---

## Q14 — CloudWatch server logs (structured JSON, sanitization, retention)

**Current 2026 enterprise practice.** Lambda → CloudWatch with structured JSON is the AWS-native baseline; the Lambda runtime emits each `console.log(JSON.stringify(...))` as a discrete log event consumable by CloudWatch Insights. The canonical shape:

```json
{
  "timestamp": "2026-05-17T14:23:01.123Z",
  "level": "info",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "request_id": "lambda-aws-request-id",
  "route": "/[locale]/pricing",
  "user_id_hash": "sha256:abc…",     // hashed/anon, NEVER raw email/uuid in PHI tier
  "method": "GET",
  "status": 200,
  "duration_ms": 142,
  "msg": "rendered marketing page"
}
```

Critical primitives:
- **Tiered retention.** CloudWatch log group retention set per environment: dev 30d, staging 90d, prod 90d "hot" + Glacier-tier S3 export at 7y for HIPAA audit trail of *security events* (not application logs).
- **PHI sanitizer module.** Single chokepoint — `lib/observability/sanitize.ts` — strips known PHI keys (`email`, `phone`, `dob`, `address`, `diagnosis`, `condition`, `medication`, `notes`, free-text >N chars), redacts JWTs, replaces user UUIDs with stable hashes.
- **ESLint rule:** `no-console` enforced (use `logger.info/warn/error` only). No raw `console.log` past lint.
- **Runtime redaction wrapper.** The logger wraps every log call: `logger.info(msg, fields)` → `console.log(JSON.stringify(sanitize({ ts, level, trace, ...fields, msg })))`.
- **Insights queries committed** in `docs/observability/insights_queries.md`: errors by route, p95 latency by route, recent 4xx/5xx clustered.

The Cerebral-lesson concrete control here is the **PHI sanitizer wrapping every log emission** — not opt-in, not "we'll remember to sanitize at the call site," but a module that's the *only* way to emit a log line.

- **Reference:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatch_Logs_Insights.html + https://aws.amazon.com/blogs/mt/structured-logging-for-aws-lambda/
- **Recommendation for M1/M2:** Ship `lib/observability/logger.ts` + `sanitize.ts` + ESLint `no-console` + a unit test that asserts known-PHI keys are redacted. Set log group retention via SST infra. Commit one CloudWatch Insights query per route family for M1 smoke-validation.
- **Retrofit cost if wrong:** **High** — every Lambda log call that hits CloudWatch without the wrapper is a potential PHI leak record that has to be hunted in retention or expired.

---

## Q15 — Feature flag platform at trigger point

**Current 2026 enterprise practice.** The 2026 landscape:
- **LaunchDarkly** — enterprise gold standard for governance/approval/RBAC; SaaS-only; expensive at scale; AWS us-east-1 outage Oct 20 2025 taught the industry that LD's control plane and data plane were coupled (they've since decoupled). Strong if SOC2/HIPAA-from-vendor matters and budget supports it.
- **Statsig** — acquired by OpenAI Sep 2025 for $1.1B; still operating independently with the existing customer base but strategic direction now serves OpenAI; some procurement-risk concern from large customers.
- **GrowthBook** — open-source, warehouse-native experimentation, self-hostable. Premium features (SSO, advanced RBAC, prerequisite flags) require commercial license. Fits AWS ECS self-host narrative.
- **PostHog flags** — included in PostHog platform; tied to the same identity/event model as analytics + replay; A/B testing via flag exposure is native.
- **Vercel Flags SDK + Hypertune** — framework-native to Next.js, Edge Config integration gives near-zero-latency flag init at the edge; Hypertune is type-safe end-to-end with codegen.
- **Unleash / Flagsmith** — full self-host story, smaller scale.

For a 1 → 5-10 eng HIPAA-aligned consumer site already adopting PostHog Cloud (Q4): **PostHog flags is the right pick at the trigger point.** Same BAA, same identity, native A/B-on-flag-exposure, no second self-hosted ECS service to operate. The strategy doc's plan to deploy GrowthBook self-hosted on ECS is real engineering work (Mongo, web service, scheduler, certs, monitoring) that PostHog flags makes unnecessary at 5-10 eng. Reserve GrowthBook for when warehouse-native experimentation (Snowflake/BigQuery) becomes the binding constraint — typically post-20 eng with a data team.

Vercel Flags SDK + Hypertune is the right pick for a Vercel-hosted Next.js site. We're on SST/AWS (D2), so Vercel-specific tooling is non-load-bearing. The `flags` SDK pattern itself (typed flag declarations, server-component-friendly, Edge Config local cache) is a useful pattern even without Vercel — adopt the shape (typed `flag()` adapter, local cache, network fallback) regardless of vendor.

- **Reference:** https://posthog.com/blog/posthog-vs-launchdarkly + https://www.flagsmith.com/blog/why-openai-acquired-statsig + https://www.growthbook.io/compare/growthbook-vs-launchdarkly + https://vercel.com/docs/flags
- **Recommendation for M1/M2:** **Replace D43's "GrowthBook self-hosted at trigger" with "PostHog flags at trigger."** Keep typed `features.ts` env-var module on day one as the 90% case. When non-eng flipping or A/B testing becomes the binding constraint, flip the `flag()` adapter to call PostHog. No new ECS service to operate.
- **Retrofit cost if wrong:** **Low** if `flag()` adapter ships in M1; **Medium** if direct vendor SDK calls leak into pages.

---

## Q16 — Server-side flag evaluation + LaunchDarkly Oct 2025 outage lesson

**Current 2026 enterprise practice.** Next.js 16 Server Components flag access has three correctness requirements:

1. **Typed flag declarations.** Define every flag in a single `apps/web/lib/flags/index.ts` with typed default values. Server Components import the `flag` and call it with the user context.
2. **Local-cache-with-network-fallback.** The flag SDK initializes from a local file/Edge Config snapshot first, then refreshes from the network. If the network call fails or the SDK can't reach the vendor, evaluation returns the locally-cached value, not the type-system default.
3. **Safe-by-default fallback values.** Every flag's default must produce *safe behavior* if everything else fails — `enable_new_checkout: false`, `kill_switch_legacy_path: false` (i.e., kill switch defaults to "don't kill"), `experimental_ai_assist: false`.

**The LaunchDarkly Oct 20 2025 lesson** (https://launchdarkly.com/blog/what-happened-what-we-learned-and-how-were-improving/) is exactly this. AWS us-east-1 took LD's control plane down. Compounding: LD's recovery action (revert to legacy routing with cold caches) triggered a thundering herd of SDK retries that took down the data plane too. Customer impact: in many integrations, flags evaluated to `false` because cache had expired and the SDK couldn't reach LD. FireHydrant (an LD customer) deployed emergency PRs to *hardcode* critical flags to safe values because the `false` default wasn't actually safe for their code paths.

**The five action items for any flag platform we pick:**
1. Audit every flag's default — assume the SDK can't reach the vendor. Verify the fallback is *safe behavior*, not a coincidentally-non-broken behavior.
2. Persist local cache across process restarts (Lambda cold starts are the trap here — initialize from a baked-in snapshot, not from network).
3. Hardcode kill-switch values for critical paths — `if (process.env.HARDCODE_FLAG_FOO === 'true') return true;` overrides as a deploy-time bypass.
4. Monitor the flag vendor as first-class infra dependency, with status-page integration into PagerDuty.
5. Test recovery procedures including cold caches and thundering-herd retry storms.

In Next.js 16 specifically: Server Components evaluate flags per-render in Lambda. A cold Lambda init that synchronously waits for LD/PostHog to reach over the network adds 100-500ms to TTFB. The fix is **bake a flag snapshot into the deployment artifact** (an SST asset) and let the SDK update asynchronously after warm-up — known as "bootstrap-from-disk."

- **Reference:** https://launchdarkly.com/blog/what-happened-what-we-learned-and-how-were-improving/ + https://firehydrant.com/blog/service-status-update-october-20-2025/ + https://www.flagsmith.com/blog/launchdarkly-went-dark-during-aws-outage-flagsmith-didnt
- **Recommendation for M1/M2:** The `features.ts` env-var module in M1 is itself the safest possible "vendor"; vendor outage = process restart with same env. When PostHog flags activates (M3+?), bake a snapshot artifact into the SST deploy + persist a `/tmp` cache + define every flag's default to safe behavior. Document the "if PostHog is unreachable, every flag falls back to X" matrix in an ADR.
- **Retrofit cost if wrong:** **High in incident-pain dollars** — a flag-vendor outage that kills your site (because the cold Lambda waited for a network call, or the default value was wrong) is a P1.

---

## Q17 — A/B testing infrastructure pre-launch

**Current 2026 enterprise practice.** A/B testing infra is rarely needed pre-launch and frequently overbuilt. The honest enterprise pattern: A/B testing infra becomes useful when (a) traffic is high enough that experiments reach significance in <2 weeks (typically ~10K-50K weekly active users for typical lift sizes), AND (b) there's organizational appetite to commit to "we will not ship without measuring." Below either threshold, A/B testing is roleplay — you'll see noise, not signal.

When it does activate, the canonical pattern is **flag platform delivers the variant assignment + analytics platform measures the outcome**. GrowthBook + Amplitude (the strategy-doc default) is one such pairing; PostHog flags + PostHog analytics + PostHog experiments is the single-platform consolidation that 5-30 eng teams converge on in 2026 because it eliminates the "did the right cohort definition propagate to the right tool?" stitching problem.

For Quilty: pre-launch (M1-M8) there's no meaningful A/B testing surface. M9+ ("Iterate" milestone) is the right activation point. By then PostHog Boost is live and `flag()` is wired — experiments are a UI toggle, not new infrastructure.

- **Reference:** https://posthog.com/blog/posthog-vs-launchdarkly + GrowthBook experimentation docs (https://docs.growthbook.io/)
- **Recommendation for M1/M2:** Do not provision dedicated A/B infra in M1 or M2. Ship the typed `flag()` adapter (Q15). When traffic + product appetite justify it, flip on PostHog Experiments — same platform, same identity.
- **Retrofit cost if wrong:** **Low.** A/B infra adopted late is normal industry practice.

---

## Q18 — CSP report sink

**Current 2026 enterprise practice.** Three sink options for `report-uri` / `Reporting-Endpoints` + `report-to`:
- **Sentry's built-in CSP endpoint** — `https://o{org_id}.ingest.sentry.io/api/{project_id}/security/?sentry_key={key}` — already part of your Sentry project. CSP violations land as security events alongside JS errors, with grouping, fingerprinting, release tagging. Counts against your event quota. Known limitation: Sentry's endpoint requires a query string (`?sentry_key=`), and the modern `report-to` directive doesn't support query strings — so you specify *both* `report-uri` (works for current browsers) and `report-to` + `Reporting-Endpoints` (forward-compat, though report-to currently can't target Sentry's endpoint per their open issue #52794). In practice this means `report-uri` carries the load for Sentry today.
- **Cloudflare Workers / dedicated edge handler** — full control, free tier, store in your own bucket. Operational overhead.
- **Self-hosted endpoint** — Lambda + DynamoDB. Most overhead, least value.

For a 1-eng team already paying for Sentry Business, **Sentry as the CSP sink is the obvious pick.** Zero new infra, zero new vendor, same triage workflow as other errors. The event-quota concern is real for high-volume sites; for a marketing-tier site pre-launch the volume is negligible.

- **Reference:** https://docs.sentry.io/security-legal-pii/security/security-policy-reporting/ + https://github.com/getsentry/sentry/issues/52794
- **Recommendation for M1/M2:** Sentry's CSP endpoint via `report-uri`. Set up the header in the Next.js middleware that owns the CSP nonce. Start in `Content-Security-Policy-Report-Only` mode per D32; flip to `Content-Security-Policy` enforcing once the report stream is clean for 2-4 weeks.
- **Retrofit cost if wrong:** **Low.** Sink swap is one header value.

---

## Q19 — Cost envelope at 1-eng pre-launch (realistic 2026 numbers)

| Line item | Monthly USD (pre-launch) | Notes |
|---|---|---|
| Sentry Business (50k errors, 50 replays, 5M spans) | ~$80 | Annual billing; PAYG above bundled |
| PostHog Teams + Boost add-on | ~$250 | + usage: ~$0/mo at pre-launch (free 1M events / 5K recordings / 1M flag reqs) |
| CloudWatch (logs + metrics + Insights queries) | ~$5-30 | Lambda free tier + minimal log volume |
| GrowthBook self-hosted on ECS *(removed per Q15)* | ~$0 | Replaced by PostHog flags |
| AWS Lambda + APIGW + CloudFront (SST web tier) | ~$5-25 | Free tier covers most pre-launch |
| Route 53 + ACM certs | ~$1-3 | Hosted zone + queries |
| **Recommended stack monthly floor** | **~$340-390** | Sentry + PostHog + AWS infra |
| Worst-case path (Amplitude Enterprise) | **~$2,000+/mo** | $1,700-8,000+/mo for Amplitude alone at Enterprise |

The recommended stack lands at **~$340-390/mo pre-launch**, scaling roughly linearly with usage on PostHog and Sentry. The "worst-case path" — where someone bolts Amplitude Enterprise onto the web tier because of the existing mobile contract — is a 5-10x cost multiplier with no offsetting capability gain over PostHog Cloud Boost.

- **Reference:** https://sentry.io/pricing/ + https://posthog.com/pricing + https://aws.amazon.com/cloudwatch/pricing/
- **Recommendation for M1/M2:** Budget ~$400/mo for observability + analytics + flags pre-launch. Revisit at first revenue or 10K WAU.
- **Retrofit cost if wrong:** **Low.** Cost is procurement, not code.

---

## TOP-3 vendor-choice decisions to re-evaluate

1. **D42b — "Amplitude added pre-launch" for web.** Replace with **PostHog Cloud (Boost add-on)** for the web tier. Mobile keeps Amplitude. Rationale: single BAA, single platform, ~$250/mo vs $20K-100K+/yr, no attribute-leak privacy bug, replay + flags + experiments bundled.

2. **D43 — "GrowthBook self-hosted at trigger."** Replace with **PostHog flags at trigger.** Rationale: zero new infra to operate (we're already on PostHog for analytics), same identity model, same BAA, same SDK. GrowthBook becomes valid only if warehouse-native experimentation becomes binding (post-20-eng / dedicated data team).

3. **D42a — "Sentry Business for errors + RUM."** Keep, with one addition: **OTel-first instrumentation** via `@vercel/otel` so Sentry consumes OTel spans rather than us calling Sentry-proprietary span APIs. Future-proofs against backend migration with zero day-one cost.

---

## Consolidated observability + analytics + flags architecture

**What ships in M1 (stubs + adapters, vendors live where possible):**

- `apps/web/instrumentation.ts` — `@vercel/otel` bootstrap, W3C `tracecontext` + `baggage` propagators, service name `quilty-web`.
- `apps/web/lib/observability/`:
  - `logger.ts` — structured-JSON logger, wraps every emission, calls `sanitize()` first.
  - `sanitize.ts` — PHI scrubber (key denylist + JWT redaction + user-id hashing + free-text length cap).
  - `assertNoPHI.ts` — runtime dev assertion that throws on suspicious payload shapes.
  - `logError.ts` — typed wrapper around Sentry `captureException`, OTel-span-aware.
  - `track.ts` — typed `AnalyticsEvent` union; routes to PostHog (or stub) when consent + vendor live.
  - `flag.ts` — typed `flag(name, defaultValue, ctx)` adapter; M1 reads from `features.ts` env vars only.
  - `web-vitals.ts` — `useReportWebVitals` → OTel histograms, dimensioned by route + device class.
  - `replay-classes.ts` — exported constants (`SENTRY_BLOCK`, `POSTHOG_NO_CAPTURE`) for use in components.
- `apps/web/lib/flags/features.ts` — typed env-var flag module (D43).
- `apps/web/middleware.ts` — owns CSP nonce + `Content-Security-Policy-Report-Only` header pointing at Sentry's CSP endpoint (D32).
- **Vendors live in M1:** Sentry Business (errors + RUM + replay error-triggered + CSP sink); CloudWatch (Lambda logs); typed `features.ts` flags.
- **Vendors stubbed in M1:** PostHog (adapter present, vendor disabled until ConsentState ships in M3/M5).

**What activates when:**

| Milestone | Activation |
|---|---|
| M1 | Sentry live; OTel + W3C propagation wired; logger + sanitize + assertNoPHI + adapters shipped; CSP report-only |
| M2 | Web Vitals dashboards populated; first p75-by-route baselines captured; SEO + a11y baseline tied into Sentry release health |
| M3 | ConsentState shipped; PostHog client SDK activated behind consent gate; PostHog replay sampled |
| M5 | Account portal v0; `flag()` migrates from env vars → PostHog flags for runtime toggle of beta features |
| M6 | Real auth; OIDC backchannel logout emits OTel spans; user_id propagates into PostHog `distinct_id` |
| M7 | Stripe/RevenueCat events flow through `track()` → PostHog; subscription funnels live |
| M8 | CSP flipped from `Report-Only` → enforce after 2-4 clean weeks; BAA scope inventory finalized |
| M9+ | PostHog Experiments activated as traffic justifies; warehouse-native experimentation (GrowthBook) reconsidered at 20+ eng |

---

## TOP-5 retrofit-hostile items if missing from M1 scaffold

1. **PHI sanitizer in the log path.** Every log emission goes through `sanitize()`. Adding this after logs are scattered through the codebase is a forensic exercise. **Retrofit cost: High.**
2. **W3C `traceparent` propagation via OTel from M1.** Cross-language trace context is one config line in M1 (`registerOTel({ propagators: ['tracecontext', 'baggage'] })`) and a multi-week project later because every fetch wrapper, Lambda handler, and Rust service boundary needs touching. **Retrofit cost: High.**
3. **Typed event union for `track()`.** String-typed events become an untyped sprawl in 6 months. Refactoring back to typed events post-fact is a multi-PR slog with downstream PostHog property cleanup. **Retrofit cost: High.**
4. **`maskAllText + blockAllMedia + maskAllInputs` replay defaults + `sentry-block`/`ph-no-capture` audit habit.** Loosening defaults later is easy; tightening after a leak is shipping a v2 redaction job + replay deletion. **Retrofit cost: High in dollars, low in code.**
5. **ESLint `no-console` + ban on direct vendor-SDK imports outside `lib/observability/`.** Once direct `Sentry.captureException` calls or `console.log` calls are seeded throughout `app/` and `components/`, hunting them is forever. **Retrofit cost: High.**

---

## Decisions that change from baseline

| Baseline (D42a/b, D43) | Revised (this review) | Why |
|---|---|---|
| Sentry Business day-1 (errors + RUM) | ✅ Keep, **add OTel-first via `@vercel/otel`** | Sentry SDK is OTel-native; vendor-agnostic at zero cost |
| Amplitude pre-launch (web) | ❌ **Drop from web.** Web → **PostHog Cloud Boost** | Amplitude attribute-leak bug (Q11) + $20K-100K+/yr BAA cliff (Q3); PostHog Boost is $250/mo, one BAA, same identity model |
| Amplitude on mobile (D42b) | ✅ Keep | Existing contract, mobile PHI surface different; reconcile mobile↔web in warehouse at trigger |
| CloudWatch + structured JSON | ✅ Keep, **add `sanitize()` + ESLint `no-console`** | The Cerebral-lesson primitive — non-optional |
| GrowthBook self-hosted at trigger | ❌ **Replace with PostHog flags at trigger** | Zero new infra; same BAA; native A/B-on-flag-exposure |
| Replay vendor deferred | Define as **Sentry replay (error-triggered) + PostHog replay (consent-gated)** with `block`-class on every clinical control | Both inside their BAAs; Exclude > Mask is the load-bearing distinction (Q12); FullStory/LogRocket add a contract for no gain |
| CSP report sink (unspecified) | **Sentry's CSP endpoint** via `report-uri` (D32) | Already paid for; same triage workflow |
| typed `features.ts` day-1 (D43) | ✅ Keep — same shape, just rename the day-1 → day-N path | Adapter `flag()` reads from `features.ts` today, PostHog later |

---

## HIPAA / Cerebral-lesson concrete controls shipping at M1

| Control | Mechanism | Where |
|---|---|---|
| PHI lint rule | ESLint custom rule banning direct `console.*`, direct vendor SDK imports outside `lib/observability/` | `eslint.config.mjs` |
| Log sanitizer | Single chokepoint `sanitize()` invoked by every `logger.*` call | `apps/web/lib/observability/sanitize.ts` |
| Runtime PHI assertion | `assertNoPHI(payload)` throws in dev on suspicious keys | `apps/web/lib/observability/assertNoPHI.ts` |
| Mask-all replay defaults | `maskAllText: true`, `blockAllMedia: true`, `maskAllInputs: true`, `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 1.0` | `apps/web/lib/observability/sentry.client.ts` |
| Attribute-leak guard (future-proofing) | Documented denylist of HTML attributes that must not carry user-typed data (`alt`, `title`, `placeholder`, `aria-label`, `value`, `data-*`) — codified as a test + ADR | `tests/a11y/attribute-leak.spec.ts` + ADR |
| Clinical-control exclusion test | Unit test asserting every `input[type=checkbox]`, `input[type=radio]`, `[role="radiogroup"]` carries `data-sentry-block` + `ph-no-capture` on clinical routes | `tests/replay/clinical-controls.spec.ts` |
| Consent-gated SDK load | PostHog client SDK only initialized if `ConsentState.analytics === true` (D35); GPC honored at edge | `apps/web/lib/observability/track.ts` + middleware |
| CSP report-only → enforce path | Day-1 `Content-Security-Policy-Report-Only` → Sentry; M8 cutover to enforce after 2-4 clean weeks | `apps/web/middleware.ts` |
| Log retention tiering | CloudWatch retention 90d prod / 30d dev; security-event audit trail exported to S3 Glacier 7y | SST infra (`sst.config.ts`) |
| Hashed user id in logs | `user_id_hash: sha256(user_id + secret)` — raw user UUIDs never in logs | `sanitize.ts` |
| BAA scope inventory | `docs/baa_scope.md` listing every vendor + tier + signed-date + masking-config-summary | `docs/baa_scope.md` (new, M1) |
| AWS account isolation | Workloads-NonHIPAA OU (D31), Phase 1 vend `marketing-prod` at launch trigger | `quilty-aws/` infra layers |

---

## Sources

- Sentry — https://sentry.io/pricing/ , https://sentry.io/legal/baa/ , https://sentry.zendesk.com/hc/en-us/articles/23858023552283 , https://docs.sentry.io/platforms/javascript/session-replay/privacy/ , https://docs.sentry.io/platforms/javascript/guides/nextjs/opentelemetry/ , https://docs.sentry.io/security-legal-pii/security/security-policy-reporting/
- PostHog — https://posthog.com/pricing , https://posthog.com/platform-packages , https://posthog.com/docs/privacy/hipaa-compliance , https://posthog.com/baa , https://posthog.com/blog/posthog-vs-sentry , https://posthog.com/blog/posthog-vs-launchdarkly , https://posthog.com/blog/best-hipaa-compliant-analytics-tools , https://posthog.com/blog/best-error-tracking-tools
- Amplitude — https://amplitude.com/pricing , https://amplitude.com/docs/session-replay/manage-privacy-settings-for-session-replay , https://github.com/amplitude/Amplitude-TypeScript/issues/887
- LaunchDarkly outage — https://launchdarkly.com/blog/what-happened-what-we-learned-and-how-were-improving/ , https://firehydrant.com/blog/service-status-update-october-20-2025/ , https://www.flagsmith.com/blog/launchdarkly-went-dark-during-aws-outage-flagsmith-didnt
- Statsig / OpenAI — https://www.statsig.com/blog/openai-acquisition , https://openai.com/index/vijaye-raji-to-become-cto-of-applications-with-acquisition-of-statsig/ , https://www.flagsmith.com/blog/why-openai-acquired-statsig
- GrowthBook / Flags landscape — https://www.growthbook.io/compare/growthbook-vs-launchdarkly , https://configcat.com/blog/top-eight-launchdarkly-alternatives/
- Vercel Flags + Hypertune — https://vercel.com/docs/flags , https://www.hypertune.com/blog/feature-flags-and-ab-testing-at-the-edge-with-hypertune-nextjs-and-vercel
- OpenTelemetry / W3C — https://opentelemetry.io/docs/ , https://nextjs.org/docs/app/guides/open-telemetry , https://www.w3.org/TR/trace-context/ , https://www.infoq.com/news/2026/02/opentelemetry-observability/
- Web Vitals — https://github.com/GoogleChrome/web-vitals , https://web.dev/articles/vitals , https://nextjs.org/docs/pages/api-reference/functions/use-report-web-vitals
- FullStory / LogRocket — https://help.fullstory.com/hc/en-us/articles/4408633932439-Form-Privacy , https://help.fullstory.com/hc/en-us/articles/360044349073-Fullstory-Private-by-Default , https://www.paubox.com/blog/is-fullstory-hipaa-compliant-1
