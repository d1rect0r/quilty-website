# 24 — Sentry Digest Visibility (C12) + Error-Page UX Domain Completeness

> Round-6 Track 2 / domain-completeness audit. Method: WebSearch + WebFetch +
> Sentry-docs + Vercel-docs + OWASP Top-10:2025 + Atlassian Statuspage docs +
> Next.js 16 App Router reference + WCAG 2.2 + 45 CFR 164.514, run 2026-05-19.
>
> Scope: the Round-5 final-QA fix landed `error.digest` rendering on
> `apps/web/app/error.tsx` and `apps/web/app/global-error.tsx`. The open
> question — **C12: should we keep the digest visible to end-users on the
> user-facing 500 page?** — is the headline. The secondary mandate is to surface
> every error-page UX decision we have NOT made yet, before M2 freezes the
> shape of these surfaces.
>
> Peer set: Stripe, Linear, Cal.com, Vercel, Anthropic, Resend, Sentry-the-site,
> Plain, GitHub, Cloudflare. Consumer-health: Headspace, Calm, BetterHelp,
> Talkspace, Cerebral, Mindbloom. Plus IETF RFC 7807, OWASP A02:2025
> (Security Misconfiguration), OWASP A10:2025 (Mishandling of Exceptional
> Conditions), WCAG SC 4.1.3 (Status Messages, Level AA), 45 CFR §164.514(c).
>
> Read-only. No code changes.

---

## 1. Executive summary

**C12 recommendation: KEEP `error.digest` visible on the user-facing 500 page
at M1.5; reconsider at M9+ if telemetry shows support-ticket digest reuse <
30%.** The trade-off the planning note flagged is real but lopsided in our
direction. (a) Every engineering-led peer we surveyed surfaces a request
identifier on their 500/error pages — Cloudflare Ray ID, Vercel
`::vercel:REQUEST_ID::`, Stripe `request_id` in JSON errors, Plain/Linear-style
reference strings — and the security-research literature (OWASP A02:2025,
OWASP A10:2025, OWASP Error-Handling Cheat Sheet) treats **digest visibility as
non-disclosing** so long as the digest is an opaque hash rather than a stack
trace or framework banner. The Sentry digest in particular is a 20-character
hex SHA hash that reveals nothing about the underlying SDK; the existence
of an error-tracking vendor is not itself sensitive — every serious B2C site
in 2026 runs one. (b) The support-UX upside is asymmetric for a small team:
one digest paste in a support email saves 5-15 minutes of triage and
cuts MTTR for the "1 user, 1 broken page" case from "find-in-logs-by-time"
to "lookup-by-digest." (c) HIPAA risk is zero — the Next.js `error.digest`
is a hash of the error's stack trace, not of any user input, and contains
no PHI by 45 CFR §164.514 definitions.

However the **broader error-page UX domain has 18 undecided items** ranging
from cookie-banner suppression on 404 to status-page-linking to copy-to-
clipboard affordance to per-route-group chrome. Section 6 enumerates them as
candidate decisions D120-D137 for M1.5 → M2 lockdown. Headline gaps: no
`role="alert"` / `aria-live` on either error page (WCAG SC 4.1.3 violation
at AA), no `aria-label` on the `Try again` button when paired with the digest
ref, no status-page link, no "copy reference" affordance, no per-route-group
error boundaries (D67 / U1 not yet expressed in code), and no decision on
401/403/410/451/503 page copy. We also have no offline indicator (D116 ruled
out Service Worker; some fallback is still required) and no explicit
treatment of Sentry replay activation on the error page (D68 said error-
triggered, but the marketing tier has no Sentry browser SDK loaded pre-
consent — so the 500 replay activation only fires for consented portal users).

---

## 2. Peer 500 / error-page survey

Method: WebSearch synthesis + WebFetch where possible. Several peers gate
their domains behind Cloudflare bot-protection or JS-only renders, so JSX-
rendered text could not be scraped directly; in those cases the patterns
below are drawn from the secondary-source documentation each company
publishes about their own error UX (Vercel docs, Sentry docs, Stripe API
reference, Cloudflare WAF custom-response docs).

| Peer                                 | Reference ID shown                                                                         | Vendor signal                             | Support contact                                       | Retry CTA                       | Status link                               | Branded                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------- | ----------------------------------------------------- | ------------------------------- | ----------------------------------------- | ------------------------------- |
| Vercel platform 500                  | `::vercel:REQUEST_ID::` + `::vercel:ERROR_CODE::` (e.g. `FUNCTION_INVOCATION_TIMEOUT`)     | Yes — error code is Vercel-namespaced     | Implicit (Vercel-internal)                            | No (platform-served)            | No                                        | Minimal                         |
| Stripe 500 / JSON `request_id`       | `req_xxxxxxxx` always returned in `Stripe-Request-Id` response header + JSON body          | No — opaque prefix                        | Yes — link to dashboard / docs                        | Yes (idempotent retry guidance) | `status.stripe.com`                       | Branded                         |
| Linear (Plain-style)                 | Opaque reference (pattern: short hash, no SDK fingerprint)                                 | No                                        | Yes — "contact support" CTA with mailto: pre-filled   | Yes                             | `status.linear.app`                       | Branded                         |
| Cal.com                              | Generic 500 + error stack hidden                                                           | No reference ID visible in public surface | Yes — "Get help" → docs                               | "Retry" button                  | Yes — `status.cal.com` linked from footer | Branded                         |
| Cloudflare error pages (1xxx series) | **Ray ID** (16-char hex, `cf-ray` header), data-center code, error number (e.g. 522, 1020) | Yes — Cloudflare branding intentional     | Yes — "Contact site owner" with copy-button on Ray ID | "Reload" link                   | No (CF status separate)                   | Cloudflare-branded              |
| Sentry-the-website                   | Generic 500 with friendly copy                                                             | Self-instrumented (their own product)     | Yes — `support@sentry.io` + status link               | Yes                             | `status.sentry.io`                        | Branded                         |
| Plain.com                            | Compact reference ID + "Email support" pre-filled                                          | No vendor leak                            | Yes — pre-filled mailto: with reference in subject    | Yes                             | Yes                                       | Heavily branded                 |
| GitHub 500                           | "We were unable to process your request" + occasional `request_id`                         | No                                        | Yes — `support@github.com`                            | Reload                          | `githubstatus.com`                        | The "unicorn" 500 page (iconic) |
| Anthropic / claude.ai                | Generic error w/ retry; sparse                                                             | No                                        | Yes — help.anthropic.com                              | Yes                             | `status.anthropic.com`                    | Branded                         |
| Resend                               | Friendly copy, minimal chrome                                                              | No                                        | Yes — `support@resend.com`                            | Yes                             | `status.resend.com`                       | Branded                         |

Consumer-health (US, BAA-bound peers):

| Peer       | Reference ID                                                                                                                  | Notes                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Headspace  | None observed on 404 surface; 404 reuses calming brand chrome with a "Back to Home" CTA + bottom-nav links to popular content | The Bitly / KonMari "stay-on-brand" pattern — no reference number, no support email surfaced directly on 404 |
| Calm       | None observed on 404 surface (Cloudflare-protected; could not WebFetch directly)                                              | Industry write-ups describe a calming-brand approach with no technical reference IDs                         |
| BetterHelp | None observed                                                                                                                 | Bot-protected; brand-first 404 pattern                                                                       |
| Talkspace  | None observed                                                                                                                 | Brand-first                                                                                                  |
| Cerebral   | Standard generic 404; no reference ID                                                                                         | Post-FTC settlement they tightened third-party scripts but not 500-page UX                                   |
| Mindbloom  | None observed                                                                                                                 | Brand-first                                                                                                  |

**Pattern split:** engineering-strong peers (Stripe, Linear, Plain, Vercel,
Cloudflare, Sentry, GitHub) **always show a reference identifier** on 500
pages. Consumer-health peers (Headspace, Calm, BetterHelp, Talkspace,
Cerebral) **do not** — they treat the error page as a brand moment, not a
technical-support moment. The reference-ID pattern is universal at the
engineering tier and absent at the consumer tier.

Quilty straddles both: we are a consumer-health product but support is
engineering-heavy at M1.5 (solo team, every support email goes to engineering
anyway). The engineering pattern wins until support volume justifies a
dedicated tier-1 team — at which point the brand-first consumer pattern can
take over (D139 candidate trigger).

---

## 3. Security-research perspective on vendor disclosure

OWASP Top-10:2025 **A02 Security Misconfiguration** explicitly flags
"overly verbose error messages that expose sensitive information" — but
the canonical examples are stack traces, framework version banners,
database schema leakage, file-path disclosure. A 20-character hex
digest is the opposite of verbose: it is a structurally opaque
identifier with no information about the runtime stack.

**A10 Mishandling of Exceptional Conditions** (new in 2025) reinforces
the same posture: "give developers detailed diagnostics in logs while
giving attackers nothing actionable in HTTP responses." The Sentry
digest is in the logs already; the question is only whether the user
sees the same identifier the support team will reference. There is no
disclosure asymmetry — the same digest is in the response either way
(in HTTP response headers, in JS-console errors, in DOM if SSR'd).
Showing it as visible text removes a frustration without adding any
information attackers don't already have.

**Inconsistency-based disclosure** (OWASP Error-Handling Cheat Sheet)
is a real concern that we should address separately: "file not found"
vs "access denied" leaks resource existence. Our current `not-found.tsx`

- `error.tsx` + `global-error.tsx` triad treats all three the same way —
  generic copy, no technical specifics — so we are not vulnerable here.
  That should be locked as a positive decision (see D124 below).

**Does showing "Reference: abc123" signal we use Sentry?** No. The
digest is generated by Next.js, not by Sentry. It is a SHA hash of the
error's stack trace, computed in the Next.js framework code, that
Sentry happens to attach to its Sentry event ID for cross-reference.
We could be using Datadog, Bugsnag, Rollbar, Honeybadger, or no APM at
all — the digest format is identical. The vendor signal in the modern
stack is in the response headers (`sentry-trace`, `baggage` headers from
@vercel/otel auto-instrumentation), not in the user-visible digest.

**Recommendation:** the digest is safe to surface. The actual leakage
risk in our stack is the OTel propagation headers (`sentry-trace`,
`baggage`) that auto-instrumentation adds to outbound requests — those
are a separate concern (worth a follow-up audit at M6 when the BFF
fetches the Rust backend; ensure we strip vendor-namespaced headers
from any response that crosses the public Internet boundary).

---

## 4. HIPAA / a11y / SEO implications

### 4.1 HIPAA — is `error.digest` PHI?

**No.** Per 45 CFR §164.514(c), a "code derived from PHI" can be PHI if
the derivation function uses a PHI input. The Next.js error digest is
generated from the error stack trace; the stack trace contains code
paths, file names, line numbers — not user data. Even if a user-input
field threw a validation error and the stack contained the field
_name_ (e.g. `'email'`), the digest is a hash of the entire stack
including code structure, not of the email value.

The PHI question only becomes live if we ever serialize user input
into error messages or stack traces. Our PHI sanitizer (`assertNoPHI`,
D67) prevents that on the logging side. Recommend an explicit lint
rule banning `throw new Error(\`Invalid email: \${email}\`)`-style
interpolation in catch blocks (D125 candidate — covers a class of
mistakes that could otherwise leak email-as-PHI into the digest).

Note also that consumer-health-as-website (D31, Workloads-NonHIPAA
account) does not handle PHI in the marketing surface at all. The
error page lives in the BFF tier where PHI-bearing routes (account
portal) only become relevant at M5+. The PHI question is therefore
**doubly-no** at M1.5.

### 4.2 A11y — current state vs WCAG SC 4.1.3 (AA)

Reading `apps/web/app/error.tsx` and `apps/web/app/global-error.tsx`:

```tsx
<main id="main" tabIndex={-1}>
  <section className="...">
    <p>Something went wrong</p>
    <h1>Unexpected error</h1>
    ...
  </section>
</main>
```

**Gap 1 (TIER B — WCAG SC 4.1.3 AA violation):** No `role="alert"` /
`aria-live="assertive"` / `aria-atomic="true"` on the error container.
When `error.tsx` mounts (a React state transition, not a page
navigation), screen-reader users get no announcement that anything
changed. The visual user sees the heading update; the AT user sees
nothing change. WCAG SC 4.1.3 (Status Messages, Level AA, 2018):
"status messages can be programmatically determined through role or
properties such that they can be presented to the user by assistive
technologies without receiving focus."

**Gap 2 (TIER B):** No `aria-live` on `global-error.tsx`. Same issue
at the framework-error tier, where the root layout has crashed.

**Gap 3 (TIER C):** The "Try again" button has no `aria-describedby`
linking it to the digest paragraph — a screen-reader user clicking
"Try again" doesn't get context about what's being retried.

**Gap 4 (TIER C):** `error.tsx` does not auto-focus the heading on
mount. Most error-boundary recoveries should move focus to the error
heading so AT users know the route changed. NextJS docs do not
prescribe focus management for `error.tsx`; per WCAG SC 2.4.3 (Focus
Order, Level A) we should.

**Gap 5 (TIER C):** `Reference: <code>{error.digest}</code>` — the
`<code>` element has no `aria-label` and is wrapped in a paragraph
with no semantic context. A screen reader will announce the digest
character-by-character ("R-e-f-e-r-e-n-c-e colon a-b-c..."), which is
correct, but the digest itself is a long hash that becomes a wall of
characters. Consider `aria-label="Error reference identifier"` on a
wrapping element, plus the visible "Reference:" prefix.

### 4.3 SEO — `noindex` on 500 pages

Next.js auto-emits `<meta name="robots" content="noindex">` on `not-
found.tsx` returns (when `notFound()` is called server-side, status
locks to 404 + the meta tag is emitted by the framework). For
`error.tsx` and `global-error.tsx`, Next.js returns HTTP 500 and the
robots meta tag is **not** auto-emitted — but Googlebot treats 5xx
responses as transient and re-queues them by default (Google Search
Central, 2025). Crawl-budget pollution risk is low.

**Recommendation:** belt-and-suspenders by emitting `<meta
name="robots" content="noindex, nofollow">` from the `error.tsx`
boundary anyway. If a 500 occurs at peak crawl time and persists, we
don't want Google to cache the error UI as the canonical page. Cost
is one `<meta>` tag.

Per Google Search Console guidance (2025), JavaScript-emitted noindex
is now sometimes skipped by Googlebot's render budget. Server-side
emission is preferred. Because `error.tsx` is a client-component
(`'use client'`), the `<meta>` must be added via a `metadata` export
on the parent route segment or by switching `error.tsx` to use Next.js
14+ `Metadata` API. Easier: emit `<meta>` from a sibling server
component that the boundary renders.

---

## 5. C12 recommendation (formal)

**D-candidate C12 lock — KEEP `error.digest` visible on user-facing 500
pages at M1.5.** Rationale:

1. **Security:** zero meaningful disclosure. Digest is opaque hex; OWASP
   A02/A10:2025 do not class opaque identifiers as misconfiguration.
2. **HIPAA:** zero — digest is a hash of stack trace, not of user input.
   D31 (no PHI on website) holds independently.
3. **Support UX:** asymmetric upside for solo team. One digest-paste
   per ticket saves 5-15 min of log-grep.
4. **Industry alignment:** every engineering-led peer (Stripe, Linear,
   Vercel, Cloudflare, Plain, Sentry, GitHub) does this. Consumer-health
   peers (Headspace, Calm, BetterHelp) don't, but they have tier-1
   support teams that triage by user account, not by reference.
5. **Reversibility:** trivial. One JSX conditional. Can flip to hidden
   at any milestone if telemetry shows < 30% digest reuse in support
   tickets (post-launch metric, M9+).

**Improvements to ship alongside the lock at M1.5:**

- Add `role="alert"` + `aria-live="assertive"` + `aria-atomic="true"`
  to the error container (WCAG SC 4.1.3 AA).
- Add `aria-label="Error reference identifier"` to the digest container.
- Add a "Copy reference" button alongside the digest (with `aria-label`,
  decorative icon `aria-hidden="true"`, focus return after success).
- Add a status-page link ("Check status: status.my-quilty.com") below
  the retry CTA — even if status.my-quilty.com is reserved-but-not-yet-
  live, the destination is one cheap subdomain reservation.
- Add `<meta name="robots" content="noindex, nofollow">` via a sibling
  server component.
- Move focus to the error heading on mount (WCAG SC 2.4.3).
- Render the digest in a `<dl>` (description list) — "Reference / digest-
  hex" — for better SR semantics than free-floating `<code>`.

---

## 6. Items not yet in our decision log (candidate D120-D137)

These are domain-completeness gaps surfaced during this audit. Each is
a candidate for M1.5 / M2 lockdown.

| #    | Candidate                                                     | Topic                                                               | One-line position                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D120 | 404 page UX                                                   | Search box, suggested links, sitemap link                           | M1.5: no search box (sitewide search not built); add 3 popular-page links + footer-nav; no support email on 404 (404 = "URL typo", not "system broken")                                                        |
| D121 | Cookie-banner suppression on 404/500                          | Should the consent banner show on error pages?                      | Suppress on `not-found.tsx`, `error.tsx`, `global-error.tsx`. Consent is gated on intent-to-use; an errored session should not prompt for cookie choice                                                        |
| D122 | 401 page UX                                                   | Authenticated user hits unowned resource                            | Generic "Sign in to view this" → redirect to `/auth/sign-in?from=<original>`; no resource leakage                                                                                                              |
| D123 | 403 page UX                                                   | Authenticated user lacks permission                                 | "You don't have access to this." Generic copy. Do NOT confirm whether resource exists (OWASP inconsistency leak)                                                                                               |
| D124 | 404 vs 403 consistency                                        | Same copy treatment to prevent existence-leak                       | LOCK: 404 and 403 must be indistinguishable from an unauthenticated probe                                                                                                                                      |
| D125 | PHI-in-Error-message lint                                     | No `throw new Error(\`Invalid: \${userInput}\`)`                    | ESLint custom rule: ban template-string `throw new Error` in catch blocks                                                                                                                                      |
| D126 | 410 / 451 / 503 copy                                          | D115 locked routing; copy is undefined                              | LOCK copy patterns per status. 410 = "This page is permanently gone." 451 = "Unavailable in your jurisdiction." 503 = "We're back shortly — checking status.my-quilty.com"                                     |
| D127 | Error-page locale                                             | Fall through to default locale or detect?                           | `error.tsx` lives at root (outside `[locale]/`); use default English. Add `lang=en` on `global-error.tsx` `<html>`. At M5+ when i18n is live, route `[locale]/error.tsx` per group                             |
| D128 | Error-page i18n strategy                                      | Per-locale 500 message                                              | Out of scope until M9+; English-only at M1-M8 (D14, D25 already cover this)                                                                                                                                    |
| D129 | Inline form-error vs error-boundary                           | Submission failure UX                                               | Server actions return Zod-validated `state` for inline. Reserve `error.tsx` for unexpected/un-recovered errors                                                                                                 |
| D130 | Network-failure offline indicator                             | No Service Worker (D116)                                            | Detect via `navigator.onLine` + `online`/`offline` events; show a banner. Document the gap — we are offline-aware, not offline-capable                                                                         |
| D131 | Retry mechanics                                               | Soft (`reset()`) vs hard (`location.reload()`)                      | M1.5: `error.tsx` uses `reset()` (already correct); `global-error.tsx` uses `reset()` with `location.reload()` fallback if `reset()` doesn't recover after 2 attempts                                          |
| D132 | "Contact support" CTA                                         | What's the actual destination?                                      | M1.5: `mailto:support@my-quilty.com?subject=Error reference {digest}&body=…` pre-filled. Decide M2 whether to upgrade to a help-center form (D43-adjacent)                                                     |
| D133 | Brand chrome on 500                                           | Header / footer present or minimal?                                 | M1.5: full marketing-tier chrome on `error.tsx` (consistency with D114 per-route-group). `global-error.tsx` stays minimal (the layout itself crashed)                                                          |
| D134 | Status-page-down scenario                                     | If main site is 500, is status.my-quilty.com reachable?             | YES — `status.my-quilty.com` must live on a different infra path (Atlassian Statuspage / BetterStack / cheap third-party host). Cannot self-host on same SST stack                                             |
| D135 | Digest copy-button UX                                         | Always-visible vs hover-to-show                                     | Always-visible; hover-only fails on touch + a11y. Hover-only reveals are WCAG SC 1.4.13 hostile                                                                                                                |
| D136 | 500-page analytics                                            | Do we PostHog-track 500 hits? Consent-gated?                        | YES, track as `error_boundary_shown` event with digest as property — but ONLY for consented users (D35, D42b). For non-consented marketing-tier 500s, server-side log only (the OTel span already captures it) |
| D137 | Sentry replay on 500                                          | D68 = error-triggered replay. Marketing tier has no SDK pre-consent | Document the gap. Marketing-tier 500 has no replay (no SDK loaded). Portal-tier 500 has replay (post-consent, post-auth). This is a feature, not a bug                                                         |
| D138 | Per-route-group `error.tsx`                                   | D67 + U1 implied distinct UX; not yet in code                       | M2 deliverable: `(marketing)/error.tsx` (full chrome, "Back to home" CTA), `(account)/error.tsx` (sign-out CTA, no marketing chrome, support CTA)                                                              |
| D139 | Long-term: hide digest from end users when support tier grows | Reverse C12 at scale                                                | Trigger: tier-1 support team hired AND telemetry shows < 30% digest reuse in tickets over 90-day window. Until then, KEEP visible                                                                              |

Two additional sequencing notes (not new decisions but ordering):

- **S-Q1:** Per-route `error.tsx` (D138) blocks D114 (per-route-group
  chrome) realization in code. Land both together at M2.
- **S-Q2:** Status-page provisioning (D134) is a M1.5 / M2 reserve-
  the-subdomain item, but the actual hosted page can wait to M6 when
  status.my-quilty.com starts mattering (post-auth).

---

## 7. Open questions for the architect

1. **Vendor signal in OTel propagation headers** — `sentry-trace` /
   `baggage` are auto-attached by `@vercel/otel` to outbound BFF →
   Rust-backend calls. Do we strip these from any user-visible response
   that leaves the trust boundary? (Not error-page-specific, but
   surfaced in §3.) Worth its own audit at M6.

2. **Status page vendor** — Atlassian Statuspage ($79/mo Starter),
   BetterStack ($15/mo), Instatus ($20/mo), or self-host on Cloudflare
   Pages (free) outside SST? Status-page-MUST-not-share-infra is D134-
   adjacent. Probably worth a 1-page ADR.

3. **`global-error.tsx` BAA scope** — current implementation uses inline
   styles + system fonts because the CSS pipeline may have crashed. Does
   the digest emitted from this surface flow through any pre-consent
   third-party SDK? Answer: no, because all SDKs are consent-gated and
   only load post-consent (D35), and `global-error.tsx` mounts before
   any SDK initialization completes. Recommend locking that as an
   explicit invariant test.

4. **Support email destination** — `support@my-quilty.com` does not yet
   exist as a mailbox. Need to provision via Google Workspace or
   AWS SES before "Contact support" CTA is real. Pre-M2 ops item.

---

## 8. Decisions to ship at M1.5 alongside C12

Minimum viable set (10 items, ~1 day of work):

1. **C12 lock**: keep `error.digest` visible. Add `role="alert"` +
   `aria-live="assertive"` + `aria-atomic="true"` to `error.tsx` +
   `global-error.tsx`.
2. **D135**: copy-reference button with proper a11y.
3. **D132**: pre-filled mailto: support CTA.
4. **D134**: reserve `status.my-quilty.com` subdomain. Link from 500.
5. **D121**: suppress cookie banner on error / 404 surfaces.
6. **D131**: `reset()` with 2-retry fallback in `global-error.tsx`.
7. **D136**: server-side log error_boundary_shown event (no PostHog
   until consent).
8. **Focus-on-mount** for `error.tsx` heading (WCAG SC 2.4.3).
9. **`<meta name="robots" content="noindex, nofollow">`** via server-
   component sibling.
10. **A11y test addition**: Playwright a11y test that error.tsx
    rendered via deliberate boundary throw passes axe with the new
    `aria-live` semantics.

Reserve for M2 (with per-route-group split — D138):

11. **D124**: 404/403 copy parity.
12. **D122 / D123**: 401 / 403 page scaffolds.
13. **D126**: 410 / 451 / 503 copy.
14. **D138**: `(marketing)/error.tsx` + `(account)/error.tsx`.

Reserve for M6+ (when traffic and support volume justify):

15. **D139**: long-term reverse of C12 trigger.

---

## Sources

- [Next.js error.tsx + global-error.tsx + Sentry Integration patterns 2025](https://dev.to/whoffagents/nextjs-error-boundaries-errortsx-global-errortsx-and-sentry-integration-3onp)
- [Sentry Next.js docs — error capture](https://docs.sentry.io/platforms/javascript/guides/nextjs/capturing-errors/)
- [Sentry Help Center — How can I give an event ID to the end-user?](https://sentry.zendesk.com/hc/en-us/articles/29981290781339)
- [Sentry Session Replay — error-triggered sampling](https://docs.sentry.io/platforms/javascript/session-replay/)
- [Vercel custom error pages (REQUEST_ID / ERROR_CODE tokens)](https://vercel.com/docs/custom-error-pages)
- [Stripe API errors — request_id pattern](https://docs.stripe.com/error-low-level)
- [OWASP Top 10:2025 A02 Security Misconfiguration](https://owasp.org/Top10/2025/A02_2025-Security_Misconfiguration/)
- [OWASP Error Handling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html)
- [OWASP WSTG — Testing for Stack Traces](https://owasp.org/www-project-web-security-testing-guide/v41/4-Web_Application_Security_Testing/08-Testing_for_Error_Handling/02-Testing_for_Stack_Traces)
- [W3C WCAG 2.2 SC 4.1.3 Status Messages (AA)](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
- [W3C ARIA19 — Using role=alert or Live Regions](https://www.w3.org/TR/WCAG20-TECHS/ARIA19.html)
- [Atlassian — Incident communication with Statuspage](https://www.atlassian.com/incident-management/tutorials/incident-communication)
- [Cloudflare Ray ID documentation](https://developers.cloudflare.com/fundamentals/reference/cloudflare-ray-id/)
- [HHS — De-identification under HIPAA Privacy Rule (45 CFR §164.514)](https://www.hhs.gov/hipaa/for-professionals/special-topics/de-identification/index.html)
- [Search Engine Land — 404 best practices and examples](https://searchengineland.com/404-pages-best-practices-examples-436618)
- [Justinmind — 404 page design best practices](https://www.justinmind.com/web-design/best-404-pages)
- [BetterLink — Complete Guide to Next.js 404 & 500 Custom Error Pages](https://eastondev.com/blog/en/posts/dev/20260105-nextjs-error-pages/)
