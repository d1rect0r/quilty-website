# Incident post-mortems

Per-incident post-mortems land here at filename pattern
`YYYYMMDD-{issue-slug}.md` (e.g., `20260601-csp-violation-spike.md`).

## When to author

- **SEV1**: within 5 business days of incident closure (HIPAA
  §164.312(c)(1) Security Incident Procedures expectation).
- **SEV2**: within 10 business days.
- **SEV3 / SEV4**: optional — author at the responder's discretion
  when there's a teachable failure-mode.

## Template

Use the post-mortem template at the bottom of
`docs/runbook/incidents/README.md`. Mandatory sections: summary,
timeline, contributing factors, action items, audit-log export
path (S3 location for the encrypted Discord channel export per
HIPAA §164.530(j) 6-year retention).

## Audit-log linkage

Every SEV1 post-mortem cross-references the encrypted Discord-
channel export uploaded to the `quilty-aws/log-archive/` S3
bucket under Object Lock. The in-repo post-mortem is the
human-readable narrative; the S3 export is the per-§164.530(j)
compliance record. See item 12 of
`docs/runbook/m1.5-post-sprint-checklist.md` for the export
procedure.

## Directory hygiene

Post-mortems are append-only. Once authored, edits are limited
to action-item status transitions (open → in-progress → closed).
Substantive narrative edits require a follow-up post-mortem
referencing the original.
