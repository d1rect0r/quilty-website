#!/usr/bin/env bash
# =============================================================================
# Phase-D E2 — Local SST deploy wrapper (LOCAL apply path, D-PD-2)
# =============================================================================
# Local equivalent of .github/workflows/deploy.yml's `deploy-prod` job for the
# operator-runs-local go-live. Reproduces the CI deploy contract exactly, but
# sources every value from a SINGLE SOURCE OF TRUTH instead of GitHub repo
# vars/secrets:
#   - infra ARNs/domains  ← AWS SSM Parameter Store (/quilty/website/*)
#   - pseudonym pepper     ← AWS Secrets Manager (quilty/website/pseudonym-pepper)
#   - Sentry DSN + token   ← operator env (Sentry lives outside AWS)
# This kills the "pepper in two places that can drift" smell (research verdict)
# for the path we actually use.
#
# Sequence mirrors deploy.yml: suppress alarm actions → sst deploy → (SST runs the
# CloudFront /* invalidation with wait) → restore alarm actions (always) → SEO
# index-posture gate against the CloudFront distribution domain → notify result →
# print the distribution domain for the runbook's DNS-cutover step (B4).
#
# SAFETY: dry-run by DEFAULT — resolves + validates all config and prints the plan
# but does NOT deploy. Pass --execute to deploy. --execute verifies the caller is
# in the marketing-prod account and that the pepper is not still the placeholder.
#
# Usage:
#   export NEXT_PUBLIC_SENTRY_DSN=... SENTRY_AUTH_TOKEN=...        # from 1Password
#   AWS_PROFILE=<marketing-prod> scripts/website-deploy-local.sh             # dry-run
#   AWS_PROFILE=<marketing-prod> scripts/website-deploy-local.sh --execute   # deploy
# =============================================================================

set -uo pipefail # NOT -e: we manage failures explicitly so the alarm-restore trap always runs

# --- config (override via env) ----------------------------------------------
REGION="${REGION:-us-east-1}"
STAGE="${STAGE:-dev}" # Phase-0 durable stage (deploy.yml hardcodes `dev`; alarm prefix quilty-web-dev-)
EXPECT_ACCOUNT="${EXPECT_ACCOUNT:-619758066987}" # marketing-prod
ALARM_PREFIX="${ALARM_PREFIX:-quilty-web-${STAGE}-}"
SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://my-quilty.com}"
# Pre-flip ceremony default: serve the real site noindex (D-PD-3). The launch flip
# (B7, held) is the only place this becomes false. Override only intentionally.
SITE_FORCE_NOINDEX="${SITE_FORCE_NOINDEX:-true}"

EXECUTE=0
for arg in "$@"; do
  case "$arg" in
    --execute) EXECUTE=1 ;;
    --dry-run) EXECUTE=0 ;;
    -h | --help)
      sed -n '2,46p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $arg (use --execute or --dry-run)" >&2
      exit 2
      ;;
  esac
done

note() { printf '  %s\n' "$*"; }
die() {
  printf 'FATAL: %s\n' "$*" >&2
  exit 1
}

echo "==============================================================="
echo "Phase-D E2 — local SST deploy ($([ "$EXECUTE" = 1 ] && echo EXECUTE || echo DRY-RUN), stage ${STAGE})"
echo "==============================================================="

# --- locate the SST project --------------------------------------------------
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not inside a git repo"
[ -f "${REPO_ROOT}/sst.config.ts" ] || die "no sst.config.ts at ${REPO_ROOT} — run from the quilty-website repo"
cd "$REPO_ROOT" || die "cannot cd to ${REPO_ROOT}"

command -v aws >/dev/null 2>&1 || die "aws CLI not found"
command -v pnpm >/dev/null 2>&1 || die "pnpm not found (corepack enable / install pnpm)"

# --- account guard -----------------------------------------------------------
acct="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)"
if [ -n "$acct" ] && [ "$acct" != "None" ]; then
  if [ "$acct" = "$EXPECT_ACCOUNT" ]; then
    note "caller account ${acct} (marketing-prod) ✓"
  else
    msg="caller account ${acct} != marketing-prod ${EXPECT_ACCOUNT} — set AWS_PROFILE correctly"
    [ "$EXECUTE" = 1 ] && die "$msg"
    note "WARN: $msg"
  fi
else
  [ "$EXECUTE" = 1 ] && die "no AWS credentials — 'aws sso login --profile <marketing-prod>'"
  note "WARN: no AWS credentials (dry-run continues; --execute requires them)"
fi

# --- resolve deploy config from SSM (env overrides win) ----------------------
ssm() { aws ssm get-parameter --name "$1" --region "$REGION" --query Parameter.Value --output text 2>/dev/null; }

echo
echo "[config] resolving from SSM /quilty/website/* (+ Secrets Manager pepper)"

WAF_WEB_ACL_ARN="${WAF_WEB_ACL_ARN:-$(ssm /quilty/website/waf-web-acl-arn)}"
QUILTY_WEB_ALERTS_TOPIC_ARN="${QUILTY_WEB_ALERTS_TOPIC_ARN:-$(ssm /quilty/website/alerts-topic-arn)}"
QUILTY_WEB_DEPLOY_BOUNDARY_ARN="${QUILTY_WEB_DEPLOY_BOUNDARY_ARN:-$(ssm /quilty/website/deploy-boundary-arn)}"
QUILTY_WEB_CLOUDFRONT_LOG_BUCKET_DOMAIN="${QUILTY_WEB_CLOUDFRONT_LOG_BUCKET_DOMAIN:-$(ssm /quilty/website/cloudfront-access-logs-bucket-domain)}"
QUILTY_WEB_ACM_CERT_ARN="${QUILTY_WEB_ACM_CERT_ARN:-$(ssm /quilty/website/acm-cert-arn)}"

# Normalise the "param missing" sentinel (get-parameter prints nothing on miss,
# but a stale `None` can sneak in via overrides) to empty.
for v in WAF_WEB_ACL_ARN QUILTY_WEB_ALERTS_TOPIC_ARN QUILTY_WEB_DEPLOY_BOUNDARY_ARN \
  QUILTY_WEB_CLOUDFRONT_LOG_BUCKET_DOMAIN QUILTY_WEB_ACM_CERT_ARN; do
  [ "${!v}" = "None" ] && printf -v "$v" '%s' ''
done

# Hard-gated values (sst.config.ts throws without them on the durable stage).
[ -n "$WAF_WEB_ACL_ARN" ] || die "WAF_WEB_ACL_ARN unresolved — has website-baseline been applied? (SSM /quilty/website/waf-web-acl-arn)"
[ -n "$QUILTY_WEB_ALERTS_TOPIC_ARN" ] || die "QUILTY_WEB_ALERTS_TOPIC_ARN unresolved (SSM /quilty/website/alerts-topic-arn)"
[ -n "$QUILTY_WEB_DEPLOY_BOUNDARY_ARN" ] || die "QUILTY_WEB_DEPLOY_BOUNDARY_ARN unresolved (SSM /quilty/website/deploy-boundary-arn — re-apply website-baseline if added recently)"
note "WAF ACL:        ${WAF_WEB_ACL_ARN}"
note "alerts topic:   ${QUILTY_WEB_ALERTS_TOPIC_ARN}"
note "deploy boundary:${QUILTY_WEB_DEPLOY_BOUNDARY_ARN}"

# Optional values — degrade with an explicit warning so the operator KNOWS the
# consequence (no access logs / raw CloudFront URL) rather than silently shipping it.
if [ -n "$QUILTY_WEB_CLOUDFRONT_LOG_BUCKET_DOMAIN" ]; then
  note "CF access logs: ${QUILTY_WEB_CLOUDFRONT_LOG_BUCKET_DOMAIN}"
else
  note "WARN: cloudfront-access-logs-bucket-domain unset — distribution will ship with NO access logs (Part D 4xx triage blind)."
fi
if [ -n "$QUILTY_WEB_ACM_CERT_ARN" ]; then
  note "ACM cert:       ${QUILTY_WEB_ACM_CERT_ARN}"
else
  note "WARN: acm-cert-arn unset — deploy will serve the RAW CloudFront URL (no custom domain). Expected only for a pre-cert rehearsal; for B3 the cert must be ISSUED first."
fi

# Pepper — single source of truth: Secrets Manager. Never echoed.
PEPPER="$(aws secretsmanager get-secret-value --secret-id quilty/website/pseudonym-pepper \
  --region "$REGION" --query SecretString --output text 2>/dev/null || true)"
if [ -z "$PEPPER" ] || [ "$PEPPER" = "None" ]; then
  [ "$EXECUTE" = 1 ] && die "pseudonym pepper unresolved (Secrets Manager quilty/website/pseudonym-pepper)"
  note "WARN: pepper unresolved (dry-run continues)"
elif [[ "$PEPPER" == PLACEHOLDER* ]]; then
  die "pseudonym pepper is still the PLACEHOLDER — rotate it ('aws secretsmanager put-secret-value') before deploying (deploy.yml/A3)."
else
  note "pepper:         <resolved from Secrets Manager, ${#PEPPER} chars> ✓"
fi

# Sentry — operator-supplied (outside AWS). Required by sst.config.ts.
[ -n "${NEXT_PUBLIC_SENTRY_DSN:-}" ] || die "NEXT_PUBLIC_SENTRY_DSN unset — export it (Sentry project DSN, A2)"
[ -n "${SENTRY_AUTH_TOKEN:-}" ] || die "SENTRY_AUTH_TOKEN unset — export it (Sentry auth token, A2)"
note "Sentry DSN/token: <from env> ✓"
note "site URL:       ${SITE_URL}"
note "noindex:        ${SITE_FORCE_NOINDEX}"

if [ "$EXECUTE" != 1 ]; then
  echo
  echo "DRY-RUN: config resolves cleanly. Re-run with --execute to deploy."
  echo "==============================================================="
  exit 0
fi

# --- alarm-action suppression (best-effort) + guaranteed restore -------------
# Mirrors deploy.yml M2.8: silence the SST-authored quilty-web-${STAGE}-* alarm
# ACTIONS (not the alarms) so a deploy's cold-start/invalidation blip can't
# self-page. A trap restores them no matter how the script exits.
suppressed_names=""
restore_alarms() {
  [ -n "$suppressed_names" ] || return 0
  echo "[restore] re-enabling alarm actions: ${suppressed_names}"
  # shellcheck disable=SC2086 # word-splitting is intended: one --alarm-names arg each
  aws cloudwatch enable-alarm-actions --region "$REGION" --alarm-names $suppressed_names 2>/dev/null || true
}
trap restore_alarms EXIT

# Portable array build (no mapfile — macOS system bash is 3.2): one alarm name
# per line, skipping blanks. --output text is tab-separated for a flat list.
_alarms=()
# `|| [ -n "$_a" ]` reads a final line that lacks a trailing newline (mapfile-equivalent robustness).
while IFS= read -r _a || [ -n "$_a" ]; do [ -n "$_a" ] && _alarms+=("$_a"); done < <(aws cloudwatch describe-alarms --region "$REGION" \
  --alarm-name-prefix "$ALARM_PREFIX" \
  --query 'MetricAlarms[].AlarmName' --output text 2>/dev/null | tr '\t' '\n')
if [ "${#_alarms[@]}" -gt 0 ]; then
  echo "[suppress] disabling actions on: ${_alarms[*]}"
  if aws cloudwatch disable-alarm-actions --region "$REGION" --alarm-names "${_alarms[@]}"; then
    suppressed_names="${_alarms[*]}"
  fi
else
  echo "[suppress] no ${ALARM_PREFIX}* alarms yet (first deploy) — nothing to suppress."
fi

# --- deploy ------------------------------------------------------------------
echo
echo "[deploy] pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile || die "pnpm install failed"

echo "[deploy] pnpm sst deploy --stage ${STAGE}"
deploy_rc=0
NEXT_PUBLIC_SITE_URL="$SITE_URL" \
  NEXT_PUBLIC_SENTRY_DSN="$NEXT_PUBLIC_SENTRY_DSN" \
  SENTRY_AUTH_TOKEN="$SENTRY_AUTH_TOKEN" \
  SST_DEPLOY_GATE_PASSED='true' \
  WAF_WEB_ACL_ARN="$WAF_WEB_ACL_ARN" \
  QUILTY_WEB_DEPLOY_BOUNDARY_ARN="$QUILTY_WEB_DEPLOY_BOUNDARY_ARN" \
  QUILTY_PSEUDONYM_PEPPER="$PEPPER" \
  QUILTY_WEB_ALERTS_TOPIC_ARN="$QUILTY_WEB_ALERTS_TOPIC_ARN" \
  QUILTY_WEB_CLOUDFRONT_LOG_BUCKET_DOMAIN="$QUILTY_WEB_CLOUDFRONT_LOG_BUCKET_DOMAIN" \
  QUILTY_WEB_ACM_CERT_ARN="$QUILTY_WEB_ACM_CERT_ARN" \
  SITE_FORCE_NOINDEX="$SITE_FORCE_NOINDEX" \
  pnpm sst deploy --stage "$STAGE" || deploy_rc=$?

# Restore alarms now (don't wait for EXIT) so the SEO gate below observes the
# real steady-state alarm posture; the trap stays as a backstop.
restore_alarms
suppressed_names=""

# --- SEO index-posture gate (CloudFront distribution domain, pre-DNS-safe) ----
# Lifted from deploy.yml: the apex aliases are written LATER (B4) so we check the
# always-resolvable distribution domain. Posture is baked at build, emitted on
# every host, so this is an equivalent check. Distribution id comes from the
# cloudfront-5xx alarm the deploy just created.
cf_domain=""
if [ "$deploy_rc" -eq 0 ]; then
  echo
  echo "[seo-gate] verifying index posture (want noindex=${SITE_FORCE_NOINDEX})"
  dist_id="$(aws cloudwatch describe-alarms --region "$REGION" \
    --alarm-names "${ALARM_PREFIX}cloudfront-5xx" \
    --query "MetricAlarms[0].Dimensions[?Name=='DistributionId'].Value" \
    --output text 2>/dev/null || true)"
  if [ -z "$dist_id" ] || [ "$dist_id" = "None" ]; then
    note "WARN: could not read distribution id from ${ALARM_PREFIX}cloudfront-5xx — skipping SEO gate (verify manually)."
  else
    cf_domain="$(aws cloudfront get-distribution --id "$dist_id" \
      --query 'Distribution.DomainName' --output text 2>/dev/null || true)"
    if [ -z "$cf_domain" ] || [ "$cf_domain" = "None" ]; then
      note "WARN: could not resolve CloudFront domain for ${dist_id} — skipping SEO gate."
    else
      tag="$(curl -sSI "https://${cf_domain}/en" 2>/dev/null | tr -d '\r' \
        | awk -F': ' 'tolower($1)=="x-robots-tag"{print tolower($2)}' || true)"
      if [ "$SITE_FORCE_NOINDEX" = "true" ]; then
        for _ in 1 2 3; do [ -n "$tag" ] && break; sleep 5
          tag="$(curl -sSI "https://${cf_domain}/en" 2>/dev/null | tr -d '\r' | awk -F': ' 'tolower($1)=="x-robots-tag"{print tolower($2)}' || true)"
        done
        case "$tag" in
          *noindex*) note "OK: placeholder phase — /en is noindex." ;;
          *) note "FAIL: SITE_FORCE_NOINDEX=true but /en missing noindex."; deploy_rc=1 ;;
        esac
      else
        case "$tag" in
          *noindex*) note "FATAL: serving noindex but SITE_FORCE_NOINDEX!=true — blocking."; deploy_rc=1 ;;
          *) note "OK: launched posture — /en is indexable." ;;
        esac
      fi
    fi
  fi
fi

# --- deploy-result notification (best-effort) --------------------------------
result=$([ "$deploy_rc" -eq 0 ] && echo succeeded || echo FAILED)
if [ -n "$QUILTY_WEB_ALERTS_TOPIC_ARN" ]; then
  if aws sns publish --region "$REGION" --topic-arn "$QUILTY_WEB_ALERTS_TOPIC_ARN" \
    --subject "[quilty-web] ${STAGE} local deploy ${result}" \
    --message "quilty-website ${STAGE} local deploy ${result} for $(git rev-parse --short HEAD) by $(whoami) at $(date -u +%FT%TZ)." \
    >/dev/null 2>&1; then
    note "deploy-result notification published to SNS."
  else
    note "WARN: SNS notify failed (deploy result still ${result})."
  fi
fi

echo
echo "==============================================================="
echo "Deploy ${result}."
if [ -n "$cf_domain" ]; then
  echo "CloudFront distribution domain (for runbook B3 validate + B4 DNS cutover):"
  echo "    ${cf_domain}"
  echo "Next: validate https://${cf_domain} (curl -H 'Host: my-quilty.com'), then set"
  echo "      website_cloudfront_domain=\"${cf_domain}\" in dns/ and apply (B4)."
fi
echo "==============================================================="
exit "$deploy_rc"
