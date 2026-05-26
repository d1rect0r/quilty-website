# Incident runbooks

Documents that govern incident classification, escalation, and
response for the Quilty website tier.

| Document                               | Purpose                                                       | Decision |
| -------------------------------------- | ------------------------------------------------------------- | -------- |
| [`sev-taxonomy.md`](./sev-taxonomy.md) | 4-tier SEV1-SEV4 classification + HIPAA §164.404 OCR pipeline | D130     |

Adjacent runbooks (live one level up at `docs/runbook/`):

- `oncall-trigger.md` — solo-founder on-call posture + rotation activation trigger (D125).
- `sentry-monitors.md` — Sentry Uptime + Sentry Cron activation steps (D124).
- `baa-inventory.md` — vendor BAA state.
- `vendor-erasure-matrix.md` — per-vendor erasure procedure when PHI exposure mandates containment.

## Conventions

- **One SEV per incident.** If scope grows during investigation,
  re-classify (e.g., SEV2 → SEV1); do not split a single
  underlying incident into multiple SEVs.
- **SEV1 + PHI is special.** The §164.404 60-day OCR notification
  clock starts at the moment of discovery, not at the moment of
  classification. Even if mitigation is fast, the SEV1
  classification stays for the full notification window.
- **Audit logs to `#quilty-incidents`.** The Discord channel is
  the operational audit surface; Discord messages persist
  indefinitely by default but Discord is NOT the compliance
  record. SEV1 records MUST be exported to the BAA-covered S3
  bucket (Object Lock + 6-year lifecycle) per §164.530(j); the
  §164.312(b) requirement is satisfied by the exported S3
  record. See `sev-taxonomy.md` § "Audit log requirements" for
  the export procedure.
- **Owner = Founder** in the solo-founder phase per
  `oncall-trigger.md`. Post-rotation activation (head-count trigger
  = 2nd engineer hired), owner rotates with the on-call schedule.

## How to declare an incident

1. Confirm the symptom is real (Sentry Uptime dashboard, curl
   to `/api/health`, customer report).
2. Classify against `sev-taxonomy.md`. When ambiguous, choose
   the higher severity — easier to de-escalate than to retroactively
   escalate.
3. Post to `#quilty-incidents` Discord channel with the SEV
   declaration + the discovery timestamp + the affected scope.
4. Begin mitigation per the SEV-specific playbook in
   `sev-taxonomy.md`.
5. Close the incident in the same channel with the resolution
   narrative + the timeline. SEV1 closures also trigger the
   §164.404 notification preparation if PHI was involved.

## Post-mortem template (SEV1 + SEV2 required; SEV3 + SEV4 optional)

Stripe / Discord / Linear publish post-mortem templates as a
narrative discipline. For SEV1 + SEV2, author the post-mortem
within 5 business days of resolution. The post-mortem lives
alongside the SEV1 audit-log export in the BAA-covered S3 bucket
(per §164.530(j) 6-year retention).

```
# SEV<N> — <one-line summary>

- Discovery timestamp (UTC):
- Severity declared at (UTC):
- Mitigation start (UTC):
- Mitigation complete (UTC):
- Resolution narrative (1-2 paragraphs):
- Affected users (count + scope, IF SEV1+PHI):
- HIPAA §164.404 status (IF SEV1+PHI): {discovery -> OCR clock t+0}
- External counsel review (IF retainer signed):
- Root cause (5-whys minimum):
- Timeline:
  - HH:MM UTC — <event>
  - HH:MM UTC — <event>
- Follow-up actions (with owner + due date):
  - [ ] action 1 — owner — due
  - [ ] action 2 — owner — due
- Audit-log artifact (S3 path to the exported Discord thread):
```

The follow-up actions roll into the standard backlog. SEV1
follow-ups have higher priority than next-iteration items.
