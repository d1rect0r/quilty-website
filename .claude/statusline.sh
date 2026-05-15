#!/usr/bin/env bash
# Status line — shows model | dir | branch + dirty marker | context % | cost | rate limit | phase
set -uo pipefail

input=$(cat)
model=$(printf '%s' "$input" | jq -r '.model.display_name // "?"')
dir=$(printf '%s' "$input" | jq -r '.workspace.current_dir // "?"')
ctx=$(printf '%s' "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
cost=$(printf '%s' "$input" | jq -r '.cost.total_cost_usd // 0' | awk '{printf "%.2f", $1}')
rl=$(printf '%s' "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty' | cut -d. -f1)

cd "$dir" 2>/dev/null || true
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "-")
dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
if [[ "$dirty" != "0" ]]; then
  dmark=$'\033[33m●\033[0m'  # yellow dot = dirty
else
  dmark=$'\033[32m✓\033[0m'  # green check = clean
fi
phase=$(cat "${CLAUDE_PROJECT_DIR:-.}/.claude/CURRENT_PHASE" 2>/dev/null || echo "")

# Color context-% by pressure
if   [[ "$ctx" -ge 80 ]]; then cctx=$'\033[31m'  # red
elif [[ "$ctx" -ge 60 ]]; then cctx=$'\033[33m'  # yellow
else cctx=$'\033[36m'; fi                         # cyan
reset=$'\033[0m'

printf "[%s] %s %s %s | ctx %s%s%%%s | \$%s" \
  "$model" "${dir##*/}" "$branch" "$dmark" "$cctx" "$ctx" "$reset" "$cost"
[[ -n "$rl" ]] && printf " | rl5h %s%%" "$rl"
[[ -n "$phase" ]] && printf " | %s" "$phase"
echo
