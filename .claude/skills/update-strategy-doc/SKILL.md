---
name: update-strategy-doc
description: Append a dated update-log entry to docs/website_strategy_discussion.md and surface any locked decisions for D-numbering. Use when a session locks a new strategic decision.
argument-hint: [one-line-summary]
---

## Current state
- Strategy doc tail: !`tail -40 docs/website_strategy_discussion.md 2>/dev/null || echo "(no strategy doc found)"`
- Highest existing D-number: !`grep -oE 'D[0-9]+' docs/website_strategy_discussion.md 2>/dev/null | sort -V | tail -1 || echo "D0"`

## Instructions

Append a new entry to the strategy doc's Update Log section with today's date and the summary `$ARGUMENTS`.

Then ask the user:

1. **"Is there a locked decision to record? (y/n)"** — if yes, propose the next D-number (D<n+1>) and a 2-4 line decision block with:
   - **Decision:** what we chose
   - **Rationale:** why
   - **Date:** today

2. **"Any prior D-numbers superseded or amended by this session?"** — if yes, mark them in the doc with a "(superseded by D<new>)" annotation.

Do not invent decisions. Only record what the user explicitly confirms.

After updating the strategy doc, also update the workflow roadmap update log (`docs/website_workflow_roadmap.md`) if the decision affects milestone planning.
