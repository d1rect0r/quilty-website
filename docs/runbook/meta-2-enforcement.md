# META-2 enforcement — source-comment hygiene gate

> Runbook for the META-2 source-comment discipline + the CI grep
> gate that enforces it. The gate lives at
> `scripts/check-no-workflow-context.mjs`; the policy lives at
> `scripts/meta-policy.json`. This document is the authoritative
> reference for the rule set + the escape-hatch procedure.

---

## Why this exists

Source-file comments outlive the sprint that produced them. A
"Wave 4 close-pass found" reference in 2026 source is meaningless
to a 2027 reader; the same idea written as "consent-server perf
chokepoint per D63" stays legible. The canon at META-2 (per the
project's locked decisions log) is that **only permanent
documentation references survive code review**:

- D-numbers (D1-D195+) from `docs/website_strategy_discussion.md`
- ADR-NNNN from `docs/adr/`
- RFC (e.g., RFC 7725), WCAG SC (e.g., WCAG 2.5.5), CVE (e.g.,
  CVE-2025-29927), HIPAA § (e.g., HIPAA §164.404), GDPR Article
  (e.g., GDPR Article 7), FTC § (e.g., FTC §5)

Why this matters: enterprise canon. Stripe rejects PRs with
internal-ticket refs in source. Plain enforces "comments outlive
the code" discipline. Linear bans `LINEAR-NNN` from source. The
Quilty website carries the same conventions because the same
maintenance forces apply (engineer turnover, code archaeology,
audit-trail durability).

---

## What the gate catches

Patterns listed in `scripts/meta-policy.json`. As of the current
policy version (1), 11 patterns:

| Rule            | Catches                        | Replace with                                    |
| --------------- | ------------------------------ | ----------------------------------------------- |
| `m-number`      | M1, M1.5, M3, M6, ...          | Permanent doc ref or milestone-neutral phrasing |
| `round-n`       | "Round 6", "Round-5"           | D-number or ADR-NNNN                            |
| `wave-n`        | "Wave 4", "Wave-1-close"       | D-number or ADR-NNNN                            |
| `cluster-n`     | "Cluster-3", "Cluster 2"       | D-number or ADR-NNNN                            |
| `sprint`        | "this sprint", "next sprint"   | Milestone-neutral phrasing                      |
| `audit-found`   | "the audit found"              | Permanent doc ref                               |
| `commit-n`      | "Commit 31"                    | D-number or ADR-NNNN                            |
| `agent-name`    | "@quilty/typescript-reviewer"  | "the reviewer" / "a reviewer pass"              |
| `jira-ticket`   | "JIRA-1234"                    | D-number or ADR-NNNN                            |
| `linear-ticket` | "QLY-456" (Quilty project key) | D-number or ADR-NNNN                            |
| `gh-issue`      | "GH-789"                       | D-number or ADR-NNNN                            |

The `linear-ticket` pattern is scoped to the `QLY-` prefix
deliberately — a generic `[A-Z]{3,6}-[0-9]+` would false-positive
on `ADR-0010` and other legitimate permanent doc refs. If/when a
new Linear project key is in use, append it as a separate
`linear-ticket-<key>` rule in `meta-policy.json`.

---

## Scopes — what gets scanned

`scripts/meta-policy.json` `scopes.directories` enumerates the
directory roots:

- `packages/*/src/` — every package's source tree (NOT the package
  root; `vitest.config.ts`, README.md, etc. at package root are
  excluded by the glob).
- `apps/web/app/`
- `apps/web/components/`
- `apps/web/lib/`

`scopes.files` adds individual source files outside those roots:

- `apps/web/proxy.ts`
- `apps/web/instrumentation.ts`
- `apps/web/sentry.{client,server,edge}.config.ts`
- `apps/web/composition.{server,client,edge}.ts`

Extensions scanned: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`.

Excluded (regardless of scope):

- `*.test.{ts,tsx,js,jsx,mjs,cjs}` and `*.spec.{...}` — tests
  legitimately embed workflow fixtures.
- `__tests__/` + `tests/` subtrees — same rationale.
- `node_modules`, `.next`, `.velite`, `.turbo`, `.sst`,
  `.open-next`, `dist`, `build`, `coverage`, `playwright-report`,
  `test-results` — generated artifacts.
- `docs/research/` — Round-X audit archives contain verbatim
  workflow references that are the source of truth.

---

## Escape hatch — when a legitimate match fires

Some matches will be legitimate (e.g., a vendor SKU like `M3`
that happens to match the M-number pattern, or a content string
like "wave 1" in a music-theory marketing copy block). The gate
supports inline override via the same-line annotation:

```ts
// Stripe Apple Pay supports M3 chip silicon. // META-2-allow: vendor SKU
const APPLE_PAY_M3_FLAG = true;
```

Format: `// META-2-allow: <rationale>` on the SAME line as the
match. The rationale text is required (the gate suppresses on
marker presence regardless of text, but git-blame audits depend
on the rationale being descriptive — code review enforces this).

Use sparingly. The escape hatch is for genuine false-positives,
not for working around the gate.

---

## Adding a new META-N convention

1. Append a new entry to `scripts/meta-policy.json` `patterns[]`.
   Each entry: `rule` (kebab-case), `regex` (string), `flags`
   (typically `i`), `message` (one-line fix guidance).
2. Run `node scripts/check-no-workflow-context.mjs` locally to
   confirm the new rule fires on the intended targets without
   false-positives.
3. Add the new rule to the table above (with target match +
   replacement guidance).
4. If the new rule represents a load-bearing project convention,
   file an ADR (typically `ADR-00XX-<rule>-discipline.md`)
   documenting the rationale.

The script + JSON file are versioned together via
`policy_version`. Bump the version when the rule set changes in a
way that requires consumer awareness (e.g., adding a rule that
will flag existing files).

---

## CI integration

The gate runs as part of `pnpm verify`:

```
pnpm verify
  └─ pnpm syncpack:lint
  └─ pnpm knip
  └─ pnpm depcruise
  └─ pnpm security-txt:check
  └─ pnpm compliance-language:check
  └─ pnpm workflow-context:check  ← this gate
  └─ pnpm typecheck
  └─ pnpm lint
  └─ pnpm test
  └─ pnpm type-coverage
  └─ pnpm format:check
  └─ pnpm secretlint
```

The gate is positioned BEFORE `typecheck` / `lint` / `test` so it
fails fast on the cheapest check (regex scan, microseconds per
file). Lint-staged integration is a future enhancement for
real-time editor feedback — deferred until a 3+-engineer team
scale justifies the complexity.

Standalone invocation:

```bash
pnpm workflow-context:check
# or directly:
node scripts/check-no-workflow-context.mjs
```

Exit codes: `0` on clean scan, `1` on any violation. Each
violation prints `file:line [rule] message` + the offending line
excerpt.

---

## Why a Node script vs. ESLint

Comment-text matching is a regex-shaped concern, not an
AST-shaped one. ESLint can match string literals and template
elements (it does for D104 + D136 + D148), but matching arbitrary
comment-body text requires `eslint-plugin-no-restricted-text` or
a custom AST visitor — a plugin surface that adds dependency
weight without proportionate benefit for a 1-person team.

The trade-off:

- **Node script (current):** Fast, simple to debug, easy to
  iterate. No editor integration (developer feedback at
  `pnpm verify` time).
- **ESLint (future):** Real-time editor warnings (VS Code +
  JetBrains). Higher complexity + plugin dependency. Stripe + Cal.com
  - Vercel use this pattern at their team scale.

Revisit at 3+-engineer scale or when editor feedback becomes a
blocker for productivity.

---

## Decision bindings

- META-2 (project convention) — source files reference permanent
  docs only.
- META-1 (vendor-agnostic naming) — adjacent convention; the
  agent-name pattern enforces the META-1 spirit by banning
  workflow-context agent references.
- `feedback_code_naming_and_comment_discipline.md` — the
  feedback memory that locks the convention.

---

## Cross-references

- `scripts/check-no-workflow-context.mjs` — gate implementation.
- `scripts/meta-policy.json` — pattern + scope config.
- `scripts/check-compliance-language.mjs` — sibling gate (D104 +
  D136 markdown/MDX hygiene).
- `scripts/check-security-txt-expires.mjs` — sibling gate
  (security.txt Expires-field SLA).
- `eslint.config.mjs` — adjacent enforcement (D104, D136, D148
  AST patterns).
