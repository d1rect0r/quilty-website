---
name: generate-adr
description: Create a new ADR (Architecture Decision Record) in docs/adr/ with the next sequential number and a populated template covering context, decision, consequences, and links. Use when finalising a design choice.
argument-hint: [adr-title-in-kebab-case]
---

## Existing ADRs
- Highest existing ADR: !`ls docs/adr/ 2>/dev/null | grep -E '^[0-9]{4}-' | sort -r | head -1`

## Instructions

Compute the next ADR number from the highest existing above (e.g. `0007-foo.md` → next is `0008`). If no ADRs exist, start at `0001`.

Create `docs/adr/<NNNN>-$1.md` with this template (replace placeholders, do NOT leave them as TODOs — ask the user if you don't know):

```markdown
# <NNNN>. <Title from $1, title-cased>

Date: <today YYYY-MM-DD>
Status: Proposed
Deciders: <ask user>

## Context

<2-4 paragraphs: what problem, what constraints, what alternatives were considered>

## Decision

<1-2 paragraphs: what we chose and the one-sentence rationale>

## Consequences

**Positive:**
-

**Negative / Trade-offs:**
-

**Neutral:**
-

## Links

- Related ADRs:
- Related code:
- External references:
- Related D-decisions (from website_strategy_discussion.md):
```

After creating the file, print the path and remind the user to:
1. Update `docs/adr/README.md` if it has a table of contents
2. Update `docs/website_strategy_discussion.md` Update Log if this ADR ratifies a new D-decision
