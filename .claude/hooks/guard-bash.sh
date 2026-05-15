#!/usr/bin/env bash
# PreToolUse hook for Bash — rejects dangerous git/sst/aws/fs commands.
# Exit code 2 = block (stderr -> Claude as feedback).
# This hook is load-bearing for HIPAA + signed-commits posture; never bypass.
set -euo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

# Normalize whitespace once: collapse runs of space/tab to single space.
# All pattern matching below operates on $norm, not $cmd.
norm=$(printf '%s' "$cmd" | tr -s ' \t' ' ')

block() { echo "BLOCKED by guard-bash.sh: $1" >&2; exit 2; }

# ── pre-commit hook bypass flags (catch any ordering) ────────────────────────
[[ "$norm" =~ (^|[[:space:]])--no-verify([[:space:]]|=|$) ]] && \
  block "--no-verify forbidden; pre-commit hooks are load-bearing for HIPAA + signing."

[[ "$norm" =~ (^|[[:space:]])--no-gpg-sign([[:space:]]|=|$) ]] && \
  block "--no-gpg-sign forbidden; commits must be SSH-signed."

# Command-start anchor: start-of-string OR after a shell separator ; && || | $( `
# Used by every pattern that previously anchored on `^` only.
CS='(^|[;&|`(])[[:space:]]*'

# ── git config / per-command override that disables signing ──────────────────
if [[ "$norm" =~ ${CS}git[[:space:]]+(config|-c[[:space:]]+) ]]; then
  if [[ "$norm" =~ (commit\.gpgsign[[:space:]=]+false|tag\.gpgsign[[:space:]=]+false|user\.signingkey[[:space:]=]|gpg\.format[[:space:]=]|gpg\.ssh\.) ]]; then
    block "git signing config mutation forbidden; SSH-signing is load-bearing."
  fi
fi

# ── git push: force variants, refspec force, protected-branch push ───────────
if [[ "$norm" =~ ${CS}git[[:space:]]+push([[:space:]]|$) ]]; then
  # Force-push: --force, --force-with-lease (block — see ADR note in CLAUDE.md;
  # if needed, ask user to authorize per-invocation), -f token, or refspec +ref.
  if [[ "$norm" =~ (^|[[:space:]])(--force(-with-lease)?|-f)([[:space:]]|=|$) ]] || \
     [[ "$norm" =~ [[:space:]]\+[A-Za-z0-9_./-]+:[A-Za-z0-9_./-]+ ]]; then
    block "force-push forbidden (any flag form or +refspec); resolve conflicts or ask user."
  fi
  # Protected branches: main / master / production, in any of these forms:
  #   git push origin main
  #   git push -u origin main
  #   git push origin HEAD:main
  #   git push origin local:main
  if [[ "$norm" =~ (^|[[:space:]])origin[[:space:]]([A-Za-z0-9_./+-]+:)?(main|master|production)([[:space:]]|$) ]] || \
     [[ "$norm" =~ [[:space:]]HEAD:(main|master|production)([[:space:]]|$) ]]; then
    block "direct push to protected branch forbidden; use feature branch + PR."
  fi
fi

# ── destructive git reset ────────────────────────────────────────────────────
if [[ "$norm" =~ ${CS}git[[:space:]]+reset[[:space:]]+--hard[[:space:]]+(origin|HEAD~) ]]; then
  block "destructive reset; use git stash or git restore for safer alternatives."
fi

# ── SST production deploy (any reasonable spelling) ──────────────────────────
if [[ "$norm" =~ ${CS}(pnpm[[:space:]]+)?sst[[:space:]]+deploy[[:space:]] ]]; then
  if [[ "$norm" =~ --stage[[:space:]=]+(prod|production)([[:space:]]|$) ]]; then
    block "production deploy requires explicit user authorization per feedback_push_per_phase."
  fi
fi

# ── SST remove (destroys stack) ──────────────────────────────────────────────
[[ "$norm" =~ ${CS}(pnpm[[:space:]]+)?sst[[:space:]]+remove([[:space:]]|$) ]] && \
  block "sst remove destroys stack resources; use /sst-destroy-previews skill for preview cleanup."

# ── catastrophic rm ─────────────────────────────────────────────────────────
# Match: rm with any combination of -r, -R, -f flags OR --recursive --force,
# targeting / ~ $HOME .git /Users/<user> /private — including extra whitespace.
if [[ "$norm" =~ ${CS}(sudo[[:space:]]+)?rm[[:space:]] ]]; then
  if [[ "$norm" =~ (^|[[:space:]])(-[a-zA-Z]*[rR][a-zA-Z]*[fF]|-[a-zA-Z]*[fF][a-zA-Z]*[rR]|--recursive.*--force|--force.*--recursive)([[:space:]]|$) ]]; then
    if [[ "$norm" =~ ([[:space:]](/|~|\$HOME|\$\{HOME\})([[:space:]]|/|$))|(/private([[:space:]]|/|$))|(\.git([[:space:]]|/|$))|(/Users/[^[:space:]/]+([[:space:]]|/|$)) ]]; then
      block "catastrophic delete forbidden."
    fi
  fi
fi

# ── permissive chmod ────────────────────────────────────────────────────────
if [[ "$norm" =~ ${CS}(sudo[[:space:]]+)?chmod[[:space:]] ]]; then
  if [[ "$norm" =~ ([[:space:]](-R[[:space:]]+)?0?777|[[:space:]]a\+w|[[:space:]]o\+w|[[:space:]]g\+w,o\+w|[[:space:]]ugo\+w)([[:space:]]|$) ]]; then
    block "world-writable permissions forbidden."
  fi
fi

# ── pipe-to-shell, in all the forms attackers actually use ──────────────────
# (curl|wget|fetch) ... | (sudo)? (sh|bash|zsh|fish|python|node|perl)
if [[ "$norm" =~ (^|[[:space:]])(curl|wget|fetch)[[:space:]] ]] && \
   [[ "$norm" =~ \|[[:space:]]*(sudo[[:space:]]+)?(sh|bash|zsh|fish|python|node|perl)([[:space:]]|$) ]]; then
  block "pipe-to-shell forbidden; download, inspect, then execute."
fi
# Process substitution: bash <(curl ...) or sh <(wget ...)
if [[ "$norm" =~ (^|[[:space:]])(sh|bash|zsh|fish|python|node|perl)[[:space:]]+\<\([[:space:]]*(curl|wget|fetch)[[:space:]] ]]; then
  block "process-substitution download-then-exec forbidden."
fi

# ── credential exfiltration via Bash readers ────────────────────────────────
# Block cat/less/head/tail/bat/xxd/od/hexdump/strings/base64/grep/rg against
# ssh keys, AWS creds, .env files, /etc/shadow. Also catch $(cat ~/.ssh/...).
if [[ "$norm" =~ (^|[^[:alnum:]_])(cat|less|more|head|tail|bat|od|xxd|hexdump|strings|base64|grep|rg|ag)[[:space:]] ]] || \
   [[ "$norm" =~ \$\([[:space:]]*(cat|less|head|tail|base64|xxd)[[:space:]] ]]; then
  if [[ "$norm" =~ (~/\.ssh/|\$HOME/\.ssh/|/Users/[^/]+/\.ssh/|~/\.aws/credentials|/Users/[^/]+/\.aws/credentials|(^|[[:space:]])\.env([[:space:]]|/|\.|$)|[[:space:]]\.env\.[A-Za-z0-9_-]+|/etc/shadow|/private/etc/(master\.passwd|shadow)) ]]; then
    block "reading credentials/secrets via Bash forbidden; use Read tool which is policy-gated."
  fi
fi

# ── git commit secret-scan gate (defense in depth) ──────────────────────────
if [[ "$norm" =~ ${CS}git[[:space:]]+commit ]]; then
  if command -v gitleaks >/dev/null 2>&1; then
    # gitleaks 8.x: `gitleaks git --staged`; old `protect --staged` is deprecated.
    if ! gitleaks git --staged --no-banner --redact --exit-code 1 >/dev/null 2>&1; then
      block "gitleaks detected potential secret/PHI in staged changes; review and stage cleaner content."
    fi
  fi
fi

exit 0
