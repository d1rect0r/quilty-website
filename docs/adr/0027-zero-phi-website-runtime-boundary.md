# ADR-0027: Zero-PHI website runtime boundary

- **Status:** Accepted (drafted 2026-05-30, pending review)
- **Date:** 2026-05-30
- **Last reviewed:** 2026-05-30
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** `docs/website_strategy_discussion.md` § D31 + CLAUDE.md § "Critical compliance rules". Formalizes a decision that was load-bearing from the first scaffold but scattered across ADR-0002 + ADR-0004 + ADR-0005 + ADR-0013 + CLAUDE.md (README "planned-but-not-yet-written" item #2).
- **Related decisions:** D31 (zero PHI in website runtime — this ADR's canonical decision), D5 (BFF token-broker pattern), D40 (mask-all session replay), D42d (CloudWatch server-side zero-PHI logs), D47 (Phase-0 `development` account), D67 (PHI sanitizer chokepoint), D148 (PHI-in-error ESLint rule), D176-D178 (vaping-cessation framing + multi-state CHD posture + Phase-1 BA-ready split)
- **Related ADRs:** [ADR-0002](0002-session-cookie-pattern.md), [ADR-0004](0004-observability-stack.md), [ADR-0005](0005-csp-two-tier.md), [ADR-0010](0010-composition-root.md), [ADR-0011](0011-container-discriminated-union.md), [ADR-0013](0013-phi-scrubber-port.md), [ADR-0025](0025-cessation-data-retention.md), [ADR-0026](0026-pre-ai-feature-compliance.md)
- **Related research:** FTC Cerebral $7M settlement (March 2023) — analytics-SDK PHI exfiltration; Monument Health $2.5M settlement (April 2024) — addiction-treatment tracking-pixel disclosure; HHS OCR online-tracking-technologies bulletin (December 2022, revised March 2024)
- **Software versions assumed:** Next.js 16, `@quilty/security` 0.1, `@quilty/observability` 0.1, `@quilty/consent` 0.1, `@sentry/nextjs` 10.53, Node 24, SST 4.14

## Context

The single most expensive failure mode for a health-adjacent consumer website is not a breach of a database — it is the quiet, continuous exfiltration of regulated health data through third-party scripts that the operator deliberately installed. The FTC's $7M Cerebral order (March 2023) turned on exactly this: an analytics SDK collected free-text form content and shipped it to third-party advertising servers. The Monument Health order (April 2024) found the same pattern in an addiction-treatment context — tracking pixels disclosing health-status inferences without consent. Neither was a "hacker got in" story. Both were "we configured a vendor SDK to capture more than we realized, and nothing between the field and the wire stopped it."

Quilty is a vaping-cessation product (D176). Its data — quit attempts, craving logs, trigger tags, mood entries — is consumer health data (CHD) under WA MHMDA + MD MODPA + CA CMIA + FTC HBNR (D177). The mobile app and the Rust sync backend hold that data under a HIPAA-aligned posture. **The website does not, and must not.** The website's job is narrow: marketing pages, sign-in, and account/subscription management. It is a thin UI rendering + token-broker layer (D5) — it renders React to HTML, brokers OIDC callbacks, sets `__Host-` session cookies, and proxies authenticated API calls to the Rust backend. Business logic and PHI live behind that proxy.

The forces:

1. **Regulatory.** A tracking-pixel exfiltration from a PHI-handling surface is the precise fact pattern the FTC has settled four times (Cerebral, GoodRx, BetterHelp, Monument). Keeping PHI out of the website runtime entirely is the load-bearing anti-OCR control — the banner UI and consent toggles are cosmetic if PHI is in the runtime where a misconfigured SDK can reach it.
2. **Architectural.** The website runs in the Phase-0 `development` AWS account (D47), which is NOT in the BAA OU. Co-locating PHI with the marketing tier here would pull the account into BAA scope and recreate the Cerebral exposure. Phase-1 vends a dedicated `marketing-prod` account in the Workloads-NonHIPAA OU (D178) precisely so the website tier is structurally outside the BAA boundary, with an SCP forbidding website principals from touching PHI buckets.
3. **Operational.** "Zero PHI" cannot be a policy in a wiki. Every sink that _could_ carry PHI — error reports, structured logs, analytics events, session-replay frames, CloudFront cache keys, browser state — needs a mechanical chokepoint, because the next contributor who adds `throw new Error(\`failed for ${email}\`)` will not have read the wiki.

The "do nothing" outcome: PHI leaks through the path of least resistance. An engineer interpolates an email into an error message → it reaches Sentry → it is now in a third-party store outside the BAA. A new analytics call ships a craving-log field before consent → the Cerebral pattern, verbatim. A CloudFront cache key includes a query-string token → PHI is cached at edge. Each of these is a single careless line, and without a chokepoint each is a $1.5-7M FTC exposure and a multi-state-AG CHD action.

## Decision

**No protected health information (PHI) and no consumer health data (CHD) may enter the website runtime — not the CloudFront cache, not Lambda/CloudWatch logs, not browser state, not any third-party SDK. The website's scope is permanently limited to marketing, sign-in, and account/subscription management. PHI stays in the mobile app and the Rust sync backend, reachable from the website only via the authenticated BFF proxy that never deserializes PHI into website-runtime state. This invariant is enforced mechanically by the `@quilty/security` sanitizer chokepoint (`sanitize` + `assertNoPHI`), the single-chokepoint observability composition (`@quilty/observability`), author-time ESLint rules (`no-console` + a direct-vendor-SDK-import ban), and the Phase-1 account-isolation split into the Workloads-NonHIPAA OU.**

### Scope boundary (what the website tier may hold)

| May enter the website runtime                                                                                                                           | May NEVER enter the website runtime                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Marketing copy, MDX content, design tokens                                                                                                              | Craving logs, quit-attempt records, trigger/mood tags, streak data                                                            |
| Opaque session ID (`__Host-quilty_sid`), CSRF token, consent cookie                                                                                     | Raw `quilty_sub` (only the HMAC-pseudonymized form crosses any boundary — D67)                                                |
| HMAC-pseudonymized `quilty_sub`, `request_id`, `trace_id`, `route`, `error_code`, `flag_name`, `locale`, `version` (the sanitizer allowlist — ADR-0013) | Email, phone, SSN, DOB, MRN, clinical-instrument scores (PHQ/AUDIT-C/DAST), device advertising IDs, geo-precision identifiers |
| Subscription tier + billing status (non-clinical commerce metadata)                                                                                     | Anything a HIPAA Safe-Harbor §164.514(b)(2) identifier or a CHD inference would classify                                      |
| Account-management form inputs in transit (scrubbed before any sink)                                                                                    | Account-management free-text PERSISTED to a log / error / analytics / replay sink unscrubbed                                  |

The four named sinks from D31, restated as hard rules:

1. **No PHI in the CloudFront cache.** Cache keys are derived from path + a fixed, allowlisted query-param set — never from user-identifying tokens. Authenticated portal responses are `Cache-Control: no-store` (the portal CSP route class per ADR-0005 already segregates these routes).
2. **No PHI in Lambda / CloudWatch logs.** Logs are server-side only and zero-PHI by construction (D42d). Every emission passes the sanitizer before the channel; `no-console` (ESLint `error`) forces all logging through the wrapped `Logger` port so `sanitize()` runs first.
3. **No PHI in browser state.** Tokens never reach the browser (BFF, D5) — the browser holds an opaque session ID, not the access/refresh tokens. No PHI is hydrated into client component props, React state, `localStorage`, or `sessionStorage`.
4. **No PHI in third-party SDKs.** Sentry, PostHog, and any future vendor SDK are reachable only through `@quilty/observability` wrappers that consent-gate (D35) and PHI-scrub (ADR-0013) every payload. Direct vendor-SDK imports are an ESLint error outside the observability package.

### Enforcement (how it is true in code today)

This is not a documentation-only invariant. Five mechanical layers hold it:

1. **`@quilty/security` sanitizer chokepoint.** `sanitize` / `sanitizeAsync` scrub a ~65-key PHI denylist plus value-pattern regexes (email, phone, SSN, card, DOB, MRN — ADR-0013 Layer 2), and `assertNoPHI` is a dev/test runtime assertion that fails loudly when a PHI-shaped key reaches a sink. `makeSanitizer()` returns the `Sanitizer` port other packages compose around. Both are exported from the `@quilty/security` barrel (`packages/security/src/index.ts`).
2. **Single-chokepoint observability composition.** `@quilty/observability`'s `wrapAnalytics` (`packages/observability/src/domain/wrap-analytics.ts`) composes — in order — a fail-closed consent gate (D35), an `assertNoPHI` runtime check, the sanitizer scrub, and an `allSettled` fan-out. The raw vendor adapter is never reachable from a call site; the composition root consumes the wrapper, never the adapter.
3. **PHIScrubber port at the error sink.** The sink-side `PHIScrubber` port (ADR-0013 Layer 3, `packages/observability/src/adapters/phi-scrubber.ts`) scrubs every Sentry event field — `message`, `exception.values[].value/type`, `request.url/headers/data`, `breadcrumbs`, `extra`, `tags`, `contexts`, `user.email/ip_address` — at `beforeSend` for the server/client/edge containers.
4. **Author-time ESLint.** `eslint.config.mjs` sets `no-console: error` (forcing logging through the wrapped channel) and `no-restricted-imports` banning `@sentry/nextjs`, `posthog-js`, and `posthog-node` outside `lib/observability/` — each with a message citing D35/D67. ADR-0013's `PHI_IN_ERROR_SELECTORS` additionally block PHI-denylisted identifiers inside `new Error(...)`, `captureException(...)`, and structured-log field positions.
5. **Composition-root wiring.** `apps/web/composition.{server,client,edge}.ts` (ADR-0010 + ADR-0011) wire the sanitizer, the default-deny consent reader, and the PHI scrubber once per runtime. Because the container is a runtime-tagged discriminated union (ADR-0011), server-only ports are statically inaccessible from client code, so PHI-handling seams cannot be wired into a browser bundle by accident.

### Phase-1 account isolation relationship

The code chokepoints are the inner defense; account isolation is the outer one. At Phase 0 the website runs in the shared `development` account (D47) with the zero-PHI invariant enforced in code. At the Phase-1 trigger (public launch or first revenue), the website migrates to a dedicated `marketing-prod` account in the **Workloads-NonHIPAA OU** (D178). An SCP forbids website-account principals from accessing PHI buckets. This means even a total failure of the in-code chokepoint cannot reach PHI from the marketing tier — the IAM/SCP boundary stands behind the sanitizer. This two-tier defense (code chokepoint + account boundary) is the structural answer to the Cerebral/Monument fact pattern: the data the SDK would have exfiltrated is not present in the runtime, and is not reachable by the runtime's principal even if it were.

## Consequences

### Positive

- **Cerebral / Monument fact pattern is structurally unreachable.** PHI is not in the runtime to exfiltrate; every sink has a chokepoint; the account principal cannot reach PHI stores. The failure mode FTC §5 has settled four times is foreclosed at three layers.
- **The website is permanently outside BAA scope.** Keeping PHI out of the marketing tier is what lets the Phase-1 account split (D178) isolate the BAA risk into a separate OU — the architecture is BA-ready without ever making the website a BA.
- **The thin-shell discipline stays honest.** "Zero PHI" is the forcing function that keeps the website a UI + token-broker layer (D5) rather than accreting backend logic that would inevitably want to touch PHI.
- **New sinks inherit the chokepoint for free.** Any new analytics destination or log channel composed through `@quilty/observability` gets consent-gating + PHI-scrubbing without the author re-deriving the policy.

### Negative

- **Some genuinely useful product surfaces are off the table on the website.** Anything that needs to render a user's craving log, streak history, or clinical-progress data must live in the mobile app or a future `app.my-quilty.com` surface inside the appropriate boundary — not on the marketing/portal tier. This is a deliberate constraint, not an oversight.
- **The allowlist is conservative and occasionally inconvenient.** Debugging is harder when error messages cannot carry the offending value; engineers must reach for `request_id` / `trace_id` correlation instead of interpolating identifiers. ADR-0013's author-time rule makes this friction immediate rather than discovering it at the Sentry sink.
- **Every new vendor SDK is gated work, not a drop-in.** Adding a marketing pixel or a new analytics vendor requires an adapter behind the `@quilty/observability` wrapper plus a consent-category mapping — there is no fast path that bypasses the chokepoint, by design.

### Neutral

- **The invariant is partly redundant with ADR-0013, ADR-0004, ADR-0005, and ADR-0002.** This ADR is the canonical statement of the _boundary_; those ADRs implement specific pieces of it (the PHI scrubber, the observability stack, the CSP route classes, the cookie/token posture). The redundancy is intentional — D31 is referenced by all of them and deserves a single home.
- **Phase-0 runs in a shared account.** The account-isolation outer defense is dormant until the Phase-1 trigger; until then the in-code chokepoint carries the full weight. This is acceptable because Phase 0 is DTC-only with no PHI flow to the website tier by construction.

## Alternatives considered

### Alternative A: Allow PHI on the website behind "careful" SDK configuration

- **What it is:** Render user health data on the portal and rely on per-SDK PII-redaction settings + a BAA with each vendor to stay compliant.
- **Why rejected:** This is the Cerebral architecture. "Capability + configuration" gaps are the documented failure — the SDK _could_ capture the field and the config _did_, with nothing structural in between. BAAs with analytics vendors are fragile, expensive, and do not undo an exfiltration that already happened. Keeping PHI out of the runtime is categorically stronger than configuring vendors to handle it carefully.

### Alternative B: Single AWS account for marketing + PHI services

- **What it is:** Co-locate the website with the PHI-handling backend in one account; rely only on in-code controls.
- **Why rejected:** Removes the outer defense entirely and pulls the marketing tier into BAA scope. The Cerebral/Monument exfiltrations came from PHI-handling accounts; the Phase-1 split (D178) exists specifically to put the website outside that OU. A single account would recreate the exact blast radius the split is designed to prevent.

### Alternative C: Sanitize at each emission call site instead of a chokepoint

- **What it is:** Ask every developer to call a `redact()` helper before every log / error / analytics emission.
- **Why rejected:** Distributes the responsibility to N call sites; the next contributor forgets one and PHI leaks. The wrapper-around-adapter chokepoint (ADR-0010 + ADR-0013) makes the redaction structural — a call site _cannot_ bypass it, because the raw adapter is not importable.

## Compliance / Verification

- **Author-time:** `eslint.config.mjs` `no-console: error` + `no-restricted-imports` vendor-SDK ban + ADR-0013 `PHI_IN_ERROR_SELECTORS`; fires at PR time + lint-staged. Tests at `packages/eslint-config-tests/__tests__/eslint-phi-error-rules.test.ts`.
- **Runtime sanitizer:** `packages/security/src/__tests__/{sanitizer,value-patterns}.test.ts` cover the denylist + value-pattern parity across sync + async paths.
- **Observability chokepoint:** `packages/observability/src/__tests__/wrap-analytics.contract.test.ts` (consent-gate + scrub composition order) + `phi-scrubber.test.ts` (Sentry-event field coverage + untouched-field passthrough).
- **Composition-root wiring:** `.dependency-cruiser.cjs` enforces that vendor SDKs are imported only inside the observability package; the runtime-tagged container (ADR-0011) makes server-only ports statically inaccessible from client code.
- **Account isolation (Phase 1):** SCP test in `quilty-aws` denies website-account principals `s3:*` on PHI bucket ARNs; verified at the Phase-1 cutover.
- **Manual audit:** periodic review that no portal route returns CHD in its response body or hydrated props; CloudFront cache-key inspection for absence of identifying query params.

## Revisit triggers

- **First product requirement to render user health data on a website surface** — forces an explicit decision about whether that surface belongs on the website tier at all, or on a future `app.my-quilty.com` inside a proper boundary. Never silently relax this ADR.
- **Phase-1 account migration** — activates the SCP outer defense; verify the OU placement (Workloads-NonHIPAA) + the PHI-bucket SCP at cutover.
- **First signed B2B / claims-billing contract (D178, TW-010 / TW-013)** — re-evaluates whether any BA-scope data path touches the website tier; default answer stays "no."
- **New third-party SDK proposal** — must route through `@quilty/observability` with a consent category; a vendor that cannot be wrapped is rejected.
- **FTC / state-AG enforcement against a cessation or health-adjacent peer for tracking-pixel exfiltration** — full audit of every website sink against the new fact pattern.
- **Next.js / OpenNext caching-model change** that alters CloudFront cache-key derivation — re-verify no identifying token can enter a cache key.

## References

- FTC Cerebral settlement ($7M, 2023-03, analytics-SDK PHI exfiltration): <https://www.ftc.gov/news-events/news/press-releases/2024/04/ftc-action-leads-7-million-judgment-against-cerebral-failing-secure-sensitive-consumer-data>
- FTC Monument settlement (addiction-treatment tracking pixels, 2024-04): <https://www.ftc.gov/news-events/news/press-releases/2024/04/ftc-finalizes-order-monument-banning-it-disclosing-health-data-advertising>
- HHS OCR online-tracking-technologies bulletin: <https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/hipaa-online-tracking/index.html>
- HIPAA Safe Harbor de-identification §164.514(b)(2): <https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.514>
- FD&C Act §520(o)(1)(B) general-wellness lane (product classification, ADR-0023): <https://www.fda.gov/medical-devices/digital-health-center-excellence/general-wellness-policy-low-risk-devices>
- Strategy doc D31 + D176-D178: `docs/website_strategy_discussion.md`
