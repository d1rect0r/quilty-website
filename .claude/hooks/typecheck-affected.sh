#!/usr/bin/env bash
# PostToolUse hook for Write|Edit|MultiEdit — runs scoped tsc on the
# workspace containing the edited file. Only runs on TS/TSX changes.
# Surfaces type errors to Claude via stderr so they get fixed in-turn.
set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')

# Only TS files matter for typecheck
[[ "$file" != *.ts && "$file" != *.tsx ]] && exit 0

cd "${CLAUDE_PROJECT_DIR}"
[[ ! -f "package.json" ]] && exit 0
[[ ! -f "pnpm-workspace.yaml" && ! -f "pnpm-lock.yaml" ]] && exit 0

# Scope tsc to the affected workspace package
if [[ "$file" == */apps/web/* ]]; then
  pnpm --filter web typecheck 2>&1 | tail -30 \
    || echo "typecheck failed in apps/web (PostToolUse cannot block; Claude please review)" >&2
elif [[ "$file" == */packages/ui/* ]]; then
  pnpm --filter @quilty/ui typecheck 2>&1 | tail -30 \
    || echo "typecheck failed in packages/ui" >&2
elif [[ "$file" == */packages/shared-types/* ]]; then
  pnpm --filter @quilty/shared-types typecheck 2>&1 | tail -30 \
    || echo "typecheck failed in packages/shared-types" >&2
fi

exit 0
