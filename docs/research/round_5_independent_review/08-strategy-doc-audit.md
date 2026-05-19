# Internal Audit — Quilty Website Strategy vs Research

> Auditor: fresh agent, treating the in-repo strategy doc + roadmap + 8 research reports + CLAUDE.md + README.md as canonical sources.
> Scope: decision-vs-research drift, untranslated findings, cross-decision contradictions, silent assumptions, doc coherence.
> Plan-mode output: read-only review. No code or doc changes proposed; findings only.

---

## Section 1: Decision drift audit

> Convention: silent items (no drift, well-evidenced) collapsed to a single line. Anything flagged gets the full block.

**D1 — Next.js 16 App Router + TypeScript.** Source: `framework_deploy_architecture.md` §1 + §2. **No drift. Severity: NONE.** Research explicitly endorses App Router as the right default for "marketing pages + account portal that mostly displays data" and the strategy doc correctly carries that conditional rationale.

**D2 — SST (uses OpenNext) on AWS.** Source: `framework_deploy_architecture.md` §2.

- **Drift:** Strategy doc says "SST 3.x" but research says SST is in flux (Next.js 16.2 Adapter API stabilized Mar 2026; unified adapter monorepo expected end of 2026). Today is 2026-05-17 — current shipping SST line is **4.x** (verified per the user's brief). Strategy doc undershoots the version.
- **Severity: MEDIUM** — version is not architecturally load-bearing, but pinning to "3.x" in the orientation doc misleads the scaffold step.

**D3 — Single Next.js app for marketing + `/account/*`.** Source: `framework_deploy_architecture.md` §3 (Formcake case study). **No drift. Severity: NONE.**

**D4 — Turborepo + pnpm + `apps/web` + `packages/ui` + `packages/shared-types`.** Source: `framework_deploy_architecture.md` §5.

- **Drift:** Research recommends `apps/website` + `packages/shared-types`; strategy doc adds `packages/ui` workspace. That's a defensible expansion but research treats `packages/ui` extraction as _ADDITIVE_ ("Defer until second consuming app exists"). Strategy D4 carries this by carving the workspace empty until trigger per D49 — coherent on paper, but the framing in the design-system research (`design_system_a11y.md` §2) is stronger: shadcn monorepo support uses `@workspace/ui/components` even in a non-monorepo, suggesting the workspace can be created empty as a forward seam.
- **Severity: LOW** — internally consistent, just worth surfacing that "empty workspace at scaffold" is a deliberate seam, not a placeholder.

**D5 — BFF via Next.js Route Handlers.** Source: `auth_session_architecture.md` §2 + `framework_deploy_architecture.md` §6. **No drift. Severity: NONE.** Strongly evidenced (IETF BCP Dec 2025).

**D6 — Cognito Hosted UI at `auth.my-quilty.com`.** Source: `auth_session_architecture.md` §3 + `external_integrations.md` §6. **No drift. Severity: NONE.** Subdomain rename from `quilty.app` to `my-quilty.com` is explicitly logged in the update log.

**D7 — `__Host-` cookies + OIDC code flow per subdomain.** Source: `auth_session_architecture.md` §1 + §4. **No drift. Severity: NONE.** Research explicitly flags "`__Host-` is mutually exclusive with parent-domain cookies" and the strategy doc carries that constraint. Round-2 update log captures the revision from earlier hypothesis correctly.

**D8 — SameSite=Lax.** Source: `auth_session_architecture.md` §1 + §7. **No drift. Severity: NONE.**

**D9 — OIDC Backchannel Logout with `sid`.** Source: `auth_session_architecture.md` §6.

- **Drift:** Research says **"Cognito supports it"** in one sentence with no citation. The strategy doc inherits the claim verbatim ("Cognito supports it"). This is the single most load-bearing unverified claim in the auth stack — see Section 3 contradiction analysis.
- **Severity: HIGH** — entire D9 + D11 stack depends on this. The research footnotes the OIDC spec (openid.net/specs/openid-connect-backchannel-1_0.html) but not the Cognito implementation claim. As of native AWS docs (audited from memory; not verified in research file), Cognito Hosted UI's backchannel logout support is not documented as a first-class feature — there is no `backchannel_logout_uri` registration field in the Cognito app-client config, and `sid` is not in the standard Cognito ID token claim set. **The research file claims a feature that Cognito has not been verified to ship.**

**D10 — Signed double-submit CSRF + custom `X-Quilty-CSRF` header.** Source: `auth_session_architecture.md` §7. **No drift. Severity: NONE.**

**D11 — Independent mobile-web sessions joined by `sid`, not Native SSO.** Source: `auth_session_architecture.md` §6. **Drift inherited from D9.** Same root cause: `sid` claim assumed present in Cognito tokens. **Severity: HIGH (inherited from D9).**

**D12-D16 — Domain + routing.** Source: `content_i18n_seo.md` §2 + §5 + §8 + `framework_deploy_architecture.md` §4. **No drift. Severity: NONE.**

**D17 — Tailwind v4 + `@theme` 3-layer token namespace.** Source: `design_system_a11y.md` §1. **No drift. Severity: NONE.** Research explicitly names "primitives → semantic → component" three-layer and identifies it as the seam every enterprise system regretted skipping.

**D18 — shadcn in `components/ui/` + wrap-don't-edit.** Source: `design_system_a11y.md` §2 + §3. **No drift. Severity: NONE.** CLAUDE.md places primitives at `apps/web/components/ui/` and wraps at `apps/web/components/app/` — consistent.

**D19 — Lucide React.** Source: `design_system_a11y.md` §9. **No drift. Severity: NONE.**

**D20 — Dark-mode-ready CSS vars (light tokens now; switch hook later).** Source: `design_system_a11y.md` §7. **No drift. Severity: NONE.**

**D21 — `next/font` + `next/image` discipline.** Source: `design_system_a11y.md` §8. **No drift. Severity: NONE.**

**D22 — `@axe-core/playwright` + `eslint-plugin-jsx-a11y`.** Source: `design_system_a11y.md` §5.

- **Drift:** Strategy doc cites "Deque's own figure: ~57%" for automation catch rate. Research file says "Deque's own figure — axe catches **~57% by volume**" but also names "40–43% automation ceiling" in the same paragraph. The 40-57% range reflects axe-by-volume vs WCAG-issues-by-type. Strategy doc carries one end without the band.
- **Severity: LOW** — direction is right; the % cited is one of two figures the research itself gives.

**D23 — WCAG 2.2 AA, not AAA.** Source: `design_system_a11y.md` §5 + CORE table. **No drift. Severity: NONE.**

**D24 — Pages as typed block arrays.** Source: `content_i18n_seo.md` §1 + §4. **No drift. Severity: NONE.**

**D25 — next-intl.** Source: `content_i18n_seo.md` §2. **No drift. Severity: NONE.**

**D26 — Metadata baseline.** Source: `content_i18n_seo.md` §3. **No drift. Severity: NONE.**

**D27 — Schema.org baseline including `FAQPage`.**

- Source: `content_i18n_seo.md` §3.
- **Drift:** Strategy doc lists `FAQPage` as part of the baseline. Per the prompt's prior, **Google retired `FAQPage` rich-result eligibility in May 2026** for most sites (only government/health authority sites retain it). The research file (dated 2026-05-14) pre-dates that retirement and doesn't reflect it; strategy doc has not been updated to reflect it.
- **Severity: MEDIUM** — leaving `FAQPage` in the baseline doesn't break anything (the markup is still valid JSON-LD) but it misleads as a "structured-data SEO play." Should be downgraded to "we may emit it but it no longer earns rich-result placement" or replaced with `MedicalWebPage` FAQ section embedding. **Worth a strategy-doc update.**

**D28 — RUM tracking INP/LCP/CLS.** Source: `content_i18n_seo.md` §3 + `design_system_a11y.md` §8. **No drift. Severity: NONE.**

**D29 — Marketing block library.** Source: `content_i18n_seo.md` §4 + `design_system_a11y.md` §3. **No drift. Severity: NONE.**

**D30 — MDX-now → CMS-later.** Source: `content_i18n_seo.md` §1. **No drift. Severity: NONE.**

**D31 — Zero-PHI website.** Source: `security_observability_compliance.md` §5. **No drift. Severity: NONE.** Strongly evidenced (Cerebral $7M, Monument).

**D32 — CSP nonce + strict-dynamic, report-only → enforce.** Source: `security_observability_compliance.md` §1. **No drift. Severity: NONE.**

**D33 — HSTS preload + frame-ancestors + Referrer-Policy + Permissions-Policy default-deny camera/mic/geo.** Source: `security_observability_compliance.md` §1. **No drift. Severity: NONE.**

**D34 — SRI on third-party scripts (Stripe.js + 2-3 analytics).**

- Source: `security_observability_compliance.md` §1.
- **Drift:** Strategy doc and research both list "SRI on Stripe.js" as the prime example. **Stripe explicitly does not publish or guarantee SRI hashes for `js.stripe.com/v3/`** — they update the script frequently, and Stripe's own docs/community guidance is that SRI on Stripe.js will cause periodic outages whenever Stripe ships a patch. (Verified in the prompt's prior; not contradicted by anything in the research file.)
- **Severity: HIGH** — the lock as written is operationally wrong. Selective-SRI policy is correct; the named example is wrong. Should be reframed as "SRI on third-party scripts WHEN THE VENDOR PUBLISHES HASHES; Stripe.js is the documented exception — pin via CSP + `frame-src js.stripe.com` instead." **Worth a strategy-doc update before M1's `next.config.ts` ships headers.**

**D35 — Server-side ConsentState SoT + GPC + SDK-gated.** Source: `security_observability_compliance.md` §2. **No drift. Severity: NONE.** Cerebral/Monument lesson carried correctly.

**D36 — CycloneDX SBOM + Dependabot + lockfile pinning.** Source: `security_observability_compliance.md` §6. **No drift. Severity: NONE.**

**D37 — CloudFront WAF managed rules + Cloudflare Turnstile on auth/signup.** Source: `security_observability_compliance.md` §7. **No drift. Severity: NONE.**

**D38 — W3C traceparent → x_trace_id propagation.** Source: `security_observability_compliance.md` §3. **No drift. Severity: NONE.**

**D39 — Web mutations on same `/v1/*` endpoints + traceparent + Idempotency-Key + `channel:"web"`.** Source: `security_observability_compliance.md` §4. **No drift. Severity: NONE.**

**D40 — Session replay default mask-all + allowlist.** Source: `security_observability_compliance.md` §3. **No drift. Severity: NONE.**

**D41 — Server-side flag eval with local cache.** Source: `security_observability_compliance.md` §8. **No drift. Severity: NONE.** LaunchDarkly Oct 2025 outage lesson carried.

**D42a — Sentry Business tier (errors + RUM) day-one + thin `logError()`.**

- Source: `security_observability_compliance.md` §3.
- **Drift:** Research says "Sentry **OR** Datadog RUM" and explicitly raises "PostHog with BAA is the closest single-vendor fit (analytics + replay + flags under one BAA)." Strategy doc picks Sentry without recording the PostHog alternative analysis. Update log says "single source of truth for product decisions … industry standard for consumer-health (Headspace, Calm)" — that argument doesn't appear in the research file; it appears to be added at lock time without backing.
- **Severity: MEDIUM** — Sentry is a defensible pick, but the PostHog single-platform alternative is documented in research as a real competitor and the strategy doc shouldn't have skipped it silently. See Section 4 silent-assumption #4.

**D42b — Amplitude for product analytics.**

- Source: NOT in the research files. Strategy doc rationale ("matches mobile choice"; "industry standard for consumer-health (Headspace, Calm)") is asserted in the update log without research citation.
- **Drift:** No research file evaluates Amplitude vs Mixpanel vs PostHog as a product-analytics decision. The justification "matches mobile" is a project-internal fact, not a research finding. **No underlying research found for D42b.**
- **Severity: MEDIUM** — pick is defensible (mobile-web consolidation has real value) but the strategy doc rationale is light. Also: Amplitude BAA cost is not stated (see Section 4 silent-assumption).

**D42c — Session replay deferred.** Source: `security_observability_compliance.md` §3 (mask-all default doc'd; vendor open). **No drift. Severity: NONE.**

**D42d — CloudWatch for server-side logs.** Source: research only mentions CloudWatch tangentially in framework_deploy. Strategy treats it as a foregone conclusion (AWS substrate). **No drift. Severity: NONE.**

**D43 — Typed `features.ts` env-var module day-one + GrowthBook self-hosted at trigger.** Source: `security_observability_compliance.md` §8.

- **Drift:** Research names "GrowthBook self-hosted **or Statsig** (HIPAA BAA available)." Strategy doc picks GrowthBook without recording the Statsig comparison.
- **Severity: LOW** — GrowthBook is the safer pick (self-hosted = full data control), but Statsig also has BAA. **The LaunchDarkly Oct 2025 lesson is absorbed correctly** (server-side eval + local cache is the structural shape) — that part is fine.

**D44 — Subscription provider** (deferred, but baseline locked to Stripe + Stripe Customer Portal + RevenueCat for IAP). Source: `consumer_health_patterns.md` §1 + §3 + `regulatory_requirements.md` §5. **No drift. Severity: NONE.**

**D45 — `my-quilty.com` public domain.** Source: User-stated reality, not research. Strategy doc captures the swap from earlier `quilty.app` hypothesis. **No drift. Severity: NONE.**

**D46 — Website in separate `quilty-website` repo.** Source: Round-3/Round-4 enterprise research (referenced in update log but **not present as a research file in `docs/research/`**).

- **Drift:** Strategy doc cites "Round-3 enterprise research" and "8 research reports across 4 rounds" — but `docs/research/` only has the 8 Round-1/Round-2 files; the Round-3 and Round-4 enterprise findings are summarized in the strategy update log itself, not preserved as separate research artifacts.
- **Severity: LOW** — the _decision_ is defensible (matches industry consensus on polyrepo regret), but the "where to find the underlying research" link is broken. **Worth surfacing: round-3 + round-4 enterprise research is verbal-in-update-log only.**

**D47 — Phase 0 = existing `development` account.** Same source-tracing issue as D46. **No drift in the decision. Severity: LOW** (same audit-trail issue).

**D48 — Backend permanently Rust; OpenAPI as cross-language contract.** Source: User-confirmed organizational reality (Track A migration). Not a research-derived decision. **No drift. Severity: NONE.**

**D49 — All other restructuring deferred to Phase 1+ triggers.** Source: Round-4 research (in update log only). **No drift. Severity: LOW** (same source-tracing issue as D46/D47).

---

## Section 2: Research findings not translated into decisions

### `auth_session_architecture.md`

- **Finding:** Refresh token rotation + RTFAMILY reuse detection ("CORE (done)"). Research treats this as already-shipped in W2-B.2 and inherited by BFF.
  - **Why it matters:** The website's BFF will hold refresh tokens; the rotation/reuse-detection plumbing has to be plumbed through the BFF, not just the API gateway. Strategy doc doesn't enumerate this as a website-side decision.
  - **Should it become a decision?** MAYBE — at minimum a one-line decision in the auth block saying "Web BFF inherits the W2-B.2 RTFAMILY rotation; refresh happens server-side in the BFF, never in the browser."
- **Finding:** RFC 9470 step-up auth challenge surface ("ADDITIVE"). Research notes BFF intercepts 401 + step-up challenge and redirects to Hosted UI with elevated `acr_values`.
  - **Why it matters:** Step-up flows for "change email," "delete account," "manage MFA" are real M6 requirements; the BFF middleware design needs to know step-up is in scope.
  - **Should it become a decision?** YES — even as "ADDITIVE pattern locked: BFF translates RFC 9470 challenge into Hosted UI re-auth round-trip." Currently not surfaced in the decision log; M6 deliverable section mentions "step-up auth surface" but no D-number anchors it.
- **Finding:** Safari ITP behavior — JS-set first-party cookies capped at 7 days; server-set are not.
  - **Why it matters:** Implies cookie-setting must always go through the BFF, never via `document.cookie` from client code. This is operationally load-bearing but not stated as a decision.
  - **Should it become a decision?** YES — single-line discipline rule: "Session cookies set server-side from BFF only; client never writes `document.cookie` for session-bearing values."
- **Finding:** Iron-session / cookie encryption pattern not addressed at all. The BFF stores tokens "in Redis/server-side cache" per research §2.
  - **Why it matters:** D5 says BFF, but does the session cookie itself encrypt the payload (Iron-session pattern) or just bear an opaque session ID indexing into ElastiCache/Valkey? The roadmap §M6 says "Cache layer (ElastiCache Valkey) — BFF session storage TBD — may use, may rely on cookies only." Genuine ambiguity left to M6.
  - **Should it become a decision?** YES — before M6 ships, lock the session storage model (opaque session-ID + Redis vs encrypted-payload-in-cookie). Both work; mixing them later is painful.

### `consumer_health_patterns.md`

- **Finding:** "Receipt/invoice download for HSA/FSA reimbursement" — Headspace, Oura, WHOOP all surface this prominently.
  - **Why it matters:** Mental-health spend is widely HSA/FSA-eligible. The website's account portal (M7) needs invoice PDF download. Roadmap M7 says "HSA/FSA invoice download" but no D-number.
  - **Should it become a decision?** NO — already in M7 deliverables; doesn't need a D-number, just confirms scope.
- **Finding:** Session/device management ("sign out everywhere", connected-devices list) — present in healthcare-grade portals but rarely surfaced in marketing.
  - **Why it matters:** Different from D9 backchannel logout. This is the UX surface for _user-initiated_ device list + revocation, distinct from server-initiated logout propagation.
  - **Should it become a decision?** MAYBE — could be captured in the Auth block as "Session list UI is M6 deliverable; uses backchannel logout from D9 as the propagation mechanism."
- **Finding:** Connected-apps / OAuth grants UI (Strava, MyFitnessPal have it).
  - **Why it matters:** Likely out of scope for Quilty's first surface, but the architectural pattern (BFF-mediated OAuth grants management) is worth flagging.
  - **Should it become a decision?** NO — genuinely deferrable.

### `content_i18n_seo.md`

- **Finding:** Hreflang self-reference with `x-default` is a "common mistake" that invalidates the whole cluster.
  - **Why it matters:** When second locale ships (post-launch), the team must remember this. Easy to forget.
  - **Should it become a decision?** MAYBE — add to the i18n trigger watchlist with the warning, not a current D-decision.
- **Finding:** Sanity = document-level i18n vs Contentful = field-level i18n — research recommends field-level for Quilty.
  - **Why it matters:** When CMS migration triggers (D30), this is a decision-shaping point that strategy doc deferred without recording the recommendation.
  - **Should it become a decision?** NO — captured in research, deferral is correct.
- **Finding:** `next/third-parties` or "Vercel Speed Insights" as RUM mechanism.
  - **Why it matters:** D28 says "RUM tracking INP/LCP/CLS" but doesn't say _how_. Strategy doc relies on D42a (Sentry RUM). The `next/third-parties` mention in research is just one alternative path.
  - **Should it become a decision?** NO — Sentry RUM (D42a) covers it.

### `design_system_a11y.md`

- **Finding:** View Transitions API has Baseline support (Chrome 111+, Safari 18+, Firefox 133+) — preferred over Motion for page-level transitions.
  - **Why it matters:** Tiny but real architectural seam: "for page transitions, use View Transitions API; reserve Motion for gestures/orchestration."
  - **Should it become a decision?** NO — additive, can land when first animation requirement appears.
- **Finding:** Keyboard-trap + focus-management tests as Playwright user flows, not unit tests.
  - **Why it matters:** Testing strategy implication. Strategy doc has D22 for axe-core but doesn't specify keyboard/focus testing posture.
  - **Should it become a decision?** MAYBE — testing posture is genuinely TBD in roadmap ("when do we TDD, when do we test-after"), so this could land as a TestAuthor-skill convention rather than a D-number.

### `external_integrations.md`

- **Finding:** Google Play Jan-2026 update: privacy URL must be **identical strings** in Play Console, in-app, and on website.
  - **Why it matters:** Lock the URL string before M2 ships placeholder privacy. Catches the "should it be `/privacy/` or `/privacy`?" gotcha (intersects D13 trailingSlash: false).
  - **Should it become a decision?** NO — already implicitly satisfied by D13 + the placeholder `/privacy` page in M2. Worth flagging as a launch-gate check item, not a D-number.
- **Finding:** Apple Developer Program org enrollment requires real website; "Links to social media... or domain-registrar parking pages won't be accepted."
  - **Why it matters:** External-system forcing function; orientation for "why M1 matters." Strategy doc carries this in the North Star ("external onboarding clears as byproduct"); roadmap launch-readiness checklist includes Apple Dev org enrollment.
  - **Should it become a decision?** NO — operational, not architectural.

### `framework_deploy_architecture.md`

- **Finding:** CloudFront 25 cache-behaviors cap; 1 MB Lambda@Edge request body cap; 60s default CloudFront timeout.
  - **Why it matters:** Route layout constraint. If `/api/*` and `/account/*` and `/blog/*` each need distinct cache behaviors, 25 is finite.
  - **Should it become a decision?** NO — operational constraint. Worth a note in SST config when M1 lands.
- **Finding:** "No HIPAA guidance in SST docs. You'll need to validate BAA coverage on each underlying primitive yourself."
  - **Why it matters:** Implies an explicit BAA-inventory ADR for the website tier (Lambda, CloudFront, S3, DynamoDB cache). CLAUDE.md mentions "vendor BAA inventory" once; strategy doc doesn't enumerate.
  - **Should it become a decision?** YES — an ADR ("Website tier BAA inventory: which AWS primitives we use under BAA, which vendors carry website-side BAAs, which surfaces are PHI-free and don't need one"). Material for HIPAA defensibility.
- **Finding:** Server Actions for mutations marked ADDITIVE; "Server Actions are queued. Using them for data fetching introduces sequential execution."
  - **Why it matters:** D5 BFF locks Route Handlers; doesn't address Server Actions. Implicit conflict — when is Server Actions vs Route Handler the right choice?
  - **Should it become a decision?** MAYBE — a one-liner in D5: "Mutations via Server Actions where same-origin form-post UX is desired; cross-origin or API-shape mutations via Route Handlers. Read paths via direct Server Component fetch to Rust backend."

### `regulatory_requirements.md`

- **Finding:** Two CCPA opt-out submission methods required, one must be **interactive web form** — not just the "Your Privacy Choices" link.
  - **Why it matters:** Cosmetic-banner-only is insufficient. M8 deliverable list says "Cookie consent banner with granular GDPR + CCPA toggles" but doesn't explicitly call out the interactive-web-form requirement.
  - **Should it become a decision?** NO — already covered in spirit; flag for M8 reviewer.
- **Finding:** HIPAA NPP update deadline Feb 16, 2026 (now past) — NPPs require revision per HHS 2024 rule changes.
  - **Why it matters:** Lawyer-reviewed NPP at M8 must reflect 2024 changes, not pre-2024 template.
  - **Should it become a decision?** NO — operational/legal, not architectural. Flag for M8 lawyer brief.

### `security_observability_compliance.md`

- **Finding:** "COEP/COOP/CORP cross-origin isolation is **TRAP** at our scale."
  - **Why it matters:** Strategy doc D33 enumerates HSTS, frame-ancestors, Referrer-Policy, Permissions-Policy — but is silent on COOP/CORP. Research is silent because research called them TRAP. Coherent omission, but worth surfacing as intentional.
  - **Should it become a decision?** NO — explicit deferral is fine; could note "COOP/CORP intentionally not adopted at Phase 0" in the doc.
- **Finding:** "Trusted Types" — not addressed anywhere in research or strategy.
  - **Why it matters:** Web Almanac 2025 + emerging CSP best practice. Adds a `require-trusted-types-for 'script'` directive on top of strict-dynamic. Real defense-in-depth for DOM XSS, but it has compatibility costs (Firefox just shipped in 135).
  - **Should it become a decision?** MAYBE — at minimum acknowledge "Trusted Types deferred to post-launch" rather than silently omit.
- **Finding:** Iubenda / Cookiebot are "sufficient for the banner layer" given Quilty's scale; OneTrust is overkill.
  - **Why it matters:** Vendor recommendation for the cosmetic banner layer. Strategy doc D35 says "server-side ConsentState single source of truth" but doesn't name the banner-UI vendor.
  - **Should it become a decision?** MAYBE — could land as a D44-style deferred decision ("banner UI vendor: TBD, Iubenda/Cookiebot the likely picks").
- **Finding:** "SBOM via `@cyclonedx/cyclonedx-npm`" tool name; "same Sigstore signing seam as backend."
  - **Why it matters:** D36 says "CycloneDX SBOM" — implementation tool is `@cyclonedx/cyclonedx-npm`. Worth recording for M1 CI setup.
  - **Should it become a decision?** NO — captured indirectly.

---

## Section 3: Cross-decision contradictions

### D9 (Cognito Backchannel Logout) + D11 (mobile-web session join via `sid`) — HIGH RISK

- **Tension:** Both decisions assume Cognito supports OIDC Backchannel Logout AND emits a `sid` claim in its tokens. The research file states "Cognito supports it" without citing AWS docs. **Per the prompt's prior:** this support is parallel-being-verified and may not actually exist as a first-class Cognito feature.
- **Operational impact:** If Cognito does NOT support backchannel logout natively, then either (a) D9/D11 need to be re-engineered around a homegrown "session revocation broadcast" mechanism (DDB-backed, the backend's audit-pipeline already has the seam), or (b) D11 falls back to "best-effort session-list-and-revoke from each surface independently."
- **Resolution required:** Block M6 until Cognito backchannel-logout support is verified in AWS docs. If unsupported, design a Quilty-internal session-revocation event (e.g., DDB Streams → SQS → website BFF subscriber + mobile push subscriber) that _implements_ the OIDC backchannel-logout semantic without requiring Cognito to ship the spec. This is the single most material contradiction in the locked stack.

### D7 (`__Host-` + per-subdomain OIDC) + D11 (mobile-web join via `sid`) — MEDIUM

- **Tension:** D7 mandates session cookies cannot cross subdomain boundaries (`__Host-` forbids `Domain` attribute). D11 assumes a shared `sid` ties web + mobile sessions together. These are not literally in conflict (mobile doesn't use cookies; it uses tokens carrying `sid`), but it's worth verifying that the Cognito web app client emits the same `sid` value that the Cognito mobile app client emits for the same user session.
- **Resolution required:** Verify that `sid` is per-Cognito-session, not per-app-client. AWS docs are silent in research; needs explicit check at M6.

### D17 (Tailwind v4) + D18 (shadcn wrap-don't-edit) + D20 (dark mode) — LOW

- **Tension:** shadcn primitives ship with Tailwind v3 conventions (utility-class strings in component source). Tailwind v4's `@theme` block + CSS custom properties is a different convention. The shadcn → v4 migration story has been bumpy (shadcn started shipping v4-compatible CLI in mid-2025; older primitives still use v3 idioms).
- **D20 dark mode** depends on CSS custom properties swapped under `[data-theme="dark"]` — requires that shadcn primitives reference `var(--color-...)` rather than `hsl(...)` literals.
- **Resolution required:** At M1 scaffold, verify shadcn CLI version + which Tailwind v4 migration of primitives is being pulled in. If pulling pre-v4 primitives, the "wrap-don't-edit" rule has to be relaxed long enough to update color references to CSS-var form, or the dark-mode flip will require touching the `components/ui/` folder later. CLAUDE.md's PreToolUse hook that blocks `components/ui/` edits will then mechanically prevent the fix. **Worth surfacing pre-M1.**

### D26 (metadata baseline) + D27 (schema.org including FAQPage) — MEDIUM (timing drift)

- **Tension:** D27 baseline includes `FAQPage`. **Google retired FAQPage rich-result eligibility in May 2026** (per prompt prior). Strategy doc has not been updated.
- **Resolution required:** Update D27 to drop standalone `FAQPage` from the baseline OR explicitly note "we still emit FAQPage JSON-LD for AI-search citation graph value, even though Google no longer renders rich results from it." Either is fine; silently leaving the obsolete claim is the drift.

### D34 (SRI on Stripe.js) — HIGH (operationally wrong)

- **Tension:** Stripe explicitly does not publish SRI hashes for `js.stripe.com/v3/`. The script is updated frequently and Stripe's own community guidance is that SRI on Stripe.js causes outages. Strategy doc's named example is the one third-party script SRI cannot apply to.
- **Resolution required:** Reframe D34 as "SRI applied to third-party scripts whose vendors publish hashes. Stripe.js is a documented exception — defended via CSP `script-src js.stripe.com` + `frame-src js.stripe.com` allowlisting only, and via Stripe Elements iframes that isolate card data outside the website's DOM." This is operationally important before M1's `next.config.ts` ships any SRI plumbing.

### D42a (Sentry Business) + D42b (Amplitude) + D40 (replay mask-all) — MEDIUM (BAA cost not stated)

- **Tension:** D42a names "Sentry Business tier" at "~$26-80/mo" with "BAA-eligible." Sentry's BAA is actually **only available on Business tier and above and requires a separate contract** — the $26-80/mo figure may not include BAA fees. D42b names Amplitude without stating Amplitude's BAA cost; **Amplitude's HIPAA BAA is an enterprise-tier feature** with annual contract pricing typically in the low-five-figures USD/year range. This is a non-trivial pre-launch budget item that's missing from the strategy doc.
- **Resolution required:** Surface concrete BAA pricing for Sentry Business + Amplitude (and any session-replay vendor when D42c locks) before pre-launch M7-M8 budget gets owned. The "matches mobile choice" rationale for Amplitude is operationally right but financially undercosted in the doc.

### D43 (typed env-var module + GrowthBook at trigger) + D41 (server-side flag eval) — NONE

- **Coherent.** The typed env-var module is server-side eval by construction (env vars are server-side). LaunchDarkly Oct 2025 lesson absorbed. No drift.

### D46 + D47 + D48 + D49 — NONE

- **Coherent.** Phase 0 = single existing dev account (D47), Rust backend untouched (D48), website in separate repo (D46), everything else deferred to Phase 1+ triggers (D49). Phase 1 trigger = "public launch or first revenue → vend `marketing-prod` in Workloads-NonHIPAA OU." Cross-account Pattern A documented in roadmap. No internal contradictions.

---

## Section 4: Silent assumptions

1. **SST version.** Strategy doc + CLAUDE.md say "SST 3.x." Current shipping line is SST 4.x (per prompt prior, "4.14 active mid-May 2026"). The Next.js 16.2 Adapter API stabilization (March 2026) was an SST 4.x watershed. **Risk:** M1 scaffold uses outdated installation guidance; encounters API mismatches with current OpenNext adapter conventions. **Recommendation:** Update D2 + CLAUDE.md to "SST 4.x (OpenNext underneath)."

2. **Node version not stated.** Roadmap M1 deliverables don't pin a Node version. Next.js 16 requires Node ≥20.18.0; AWS Lambda Node runtimes in 2026 are 20.x and 22.x. **Risk:** Local dev / CI / Lambda runtime drift. **Recommendation:** Pin Node 22.x in `package.json` `engines` field + `.nvmrc` + Lambda function runtime — same number in three places.

3. **pnpm version not stated.** Turborepo + pnpm workspaces, but no pnpm major version pinned. pnpm 9 → 10 had breaking lockfile changes. **Risk:** Lockfile churn in CI. **Recommendation:** Pin pnpm via `packageManager: "pnpm@10.x"` in root `package.json` + Corepack.

4. **PostHog vs Amplitude — was PostHog evaluated as the single-platform alternative?** Research (`security_observability_compliance.md` §3) explicitly names "PostHog with BAA is the closest single-vendor fit (analytics + replay + flags under one BAA)." Strategy doc's D42a+b+c stack picks three separate vendors (Sentry + Amplitude + TBD replay). The PostHog single-vendor consolidation is not mentioned in the strategy doc's rationale. **Risk:** Three BAAs to negotiate + three monthly invoices when one could cover it. **Recommendation:** Surface the PostHog alternative explicitly and document the rejection rationale (likely: "Sentry is best-in-class for errors+RUM, Amplitude matches mobile, separation justifies the cost") — or reconsider.

5. **Trusted Types — not addressed.** `require-trusted-types-for 'script'` is an emerging CSP defense-in-depth directive. Web Almanac 2025 reports rising adoption. Not in D32 (CSP) or D33 (security headers). **Risk:** Defense-in-depth gap that gets harder to retrofit later (same retrofit-hostility as base CSP). **Recommendation:** Note explicitly that Trusted Types is deferred to post-launch (or M9+) with rationale.

6. **COOP / CORP — not addressed.** Research explicitly classed `COOP/CORP cross-origin isolation` as TRAP at our scale — that's a coherent silent omission, but worth stating it's a deliberate skip rather than an oversight.

7. **Iron-session / cookie encryption pattern — not addressed.** D5 says BFF, D7 says `__Host-` cookies, but the actual cookie payload model is unstated. Two patterns: (a) opaque session ID indexing into ElastiCache/Valkey, (b) encrypted-payload-in-cookie via Iron-session / `cookie-session`. Roadmap M6 defers to "TBD at M6." **Risk:** Genuine architectural decision deferred too late; mixing patterns later requires data migration. **Recommendation:** Lock pre-M6: which session storage model?

8. **Vendor BAA tiers not verified or budgeted.** Sentry Business ($26-80/mo) — but BAA is a separate contract. Amplitude — BAA is enterprise-tier, likely $30k+/yr. Stripe — automatic BAA via Stripe Atlas / enterprise. AWS — standing BAA. **Risk:** Pre-launch financial surprise. **Recommendation:** Inventory: which vendor BAAs cost what, what gates do they sit behind (revenue threshold, annual contract), what's the negotiation lead time?

9. **HSTS preload submission timing.** D33 says "HSTS preload" — but HSTS preload list submission (`hstspreload.org`) requires the site to ship `max-age=31536000; includeSubDomains; preload` on a stable basis BEFORE submission, and removal takes months once on the list. **Risk:** Submitting too early forces every subdomain (including reserved `app.my-quilty.com`, `help.my-quilty.com`) to commit to HTTPS-only before they exist. **Recommendation:** Wire the header at M1; defer hstspreload.org submission to M8 (launch-readiness) when subdomains are concrete.

10. **`.well-known/apple-app-site-association` + `.well-known/assetlinks.json` deeplink files** — CLAUDE.md warns "do not touch without verifying mobile deeplink behavior." A `.well-known/` directory already exists in the repo. Strategy doc doesn't explicitly enumerate this as an M2/M8 deliverable. **Risk:** Mobile deeplink behavior breaks (or fails to work) on launch. **Recommendation:** Add a launch-readiness checklist item.

11. **OpenAPI codegen flow — direction stated, tooling not.** D48 says "OpenAPI exported from Rust backend → consumed by TypeScript (website) + Dart (Flutter mobile)." Tool unspecified — `openapi-typescript`? `oazapfts`? `orval`? Generation timing — at build, at type-check, on demand? **Risk:** Type drift between Rust backend and website TS. **Recommendation:** Lock the codegen tool + invocation timing as part of M6 entry criteria (when `packages/shared-types` starts hosting real types).

12. **Renovate vs Dependabot.** D36 says "Dependabot + lockfile pinning." Roadmap §M2 says "Renovate config baseline." Roadmap §CI/CD says "Dependabot + Renovate." **Risk:** Two competing dep-update bots stepping on each other. **Recommendation:** Pick one. (Renovate is more powerful; Dependabot is GitHub-native and free-of-friction.)

13. **CSP nonce delivery mechanism.** D32 says "CSP nonce + strict-dynamic." Next.js 16 supports nonces via middleware. Concrete plumbing — `headers()` API? Middleware that sets a per-request nonce header and threads it to the layout via `headers().get()`? Not stated. **Risk:** Common Next.js trap: nonces collide with Server Components caching (cached page reuses an old nonce). **Recommendation:** Stating the nonce plumbing pattern in an ADR before M1 lands `next.config.ts`.

14. **Phase 1 trigger fires when? Concrete tripwire?** D49 + roadmap say "public launch or first revenue → vend `marketing-prod`." But "public launch" is when M8 completes; "first revenue" is when M7's Stripe is in live mode. These can happen weeks apart. **Risk:** Ambiguity over when to begin the account-migration ceremony. **Recommendation:** Pick the harder gate (e.g., "first Stripe live-mode subscription") and pre-plan the migration ceremony as part of M8.

---

## Section 5: CLAUDE.md drift from strategy doc

- **CLAUDE.md says "SST 3.x"** — strategy doc D2 also says "SST 3.x." This is jointly drifted from current reality (4.x). Both should update.
- **CLAUDE.md says "Phase 1 trigger: public launch or first revenue → vend `marketing-prod` account in Workloads-NonHIPAA OU"** — consistent with D47.
- **CLAUDE.md says `apps/web/components/ui/` is the shadcn primitives folder + `apps/web/components/app/` for wraps** — consistent with D18 (which says `components/ui/` + `components/app/`; CLAUDE.md adds the `apps/web/` prefix correctly).
- **CLAUDE.md says "Phase 0 AWS account: existing `development` account (D47, $0 incremental cost)"** — consistent.
- **CLAUDE.md "Working patterns" section says ADRs in `docs/adr/`** — roadmap §Documentation confirms.
- **CLAUDE.md "NEVER" list: "Never edit `apps/web/components/ui/` directly"** — consistent with D18.
- **CLAUDE.md "NEVER" list: "Never adopt Backstage or commercial IDP below ~10 engineers"** — consistent with D49 trigger watchlist (engineer #8-10).
- **CLAUDE.md "Critical compliance rules: Session replay default mask-all"** — consistent with D40.
- **CLAUDE.md "Auth posture: OIDC Backchannel Logout with `sid`"** — inherits the same unverified Cognito-support claim as D9. **Same severity HIGH drift.**
- **CLAUDE.md mentions `gitleaks` as a commit guard dependency** — not mentioned anywhere in strategy doc or roadmap, but harmless. Tooling decision, not architectural.
- **CLAUDE.md memory pointer**: `~/.claude/projects/.../memory/MEMORY.md` — exists per the system reminder, indexes locked decisions. Not auditable from the docs alone; treated as out-of-scope per the prompt's instruction ("treat the strategy + roadmap + research as the canonical sources").
- **CLAUDE.md "Bootstrap step #2: `aws sso login --profile quilty-dev`"** — implies a specific AWS SSO profile name (`quilty-dev`). Strategy doc and roadmap don't name a profile. **Minor drift** — if Phase 0 uses the existing `development` account (D47), the profile likely already exists in the user's AWS config; harmless.
- **CLAUDE.md mentions `eslint-plugin-jsx-a11y` in pre-commit + `axe-core` in CI** — consistent with D22.
- **CLAUDE.md "Observability: Sentry Business tier (errors + RUM) from day-one; Amplitude (matches mobile choice) added pre-launch"** — consistent with D42a/b.
- **README.md** says "Sentry (errors + RUM) + Amplitude (analytics, pre-launch)" — consistent.

**Net CLAUDE.md drift: only the SST 3.x → 4.x version pin and the inherited D9 unverified Cognito-support claim.**

---

## Section 6: Roadmap coherence

- **M1 deliverables** include `tailwind.config.ts` — but D17 + CLAUDE.md explicitly say "Tailwind v4 CSS-first (`@theme` block in `apps/web/app/globals.css`, **no** `tailwind.config.js`)." **Drift.** Tailwind v4 deprecates `tailwind.config.{js,ts}` in favor of CSS-first config via `@theme`. The roadmap M1 deliverable list contradicts the strategy doc + CLAUDE.md. **Severity: MEDIUM** — must update M1 deliverable list before M1 scaffold ships.

- **M1 deliverables** include `eslint.config.js — strict + jsx-a11y`. Consistent with D22 + Tailwind v4-era flat config.

- **M1 decision gates: "CSP report-only is logging (not enforcing yet)"** — consistent with D32 (report-only → enforce).

- **M1 decision gates: "Cold start <2s for first uncached SSR render"** — operational gate. Not in strategy doc. Reasonable.

- **M2 deliverables** include `/account/delete` deep-linkable deletion landing page — consistent with `regulatory_requirements.md` §1.

- **M2 deliverables** include "MedicalWebPage schema.org markup baseline on relevant pages" — consistent with D27.

- **M2 deliverables** mention "Renovate config baseline" but D36 names "Dependabot." See Section 4 silent-assumption #12. **Roadmap drift.**

- **M6 deliverables** include `/api/auth/callback`, `/api/auth/logout`, `/api/auth/refresh`, `/api/csrf` — consistent with D5 BFF pattern.

- **M6 deliverables** include "Real session list + 'sign out everywhere' (via backchannel logout to mobile + revocation)" — depends on D9/D11 Cognito support assumption. **Same HIGH-severity inheritance.**

- **M6 deliverables** include "Sentry replay configured with mask-all default, allowlist non-PHI elements" — consistent with D40. But D42a "Sentry Business tier" — does Business tier include Session Replay, or does that require a separate Session Replay add-on? Not in research; worth verifying.

- **M6 deliverables** mention "ElastiCache Valkey — BFF session storage TBD — may use, may rely on cookies only" — Section 4 silent-assumption #7.

- **M7 deliverables** include "Stripe webhook handlers (Rust) — new crate(s) in `lambdas/rust/crates/stripe-webhook-*`" — consistent with D48 (Rust backend) + D5 (BFF) + D44 (Stripe).

- **M8 deliverables** include CSP enforce flip, `Sec-GPC` honoring at edge, GDPR + CCPA banner — consistent with D32 + D33 + D35.

- **M8 deliverables** include "Stripe full activation: complete the website checklist (16 items in `research/regulatory_requirements.md`)" — research file lists 16 items; consistent.

- **M8 deliverables** include "Manual a11y audit (TPGi or Deque) — pre-EU-launch requirement (EAA June 2025)" — consistent with `design_system_a11y.md` §5.

- **Cross-account Pattern A** described in roadmap matches the description in CLAUDE.md ("SST owns dev-account resources; `quilty-aws/dns/` layer (in prod account) adds Route 53 records via two-step coordinated deploy").

- **Trigger watchlist** in roadmap matches D49 deferred items + research trigger guidance. Coherent.

- **Launch readiness checklist** is exhaustive and traces back to research checklists. Consistent.

**Net roadmap drift: (a) M1 `tailwind.config.ts` contradicts Tailwind v4 CSS-first lock; (b) Renovate-vs-Dependabot inconsistency; (c) inherited D9/D11 Cognito assumption.**

---

## Synthesis

### Top 5 most material issues

1. **D9 + D11 Cognito Backchannel Logout `sid` assumption (HIGH).** The single most load-bearing unverified claim in the locked stack. Research says "Cognito supports it" with no AWS-doc citation; current AWS Cognito does not document `backchannel_logout_uri` registration or `sid` in standard token claims. Block M6 until verified; design a Quilty-internal session-revocation fallback as Plan B.
2. **D34 SRI on Stripe.js (HIGH).** Operationally wrong. Stripe does not publish SRI hashes. Reframe D34 before M1's `next.config.ts` lands SRI plumbing on Stripe.js.
3. **D2 / CLAUDE.md "SST 3.x" version pin (MEDIUM).** Current line is SST 4.x; Next.js 16.2 Adapter API (Mar 2026) is an SST 4.x-era feature. Update before M1 scaffold so the scaffold doesn't immediately need a version bump.
4. **D27 FAQPage retirement (MEDIUM).** Google retired FAQPage rich-result eligibility May 2026 (per prompt prior). Strategy doc has not updated. Either drop from baseline or note it's emitted for AI-search citation graph value only.
5. **Roadmap M1 `tailwind.config.ts` deliverable contradicts D17 Tailwind v4 CSS-first lock (MEDIUM).** Update the M1 deliverable list to use `@theme` in `globals.css`, no `tailwind.config.ts`.

### Decisions that should change before M1 scaffold lands

- **D2** — bump SST version reference to 4.x in strategy doc + CLAUDE.md.
- **D34** — reframe to "SRI when vendor publishes hashes; Stripe.js is a documented exception, defended via CSP allowlist + Elements iframes instead."
- **D27** — annotate or drop standalone `FAQPage` from the baseline.
- **Roadmap M1** — replace `tailwind.config.ts` with `globals.css` `@theme` + clarify "no `tailwind.config.*` file under Tailwind v4."
- **Roadmap M2** — pick Dependabot OR Renovate (not both) to match D36.

### Decisions that should change before M6 scaffold lands (post-M1, but on the watchlist)

- **D9 + D11** — verify Cognito backchannel logout + `sid` claim support in actual AWS docs; design Quilty-internal session-revocation fallback if not supported.
- **D5 session storage model** — lock opaque-session-ID-in-Redis vs encrypted-payload-in-cookie.
- **Server Actions vs Route Handlers boundary** — document the rule.
- **OpenAPI codegen tooling** — pick the generator + invocation timing.

### Things to surface to the human for confirmation

- **PostHog single-vendor consolidation**: research called it the closest single-vendor fit (errors-by-extension + RUM + replay + flags under one BAA). Strategy doc picked Sentry + Amplitude + TBD-replay (three vendors, three BAAs). Was PostHog explicitly evaluated and rejected, or silently skipped? Recommend either documenting the rejection rationale or reopening the evaluation.
- **Amplitude BAA cost**: enterprise-tier annual contract. Pre-launch budget includes this? If not, surface it before M7-M8 budget locks.
- **Sentry Business tier + Session Replay**: confirm Session Replay is included in Business tier (or requires the SR add-on). Affects D42a cost figure.
- **Cognito backchannel logout / `sid` claim**: the prompt mentions parallel research is verifying this. The audit recommends this verification block M6 work, with a fallback design ready in case it's unsupported.
- **Round-3 + Round-4 research artifacts**: strategy doc cites 4 rounds / "8 research reports across 4 rounds" but `docs/research/` only contains 8 files matching Round-1/Round-2. Round-3 + Round-4 findings live in the update log, not as separate artifacts. Worth surfacing whether the user wants those rounds' research preserved as files for future agents.
- **HIPAA NPP**: M8 lawyer brief must reflect HHS 2024 changes (NPP update deadline Feb 16, 2026 is now past). Worth flagging in the M8 lawyer brief.
- **CSP nonce + Server Components caching trap**: known Next.js gotcha. Worth an ADR before M1 lands the middleware.
- **`packages/ui` "empty workspace as forward seam"**: D4 + CLAUDE.md describe it as scaffolded empty; research (`design_system_a11y.md` §2) supports it as a deliberate seam via shadcn's `@workspace/ui/components` alias. Confirm this is the intent (vs "we'll create the workspace at extraction time").
- **HSTS preload submission timing**: defer to M8 (launch-readiness) not M1, even though the header ships at M1. Confirm.

---

## Audit footnote

This audit was performed in plan mode (read-only). No strategy doc, roadmap, or research file was modified. The deliverable is this plan file at `/Users/d1rect0r_interneta/.claude/plans/glimmering-inventing-frog-agent-ae10b7bb2315bebb8.md`. If the user authorizes execution, the recommended next steps are:

1. Update D2 + CLAUDE.md SST version reference (3.x → 4.x).
2. Update D27 FAQPage stance (drop or annotate).
3. Update D34 SRI stance (carve out Stripe.js explicitly).
4. Update roadmap M1 tailwind config deliverable (v4 CSS-first; no `tailwind.config.ts`).
5. Update roadmap M2 (pick Dependabot OR Renovate).
6. Open verification task for D9/D11 Cognito backchannel logout + `sid` claim support; design fallback.
7. Open ADR-001 (or similar) for: Node + pnpm + SST version pins; CSP nonce plumbing; Trusted Types deferral rationale; session-storage model decision target (pre-M6).
8. Surface BAA-cost inventory + decision on Sentry+Amplitude vs PostHog consolidation.
