# SEV Taxonomy — 4-tier severity classification (D130)

> The canonical SEV1-SEV4 classification for the Quilty website
> tier. HIPAA-aligned consumer vaping cessation context (ADR-0023 +
> ADR-0024): SEV1 + CHD/PHI exposure auto-triggers the FTC HBNR
> 60-day notification pipeline at Phase 0 (Quilty is not a HIPAA
> covered entity; HBNR + state CHD laws apply); transitions to HHS
> OCR §164.404 60-day window at Phase 1 once BAAs are in place.

---

## At-a-glance table

| SEV  | Scope                                          | Owner   | Acknowledge | Mitigation begin | Escalation                                           |
| ---- | ---------------------------------------------- | ------- | ----------- | ---------------- | ---------------------------------------------------- |
| SEV1 | Full outage OR PHI exposure OR payment failure | Founder | 30 min      | 60 min           | Founder → external counsel (deferred) → OCR §164.404 |
| SEV2 | Core feature unavailable, no PHI               | Founder | 1 hour      | 4 hours          | Founder → status-page (deferred) → customer comms    |
| SEV3 | Secondary features degraded, workaround exists | Founder | 4 hours     | next-day         | Founder; included in weekly customer changelog       |
| SEV4 | Cosmetic / non-customer-facing                 | Founder | next-day    | next iteration   | Founder; standard backlog                            |

Response times are internal targets at the solo-founder phase; not
contractual SLAs until the first paying customer + published uptime
SLA. The on-call posture lives in `docs/runbook/oncall-trigger.md`.

---

## SEV1 — outage / PHI exposure / payment failure

Any of the following classifies a SEV1 incident:

- **Full-site outage.** `/api/health` returns non-200 for ≥15
  minutes from both regions Sentry Uptime polls (US-East + EU-West),
  OR the site is unreachable end-to-end via curl.
- **CHD / PHI exposure.** Unsecured Consumer Health Data (per
  WA MHMDA + MD MODPA + CA CMIA AB-2089 + FTC HBNR — names + vaping
  cessation engagement context, craving logs, mood/trigger tags,
  identifiable user state tied to health-condition surface) or
  Protected Health Information (Phase 1+ HIPAA Privacy Rule §164.402)
  is rendered to any third party (cookies sent to analytics, query
  strings logged externally, error payloads shipped to a non-BAA-
  covered vendor, etc.). Cerebral $7M + Monument + BetterHelp $7.8M +
  GoodRx $1.5M FTC settlements are the canonical precedents —
  tracking-pixel exfiltration without BAAs / consent counts as an
  exposure even if no malicious intent.
- **Payment-system failure.** Stripe checkout returns 5xx for
  ≥10 minutes OR Apple Pay sheet fails to invoke (post-Stripe-
  activation; deferred today, but the SEV1 classification stays
  canonical so the runbook is ready at activation).

### SEV1 + PHI auto-triggers HHS OCR notification

HHS §164.404 requires breach notification within 60 days of
discovery. SEV1 events involving PHI exposure MUST enter the OCR
notification pipeline immediately, NOT after the standard
acknowledgement-then-mitigation cadence. The 60-day clock starts
at the moment the breach is discovered, not at the moment the
investigation completes.

**Discovery vs. operator-acknowledgement (HHS §164.404(a)(2)):**
"Discovery" under HIPAA is the EARLIEST time the covered entity
(or any workforce member acting as an agent of the entity) knew
or, by exercising reasonable diligence, would have known of the
breach. For a solo-founder team with automated Sentry monitoring:

- The discovery timestamp = the time Sentry (or any automated
  monitoring) first detects the anomaly, NOT the founder's later
  acknowledgement when reviewing the alert.
- Example: Sentry fires a PHI-exposure event at 02:14 UTC; the
  founder sees the Discord notification at 08:30 UTC. The 60-day
  OCR clock starts at 02:14, NOT 08:30.
- Operator-acknowledgement timestamp is logged separately for the
  §164.312(b) audit trail but does NOT reset the §164.404 clock.

Failure to use the automated-detection time as "discovery" risks
under-counting the notification window. The OCR has cited
operator-delay arguments as inadequate in multiple enforcement
actions (e.g., the 2020 Athens Orthopedic settlement).

The pipeline:

1. **Acknowledge** SEV1 + PHI within the standard 30-minute
   window. Log the SEV1 declaration + the PHI-exposure signal +
   the discovery timestamp to the `#quilty-incidents` Discord
   channel (= the audit log per HIPAA §164.312(b)).
2. **Founder (Privacy Officer per §164.530(a) + Security Officer
   per §164.308(a)(2))** is the formally-designated owner of the
   §164.404 pipeline. The founder authors the notification draft.
3. **External counsel-on-retainer review** is the
   future-state peer-review step. Deferred at the solo-founder
   phase per `docs/runbook/m1.5-post-sprint-checklist.md`.
   Trigger: first paying customer OR first DSAR.
4. **OCR notification submission** within 60 days of discovery.
   Form + procedure per [HHS Breach Notification Rule](https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html).
5. **Individual notification** required if ≥500 individuals
   affected (HHS publishes the breach in the OCR Wall of Shame).
   Even sub-500-individual breaches require individual
   notification per §164.404 + media notification per §164.406
   when the affected number crosses 500.
6. **Annual report** to HHS for sub-500 breaches (calendar year).

### SEV1 mitigation actions (immediate)

- **For outages:** check Sentry Uptime dashboard + AWS Lambda
  CloudWatch logs + DNS resolution (`dig my-quilty.com +short`).
  Common causes: Lambda concurrent-execution throttling,
  CloudFront edge cache poisoning, DNS misconfiguration.
- **For PHI exposure:** identify the exposure path immediately
  (which surface? which vendor? what data?). Stop the bleeding
  first (rotate credentials, disable the affected vendor SDK,
  remove the offending tracking code) before authoring the
  OCR notification.
- **For payment failures:** check Stripe dashboard +
  `/api/health` + `/api/ready`. Stripe's status page
  ([status.stripe.com](https://status.stripe.com)) is the
  upstream signal.

---

## SEV2 — core feature unavailable, no PHI

- Login / signup flow returns 5xx for >10 minutes (Cognito
  outage, BFF Lambda crashlooping).
- `/contact` form 5xx for any sustained period — the user-input
  surface is core and the absence of an alternative path
  (no support phone number at this phase) elevates the impact.
- Email-acknowledgement send fails systematically (SES
  bounce-rate spike >5%, post-SES-activation).
- CSP report endpoint silently dropping reports (loses signal
  for the launch-gate enforcement-flip prep).
- **Consent banner mis-rendering or submit-failure** — user
  cannot grant consent, so analytics + marketing events silently
  fail to emit (loss-of-legal-basis signal under GDPR Article 7).
  Even though no PHI is exposed, the inability to capture valid
  consent undermines the legal basis for downstream processing.
  Cerebral $7M settlement is the canonical precedent: tracking-
  pixel data exfiltration without valid consent is treated as
  breach-adjacent regardless of the technical exposure path.

Owner: founder. Acknowledge within 1 hour; mitigation begin
within 4 hours.

---

## SEV3 — secondary features degraded, workaround exists

- Cookie banner mis-rendering on a specific browser version
  (workaround: user can dismiss).
- A single marketing route returns 5xx (other routes still
  navigable; the site is not "down").
- Subprocessors-subscribe form silently fails (post-email-platform
  activation; the form is non-load-bearing at this phase).
- Analytics event-emission silently no-ops (consent gate
  default-deny working as designed but a UI signal regression
  prevented opt-in for some users).

Owner: founder. Acknowledge within 4 hours; mitigation begin
next day.

---

## SEV4 — cosmetic / non-customer-facing

- Logo alignment regression in a specific viewport.
- Internal CloudWatch log format change (no customer impact).
- Analytics dashboard tile broken (operator-only).
- Lint rule + dep-cruiser warning that doesn't block builds.

Owner: founder. Acknowledge next day; mitigation begin in the
next iteration. SEV4 items become part of the standard backlog.

---

## Severity escalation rules

- **De-escalate** if investigation reveals the initial classification
  was too aggressive (e.g., what looked like PHI exposure turns
  out to be a non-PHI data path). Log the de-escalation timestamp
  - the reason; the audit log preserves both classifications.
- **Escalate** if the scope grows during investigation. SEV2 → SEV1
  triggers the full §164.404 pipeline retroactively from the
  original discovery timestamp.
- **SEV1 + PHI cannot be de-escalated** below SEV1 until the
  exposure path is verifiably closed AND no PHI has been
  externalised. The classification stays SEV1 throughout the
  60-day OCR notification window even if the user-facing
  outage is resolved within minutes.

---

## Audit log requirements (HIPAA §164.312(b))

Every SEV1 event MUST log:

- Discovery timestamp.
- Severity declaration timestamp (= acknowledge timestamp).
- Owner identity (founder by default; named secondary if
  post-rotation-activation).
- Mitigation start + complete timestamps.
- Affected user count (if SEV1 + PHI; the §164.404
  individual-notification threshold is ≥500).
- Vendor or system involved.
- Resolution narrative.

The `#quilty-incidents` Discord channel is the operational audit
surface in the solo-founder phase. Discord channel messages
persist indefinitely by default — there is no native auto-expiry
or configurable retention. To satisfy the HIPAA §164.530(j)
6-year evidentiary requirement for SEV1 records, SEV1 channel
threads MUST be exported (DiscordChatExporter or an equivalent
tool) to a BAA-covered, durable store (e.g., an S3 bucket in the
`quilty-aws` account with an explicit Object Lock + lifecycle
policy enforcing the 6-year floor). The export is a manual
post-incident action documented at
`docs/runbook/m1.5-post-sprint-checklist.md`; do NOT rely on
Discord's native retention as the compliance record. The HIPAA
§164.312(b) audit-control requirement is satisfied by the
exported S3 record, not by the live Discord channel.

---

## Decision bindings

- D130 — 4-tier SEV taxonomy.
- D124 — Sentry Uptime monitoring (the signal source for
  outage-detection SEV1).
- D125 — Solo-founder on-call posture (cross-references this doc).
- HIPAA §164.402 — Breach definition.
- HIPAA §164.404 — Breach notification rule (60-day OCR window).
- HIPAA §164.406 — Media notification (≥500 individuals).
- HIPAA §164.312(b) — Audit controls.
- HIPAA §164.530(a) — Privacy Officer designation.
- HIPAA §164.308(a)(2) — Security Officer designation.
- HIPAA §164.530(j) — 6-year retention for HIPAA-aligned compliance records.

---

## Customer-facing status page (deferred)

Stripe, Linear, Discord, Vercel all publish customer-facing status
pages. Quilty defers status-page activation until the first paying
customer + published uptime SLA — the operational overhead of
status-page maintenance exceeds the customer value at the
pre-revenue scale. The deferred activation:

- **Vendor pick** (deferred): Instatus Pro (SOC 2 Type II + HIPAA-
  friendly + cheap at the small-team tier) is the canonical option
  surfaced in Round 6 research. Activation triggers a manual BAA-
  inventory update + a `status.my-quilty.com` subdomain carve.
- **Activation trigger**: first paying customer OR first published
  uptime SLA OR 100 active users. See
  `docs/runbook/m1.5-post-sprint-checklist.md` for the deferred
  item.
- **Pre-activation customer-comms**: SEV1 + SEV2 incidents that
  affect more than a handful of users surface via direct email
  (founder-authored) until the status page activates.

When activated, the SEV1 + SEV2 pipeline branches: every
acknowledged SEV1/SEV2 auto-posts an incident-mode status-page
entry that flips to "resolved" on close.

---

## Cross-references

- `docs/runbook/oncall-trigger.md` — on-call posture (D125).
- `docs/runbook/sentry-monitors.md` — Sentry Uptime setup (D124).
- `docs/runbook/m1.5-post-sprint-checklist.md` — external
  counsel-on-retainer trigger + status-page activation trigger.
- `docs/runbook/baa-inventory.md` — vendor BAA state.
- `docs/runbook/vendor-erasure-matrix.md` — vendor-side erasure
  procedure for PHI exposure containment.
