---
description: Run the full local pre-commit pipeline (typecheck + lint + format-check + unit tests + a11y). Use before authorising a push at milestone boundaries.
allowed-tools: Bash(pnpm *)
---

## Pre-commit pipeline

!`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:a11y`

## Instructions

Above is the full pipeline output. If everything passed (exit 0), confirm: `Pre-commit pipeline GREEN. Safe to authorise push.`

If anything failed:
1. Identify which step failed
2. Read the error output
3. Propose a fix (do not apply automatically)
4. Ask the user to authorise the fix before applying

This skill never bypasses the pipeline. If a step is flaky, fix the flake, don't disable the step.
