#!/usr/bin/env bash
# PreToolUse hook for Write|Edit|MultiEdit — blocks edits to:
#   1. The Claude Code harness itself (.claude/settings.json, hooks, agents,
#      skills). Defense-in-depth against prompt injection that tries to
#      disable the guards.
#   2. shadcn primitives at apps/web/components/ui/ (D18 — wrap don't edit).
#
# Exit 2 surfaces stderr to Claude as feedback. Users who genuinely need to
# edit the harness should do it manually (bypass the hook by editing files
# in an editor outside Claude Code, then commit).
set -euo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')
[[ -z "$file" ]] && exit 0

# 1. Harness self-protection — never let Claude edit its own guards in-session.
case "$file" in
  */.claude/settings.json|*/.claude/settings.local.json)
    echo "BLOCKED by guard-write.sh: edits to Claude Code settings require human review. If you genuinely need to change settings, the user should edit the file directly outside this session." >&2
    exit 2 ;;
  */.claude/hooks/*.sh|*/.claude/hooks/*)
    echo "BLOCKED by guard-write.sh: edits to .claude/hooks/ require human review (these are load-bearing for HIPAA + signing + supply-chain posture). Have the user edit directly outside this session." >&2
    exit 2 ;;
  */.claude/agents/*.md)
    echo "BLOCKED by guard-write.sh: edits to .claude/agents/ require human review (agent scopes are part of the security boundary). Have the user edit directly outside this session." >&2
    exit 2 ;;
  */.claude/skills/*/SKILL.md|*/.claude/skills/*.md)
    echo "BLOCKED by guard-write.sh: edits to .claude/skills/ require human review (skill instructions can change the policy posture). Have the user edit directly outside this session." >&2
    exit 2 ;;
  */.claude/statusline.sh|*/.claude/CURRENT_PHASE)
    echo "BLOCKED by guard-write.sh: edits to harness operational files require human review." >&2
    exit 2 ;;
esac

# 2. shadcn primitives — wrap don't edit (D18).
case "$file" in
  */apps/web/components/ui/*)
    echo "BLOCKED by guard-write.sh: apps/web/components/ui/ holds shadcn primitives. Wrap don't edit per D18 — create the wrapper at apps/web/components/<area>/<name>.tsx and customise there. If you need a genuinely new primitive, run \`pnpm exec shadcn add <name>\` to bring it in cleanly." >&2
    exit 2 ;;
esac

exit 0
