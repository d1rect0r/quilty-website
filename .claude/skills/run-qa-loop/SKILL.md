---
description: Run the 3-agent QA loop in parallel after a milestone closes. Invokes typescript-reviewer, accessibility-reviewer, hipaa-csp-reviewer, sst-iac-reviewer (if infra changed), perf-bundle-reviewer (if deps changed), and seo-meta-reviewer (if pages changed). Synthesises findings into a single report.
argument-hint: [milestone-name]
allowed-tools: Read, Grep, Glob, Bash(git *)
---

## Changed scope
- Files changed since main: !`git diff --name-only origin/main...HEAD`
- Dependencies changed: !`git diff origin/main...HEAD -- package.json pnpm-lock.yaml | head -50`

## Instructions

Run the QA loop for milestone: $ARGUMENTS

**Step 1** — Determine which reviewers apply based on the changed scope above:
- Any `.ts`/`.tsx` change → typescript-reviewer (always)
- Any `.tsx` under `app/` or `components/` → accessibility-reviewer
- Any change → hipaa-csp-reviewer (always — it's a launch-blocker per Cerebral/Monument lesson)
- Any change under `sst.config.ts`, `infra/`, `stacks/` → sst-iac-reviewer
- Any `package.json` change OR `app/layout.tsx` change → perf-bundle-reviewer
- Any change under `app/(marketing)/`, `app/page.tsx`, or to a `generateMetadata` → seo-meta-reviewer

**Step 2** — Spawn the selected sub-agents IN PARALLEL (single message, multiple Agent tool calls) so they run concurrently. Each gets read-only tools (Read, Grep, Glob, Bash) — they cannot write.

**Step 3** — When all return, synthesise:
- Group findings by Critical / Warnings / Suggestions across all reviewers
- Deduplicate where two reviewers flagged the same issue
- Produce a single ordered action list

**Step 4** — Do NOT fix anything yet. End with the question:
"Authorize me to fix the Critical findings, or do you want to push as-is / triage further?"

This skill never bypasses the read-only nature of reviewers. If a reviewer suggests an "obvious fix," still surface it for user authorization before applying.
