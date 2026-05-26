# On-Call Posture — solo-founder phase (D125)

> Runbook for the website's on-call posture today (solo-founder
> team) + the rotation activation trigger. SEV-1-with-PHI escalates
> to OCR notification under HIPAA §164.404 — that pipeline is
> documented in `docs/runbook/incidents/sev-taxonomy.md`.

---

## Current state — solo founder, async on-call

The founder is the sole on-call engineer + the formally-designated
Privacy Officer (HIPAA §164.530(a)) + Security Officer
(§164.308(a)(2)). No PagerDuty rotation. No second escalation
tier. The posture is intentional: at the pre-launch, pre-revenue,
no-live-PHI-traffic scale the operational overhead of a formal
rotation is higher than its benefit.

### Alert routing

```
Sentry (Uptime + error events) -> Discord webhook
                                    |
                                    v
                              #quilty-incidents
                                    |
                                    v
                           Founder phone notification
                       (Discord mobile app push enabled)
```

- Sentry Uptime monitor on `/api/health` (configured per
  `docs/runbook/sentry-monitors.md`) fires on 2 consecutive failures
  from US-East + EU-West regions.
- Sentry error reports route to the same `#quilty-incidents`
  Discord channel via the existing Sentry-to-Discord integration.
- Founder's Discord mobile app push notifications are enabled
  for the channel; the founder phone is the de facto pager.

### Response SLA targets (current phase — not contractual)

- **SEV1**: acknowledge within 30 minutes; begin mitigation within
  60 minutes. Customer-conversation-driven, not contractual — until
  the first paying customer + a published uptime SLA, these are
  internal targets.
- **SEV2-4**: best-effort during business hours.

Reference baseline + why we set 30 min rather than 60 min:
Linear's published pre-revenue runbook documents a 1-hour
acknowledge target + 4-hour mitigation. We set acknowledge
tighter than Linear's published baseline because the HIPAA-aligned
posture for a consumer mental-health surface raises the cost of
delayed PHI-exposure response (§164.404 60-day clock starts at
discovery, not at acknowledgement — see SEV taxonomy). The
30-minute target is aggressive for a solo founder; if it becomes
unsustainable in practice (e.g., when SEV1 alerts fire while the
founder is asleep, in meetings, or travelling), relax to Linear's
1-hour acknowledge + 4-hour mitigation baseline and document the
revision here. The mitigation 60-minute target is intentionally
shorter than Linear's 4-hour baseline for the same reason.

### Why no formal rotation today

- One engineer cannot be on-call 24/7 sustainably; pretending to
  have a rotation is worse than honestly documenting the gap.
- The 2026 enterprise canon (Linear, Stripe early days, Cal.com)
  defers PagerDuty rotation until there's a meaningful customer
  base. Linear's blog explicitly notes that "you can't build a
  rotation without people to rotate."
- The website is pre-launch + carries no live PHI today; SEV1 +
  PHI exposure is a future-state contingency the SEV taxonomy
  documents but does not trigger at this phase.

---

## Activation trigger — when the formal rotation starts

The formal rotation activates when the **second engineer is hired**.

This is the head-count trigger (the locked on-call rotation
posture per D125). Alternatives considered + rejected:

- **Trigger on first paying user.** Enterprise canon (Stripe early
  days) — rejected because a single paying user is too low a bar;
  the rotation overhead exceeds the SLA value.
- **Trigger on 100 paying users OR 99th-percentile uptime SLA
  expectation.** Linear/Stripe pattern — rejected at this phase
  because head-count is the simpler operational signal; revisit
  at the second-engineer trigger.

When the head-count trigger fires, immediately:

1. Schedule a hand-off session between the two engineers covering
   this runbook + the SEV taxonomy + the BAA inventory.
2. Set up PagerDuty (free tier supports 2-user rotations) OR
   Better Stack OnCall (cheaper at the 2-user tier, integrates
   with Sentry alerts directly without an intermediate webhook).
3. Configure the rotation per the post-trigger pattern below.

---

## Post-trigger rotation pattern (future state)

When the rotation activates, the canonical 2-engineer pattern is:

- **5-on / 5-off weekly rotation** (Mon-Fri primary, Sat-Sun
  secondary, swap weekly). Avoids burnout better than the
  1-week-on / 1-week-off pattern at small team scale.
- **Primary acknowledges first; secondary escalation after
  15 minutes** of no acknowledgement.
- Both on-call engineers carry the Privacy + Security Officer
  designation jointly during their shift; the founder remains the
  formally-designated Officer per HIPAA §164.530(a) +
  §164.308(a)(2) but operational responsibility rotates.
- Post-rotation activation, the founder may delegate Privacy/
  Security Officer duties to a named secondary if the secondary's
  retention is durable (the HIPAA designation document at
  `quilty-aws/docs/compliance/hipaa-officer-designation.md`
  retains 6 years; designation updates are themselves audit
  events).

References:

- PagerDuty's "Call Rotations & Schedules" guide
  (pagerduty.com/resources/learn/call-rotations-schedules/).
- DoltHub's "How to Create Automated Paging On-Call at Your
  Startup" (dolthub.com/blog/2023-08-30-...).
- Stripe's "You Build It, You Run It" engineering writeups.

---

## SEV1 + PHI exposure pipeline (cross-reference)

SEV1 events involving PHI exposure trigger an automatic HHS OCR
notification under HIPAA §164.404 (60-day window from discovery).
The pipeline:

```
SEV1 alert with PHI signal
        |
        v
Founder (= Privacy Officer + Security Officer)
        |
        v
60-day OCR notification preparation
        |
        v
(deferred: external counsel-on-retainer review)
        |
        v
OCR submission
```

Today the founder is the sole pipeline owner. The external
counsel-on-retainer step is a future-state placeholder — the
deferral is documented in `docs/runbook/m1.5-post-sprint-checklist.md`
as a manual-action item gated on first-paying-customer or first
DSAR receipt.

See `docs/runbook/incidents/sev-taxonomy.md` for the full SEV1-4
classification + escalation rules per severity.

---

## Decision bindings

- D125 — Solo-founder on-call posture (head-count trigger for
  rotation activation).
- D130 — SEV1-4 taxonomy (cross-referenced; lives in
  `docs/runbook/incidents/sev-taxonomy.md`).
- HIPAA §164.530(a) — Privacy Officer designation.
- HIPAA §164.308(a)(2) — Security Officer designation.
- HIPAA §164.404 — Breach notification rule (60-day OCR window).
- ADR-0004 — Observability stack (Sentry Business tier).

---

## Cross-references

- `docs/runbook/sentry-monitors.md` — Sentry Uptime monitor setup.
- `docs/runbook/incidents/sev-taxonomy.md` — SEV1-4 classification.
- `docs/runbook/m1.5-post-sprint-checklist.md` — manual-action items
  (HIPAA officer designation filing, external counsel retainer).
- `docs/runbook/baa-inventory.md` — vendor BAA state per
  `docs/research/round_6_foundation_audit/decisions-log.md` D169.
