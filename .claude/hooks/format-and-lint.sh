#!/usr/bin/env bash
# PostToolUse hook for Write|Edit|MultiEdit — runs prettier --write + eslint --fix
# on the edited file only. Cannot block (PostToolUse limitation); surfaces
# failures via stderr so Claude sees them and self-corrects.
# Scoped to changed file for sub-2s feedback loop.
set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')

# Bail on empty or non-existent paths
[[ -z "$file" || ! -f "$file" ]] && exit 0

# Bail if pnpm isn't set up yet (pre-M1 state)
cd "${CLAUDE_PROJECT_DIR}"
[[ ! -f "package.json" ]] && exit 0

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.css|*.json|*.md|*.mdx)
    # Prettier on supported extensions
    pnpm exec prettier --write --log-level=warn "$file" 2>&1 || true

    # ESLint --fix on JS/TS only
    case "$file" in
      *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
        pnpm exec eslint --fix --quiet "$file" 2>&1 \
          || echo "eslint reported remaining issues in $file (PostToolUse cannot block; Claude please review)" >&2
        ;;
    esac
    ;;
esac

exit 0
