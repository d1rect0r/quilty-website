#!/usr/bin/env bash
# PreToolUse hook scoped to the `test-author` sub-agent (wired in its
# frontmatter). Blocks Write/Edit/MultiEdit on anything that isn't a test
# file. Without this, test-author's Write/Edit grant could mutate production
# code; the system-prompt convention is advisory but not enforceable.
set -euo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')
[[ -z "$file" ]] && exit 0

# Allowed: anywhere under a tests/ directory, or files named *.test.* / *.spec.*
case "$file" in
  */tests/*|*/__tests__/*|*.test.ts|*.test.tsx|*.test.js|*.spec.ts|*.spec.tsx|*.spec.js)
    exit 0 ;;
  *)
    echo "BLOCKED by guard-test-author.sh: test-author may only edit test files (*.test.*, *.spec.*, or paths under tests/ or __tests__/). Got: $file" >&2
    exit 2 ;;
esac
