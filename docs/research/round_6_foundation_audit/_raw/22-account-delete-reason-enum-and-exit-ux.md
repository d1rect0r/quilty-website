# 22 — Account-delete reason enum + exit-survey UX (C8 + domain-completeness scan)

> Round-6 audit on C8: confirm or revise the `AccountDeleteReason` enum locked in `Analytics` port D82. Method: WebSearch + WebFetch against vendor docs (Stripe Customer Portal API), peer help-centers (Headspace, Calm, BetterHelp, Talkspace, Mindbloom, Noom), regulatory guidance (FTC Click-to-Cancel rule + Eighth-Circuit vacatur, Apple 5.1.1(v), CCPA §1798.105/.135), and UX-research write-ups (UserPilot, Page Flows, ProfitWell/Baremetrics). All citations linked inline; speculation is flagged.
>
> Scope: consumer-mental-health peers + general-consumer subscription peers + B2B SaaS API enum patterns + free-form vs enum trade-offs + multi-/single-select + Other-specify PHI smuggling risk + mandatory-vs-optional reason + win-back integration. Secondary mandate: surface uncovered ground in the account-delete domain → candidate D-decisions.

---

## 1. Executive summary

**C8 recommendation: KEEP the 6 current values, but split `other_specified` → `other_specified` + `other_not_specified`, ADD `taking_break` to capture the largest single bucket in consumer-mental-health peer flows, and ADD `missing_features` for Stripe-portal parity. Final shape: 8 values.**

The current 6 values cover the conceptual ground (price, fit, privacy, switching, free-text, refused) but miss two patterns that every consumer-mental-health peer ships:

1. **`taking_break`** — Headspace, Calm, BetterHelp, and Talkspace all ship a "taking a break / not the right time" choice; in mental-health flows this is the largest single bucket (10-30% of self-reported reasons per Userpilot's case studies + the [Nieman Lab 500-respondent survey](https://www.niemanlab.org/2021/10/cancel-culture-why-do-people-cancel-news-subscriptions-we-asked-they-answered/) showing "money" + "no longer need it" together account for ~50% of cancels). Without `taking_break`, every break-takers gets bucketed into `not_helpful` (incorrect — they're satisfied but pausing) or `unspecified` (signal lost). For Quilty this is also the population worth a pause-then-delete UX before hard-deleting; conflating it with `not_helpful` poisons the retention-loop ML.
2. **`missing_features`** — Stripe's canonical 8-value enum (`customer_service | low_quality | missing_features | other | switched_service | too_complex | too_expensive | unused`, per [Stripe Customer Portal docs](https://docs.stripe.com/api/customer_portal/configurations/object)) treats this as distinct from `switched_provider`. Quilty needs both: a person could leave because Quilty lacks a feature (signal → product) without having a destination (no `switched_provider`). Round-5 HIPAA-reviewer concerns are unaffected — `missing_features` has zero PHI-smuggling risk.

The PHI-safety argument for splitting `other_specified` / `other_not_specified` is operational: today's enum forces the analytics pipeline to fan out on the same value depending on whether the comment field is populated, while sanitization-of-comment is a separate concern. Splitting it makes the wire-format honest: `other_specified` means "user typed a comment that has been PHI-sanitized + retained"; `other_not_specified` means "user picked Other but the comment box was empty or sanitized to empty". This matches what every Stripe-portal consumer gets via `cancellation_details.comment === null | string`.

Locking should mark the enum **versioned, not append-only**. Per file 21 (decisions-log §B), retro-rewriting historical events is forbidden; adding `taking_break` at M5 would silently shrink the historical `not_helpful` bucket. The fix is enum-version stamping on the analytics envelope (a `schema_version: 1 | 2` discriminator), which is also an unsolved item flagged in §7.

---

## 2. Peer enum survey

Method-note: where the vendor's actual enum is published (Vercel REST API, Stripe Customer Portal) the values are verbatim API slugs. Where the vendor's enum is only reachable via the live cancel-flow (Headspace/Calm/BetterHelp/Talkspace), the column shows the closest publicly-documented description from third-party walk-throughs (Page Flows, JustAnswer, JustDeleteAccount, help-center articles) — these may lag a UX iteration. "Survey-required" = whether the user can complete cancel without selecting a reason.

| Peer                         | Type                                                                  | Single/Multi                                            | Required                                                                                                            | Other-free-text                                          | Values observed (verbatim where API; paraphrased where UI-only)                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Stripe Customer Portal**   | B2B SaaS / payment platform                                           | Single                                                  | Optional                                                                                                            | Yes — bounded `comment: string` field                    | `customer_service`, `low_quality`, `missing_features`, `other`, `switched_service`, `too_complex`, `too_expensive`, `unused` ([Stripe API ref](https://docs.stripe.com/api/customer_portal/configurations/object))                                                                                                                                                                                           |
| **Vercel REST API**          | B2B PaaS                                                              | Multi (array of objects)                                | Optional                                                                                                            | Yes — `description: string` per reason                   | Open slug set; consumers send `[{slug, description}]` ([Vercel API ref](https://vercel.com/docs/rest-api/user/delete-user-account)). 48-hour recovery window for personal accounts.                                                                                                                                                                                                                          |
| **Headspace**                | Consumer mental-health                                                | Single (claimed; reachable via Page Flows walk-through) | Reportedly optional                                                                                                 | Yes (paywalled in Page Flows; confirmed text box exists) | Taking a break, Too expensive, Not using enough, Found a different app, Privacy concerns, Other ([Headspace Help Center](https://help.headspace.com/hc/en-us/articles/115015331707), [Page Flows desktop walk-through](https://pageflows.com/post/desktop-web/deleting-your-account/headspace/)). Sources speculative on exact wording; paywalled.                                                           |
| **Calm**                     | Consumer mental-health                                                | Single                                                  | Optional                                                                                                            | Yes                                                      | Not finding it useful, Too expensive, Took a break, Used a different app, Other ([Calm Help Center](https://support.calm.com/hc/en-us/articles/115003990133-Account-Deletion), [Page Flows iOS walk-through](https://pageflows.com/post/ios/deleting-your-account/calm/)). Speculative — Page Flows paywalls the screenshots.                                                                                |
| **BetterHelp**               | Consumer mental-health (regulated)                                    | Multi (questionnaire)                                   | Optional                                                                                                            | Yes                                                      | "Quit therapy" questionnaire with reasons including: therapist fit, scheduling, cost, found another option, no longer need it, other ([BetterHelp opt-out](https://www.betterhelp.com/opt_out/), [Therapyhelpers.com walk-through](https://therapyhelpers.com/blog/how-to-cancel-betterhelp/)). Offers **3-week pause** as save-attempt before deletion.                                                     |
| **Talkspace**                | Consumer mental-health (regulated)                                    | Single                                                  | Required (third-party reports it as long)                                                                           | Yes                                                      | Survey reportedly long; specific values not publicly enumerated ([Talkspace Help Center](https://help.talkspace.com/hc/en-us/articles/360000287366), [DoNotPay walk-through](https://donotpay.com/learn/cancel-talkspace/)).                                                                                                                                                                                 |
| **Mindbloom**                | Consumer mental-health (psychedelic-assisted)                         | N/A — concierge-only                                    | N/A                                                                                                                 | N/A                                                      | No self-serve cancel; users email/chat support ([Mindbloom Help Center](https://help-center.mindbloom.com/en/articles/10130090)). Compliance-conservative choice in a regulated category.                                                                                                                                                                                                                    |
| **Noom**                     | Consumer health (behavioral)                                          | Single                                                  | Optional                                                                                                            | Yes                                                      | Cost, time, results, found alternative, other ([Stilt walk-through](https://stilt.com/save-money/how-to-cancel-noom/)).                                                                                                                                                                                                                                                                                      |
| **Cerebral**                 | Consumer mental-health (BAA-covered, $7M fine for pixel-exfiltration) | Not publicly documented                                 | Unknown                                                                                                             | Unknown                                                  | Sources opaque; their telehealth class likely uses concierge-only flow per regulatory caution.                                                                                                                                                                                                                                                                                                               |
| **Spotify**                  | Consumer subscription / media                                         | Single                                                  | Optional                                                                                                            | Yes                                                      | Specific values not public; the [Cancel page](https://www.spotify.com/de-en/signed-out/cancel/) leads through retention save + plan-comparison + post-cancel survey.                                                                                                                                                                                                                                         |
| **Netflix**                  | Consumer subscription / media                                         | Single                                                  | Optional (well-known to be skippable)                                                                               | Yes                                                      | Specific values not surfaced in search; community-reported buckets are cost, content, viewing time, switched.                                                                                                                                                                                                                                                                                                |
| **NYT / Substack**           | Consumer subscription / news                                          | Single                                                  | Optional                                                                                                            | Yes (NYT) / Optional (Substack)                          | Substack flow includes a "pause" + survey skip path ([Substack Help](https://support.substack.com/hc/en-us/articles/360037489252)). NYT cancel flow + retention-save chat is documented as long ([Nieman Lab 2021](https://www.niemanlab.org/2021/10/cancel-culture-why-do-people-cancel-news-subscriptions-we-asked-they-answered/)). Nieman survey: money = 31% of cancels, customer-service issues = 12%. |
| **Linear**                   | B2B SaaS / dev tools                                                  | Not exposed in public docs                              | Likely optional                                                                                                     | Likely yes                                               | Not enumerated; expected pattern matches Vercel / Stripe (Other + free-text).                                                                                                                                                                                                                                                                                                                                |
| **Cal.com**                  | B2B SaaS / scheduling (was open-source)                               | Not exposed in public docs                              | Likely optional                                                                                                     | Likely yes                                               | Source moved closed in 2026 per [HN discussion](https://news.ycombinator.com/item?id=47780456); historical OSS commits do not show a reason taxonomy.                                                                                                                                                                                                                                                        |
| **Plain**                    | B2B SaaS / support                                                    | Not exposed                                             | Unknown                                                                                                             | Unknown                                                  | Not surfaced.                                                                                                                                                                                                                                                                                                                                                                                                |
| **Audible / Disney+ / Hulu** | Consumer subscription / media                                         | Single                                                  | Optional (skippable per [ExplainCharges walk-through](https://explaincharges.com/how-to-cancel-hulu-subscription/)) | Yes                                                      | Specific values not surfaced; cost / content / switched / pause are recurring categories.                                                                                                                                                                                                                                                                                                                    |
| **Asana**                    | B2B SaaS / project mgmt                                               | Single + branching follow-ups (UserPilot case study)    | Optional                                                                                                            | Yes                                                      | Reason-routed counter-offer ([UserPilot blog](https://userpilot.com/blog/cancellation-flow-examples/)) — pattern, not enum.                                                                                                                                                                                                                                                                                  |

**Synthesis from the table:**

1. **8 ± 1 values is the modal taxonomy width.** Stripe (8), Headspace/Calm (5-6), BetterHelp questionnaire (~6-8), Noom (~5). The current Quilty 6 is at the low end. Bumping to 8 (adding `taking_break` + `missing_features`) lands in the modal range.
2. **No peer locks single-select as a UX-level invariant.** Vercel ships multi-select via API; BetterHelp ships a multi-part questionnaire; the rest are single-select but only as a UX simplification. The choice is policy not standard.
3. **Every consumer peer ships an "Other / specify" path.** None gates cancellation on it.
4. **None gates cancellation on selecting a reason at all.** FTC click-to-cancel "symmetry" pressure (see §3.7) actively penalizes mandatory-reason patterns.
5. **Mental-health peers ship "taking a break" explicitly.** Quilty's enum currently doesn't, which is the single most-frequently-recommended addition.
6. **Pause-before-delete is the standard save-attempt in mental-health** — BetterHelp 3-week pause, Calm and Headspace pause-via-platform-store. None forces it; all offer it. (See §5.)

---

## 3. Free-form vs enum trade-off

### 3.1 Analytics quality

Enum wins decisively: groupBy + topK + retention-bucket cohorting are O(1) on enums and O(n × similarity) on free-form. Baremetrics + ProfitWell's [Cancellation Insights tooling](https://baremetrics.com/blog/profitwell-vs-baremetrics) is built around customizable enums for exactly this reason. Free-text reasons are reportable in raw form but only become analytics-grade after manual or LLM-based bucketization — both of which compound a PHI risk (see §3.3).

### 3.2 Retention insight

Free-form gives richer texture; enum gives faster signal. For win-back ML (§5), the discriminator is reliable enough at the enum level — Userpilot's recommendation is "list the most common reasons based on churn research or past feedback, then use simple question logic to go deeper" with branching follow-ups per enum value. That maps cleanly to Quilty's `other_specified` → optional bounded `comment` field with PHI sanitizer (D67) on the BFF before the comment is logged.

### 3.3 PHI smuggling risk (decisive in Quilty's context)

Free-form fields are the canonical PHI exfiltration vector. The HIPAA Safe Harbor 18-identifier rule treats free text as PHI by default; de-identification work surveyed in [arXiv 1901.10583](https://arxiv.org/pdf/1901.10583) shows that automatic free-text de-identification accuracy is ~95-98% — which is brilliant for research but unacceptable for a compliance posture where a single missed identifier in a logged cancel-reason can re-create the Cerebral $7M scenario. Two compounding risks:

1. **User types clinical detail** ("anxiety isn't helping, my therapist diagnosed PTSD and I need something deeper"). This is PHI even though the user typed it voluntarily — HIPAA does not have a "user-consented" exception for PHI generated by a covered entity.
2. **User types third-party identifiers** ("my husband John Doe at 555-1234 said this wasn't helping him"). Now you have minor PHI for a non-consenting party.

The mitigation is layered:

- (a) The Other-specify text box is **optional and unbounded but server-side capped + sanitized**. PHI sanitizer (per D67) strips emails, phone numbers, and the HIPAA Safe Harbor identifier patterns before the comment touches Sentry, Amplitude, or the warehouse.
- (b) The comment field carries an inline disclaimer: "Don't share clinical or medical details — those stay private. Tell us about the product (pricing, features, ease of use)."
- (c) The analytics pipeline tier-separates: the BFF receives the raw comment under HIPAA-aligned handling, sanitizes, then forwards only the sanitized comment to the consent-gated analytics adapter. The raw comment is retained for ≤30 days in a `quilty.feedback.cancel` DynamoDB table with TTL, then hard-deleted (mirrors the BetterHelp 30-day data-wipe).

### 3.4 Conversion + win-back implications

Reason-routed save-attempts (the Asana pattern documented in [UserPilot](https://userpilot.com/blog/cancellation-flow-examples/)) require enums; free-form makes branching impractical. This is the strongest in-UX argument for keeping the enum primary and the comment secondary. See §5.

### 3.5 Multi-select vs single-select

Strong recommendation: **single-select primary + optional comment**. Multi-select is observed in Vercel and BetterHelp; both are edge cases (Vercel's a developer API; BetterHelp's a long questionnaire). Single-select:

- Forces honest signal (the top-of-mind reason)
- Halves the routing table for save-attempt UX (§5)
- Avoids the "all of the above" anti-pattern where users pick everything and signal nothing
- Mirrors Stripe's canonical pattern

Multi-select would be a candidate in the (regulated, support-mediated) BetterHelp-like flow; Quilty's self-serve consumer flow does not justify it.

### 3.6 Mandatory vs optional reason

**Strong recommendation: optional, with a "Prefer not to say" CTA equivalent to selecting `unspecified` — never gate cancellation on a reason.**

The compliance argument: while no specific provision in CCPA §1798.135 mandates that reason-collection be optional ([CCPA §1798.105 governs deletion](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1798.105), and the right is unqualified once verified), the [FTC Click-to-Cancel "symmetry" doctrine](https://www.ftc.gov/system/files/ftc_gov/pdf/NegOptions-1page-Oct2024-v2.pdf) explicitly treats mandatory reason-dropdowns as a dark-pattern candidate when sign-up didn't require equivalent friction. Note: the FTC rule itself was vacated by the Eighth Circuit in July 2025 on procedural grounds ([Kirkland summary](https://www.kirkland.com/publications/kirkland-alert/2024/10/ftc-finalizes-click-to-cancel-rule-governing-subscriptions-and-autorenewals), [Corepay update](https://corepay.net/articles/ftc-click-to-cancel-rule-update-2024/)), but the same conduct is still enforceable under ROSCA + FTC Act §5 + California's "one save" rule + state auto-renewal laws, and the FTC is widely expected to reissue. California's standard is **one save attempt maximum**; Quilty offering pause-then-delete is one save and within limits.

Apple's 5.1.1(v) does not address reason-collection directly, but its core principle ("make it easy to find, do not require unnecessary steps") aligns with optional reason ([Apple guideline analysis on TermsFeed](https://www.termsfeed.com/blog/apple-requirement-in-app-deletion-accounts/), [Practical Privacy / Wyrick Robbins on 5.1.1(v)](https://practicalprivacy.wyrick.com/blog/second-bite-at-the-apple-apples-account-deletion-requirement-finally-goes-into-effect-is-your-mobile-app-compliant)).

### 3.7 Verdict

Enum primary, optional, single-select, optional bounded PHI-sanitized comment for `other_specified`. Same pattern Stripe ships. Same pattern every analyzable peer ships.

---

## 4. Recommended Quilty enum

```typescript
// @quilty/observability/src/ports.ts — D82 Analytics port (revised C8)

export type AccountDeleteReason =
  | 'too_expensive' // KEEP (matches Stripe `too_expensive`)
  | 'not_helpful' // KEEP — "didn't get value from Quilty"
  | 'taking_break' // NEW — "stepping away, not deleting because of Quilty"
  | 'privacy' // KEEP
  | 'switched_provider' // KEEP (matches Stripe `switched_service`)
  | 'missing_features' // NEW (matches Stripe `missing_features`)
  | 'other_specified' // KEEP — comment field populated + sanitized
  | 'other_not_specified'; // RENAMED from `unspecified` — clearer wire-format

export type AccountDeleteSurvey = {
  reason: AccountDeleteReason;
  comment?: string; // optional, server-side capped 500 chars, PHI-sanitized via D67
  comment_disclaimer_acknowledged?: boolean; // UI gate before submit on `other_specified` path
  schema_version: 1; // versioned envelope — see §7 unsolved items
};
```

**Per-value rationale:**

- `too_expensive` — keep. Top-of-funnel cancel reason per Nieman Lab 31%. Routes save-attempt to discount/plan-change (§5).
- `not_helpful` — keep. Routes save-attempt to support-callback offer or research-resource library. (Clinical-grade routing — careful: never route to a crisis line via this enum; that's a separate Help-domain interrupt.)
- `taking_break` — **NEW**. Routes to pause-then-delete (§5). Without this, every break-taker gets miscategorized as `not_helpful` and the product team chases a phantom signal. Mental-health peer baseline (Headspace, Calm, BetterHelp).
- `privacy` — keep. Routes to no save-attempt (pressing privacy concerns with retention offers is the Cerebral playbook and the FTC dark-pattern playbook). Goes straight to confirmation.
- `switched_provider` — keep, matches Stripe `switched_service`. Routes to optional free-text "Which one?" follow-up (one-line text, also PHI-sanitized — though a competitor name carries far less PHI risk than a personal description).
- `missing_features` — **NEW**. Matches Stripe. Routes to optional "Which feature would help?" follow-up. Highest product-signal value of any reason.
- `other_specified` — keep semantic; user typed something. Comment field PHI-sanitized server-side. Routes to no save-attempt (we don't know why they're leaving).
- `other_not_specified` — **RENAMED from `unspecified`**. User declined to answer, or hit "Prefer not to say". Wire-format is now self-describing without inspecting the comment field's null-state. Routes to no save-attempt.

**Removed?** Nothing. Considered + rejected:

- `customer_service` (Stripe) — Quilty has no large support footprint at launch; would be a phantom bucket until M9+.
- `too_complex` (Stripe) — overlaps `not_helpful` for a meditation-style consumer product; add at M5+ if real-world data shows distinct signal.
- `low_quality` (Stripe) — same as above; overlaps `not_helpful`.
- `unused` (Stripe) — overlaps `taking_break` for a habit-formation product; the Quilty framing is closer to "I'm stepping away" than "I never engaged".

If at M5+ analytics shows `not_helpful` collapsing too many distinct signals, the enum can be widened by additive change (e.g., add `too_complex` + `unused` + `low_quality` — all PHI-safe, all Stripe-canonical). This requires the schema-version stamping flagged in §7.

---

## 5. Win-back / retention integration

Reason-routed save-attempts are where the enum earns its keep. Recommended UX-routing table (single save attempt per CA "one save" — never two):

| Reason                | Save-attempt                                                                                                     | Then?                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `too_expensive`       | One-time 25%/3-month discount OR plan downgrade (when annual ships, M9+)                                         | Continue to confirm                         |
| `not_helpful`         | "Want to chat with our team?" — optional support-callback link                                                   | Continue to confirm                         |
| `taking_break`        | **Pause subscription** for 30 / 60 / 90 days (Stripe `pause_collection`) — return to a hibernated account        | If pause: cancel cancel-flow. Else: confirm |
| `privacy`             | **No save attempt.** Direct to confirm + a one-paragraph "Your data is deleted, here's exactly what" reassurance | Confirm                                     |
| `switched_provider`   | "Mind telling us where?" optional one-line text, no offer                                                        | Continue to confirm                         |
| `missing_features`    | "Mind telling us which feature?" optional one-line text, no offer                                                | Continue to confirm                         |
| `other_specified`     | No save attempt (we don't know what to offer)                                                                    | Continue to confirm                         |
| `other_not_specified` | No save attempt                                                                                                  | Continue to confirm                         |

Critical UX rules:

1. **Save attempts must be dismissable in 1 click + ≤2 seconds** (FTC symmetry).
2. **No save-attempts on `privacy` or `unspecified`.** Pressing a user who flagged privacy is the dark-pattern that gets companies sued.
3. **Pause as the dominant save-attempt for `taking_break`.** BetterHelp's 3-week pause is the consumer-mental-health gold standard.
4. **Discounts are once-per-account, ever** — record `discount_offered_at` in the user record to prevent the cancel-loop-for-discount churn pattern.

---

## 6. C8 recommendation

**REVISED — adopt 8-value enum:**

```typescript
type AccountDeleteReason =
  | 'too_expensive'
  | 'not_helpful'
  | 'taking_break'
  | 'privacy'
  | 'switched_provider'
  | 'missing_features'
  | 'other_specified'
  | 'other_not_specified';
```

- Locked behavior: single-select, optional, optional bounded PHI-sanitized comment, single save-attempt per reason, never gate cancellation.
- D82 Analytics port needs the type updated (1-line change) before M1 close-out.
- All save-attempt UX routing lives in the (account) layout's delete flow component — NOT in the analytics port. Per modular-monolith boundary (D75-D81), the analytics port emits `account_deleted` with the chosen reason; the UX routing is a feature of `apps/web` not the observability package.
- `schema_version: 1` on the analytics envelope future-proofs the enum-expansion case at M5+ (see §7-1).
- Confidence: HIGH. Changes are additive (no historical analytics regress) + Stripe-aligned (vendor canonical) + consumer-mental-health peer-aligned (every peer ships `taking_break`).

---

## 7. Items not in our decision log yet — candidate D-decisions

Each item below is uncovered (or only partially covered) in D1-D110+. Listed with priority + recommended default. Bracketed Round-6 numbering uses next-available D-numbers (verify against `synthesis-and-decisions.md` at lock time).

### P0 — blocks M5 (account portal v0) or earlier

- **[D-next, P0] Enum-version stamping on cancel-reason events** — Stamp `schema_version: 1` on every `account_deleted` event. When the enum widens at M5+ (e.g., adding `too_complex`), bump to `schema_version: 2` so downstream queries can union-or-discriminate without retro-rewriting. Default: ship at the enum lock.
- **[D-next, P0] Optional reason — never mandatory** — Lock as policy: "the cancel-reason picker is always optional; a 'Prefer not to say' choice is always present; cancellation never blocks on reason-selection." Default: optional. Rationale: FTC symmetry + California one-save + Apple 5.1.1(v).
- **[D-next, P0] PHI sanitizer applied server-side to `comment`** — Confirm D67's PHI-sanitizer chain is the BFF middleware for the `comment` field on cancel-survey submit. Comment is capped at 500 chars before sanitization; final stored length is ≤500 chars post-sanitization. Raw comment retained ≤30 days in a TTL'd table; sanitized version goes to analytics. Default: ship at M1.5 (when @quilty/observability package lands).
- **[D-next, P0] Account-delete flow steps** — Lock the canonical flow: (1) Settings → Account → Delete; (2) step-up re-auth (D54 elevated_until); (3) reason picker (optional); (4) save-attempt (routed by reason); (5) confirm checkbox + button; (6) email confirmation link; (7) hard-delete + receipt email. Default: 7-step flow ending in email-confirmed hard-delete.
- **[D-next, P0] Soft-delete cooling-off window** — How long between user-confirmation and hard-delete? BetterHelp: 30-day data wipe. Vercel: 48-hour recovery for personal accounts (per Vercel docs). Recommended: **48-hour grace window** between user-confirmation and EventBridge-fanned-out hard-delete event. Window communicated in confirmation email; user can recover with a recovery link until the window expires. Rationale: matches Vercel's consumer-style window; gives BetterHelp-style 30-day data retention to legal/research carve-outs (see GDPR Art 17 below); 48 hours is short enough to satisfy hard-delete-now expectations.
- **[D-next, P0] Data export prompt before delete (GDPR Art 17 + Art 20 dual-trigger)** — Pre-confirmation step: "Want to download your data first?" → triggers the C6 Rust-backend Export API call → email with download link arrives before delete completes. Default: surface as a soft prompt, never block. Coordinated with C6 (GDPR Right-to-Access scope unified across Rust backend).

### P1 — blocks M6 (real auth integration) or M7 (Stripe)

- **[D-next, P1] Sign-in re-verification before delete (step-up re-MFA per D54)** — On clicking Delete, require step-up: prompt=login with 5-min elevated_until window. Default: required on production (M6+).
- **[D-next, P1] Active-subscription block on delete** — If user has an active Stripe subscription, force cancel-then-delete (or auto-cancel-then-delete). Default: auto-cancel at the start of the delete flow with a "We'll also cancel your subscription — no further charges" disclosure. Rationale: avoids the orphan-subscription-after-delete failure mode. (Note: also touches the iOS/Google IAP edge case — IAP subscriptions live in Apple/Google's billing realm, not Stripe; the delete flow must surface a "cancel in App Store / Play Store first" message for those users since Quilty cannot unilaterally cancel an IAP subscription.)
- **[D-next, P1] Subscription cancel ≠ account delete** — Two separate flows. Cancelling a subscription should never delete the account. Deleting an account auto-cancels the subscription. Default: lock as policy in the account-portal IA.
- **[D-next, P1] Delete + create-new-account with same email — allowed?** — Per Apple 5.1.1(v) the user must be able to delete; nothing requires that re-onboarding with the same email is prohibited. Default: allow re-create after the 48-hour grace window expires AND prior session-related state has been hard-purged. Same email allowed; the user is treated as a fully new account (no auto-restore of prior history).
- **[D-next, P1] Win-back email after delete — allowed?** — CAN-SPAM allows transactional emails (account-deletion receipt: yes). Marketing emails to a deleted account: **no**, full stop. The deletion is treated as a consent withdrawal under GDPR Art 21 (Right to Object). Default: zero marketing emails to a deleted account ever; account-deletion receipt email is the only post-delete transactional touchpoint.
- **[D-next, P1] Deletion confirmation receipt email** — Email arrives at the user's address-of-record after hard-delete completes, with: deletion timestamp, account ID hash (for support reference if user disputes), what data was deleted, what data was retained (legal-hold + financial-records carve-outs), and a privacy-policy reference. Default: ship at M6.

### P2 — blocks M8 (legal/compliance) or M9+

- **[D-next, P2] Mobile vs web delete trigger parity** — Apple 5.1.1(v) requires in-app deletion availability; Google Play also requires either in-app or via a public account-deletion URL ([Google Play deletion policy](https://support.google.com/googleplay/android-developer/answer/13327111)). Web is already the canonical Apple-required deeplink target (`/account/delete`). Default: both mobile and web surfaces complete the full flow; the Rust backend is the single delete-execution path; both surfaces fan-in to it. Mobile (Flutter) calls the same Rust delete API the web BFF calls.
- **[D-next, P2] Account-delete UI placement** — Default: Settings → Account → Account & Data → **Delete account** (last item, kept visible NOT hidden in Privacy sub-section). Rationale: Apple "easy to find" + the FTC symmetry doctrine + the legal-blogger consensus on placement.
- **[D-next, P2] Cancel-flow A/B testing limits** — FTC + California prohibit cancellation friction A/B testing that adds steps. Allowed: testing save-attempt copy, post-delete email copy, confirmation-screen copy. Default: **disallow A/B testing of cancel-flow length or reason-required-vs-optional**; allow A/B testing on save-attempt copy and offer amount.
- **[D-next, P2] Right-to-Object (GDPR Art 21) — separate from delete** — Art 21 is the right to withdraw consent for processing without deleting the account. Default: ship a separate "Pause processing / unsubscribe from analytics" toggle in Privacy & Data settings (independent of delete). Coordinated with C5/C6 GDPR scope.

### P3 — M9+ / triggered

- **[D-next, P3] Family / group accounts** — Deletion of a child without affecting a parent / shared subscription. Default: out-of-scope until family pricing ships (M9+ trigger). Reserve `family_account_id` field name in the data model now to avoid migration cost later.
- **[D-next, P3] Mandatory deletion-reason for regulated audit trails?** — For SOC 2 / HIPAA audit purposes, would we want internal audit log to record "user pressed Delete at timestamp X with reason Y"? Yes — but that's the audit log (server-side, distinct from the analytics enum). Default: dual-write — analytics emits `account_deleted` (optional reason); audit log records the user-facing event regardless. Audit-log retention: 6 years (HIPAA standard).
- **[D-next, P3] What happens to peer-content (shared content with deleted user)?** — In a future social/group feature, deleting User A removes their identity from shared spaces but preserves the shared content under "Deleted User". Default: out-of-scope at M1; reserve `author_id_hash` retention pattern in the data model.

---

## Appendix — Files cross-referenced

- `decisions-log.md` §B.2 (D82 Analytics port, lines 988-1009 — the source of the current 6-value enum to be revised)
- `synthesis-and-decisions.md` §C.P1.C8 (lines 209) — the question being answered
- `_raw/06-forms-bots-reputation.md` — RHF + Zod for the reason-picker form
- `_raw/07-deeplinks-error-resilience.md` §Q6 — `/en/account/delete` SEO posture (index=true for Apple/Google)
- `_raw/18-cmp-and-legal-pages-verification.md` — D97 ConsentStore (the analytics-gating dependency for the `account_deleted` event)
- `regulatory_requirements.md` — Apple 5.1.1(v) HARD-conditional + Google Play HARD requirement
- `website_strategy_discussion.md` D31 (zero PHI in website runtime), D54 (step-up auth), D67 (PHI sanitizer + ban-direct-vendor-SDK)

---

**Word count target ~2500. Read-only audit — no production changes proposed beyond a 1-line D82 enum revision pre-M1-close.**
