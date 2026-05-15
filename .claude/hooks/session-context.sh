#!/usr/bin/env bash
# SessionStart hook — injects git state + current phase marker into Claude's
# context at session start. Helps Claude orient without manual `git status`.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR}"

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
dirty=$(git status --short 2>/dev/null | wc -l | tr -d ' ')
ahead_behind=$(git rev-list --left-right --count "@{upstream}...HEAD" 2>/dev/null || echo "0	0")
last_commits=$(git log --oneline -5 2>/dev/null || echo "(no commits yet)")
phase=$(cat .claude/CURRENT_PHASE 2>/dev/null || echo "(unset — touch .claude/CURRENT_PHASE to set)")

jq -n \
  --arg branch "$branch" \
  --arg dirty "$dirty" \
  --arg ahead_behind "$ahead_behind" \
  --arg commits "$last_commits" \
  --arg phase "$phase" \
'{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: ("=== Session context ===\nBranch: \($branch)\nDirty files: \($dirty)\nAhead/Behind upstream: \($ahead_behind)\nCurrent phase: \($phase)\nRecent commits:\n\($commits)\n\nReminder: never push without explicit user authorization (per feedback_push_per_phase). Pre-commit hooks are load-bearing; never use --no-verify or --no-gpg-sign.")
  }
}'
