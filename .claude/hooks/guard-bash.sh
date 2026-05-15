#!/usr/bin/env bash
# PreToolUse hook for Bash — rejects dangerous git/sst/aws/fs commands.
# Exit code 2 = block (stderr -> Claude as feedback).
# This hook is load-bearing for HIPAA + signed-commits posture; never bypass.
set -euo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

block() { echo "BLOCKED by guard-bash.sh: $1" >&2; exit 2; }

case "$cmd" in
  *"--no-verify"*)
    block "--no-verify forbidden; pre-commit hooks are load-bearing for HIPAA + signing." ;;
  *"--no-gpg-sign"*)
    block "--no-gpg-sign forbidden; commits must be SSH-signed." ;;
  *"push --force"*|*"push -f "*|*"push --force-with-lease"*)
    block "force-push forbidden; resolve conflicts properly or ask user." ;;
  *"git push origin main"*|*"git push origin master"*|*"git push origin production"*)
    block "direct push to protected branch forbidden; use feature branch + PR per feedback_docs_only_direct_to_main rules." ;;
  *"git reset --hard origin"*|*"git reset --hard HEAD~"*)
    block "destructive reset; use git stash or git restore for safer alternatives." ;;
  *"sst deploy --stage prod"*|*"sst deploy --stage production"*|*"pnpm sst deploy --stage prod"*|*"pnpm sst deploy --stage production"*)
    block "production deploy requires explicit user authorization per feedback_push_per_phase." ;;
  *"sst remove"*|*"pnpm sst remove"*)
    block "sst remove destroys stack resources; use /sst-destroy-previews skill instead for preview cleanup." ;;
  *"rm -rf /"*|*"rm -rf ~"*|*"rm -rf \$HOME"*|*"rm -rf .git"*)
    block "catastrophic delete forbidden." ;;
  *"chmod 777"*|*"chmod -R 777"*)
    block "world-writable permissions forbidden." ;;
  *"curl"*"| sh"*|*"curl"*"| bash"*|*"wget"*"| sh"*|*"wget"*"| bash"*)
    block "pipe-to-shell pattern forbidden; download, inspect, then execute." ;;
esac

# git commit gate: scan staged content for secrets before they land
if [[ "$cmd" == git\ commit* ]]; then
  if command -v gitleaks >/dev/null 2>&1; then
    if ! gitleaks protect --staged --no-banner --redact 2>&1 >/dev/null; then
      block "gitleaks detected potential secret/PHI in staged changes; review and stage cleaner content."
    fi
  fi
fi

exit 0
