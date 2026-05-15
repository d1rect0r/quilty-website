---
name: run-precommit
description: Run the full local pre-commit pipeline (typecheck + lint + format-check + unit tests + a11y tests). Use before authorising a push at milestone boundaries.
allowed-tools: Bash(pnpm *)
---

## Instructions

Run the full pre-commit pipeline by invoking Bash sequentially. Surface the first failure and stop — do not retry, do not skip steps.

Steps (in order — stop on first failure):

1. **Typecheck** — `pnpm typecheck` (or `pnpm -r typecheck` for monorepo-wide)
2. **Lint** — `pnpm lint`
3. **Format check** — `pnpm format:check`
4. **Unit tests** — `pnpm test`
5. **Accessibility tests** — `pnpm test:a11y`

Note: if `package.json` hasn't been scaffolded yet (pre-M1), these commands will fail — that is expected and means the user has run this skill too early. Tell them so explicitly.

If everything passed (all five steps exit 0), confirm:

> Pre-commit pipeline GREEN across typecheck / lint / format / unit / a11y. Safe to authorise push.

If anything failed:
1. Identify which step failed
2. Show the relevant error output (last ~20 lines)
3. Propose a fix — do NOT apply automatically
4. Ask the user to authorise the fix before applying

This skill never bypasses the pipeline. If a step is flaky, fix the flake; don't disable the step.
