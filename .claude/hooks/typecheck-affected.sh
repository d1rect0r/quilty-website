#!/usr/bin/env bash
# PostToolUse hook for Write|Edit|MultiEdit — runs scoped tsc on the
# workspace containing the edited file. Only runs on TS/TSX changes.
# Surfaces type errors to Claude via stderr so they get fixed in-turn.
#
# Note: deliberately no `-e` because PostToolUse hooks must never exit non-zero.
set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')

# Only TS files matter for typecheck
[[ "$file" != *.ts && "$file" != *.tsx ]] && exit 0

cd "${CLAUDE_PROJECT_DIR}" 2>/dev/null || exit 0
[[ ! -f "package.json" ]] && exit 0
[[ ! -f "pnpm-workspace.yaml" && ! -f "pnpm-lock.yaml" ]] && exit 0

run_check() {
  local pkg="$1" label="$2"
  local out rc
  # Capture combined output; only emit to stderr on failure so Claude sees real errors.
  out=$(pnpm --filter "$pkg" typecheck 2>&1)
  rc=$?
  if [[ $rc -ne 0 ]]; then
    # Trim to last 100 lines (hook output cap is 10,000 chars per Anthropic spec)
    local trimmed
    trimmed=$(printf '%s\n' "$out" | tail -100)
    printf 'typecheck failed in %s (PostToolUse cannot block; Claude please review):\n%s\n' \
      "$label" "$trimmed" >&2
  fi
}

case "$file" in
  *apps/web/*)            run_check web "apps/web" ;;
  *packages/ui/*)         run_check @quilty/ui "packages/ui" ;;
  *packages/shared-types/*) run_check @quilty/shared-types "packages/shared-types" ;;
esac

exit 0
