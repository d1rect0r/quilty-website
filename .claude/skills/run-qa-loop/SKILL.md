---
name: run-qa-loop
description: Run the multi-agent QA loop in parallel after a milestone closes. Invokes typescript-reviewer, accessibility-reviewer, hipaa-csp-reviewer, sst-iac-reviewer (if infra changed), perf-bundle-reviewer (if deps changed), and seo-meta-reviewer (if pages changed). Synthesises findings into a single report.
argument-hint: [milestone-name]
allowed-tools: Read, Grep, Glob, Bash(git diff *), Bash(git log *), Bash(git status *), Bash(git rev-parse *), Bash(git merge-base *), Bash(git ls-files *)
---

## Changed scope (compute with fallback chain)

The diff base depends on the branch state:

1. On a feature branch: `git merge-base origin/main HEAD..HEAD`
2. On main with unpushed commits: `git diff origin/main..HEAD`
3. On main fully synced with origin: `git diff HEAD~1..HEAD` (last commit)
4. Single-commit repo: list all tracked files (`git ls-files`)

Compute the right base before listing changed files.

## Instructions

Run the QA loop for milestone: $ARGUMENTS

**Step 1** — Compute the diff base using the fallback chain above. Print the chosen base and the list of changed files so the user can see what's being reviewed.

**Step 2** — Determine which reviewers apply based on the changed scope:
- Any `.ts`/`.tsx` change → typescript-reviewer (always)
- Any `.tsx` under `apps/web/app/` or `apps/web/components/` → accessibility-reviewer
- Any change → hipaa-csp-reviewer (always — it's a launch-blocker per Cerebral/Monument lesson)
- Any change under `sst.config.ts`, `infra/`, `stacks/` → sst-iac-reviewer
- Any `package.json` change OR `apps/web/app/layout.tsx` change → perf-bundle-reviewer
- Any change under `apps/web/app/(marketing)/`, `apps/web/app/page.tsx`, or to a `generateMetadata` → seo-meta-reviewer

**Step 3** — Spawn the selected sub-agents IN PARALLEL (single message, multiple Agent tool calls) so they run concurrently. Each gets read-only tools (Read, Grep, Glob, Bash) — they cannot write (enforced via `disallowedTools` in their frontmatter).

Pass each reviewer the diff base you computed so they review the same scope.

**Step 4** — When all return, synthesise:
- Group findings by Critical / Warnings / Suggestions across all reviewers
- Deduplicate where two reviewers flagged the same issue
- Produce a single ordered action list

**Step 5** — Do NOT fix anything yet. End with the question:

> Authorize me to fix the Critical findings, or do you want to push as-is / triage further?

This skill never bypasses the read-only nature of reviewers. If a reviewer suggests an "obvious fix," still surface it for user authorization before applying.

**Optional post-step** — once the user has acted on Critical findings, you may invoke `refactor-scout` separately (it benefits from seeing the other findings as input).
