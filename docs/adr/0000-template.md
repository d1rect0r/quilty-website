# ADR-NNNN: <Short title in imperative mood>

- **Status:** Proposed | Accepted | Deprecated | Superseded by [ADR-XXXX](XXXX-slug.md)
- **Date:** YYYY-MM-DD (when the decision was accepted, not when this doc was written)
- **Last reviewed:** YYYY-MM-DD (yearly cadence for long-lived decisions; bump when re-affirmed)
- **Deciders:** <names of humans who own the consequences> (research agents go in Context, not here)
- **Originating discussion:** <link to internal ticket / PR / strategy-doc section / Linear issue, or "N/A — captured directly in strategy doc">
- **Related decisions:** D<N>, D<M> (links to strategy doc)
- **Related ADRs:** [ADR-XXXX](XXXX-slug.md) (if any)
- **Related research:** `docs/research/<file>.md` § <section> (if any)
- **Software versions assumed:** <e.g., Next.js 16.2, Node 24, SST 4.14, Sentry SDK v8, PostHog SDK v3>
  *(only when a load-bearing version pin frames the decision)*

## Context

What is the issue we're solving? What forces are at play (technical, business,
political, regulatory)? What constraints frame the choice?

Include enough background that a reader unfamiliar with the project can
understand the decision without external links. Quote real evidence (cite URLs,
benchmark numbers, regulatory text) where relevant.

State explicitly what would happen if we did NOT decide — i.e., what is the
"do nothing" outcome? This helps future readers calibrate the decision's
load-bearing-ness.

## Decision

What did we decide? Be specific and unambiguous.

State the decision as a single declarative sentence in active voice ("We will
ship X using Y"), then optionally elaborate.

## Consequences

What becomes easier or harder as a result of this decision?

### Positive

- ...

### Negative

- ...

### Neutral

- ...

## Alternatives considered

What other options did we evaluate, and why did we reject them?

### Alternative A: <name>

- **What it is:**
- **Why rejected:**

### Alternative B: <name>

- **What it is:**
- **Why rejected:**

## Compliance / Verification

How will we know this decision is being honored? Lint rules, CI checks, audit
queries, test assertions, runbooks? Where do enforcement gates live?

## Revisit triggers

What concrete signals would prompt a re-evaluation of this decision? Tie to
specific metrics (page count, engineer count, ARR threshold, regulatory change,
vendor pricing change) — not vague "if it stops working".
