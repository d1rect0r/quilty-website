#!/usr/bin/env bash
# UserPromptSubmit hook — scans the user's prompt for secrets and PHI-shaped
# patterns before they leave to the Anthropic API. Especially important for a
# HIPAA-aligned codebase: a careless paste of patient text into a coding
# prompt would be a BAA-relevant disclosure.
#
# Returns JSON with decision: "block" when a pattern matches. The user can
# bypass intentionally by including [allow-secret], [allow-pii], or
# [allow-all] in their prompt (for cases like authoring fixtures).
set -uo pipefail

input=$(cat)
prompt=$(printf '%s' "$input" | jq -r '.prompt // ""')

# Explicit bypass tag
if printf '%s' "$prompt" | grep -qiE '\[allow-(secret|pii|all)\]'; then
  exit 0
fi

# Patterns to flag. Ordered by specificity (most distinctive first).
# Each entry: <human-label>::<grep-ere>
patterns=(
  'AWS access key::AKIA[0-9A-Z]{16}'
  'AWS secret access key (40 base64 chars)::aws_secret_access_key[[:space:]]*[=:][[:space:]]*[A-Za-z0-9/+]{40}'
  'GitHub fine-grained PAT::github_pat_[0-9A-Za-z_]{60,}'
  'GitHub classic PAT::ghp_[0-9A-Za-z]{36}'
  'GitHub OAuth token::gho_[0-9A-Za-z]{36}'
  'OpenAI-style secret key::sk-[0-9A-Za-z_-]{20,}'
  'Anthropic API key::sk-ant-[0-9A-Za-z_-]{20,}'
  'Slack bot token::xox[baprs]-[0-9A-Za-z-]{10,}'
  'Stripe live secret::sk_live_[0-9A-Za-z]{20,}'
  'PEM private key block::-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'JWT shape (eyJ...eyJ...)::eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{10,}\.'
  'US Social Security Number::\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b'
  'Credit-card-shaped (16 digits)::\b[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}\b'
)

for entry in "${patterns[@]}"; do
  label="${entry%%::*}"
  regex="${entry#*::}"
  if printf '%s' "$prompt" | grep -qE -- "$regex"; then
    jq -n --arg label "$label" '{
      decision: "block",
      reason: ("Prompt contains pattern that looks like a secret or PII: " + $label + ". If this is intentional (e.g. authoring a test fixture or referencing a published example), re-submit with [allow-secret], [allow-pii], or [allow-all] in the prompt.")
    }'
    exit 0
  fi
done

exit 0
