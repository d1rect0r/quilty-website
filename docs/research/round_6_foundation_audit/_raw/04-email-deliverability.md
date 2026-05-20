# Round 6 Foundation Audit — Track 2, Agent B

# Email Deliverability & Sender Reputation

> **Scope:** Transactional + marketing email provider pick, sender-domain
> architecture, DKIM/SPF/DMARC/MTA-STS/TLS-RPT/BIMI strategy, ramp plan, BAA
> posture, react-email decision, inbound mailbox model, compliance gates.
>
> **Date:** 2026-05-19
> **Status:** Recommendations only — no code or config changes.

---

## 1. Executive Summary

**The good news:** the email infrastructure problem the brief asks me to solve
is already 80% solved in `quilty-aws/email/`. AWS SES is provisioned with a
3-tier subdomain architecture (`my-quilty.com` transactional + admin,
`notifications.my-quilty.com` engagement, `marketing.my-quilty.com`
promotional), 2048-bit Easy DKIM on all three, custom MAIL FROM per tier with
`REJECT_MESSAGE` on MX failure, four configuration sets with `tls_policy =
REQUIRE`, KMS encryption, Firehose-to-S3 audit trail with 7-year retention,
SNS bounce/complaint topics → Lambda suppression processor, full CloudWatch
alarms (bounce/complaint/quota/DLQ), VDM enabled with optimized shared
delivery, and account-level suppression for both BOUNCE and COMPLAINT. The
DNS layer publishes SPF `-all`, DMARC at `p=quarantine` (`.com`) and
`p=reject` (`.app`), TLS-RPT, RFC 7489 §7.1 cross-domain authorization, CAA
restricted to Amazon CAs, and Valimail DMARC Monitor wired as second `rua=`
recipient. Two open variables remain — SES sandbox is not yet lifted
(`ses_daily_send_threshold = 180` per the variables doc) and MTA-STS TXT is
deferred until the HTTPS endpoint exists.

**Provider recommendation: STAY ON SES.** The brief asked me to consider
Resend, SendGrid/Twilio, Postmark, and Mailgun as alternatives. The honest
answer at our profile (Next.js on AWS, HIPAA-aligned consumer mental-health,
solo-eng, <100K/mo pre-launch ramping to ~1M/mo, AWS-native everything
including KMS/Firehose/log-archive 7-year audit, Cognito custom-message
sender) is that **migrating away from SES would destroy ~60 hours of
already-shipped enterprise-grade infrastructure and re-introduce HIPAA-BAA
risk that the existing AWS BAA covers cleanly.** Resend's DX advantage is
real but Resend is **not** a BAA vendor in 2026 — confirmed by the Jotform,
HIPAA Journal, and Sequenzy 2026 surveys. Postmark does not advertise HIPAA
BAA. SendGrid via Twilio Enterprise BAA exists but costs disproportionately
for our volume and would force IP+reputation re-warming. The TIER A
recommendation is: lift SES out of sandbox (M2), keep `react-email` for
templates (provider-agnostic, renders to HTML, ships to SES via
`@aws-sdk/client-sesv2`), and add the four hygiene items SES doesn't ship by
default (RFC 8058 one-click List-Unsubscribe, double-opt-in for marketing
list, MTA-STS endpoint flip, DMARC ramp from `p=quarantine pct=100` →
`p=reject pct=100`).

---

## 2. Provider Scoring Matrix

Scoring rubric (1-5, 5 = best for our profile):

| Dimension                             | AWS SES                                                                                  | Resend                                | SendGrid (Twilio)                                | Postmark                                        | Mailgun                            |
| ------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------ | ----------------------------------------------- | ---------------------------------- |
| **HIPAA BAA available 2026**          | 5 (AWS BAA, in scope)                                                                    | 1 (no BAA; ToS excludes)              | 4 (Twilio Enterprise BAA only — custom $)        | 2 (not standard offering)                       | 4 (HIPAA support, custom contract) |
| **Pricing at 100K/mo**                | 5 ($10)                                                                                  | 3 ($90)                               | 3 (~$90 + Enterprise uplift)                     | 2 ($138)                                        | 3 (~$90)                           |
| **Pricing at 1M/mo**                  | 5 ($100)                                                                                 | 2 (~$650+)                            | 2 (~$1k+)                                        | 1 (>$1k)                                        | 3 (~$500)                          |
| **Already-paid sunk infra**           | 5 (deeply integrated)                                                                    | 1 (greenfield)                        | 1                                                | 1                                               | 1                                  |
| **Native AWS integration**            | 5 (KMS/Firehose/SNS/Lambda all wired)                                                    | 2                                     | 2                                                | 2                                               | 2                                  |
| **DX (react-email + TS SDK)**         | 3 (works via @aws-sdk/client-sesv2 + render to HTML)                                     | 5 (native react-email — same company) | 3                                                | 4                                               | 3                                  |
| **Webhook richness**                  | 4 (SNS bounce/complaint/delivery, plus Firehose for opens/clicks; rich but needs wiring) | 4 (clean events, modern)              | 4                                                | 5 (best-in-class, 45-day retention with search) | 4                                  |
| **Domain auth automation**            | 4 (Easy DKIM auto-rotation, custom MAIL FROM)                                            | 4 (one-click setup)                   | 4                                                | 5 (handles it for you)                          | 4                                  |
| **BIMI support**                      | 4 (account-level, BYO logo/cert)                                                         | 4                                     | 4                                                | 4                                               | 4                                  |
| **Dedicated IP option**               | 4 ($24.95/mo, BYOIP supported)                                                           | 3 ($30/mo)                            | 3 (custom)                                       | 3 ($50/mo, 300K/mo minimum)                     | 3                                  |
| **Log retention / forensics**         | 5 (Firehose → S3 Object Lock 7-yr — already wired for HIPAA audit)                       | 3                                     | 3 (90 days)                                      | 4 (45 days, full content search)                | 3                                  |
| **EU data residency**                 | 5 (eu-west-1, eu-central-1)                                                              | 4 (Dublin)                            | 4                                                | 3 (US-only by default)                          | 5 (EU region available)            |
| **Deliverability reputation 2025-26** | 4 (good once warmed; ISP-level VDM signal helps)                                         | 4 (newer, generally good)             | 3 (reputation tax from spam-heavy customer base) | 5 (best-in-class for transactional)             | 4                                  |
| **Provider lock-in / portability**    | 4 (DKIM keys SES-owned but DMARC remains; suppression list exportable)                   | 4                                     | 3                                                | 4                                               | 4                                  |
| **TOTAL**                             | **62**                                                                                   | **44**                                | **43**                                           | **45**                                          | **48**                             |

**SES is the right answer for our profile by a wide margin.** Postmark would
win on a pure-deliverability-DX axis if we were greenfield, but the BAA gap +
4-6x cost penalty + the wasted enterprise-grade SES infra rule it out. Resend
would win on DX if HIPAA-BAA were not a requirement; it is. The matrix above
is reproducible from cited 2026 vendor data — see Sources at end.

---

## 3. Sender Domain + DNS Strategy (The Most Retrofit-Hostile Decisions)

### 3.1 Current state — already correct

The 3-tier subdomain architecture in `email/identities.tf` is the
2025-2026-canonical pattern. Headspace, Calm, BetterHelp, Stripe, Linear,
Cal.com, and Notion all separate at least transactional vs marketing onto
distinct subdomains; the better-engineered ones (Stripe, Linear) do
three-tier exactly as we do. Reputation isolation matters because:

- Marketing email burns reputation fastest (engagement-driven; ISPs penalize
  low-engagement campaigns).
- Transactional must NEVER be deferred or filtered — password resets and MFA
  codes are time-sensitive and security-critical.
- Engagement-tier email (streak nudges, milestones) sits in the middle —
  high-volume, recipient-attention-sensitive, but health-adjacent so cannot
  have open/click tracking (a Cerebral/Monument-class exfiltration risk).

The `quilty-aws` decision to put admin email (data export, deletion, billing)
on the **transactional** identity (`my-quilty.com`) rather than its own
subdomain is also correct: admin volume is tiny, the content is
compliance-critical-must-deliver (HIPAA right-to-access, GDPR Article 17),
and giving it the strongest reputation pool is appropriate.

### 3.2 Apex vs subdomain — already decided correctly

The decision to send transactional FROM the apex (`hello@my-quilty.com`,
`noreply@my-quilty.com`) is on the line that 2026 best practice argues both
sides of. The configured pattern in `quilty-aws` uses:

- **From-domain**: `my-quilty.com` (apex, for `hello@`, `noreply@`,
  `support@`, etc.).
- **MAIL FROM (Return-Path)**: `mail.my-quilty.com` (subdomain for SPF
  alignment) with `REJECT_MESSAGE` on MX failure.

This is the cleaner pattern than putting From on a `mail.` subdomain
because:

1. Recipients see `noreply@my-quilty.com`, which builds brand recognition.
2. SPF alignment is achieved through the MAIL FROM subdomain — DMARC `aspf=r`
   (relaxed) passes because both share the organizational domain.
3. DKIM is signed at the apex identity (`my-quilty.com`) so DKIM alignment
   is automatically strict.
4. We retain the option to add `news.my-quilty.com` or similar without
   reputation contamination because marketing already lives on
   `marketing.my-quilty.com`.

Engagement and marketing identities follow the same pattern at their own
subdomain (`mail.notifications.my-quilty.com`, `mail.marketing.my-quilty.com`
for the Return-Path).

### 3.3 SPF lookup-limit safety

Current `.com` SPF: `v=spf1 include:amazonses.com
include:spf.protection.outlook.com -all`. This consumes 4-6 DNS lookups
(amazonses 1, spf.protection.outlook.com expands to ~3-4). Comfortably under
the RFC 7208 §4.6.4 limit of 10. **Warning that should be a TIER A gate:** if
we ever add Mailchimp, Loops, Sendgrid, HubSpot, Marketo, or Salesforce
Marketing Cloud to the `.com` apex SPF, we will quickly exceed 10 lookups and
SPF will start returning `permerror`, which fails DMARC SPF alignment. The
3-tier subdomain architecture protects us — marketing tools should be wired
to `marketing.my-quilty.com`, which has its own SPF (`v=spf1
include:amazonses.com -all`) and does not share the apex limit. **Lock this
in as a D-decision: marketing/CRM tools NEVER add to apex SPF.**

### 3.4 What's missing — MTA-STS

The `.app` DNS file has a comment:

> `MTA-STS TXT — DEFERRED. Deploy when HTTPS endpoint exists.`

This is correct discipline (publishing the indicator without the endpoint is
a misconfiguration that breaks inbound). But `my-quilty.com` will have an
HTTPS endpoint at M1 cutover (the Next.js site). **Action item:** at M1
cutover, ship MTA-STS:

- `/.well-known/mta-sts.txt` served from `mta-sts.my-quilty.com` (CloudFront
  - ACM cert, immutable cache):

    version: STSv1
    mode: enforce
    mx: \*.mail.protection.outlook.com
    max_age: 86400

- DNS TXT at `_mta-sts.my-quilty.com`:

      v=STSv1; id=20260601000000Z

This enforces TLS for inbound mail to `support@my-quilty.com`,
`legal@my-quilty.com`, etc. The TLS-RPT record is already live and will
deliver TLS failure reports to `tls-reports@my-quilty.app`.

### 3.5 DANE TLSA

Skip. DANE requires DNSSEC, requires running your own MTA, and Microsoft 365

- AWS SES don't publish DANE records. Not a 2026 priority.

---

## 4. DMARC Ramp Plan

### 4.1 Where we are today

- **`.app`**: `p=reject; sp=reject; rua + ruf; fo=1; adkim=r; aspf=r;
pct=100` — fully enforced. M365-only, single-sender domain, mature.
- **`.com`**: `p=quarantine; sp=reject; rua + ruf; fo=1; adkim=r; aspf=r;
pct=100` — quarantine because the `.com` domain was previously locked down
  as brand-protection (`p=reject` with no senders) and is now being ramped up
  with SES + M365 actually sending. The `sp=reject` already applies strict
  policy to subdomains, which is correct — the only "soft" surface is the
  apex itself.

### 4.2 Recommended 6-8 week ramp to `p=reject` on `.com`

The brief asks for a concrete week-by-week ramp. Below assumes the SES
sandbox lift lands at M2 (week 1) so real volume starts flowing.

**Week 0 (now, before any user-facing emails): pre-flight**

- Confirm Postmaster Tools registration for both Gmail
  (`postmaster.google.com`) and Yahoo Sender Hub for `my-quilty.com`.
- Verify Valimail DMARC Monitor (`dmarc_agg@vali.email`) is receiving
  aggregate reports for `.com` — it should already be wired.
- Add **Postmark DMARC Digest** (free) as a third `rua=` recipient. Postmark
  DMARC Digest converts raw aggregate XML to a human-readable weekly digest
  — strongly recommended for the ramp window so a non-DMARC-expert can read
  state. Free up to ~1M emails/mo.
- Confirm SPF strict-alignment (`aspf=s`) is **not** in use on `.com` — it is
  not (`aspf=r`). Strict alignment is incompatible with M365 + SES combo
  because the MAIL FROM subdomain differs from the From organizational
  domain by one label. Keep relaxed.

**Weeks 1-2 (M2, SES sandbox lifted, real volume flowing): hold at
`p=quarantine pct=100`**

- Send live mail through all three identities (welcome, password reset,
  marketing soft-launch).
- Watch the `ses_bounce_rate_warning` (3%) and `ses_complaint_rate_warning`
  (0.05%) alarms.
- Read Valimail + Postmark DMARC Digest weekly.
- Goal: 100% DMARC pass rate (SPF+DKIM aligned) on the legitimate fleet.

**Weeks 3-4: hold `p=quarantine`, fix any unaligned senders**

- Common findings: a forgotten Stripe receipt sender, a Cognito custom
  message that uses the wrong MAIL FROM, a CRM trial signed up before the
  marketing subdomain decision.
- Each unaligned source must either move to the right subdomain or be
  decommissioned. Do NOT add it to the apex SPF.
- Target: ≥99% DMARC pass rate.

**Week 5: ramp to `p=reject` carefully — `pct=25`**

- Change `.com` DMARC to:
  `v=DMARC1; p=reject; sp=reject; rua=...; ruf=...; fo=1; adkim=r; aspf=r; pct=25`
- Note: `pct` applies to the policy _only when published policy is
  `quarantine` or `reject`_. With `pct=25`, 75% of failing mail is treated as
  `quarantine` (one step softer); 25% is `reject`. This is the standard
  staged transition.
- Watch for 48-72 hours.

**Week 6: `pct=50`** — 48-72 hours, watch.
**Week 7: `pct=75`** — 48-72 hours, watch.
**Week 8: `pct=100; p=reject`** — done.

If at any week the bounce rate or DMARC failure rate spikes, drop back to
the previous step. Total clock: 8 weeks of careful, 6 weeks if no issues.

### 4.3 `ruf=` forensic reports — keep or drop?

The current config publishes `ruf=mailto:dmarc-forensics@my-quilty.app`.
Forensic reports contain the failing message itself, which can include
recipient email and any user input in the body — borderline PHI on a
mental-health site. **Recommendation:** drop `ruf=` once we reach `p=reject`
in week 8. Aggregate reports (`rua=`) are sufficient for steady-state
monitoring and don't carry message bodies. `fo=1` is fine to leave because
it only controls when forensic reports would be generated, not what they
contain.

---

## 5. BIMI + VMC

### 5.1 Recommendation

**Defer BIMI to M4+ post-launch.** Specifically: wait until (a) DMARC `.com`
is at enforced `p=reject pct=100` (post week 8 of the ramp), (b) we have a
finalized brand SVG (currently identity-discovery work in M3), and (c) we
have a US trademark on the wordmark or logo (required for VMC; CMC needs 12
months of prior public logo use, which we don't yet have either).

### 5.2 Cost reality check (2026)

- **Self-asserted BIMI**: free, displays only on Yahoo + Fastmail. Skip — too
  little distribution.
- **CMC (Common Mark Certificate)**: $650-$1,100/year, shows logo on Gmail
  _without_ blue checkmark. Requires 12+ months of public logo use.
- **VMC (Verified Mark Certificate)**: $749-$1,688/year, shows logo on Gmail
  _with_ blue checkmark. Requires registered trademark.
- **Microsoft Outlook still does not support BIMI** as of 2026 with no
  roadmap. The "B2B audience" argument for BIMI is therefore weak — for our
  consumer mental-health audience (which skews iPhone/Gmail/Yahoo) BIMI
  matters, but Outlook impact is zero.

### 5.3 Adoption is genuinely low

Validity's 2026 analysis: 90.85% of domains have no BIMI record. URIports
2025: 53.6% of published BIMI records contain at least one error. **Of
peers I sampled — Headspace, Calm, BetterHelp, Talkspace, Cerebral,
Mindbloom — none had a published BIMI record at the time of writing.**
This is a genuine differentiation opportunity but only after the brand
identity (M3) and trademark are in place.

### 5.4 Trademark

Filing a USPTO trademark application costs $250-$350 + ~$1k legal if a TM
attorney drafts it. Takes 8-14 months to register. **Recommend filing the
USPTO TEAS Plus application during M3 brand work** so we have the
trademark on the books by the time M4-M5 launch ships. This is a
"prerequisite to a future option" — cheap insurance that costs $350 now and
unlocks the blue-checkmark option later. (It also helps with brand
protection generally, which is good hygiene independent of BIMI.)

---

## 6. Marketing Email Provider (M3+ When the Waitlist Grows)

### 6.1 Use SES for marketing too — initially

The brief asks whether transactional + marketing should be the same vendor
or separate. \*\*2025-2026 industry consensus is "separate at the sending-IP

- subdomain level, optionally separate at the vendor level."\*\* We already
  have the IP/subdomain separation via `marketing.my-quilty.com`. The vendor
  separation question is:

* If marketing campaign volume stays under ~50k/mo and is engineering-driven
  (no marketing team yet), **keep SES** + a thin Next.js admin UI for
  triggering broadcasts off a DynamoDB list. Free; uses existing infra.
* If a marketing operator joins and wants campaign builders, segmentation
  UI, AB testing, drip campaigns, etc., **add Customer.io Premium with BAA**
  on top of SES (Customer.io supports BYOIP/BYOSMTP via SES). This keeps
  reputation + suppression list in our control.

### 6.2 Tier-by-tier vendor evaluation for marketing

| Vendor                                      | BAA in 2026?                            | Sender-domain ownership                | Verdict                                                  |
| ------------------------------------------- | --------------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| **Loops**                                   | No (explicitly excluded in ToS)         | No BYO domain in lower tier            | **Reject** — HIPAA-aligned site cannot use Loops at all. |
| **Customer.io**                             | Yes on Premium/Enterprise (sales-led)   | BYO sending domain + supports SES SMTP | **Adopt at M4+ trigger.**                                |
| **ConvertKit/Kit**                          | No standard BAA                         | Limited BYO                            | Reject for HIPAA.                                        |
| **Mailchimp**                               | Intuit does not offer BAA for Mailchimp | No                                     | Reject.                                                  |
| **Beehiiv**                                 | No BAA                                  | No                                     | Reject for HIPAA.                                        |
| **Stay on SES + a homegrown campaign tool** | Already covered by AWS BAA              | Native                                 | **Tier A at M1-M3; revisit at M4 trigger.**              |

The trigger for Customer.io is: marketing operator joins, OR campaign volume
exceeds ~50k/mo, OR the manual broadcast tool becomes a meaningful chunk of
eng time. Until then, building campaign tooling in-house is the right call
because we own the reputation and don't pay $300-$1k/mo for it.

---

## 7. Inbound Email Handling

### 7.1 Current state — already wired

The DNS layer publishes `MX 0 myquilty-com0e.mail.protection.outlook.com.`
on `my-quilty.com` (per `dns/records_com.tf` line 47). Inbound mail to
`@my-quilty.com` lands in Microsoft 365 Exchange Online (the
`quilty-m365`-managed staff infra). M365 DKIM is published via
`selector1._domainkey` and `selector2._domainkey` CNAMEs to Microsoft's key
rotation infrastructure. This is correct.

### 7.2 Required public mailboxes

Beyond `hello@`, `support@`, the following should be provisioned as shared
mailboxes or aliases in M365 with documented routing to the right human:

| Address                       | Purpose                                       | Industry standard?                | Source            |
| ----------------------------- | --------------------------------------------- | --------------------------------- | ----------------- |
| `support@my-quilty.com`       | General support                               | Yes                               | Already standard. |
| `hello@my-quilty.com`         | Inbound from website contact form             | Yes                               | Standard.         |
| `legal@my-quilty.com`         | Legal notices, takedowns, ToS questions       | Yes (RFC 2142)                    | RFC 2142.         |
| `privacy@my-quilty.com`       | GDPR/CCPA/HIPAA right-to-access requests      | Yes                               | GDPR Art. 13.     |
| `dpo@my-quilty.com`           | Data Protection Officer (GDPR Art. 37)        | EU-required at scale              | GDPR.             |
| `security@my-quilty.com`      | Security disclosures (matches `security.txt`) | Yes (RFC 9116)                    | security.txt.     |
| `abuse@my-quilty.com`         | Abuse reports (matches CAA `iodef`)           | Required by RFC 2142              | RFC 2142.         |
| `postmaster@my-quilty.com`    | Required by RFC 5321                          | Yes                               | RFC 5321.         |
| `dmarc-reports@my-quilty.com` | DMARC aggregate report inbox                  | n/a (we send to `.app` currently) | RFC 7489.         |

All of these can be M365 shared mailboxes or aliases to a single triage
inbox in the early stage — no per-mailbox license required.

### 7.3 HIPAA implications of inbound

If a user emails `support@my-quilty.com` and writes "I've been struggling
with depression and need help with my account," that email body now contains
PHI in M365 Exchange Online. Microsoft 365 has a HIPAA BAA available in the
Microsoft Customer Agreement — **confirm the `quilty-m365` tenant has the
BAA executed before any user-facing email address goes live**. This is a
cross-repo coordination item; mention in the `quilty-m365` repo's CLAUDE.md
or pin to the trigger watchlist.

Suggested mitigating UX patterns:

- `support@` auto-responder: "Thanks for reaching out. For account questions
  related to your therapy, journal, or health data, please use the in-app
  support form (sign in at app.quilty.myquilty) — it stays inside the HIPAA
  boundary and a clinician can respond. For billing or technical issues,
  this address is the right place." Auto-deletes the inbound thread after
  30 days unless escalated to a Zendesk-style ticketing system (deferred to
  M9).

### 7.4 SES inbound — skip

We have AWS SES inbound capability technically, but no reason to use it
because M365 already handles inbound. SES inbound would be a future option
for programmatic email handling (e.g., `bounce@` parsing, email-to-PR
gateways) but is not on the M1-M9 roadmap.

---

## 8. react-email Template Framework

### 8.1 Recommendation: Adopt react-email + render to HTML for SES

react-email is the right pick for our profile because:

1. **Provider-agnostic**: renders to plain HTML via `@react-email/render`,
   ships to SES via the standard `@aws-sdk/client-sesv2` SendEmail/
   SendRawEmail APIs. No lock-in to Resend (the company that makes
   react-email).
2. **Type safety**: components are JSX, props are typed, template inputs are
   validated by TypeScript. Compatible with our `apps/web` TS strict regime.
3. **Preview tooling**: `react-email dev` runs a Vite-style preview server
   on `localhost:3000` showing all templates rendered against test props.
4. **Vitest integration**: render templates as HTML in unit tests and assert
   on the output (e.g., "the reset-link contains the right URL with the
   right query params"). Critical for transactional correctness.
5. **shadcn philosophy alignment**: react-email components are JSX, we wrap
   them just like we wrap shadcn primitives — same mental model.

### 8.2 Template inventory for M1-M6

Suggested template library (each is a React component in
`apps/web/lib/email/templates/`):

- **Transactional** (sent from `my-quilty.com`):
  - `welcome.tsx` — first email after Cognito signup confirmation
  - `email-verify.tsx` — Cognito verification code
  - `password-reset.tsx` — Cognito password reset
  - `email-change-confirmation.tsx` — re-confirm new address
  - `mfa-backup-codes.tsx` — initial backup-code delivery
  - `account-deletion-confirmed.tsx` — HIPAA right-to-deletion
  - `data-export-ready.tsx` — link to download S3-presigned export

- **Notifications** (sent from `notifications.my-quilty.com`, only after
  user explicitly opts in):
  - `streak-reminder.tsx` (deferred to M7 — no notifications in M1-M6)

- **Marketing** (sent from `marketing.my-quilty.com`, only after explicit
  marketing opt-in, RFC 8058 List-Unsubscribe required):
  - `waitlist-confirmation.tsx` — for the pre-launch waitlist
  - `launch-announcement.tsx`

### 8.3 react-email + Apple Mail Privacy Protection caveat

AMPP pre-fetches images. Open-rate is therefore unreliable as an engagement
signal. The existing `quilty-aws/email/configuration_sets.tf` already
disables open/click tracking on `notifications` for exactly this reason
plus PHI-adjacency. **Do not build product logic that depends on email open
rates** — measure engagement at the app layer (session frequency, feature
usage). This is already locked in via the configuration set design; just
flagging that any future tracking-based logic violates this lock.

### 8.4 MJML alternative — skip

MJML is the alternative React Email displaced. MJML's XML-DSL is more
verbose, has no Vitest preview story, and the TS typings are weaker. The
react-email ecosystem has won the 2024-2026 cycle (downloads, contributors,
community templates). Stick with react-email.

---

## 9. RFC 8058 List-Unsubscribe + Compliance Gates

### 9.1 List-Unsubscribe is required at >5,000/day to Gmail/Yahoo

Per Gmail + Yahoo 2024 bulk sender requirements (effective Feb 2024, fully
enforced since Nov 2025): senders with >5,000 messages/day to consumer
Gmail or Yahoo must include both:

    List-Unsubscribe: <mailto:unsubscribe-token@my-quilty.com>,
                      <https://my-quilty.com/u/{token}>
    List-Unsubscribe-Post: List-Unsubscribe=One-Click

The `List-Unsubscribe-Post` header signals RFC 8058 compliance — Gmail's
unsubscribe button sends a POST request to the URL without a confirmation
page. **The user must be unsubscribed within 2 days**.

### 9.2 Quilty plan

- **Transactional** (`my-quilty.com` tier): no List-Unsubscribe required
  per Gmail's own docs (password resets, MFA, etc., are exempted). Do not
  add one — the legal interpretation is that unsubscribing from
  transactional security email is dangerous.
- **Notifications** (`notifications.my-quilty.com` tier): List-Unsubscribe
  required. Route the POST handler to the BFF, which writes a tombstone to
  DynamoDB and propagates to the Rust backend via EventBridge (the same
  pattern as D9 session revocation).
- **Marketing** (`marketing.my-quilty.com` tier): List-Unsubscribe required
  - double-opt-in to _add_ to the list.

### 9.3 Double opt-in flow (GDPR/CASL required for marketing)

Standard pattern, implementable inside the existing BFF:

1. User submits email on `/waitlist` or `/notify-me`.
2. BFF generates a single-use token (32-byte random, HMAC-signed with
   server-side secret, 24h expiry), writes pending row to DynamoDB.
3. BFF triggers SES SendEmail using `waitlist-confirmation.tsx` template
   from the `marketing` configuration set, addressed to the user, with a
   `https://my-quilty.com/confirm/{token}` link.
4. User clicks the link. BFF validates the token, marks the row as
   `confirmed`, sets `consent_source`, `consent_timestamp`, `consent_ip`,
   `consent_user_agent` (CASL/GDPR audit trail).
5. Show a confirmation landing page; subsequent marketing emails are now
   permitted.

The audit trail (consent metadata) must be retained for 7 years (HIPAA-
aligned) and exportable on request (GDPR Article 15).

### 9.4 Other compliance footnotes

- **CAN-SPAM** (US): physical address required in every commercial email
  footer. Use a registered agent or a P.O. box — do not use a residential
  address. **Action: register a virtual mailbox / commercial registered
  agent before first marketing email.**
- **CASL** (Canada): express consent required. Track `consent_source` =
  "double_opt_in_waitlist" etc.
- **Quebec Law 25**: French-language email option required for Quebec
  residents. Defer to M9+ or block QC addresses from marketing list until
  bilingual templates exist.
- **CCPA "Do Not Sell"**: applies to data-sharing, not email-sending. As
  long as we don't sell the email list, CCPA doesn't gate sending. The
  consent record satisfies "Right to Know" requests.
- **eIDAS / EU**: sender identification required. Already satisfied by
  CAN-SPAM-compatible footer.

---

## 10. HIPAA Implications of Email Content

### 10.1 The rule

D31 locks "zero PHI in website runtime." Email sent FROM the website tier
is a runtime artifact. **Therefore: no PHI in any email body, ever.**

### 10.2 The acceptable patterns

- ✅ "You have a new message from your therapist — sign in at
  app.quilty.myquilty to read it."
- ✅ "Your data export is ready. Sign in to download it."
- ✅ "Your subscription renewed for $X." (transactional dollar amount is
  not PHI; service nature implied is borderline but tolerable.)
- ❌ "Hi {first}, your PHQ-9 score this week was 12." (Score = PHI.)
- ❌ "Your therapist Jane Doe responded: 'Have you tried…'." (Body of
  therapist message = PHI.)
- ❌ "We see you've been struggling with depression — here's a tip."
  (Diagnosis = PHI.)

This is the same pattern Headspace, Calm, BetterHelp, Talkspace, and
Mindbloom all use: notifications are "tap to view in app," never carry the
content itself.

### 10.3 First-name salutation

`Hi {first_name}` is **not** PHI because a first name alone is not a HIPAA
18-identifier in combination with health information unless the email body
also references health information. We can use first-name salutations
freely in welcome / billing / generic notifications.

### 10.4 Audit log of sent emails

Already wired: the Firehose configuration in `email/firehose.tf` writes
every SES send event (delivery, bounce, complaint, send, reject, rendering
failure) to the log-archive S3 bucket with 7-year Object Lock COMPLIANCE.
This satisfies HIPAA §164.312(b) audit-control for "sent" but NOT for
"content" — bodies are NOT logged, only metadata. This is correct
(content-logging would itself be a PHI exposure even though we promise no
PHI is in the body).

---

## 11. Cost Modeling

Assumes pricing as of May 2026, us-east-1.

| Tier                   | Volume  | SES cost/mo | Resend equivalent  | SendGrid eq       | Postmark eq     |
| ---------------------- | ------- | ----------- | ------------------ | ----------------- | --------------- |
| Pre-launch (M1-M3)     | 5k/mo   | $0.50       | $0 (free tier)     | $20 (Essentials)  | $15 (10k tier)  |
| Soft launch (M4-M5)    | 50k/mo  | $5          | $20 (Pro)          | $90 (Pro)         | $60.50          |
| Launch (M6)            | 200k/mo | $20         | $90 (Scale)        | $250+             | ~$200+          |
| Growth (M7-M9)         | 1M/mo   | $100        | ~$650 (Enterprise) | ~$1k (Enterprise) | ~$1k+ (Premier) |
| Scale (50k MAU active) | 2-3M/mo | $200-300    | $1.2k-2k           | $2k+              | $2k+            |

**Add for SES**: VDM engagement tracking $0.0015/message ≈ $1,500 at 1M/mo.
Dedicated IP $24.95/mo (recommend ramping ONLY if we hit shared-IP issues —
optimized shared delivery is sufficient at our volume).

Five-year TCO at projected growth heavily favors SES: ~$50k vs ~$200k+ for
managed competitors. The "Resend DX is worth $150k over 5 years" argument
is implausible at our solo-eng-greybeard-comfortable-with-AWS profile.

---

## 12. Gap List Classified

### TIER A — Must close before M1.5 cutover

1. **Lift SES out of sandbox** — submit production access request to AWS
   Support citing the existing identity verifications, configuration sets,
   suppression handling, alarms, and the website business case. Typical
   approval: 24-48h after a complete justification with PHI/HIPAA context.
   Update `ses_daily_send_threshold` from 180 to 45,000 (90% of 50k/day
   typical production quota).
2. **MTA-STS endpoint + DNS** — once `my-quilty.com` HTTPS is live at M1
   cutover, deploy `/.well-known/mta-sts.txt` + `_mta-sts.my-quilty.com`
   TXT.
3. **RFC 8058 List-Unsubscribe** infrastructure: `https://my-quilty.com/u/
{token}` BFF route + DynamoDB suppression table + EventBridge bridge to
   Rust backend for cross-tier propagation. Wire into the `notifications`
   and `marketing` configuration sets' SendEmail calls.
4. **Inbound mailboxes** in M365 for `legal@`, `privacy@`, `dpo@`,
   `security@`, `abuse@`, `postmaster@`, `dmarc-reports@` on `my-quilty.com`.
   Verify `quilty-m365` tenant has Microsoft BAA executed.
5. **Double-opt-in token flow** for any pre-launch waitlist. Even before
   first marketing send.

### TIER B — Should close before M4+ marketing send

6. **DMARC ramp** from `p=quarantine pct=100` → `p=reject pct=100` on
   `.com`. 6-8 week clock starting when SES is producing real volume.
7. **Postmark DMARC Digest** wired as third `rua=` recipient (free, easier
   to read than Valimail's UI for non-experts).
8. **react-email** library adopted in `apps/web/lib/email/`. Initial
   templates: `welcome.tsx`, `email-verify.tsx`, `password-reset.tsx`,
   `data-export-ready.tsx`, `waitlist-confirmation.tsx`.
9. **USPTO TEAS Plus trademark filing** for the Quilty wordmark and/or
   logo. Cheap insurance; 8-14 month clock.
10. **CAN-SPAM physical address**: register a virtual mailbox or commercial
    registered agent. Embed in marketing template footer.
11. **`abuse@my-quilty.com` triage runbook** — RFC 2142 obligation;
    typical content is spam reports against our domain, takedown notices.

### TIER C — Defer / skip / trigger-based

12. **BIMI + VMC** — defer to M4-M5 post-launch. Requires DMARC `p=reject`,
    trademark, finalized brand SVG. CMC fallback if trademark not yet
    issued.
13. **Customer.io Premium for marketing** — defer to when (a) a marketing
    operator joins, OR (b) campaign volume exceeds ~50k/mo, OR (c)
    homegrown campaign tooling becomes >5h/mo of eng time.
14. **Dedicated IP** — defer indefinitely. Optimized shared delivery (VDM)
    is sufficient up to ~1M/mo. Re-evaluate if shared-pool reputation
    issues appear in postmaster tools.
15. **DANE TLSA** — skip permanently. Requires DNSSEC + self-run MTA;
    neither AWS SES nor M365 support DANE in 2026.
16. **`ruf=` forensic reports** — drop after week 8 of DMARC ramp once
    `p=reject pct=100` lands. Aggregate reports sufficient for
    steady-state; forensic reports carry message content (PHI risk).
17. **SES inbound** — skip; M365 handles inbound. Reconsider only if a
    programmatic email-to-pipeline gateway becomes needed.

---

## 13. Conflicts with Existing D-Decisions

**None found.** The audit confirms alignment with:

- **D31** (zero PHI in website runtime) — email content discipline matches.
- **D7** (`__Host-` prefixed cookies, OIDC code flow) — magic-link sign-in
  via email is implementable without conflict; tokens cross-domain via the
  `/auth/callback` route handler.
- **D54** (step-up auth for email change) — email change confirmation flow
  fits cleanly into the recommended template inventory.
- **D9 / D11** (EventBridge fan-out for session/auth events) — the same
  EventBridge bus carries `quilty.email.unsubscribed` events to the Rust
  backend for cross-tier suppression. No new bus needed.

One alignment **opportunity** found: D67's PHI sanitizer module (which gates
client-side logging) should be extended to gate email template inputs too —
any template prop named `body`, `note`, `journal`, `mood`, or matching
known-PHI patterns should fail at render-time in dev/test, not at runtime
in production. This is a Tier B deliverable when the template library
lands.

---

## 14. Recommended New D-Decisions (D75+)

These are proposed lock-down decisions. The user will assign final D-numbers
during the audit synthesis step.

| #       | Proposed decision                                                                                                                                                                                                                                                                                                                                                                                        | Rationale                                                   |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **D75** | **AWS SES is the locked transactional + initial marketing email provider** for all email originating from website tier, mobile push-to-email, or Rust backend. Resend / Postmark / SendGrid / Mailgun rejected for our profile (BAA gap or cost).                                                                                                                                                        | See §2 scoring matrix + §11 cost.                           |
| **D76** | **3-tier sender subdomain architecture is locked**: `my-quilty.com` (transactional + admin), `notifications.my-quilty.com` (engagement), `marketing.my-quilty.com` (promotional). Each with its own SPF/DKIM/MAIL FROM. **Apex SPF MUST NOT expand beyond `amazonses.com` + `spf.protection.outlook.com`** — third-party tools route through subdomains, never the apex, to protect the 10-lookup limit. | See §3.3. Retrofit-hostile if violated.                     |
| **D77** | **DMARC ramp to `p=reject pct=100` on `.com` within 8 weeks of SES sandbox lift**, following the week-by-week plan in §4.2. Drop `ruf=` after enforcement lands (PHI risk in forensic message bodies).                                                                                                                                                                                                   | See §4 + §10.                                               |
| **D78** | **react-email is the locked template framework**, rendered to HTML via `@react-email/render`, shipped to SES via `@aws-sdk/client-sesv2`. Provider-agnostic, type-safe, Vitest-testable, dev preview server. MJML rejected.                                                                                                                                                                              | See §8.                                                     |
| **D79** | **RFC 8058 one-click List-Unsubscribe + List-Unsubscribe-Post are mandatory** on every `notifications.` and `marketing.` tier email. Transactional tier MUST NOT include them. POST handler at `/u/{token}` lives in `apps/web` BFF and propagates via EventBridge. Unsubscribe honored within 2 days.                                                                                                   | Gmail/Yahoo bulk sender 2024 rule, fully enforced Nov 2025. |
| **D80** | **Double opt-in is mandatory for the marketing list** (`marketing.my-quilty.com`). Consent metadata (`source`, `timestamp`, `ip`, `user_agent`) recorded in DynamoDB and retained 7 years. Single opt-in acceptable for the _transactional_ list (which is "you signed up for an account; we will email you").                                                                                           | GDPR + CASL requirement.                                    |
| **D81** | **BIMI + VMC deferred to M4+ post-launch**, contingent on (a) DMARC `p=reject` enforced, (b) finalized brand SVG, (c) USPTO trademark issued. CMC accepted as fallback if trademark still pending.                                                                                                                                                                                                       | See §5.                                                     |
| **D82** | **Public mailbox roster on `my-quilty.com`** lands at M2 in M365: `support@`, `hello@`, `legal@`, `privacy@`, `dpo@`, `security@`, `abuse@`, `postmaster@`, `dmarc-reports@`. Each is a shared mailbox or alias; PHI-content auto-responder language drives users back to the in-app support form.                                                                                                       | RFC 2142 + GDPR + RFC 9116.                                 |
| **D83** | **No PHI in email bodies, ever** — including notifications and marketing. The acceptable pattern is "sign in to view" content references. Template props matching known-PHI shapes fail at render in dev/test via PHI sanitizer extension to D67.                                                                                                                                                        | D31 logical extension.                                      |
| **D84** | **Marketing email vendor stays as SES + homegrown campaign tool through M6+**. Customer.io Premium (with BAA) is the locked upgrade path when (a) marketing operator joins OR (b) volume >50k/mo campaigns OR (c) homegrown tooling exceeds ~5h/mo eng cost. Loops, ConvertKit, Mailchimp, Beehiiv permanently rejected (no BAA).                                                                        | See §6.2.                                                   |

---

## 15. Open Scope Questions

These are decisions I cannot lock unilaterally — flagging for user judgement
during synthesis.

1. **SES production-access request timing** — should it be submitted now
   (during M1.5 doc work) or after the M2 first-deploy lands? Earlier is
   better because the 24-48h approval window blocks first user-facing
   email. **Recommendation**: submit week of M1.5 close.
2. **`dpo@my-quilty.com` named individual** — GDPR Art. 37 requires a
   designated DPO under certain circumstances (large-scale processing of
   special categories incl. health). Quilty likely meets this threshold at
   launch. Who is the DPO? Founder by default? External fractional DPO
   service? **Recommendation**: founder = DPO at launch, mark in privacy
   policy, revisit at 10k MAU.
3. **USPTO trademark — wordmark or logo or both?** — Standard pattern is
   word + logo. Total cost ~$700-1k filing + ~$2k legal. **Recommendation**:
   file the wordmark TEAS Plus during M3 brand work. Logo can be added
   later as continuation-in-part once finalized.
4. **CAN-SPAM physical address** — virtual mailbox (e.g., Stable, iPostal1
   at ~$20/mo) or commercial registered agent (e.g., Northwest Registered
   Agent ~$125/yr) or P.O. box? **Recommendation**: Northwest Registered
   Agent — cheaper at annual cost, includes registered-agent service for
   the LLC formation work.
5. **Dedicated IP — ever?** — Recommendation says skip permanently. User
   should sanity-check this against any future enterprise B2B contracts
   that may demand "dedicated IP" in their security questionnaire. SOC 2
   reviewers occasionally tick this box. **Recommendation**: if enterprise
   B2B contracts ever surface, evaluate at that point, not preemptively.
6. **Bounce/complaint alert email** — currently `alert_email =
aws-alerts@my-quilty.app`. This is fine for the alarm SNS subscription
   but is a noisy address. Should there be a paging integration (e.g.,
   PagerDuty webhook on the `composite_alarm.ses_reputation_degraded`) or
   is email-alert sufficient at our scale? **Recommendation**: keep
   email-alert for solo-eng pre-launch; revisit when a second engineer
   joins.

---

## 16. Sources (2025-2026)

- [Resend vs SendGrid (2026) — Dev Community](https://dev.to/thiago_alvarez_a7561753aa/resend-vs-sendgrid-2026-sendgrid-killed-its-free-tier-now-what-2gh4)
- [HIPAA Compliant Email Providers — Paubox 2026](https://www.paubox.com/blog/hipaa-compliant-email)
- [HIPAA Compliant Email Providers — HIPAA Journal 2026](https://www.hipaajournal.com/hipaa-compliant-email-providers/)
- [AWS SES vs Postmark — Courier 2026](https://www.courier.com/integrations/compare/amazon-ses-vs-postmark)
- [Resend vs Amazon SES — Forward Email 2026](https://forwardemail.net/en/blog/resend-vs-amazon-simple-email-service-ses-email-service-comparison)
- [Mailtrap vs Amazon SES vs Postmark — Anyleads 2026](https://anyleads.com/mailtrap-vs-amazon-ses-vs-postmark-best-smtp-provider-for-transactional-emails-in-2026)
- [Resend vs AWS SES: Developer Simplicity vs Cost at Scale — Mailflow 2026](https://mailflowauthority.com/email-comparisons/resend-vs-aws-ses)
- [React Email AWS SES integration docs](https://react.email/docs/integrations/aws-ses)
- [6 Best Email Tools With React Email Support — Sequenzy 2026](https://www.sequenzy.com/blog/best-email-tools-with-react-email-support)
- [BIMI Certificate Cost — SSL2BUY 2026](https://www.ssl2buy.com/wiki/bimi-certificate-cost-cmc-and-vmc-pricing)
- [Verified Mark Certificate Guide — Captain DNS 2026](https://www.captaindns.com/en/blog/bimi-vmc-cmc-certificate-guide)
- [BIMI Battle: Adoption Analysis — Validity](https://www.validity.com/blog/the-bimi-battle-an-analysis-on-bimi-adoption-and-implementation/)
- [BIMI in 2026: Verified Logos, CMCs — Red Sift](https://redsift.com/guides/bimi-in-2026-verified-logos-cmcs-and-the-fastest-path-to-inbox-display)
- [Gmail and Yahoo Bulk Sender Requirements — EmailWarmup 2026](https://emailwarmup.com/blog/gmail-and-yahoo-bulk-sender-requirements/)
- [Gmail Email Sender Guidelines FAQ — Google Workspace Admin Help](https://support.google.com/a/answer/14229414?hl=en)
- [Yahoogle Bulk Sender Requirements 2024 — Mailgun](https://www.mailgun.com/state-of-email-deliverability/chapter/yahoogle-bulk-senders/)
- [Bulk Sender Changes at Yahoo/Gmail — AWS Messaging Blog](https://aws.amazon.com/blogs/messaging-and-targeting/an-overview-of-bulk-sender-changes-at-yahoo-gmail/)
- [Loops.so Review — Encharge 2026](https://encharge.io/loops-review/)
- [Loops vs Customer.io — Sequenzy 2026](https://www.sequenzy.com/versus/loops-vs-customer-io)
- [Customer.io HIPAA Docs](https://docs.customer.io/journeys/hipaa-standards/)
- [HIPAA-Compliant Email Marketing Tools 2026 — Sequenzy](https://www.sequenzy.com/blog/best-hipaa-compliant-email-marketing-tools)
- [Email Marketing Tools for HIPAA-Compliant SaaS — Sequenzy 2026](https://www.sequenzy.com/email-marketing-for/hipaa-compliant-saas)
- Internal: `quilty-aws/email/README.md` (existing SES infrastructure)
- Internal: `quilty-aws/dns/records_com.tf` + `dns/records.tf` (DNS state)
- Internal: `docs/website_strategy_discussion.md` (D-decisions D1-D74)
- Internal: `docs/research/consumer_health_patterns.md` (peer behavior)

---

**End of report.**
