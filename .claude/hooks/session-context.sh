#!/usr/bin/env bash
# SessionStart hook — injects git state + current phase marker into Claude's
# context at session start. Helps Claude orient without manual `git status`.
#
# Phrasing convention: factual state, NOT imperative instructions.
# Imperative additionalContext can trigger Claude's prompt-injection defenses
# (Anthropic hooks doc § "Prompt Injection in additionalContext"). The hooks
# enforce policy mechanically; this context just describes the environment.
set -euo pipefail

# Fail-closed on bad CLAUDE_PROJECT_DIR — otherwise we'd run git commands in
# whatever cwd the harness inherited and leak the wrong repo's state.
if ! cd "${CLAUDE_PROJECT_DIR:-/nonexistent}" 2>/dev/null; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: "(session-context skipped: CLAUDE_PROJECT_DIR not set or unreadable)"
    }
  }'
  exit 0
fi

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
dirty=$(git status --short 2>/dev/null | wc -l | tr -d ' ')
ahead_behind=$(git rev-list --left-right --count "@{upstream}...HEAD" 2>/dev/null || echo "0	0")
last_commits=$(git log --oneline -5 2>/dev/null || echo "(no commits yet)")
phase=$(cat .claude/CURRENT_PHASE 2>/dev/null | tr -d '[:space:]' || echo "")
[[ -z "$phase" ]] && phase="(unset)"

jq -n \
  --arg branch "$branch" \
  --arg dirty "$dirty" \
  --arg ahead_behind "$ahead_behind" \
  --arg commits "$last_commits" \
  --arg phase "$phase" \
'{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: ("=== Session context (factual state) ===\nBranch: \($branch)\nDirty files: \($dirty)\nAhead/Behind upstream: \($ahead_behind)\nCurrent phase: \($phase)\nRecent commits:\n\($commits)\n\nPolicies in effect (enforced by hooks):\n- guard-bash.sh blocks --no-verify, --no-gpg-sign, force-push (any form), direct push to protected branches, sst remove, sst deploy --stage prod/production, catastrophic rm, world-writable chmod, pipe-to-shell, credential reads, git signing config mutation.\n- guard-prompt.sh scans prompts for AWS keys, PATs, JWTs, PEM, SSN, CC patterns.\n- guard-write.sh blocks edits to .claude/ harness and apps/web/components/ui/ (shadcn primitives are wrap-only per D18).\n- Pushes are user-authorised at milestone boundaries (see feedback_push_per_phase memory).")
  }
}'
