#!/usr/bin/env bash
# PostToolUse hook for Write|Edit|MultiEdit — runs prettier --write + eslint --fix
# on the edited file only. Cannot block (PostToolUse limitation); surfaces
# failures to Claude via stderr so it self-corrects.
# Scoped to changed file for sub-2s feedback loop.
#
# Note: deliberately no `-e` because PostToolUse hooks must never exit non-zero.
# Failure paths are routed to stderr (which IS visible to Claude per Anthropic
# hooks doc § exit-code output handling).
set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')

# Bail on empty or non-existent paths
[[ -z "$file" || ! -f "$file" ]] && exit 0

# Bail if pnpm isn't set up yet (pre-M1 state)
cd "${CLAUDE_PROJECT_DIR}" 2>/dev/null || exit 0
[[ ! -f "package.json" ]] && exit 0

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.css|*.json|*.md|*.mdx)
    # Prettier — capture combined output, only print on failure (to stderr so Claude sees it)
    prettier_out=$(pnpm exec prettier --write --log-level=warn "$file" 2>&1)
    prettier_rc=$?
    if [[ $prettier_rc -ne 0 ]]; then
      printf 'prettier failed on %s (PostToolUse cannot block; Claude please review):\n%s\n' \
        "$file" "$prettier_out" >&2
    fi

    # ESLint --fix on JS/TS only
    case "$file" in
      *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
        eslint_out=$(pnpm exec eslint --fix --quiet "$file" 2>&1)
        eslint_rc=$?
        if [[ $eslint_rc -ne 0 ]]; then
          printf 'eslint reported remaining issues in %s (PostToolUse cannot block; Claude please review):\n%s\n' \
            "$file" "$eslint_out" >&2
        fi
        ;;
    esac
    ;;
esac

exit 0
