#!/usr/bin/env bash
# =============================================================================
# Phase-D E2 — Local SST deploy wrapper (LOCAL apply path, D-PD-2)
# =============================================================================
# Local equivalent of .github/workflows/deploy.yml's `deploy-prod` job for the
# operator-runs-local go-live. Reproduces the CI deploy contract exactly, but
# sources every value from a SINGLE SOURCE OF TRUTH instead of GitHub repo
# vars/secrets:
#   - infra ARNs/domains/tables ← AWS SSM Parameter Store (/quilty/website/*)
#   - Sentry DSN + token + CSP report URI ← operator env (Sentry lives outside AWS)
# SECRETS (pepper + CSRF key) are RUNTIME-ONLY: the SSR Lambda fetches them via
# the Parameters-and-Secrets extension; this wrapper only VERIFIES they are
# seeded (non-placeholder) and never exports a value — a deploy-time env copy
# is readable via lambda:GetFunctionConfiguration and lands in IaC state.
#
# Sequence mirrors deploy.yml: suppress alarm actions → sst deploy → (SST runs the
# CloudFront /* invalidation with wait) → restore alarm actions (always) →
# route-manifest smoke gate (every route with distinct server dependencies —
# the /en-only probe famously missed a 500ing /en/contact) + SEO index-posture
# gate → notify result → print the distribution domain for the runbook's
# DNS-cutover step (B4). On a failed gate the script prints the
# redeploy-last-good-sha rollback one-liner (no alias rollback exists for
# CloudFront+OpenNext — rollback IS a redeploy; docs/runbook/rollback.md).
#
# SAFETY: dry-run by DEFAULT — resolves + validates all config and prints the plan
# but does NOT deploy. Pass --execute to deploy. --execute verifies the caller is
# in the marketing-prod account and that the secrets are not still placeholders.
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
echo "[config] resolving from SSM /quilty/website/* (secrets are verify-only; runtime-fetched by the Lambda)"

WAF_WEB_ACL_ARN="${WAF_WEB_ACL_ARN:-$(ssm /quilty/website/waf-web-acl-arn)}"
QUILTY_WEB_ALERTS_TOPIC_ARN="${QUILTY_WEB_ALERTS_TOPIC_ARN:-$(ssm /quilty/website/alerts-topic-arn)}"
QUILTY_WEB_DEPLOY_BOUNDARY_ARN="${QUILTY_WEB_DEPLOY_BOUNDARY_ARN:-$(ssm /quilty/website/deploy-boundary-arn)}"
QUILTY_WEB_CLOUDFRONT_LOG_BUCKET_DOMAIN="${QUILTY_WEB_CLOUDFRONT_LOG_BUCKET_DOMAIN:-$(ssm /quilty/website/cloudfront-access-logs-bucket-domain)}"
QUILTY_WEB_ACM_CERT_ARN="${QUILTY_WEB_ACM_CERT_ARN:-$(ssm /quilty/website/acm-cert-arn)}"
QUILTY_RATE_LIMIT_TABLE="${QUILTY_RATE_LIMIT_TABLE:-$(ssm /quilty/website/rate-limit-table)}"
QUILTY_IDEMPOTENCY_TABLE="${QUILTY_IDEMPOTENCY_TABLE:-$(ssm /quilty/website/idempotency-table)}"

# Normalise the "param missing" sentinel (get-parameter prints nothing on miss,
# but a stale `None` can sneak in via overrides) to empty.
for v in WAF_WEB_ACL_ARN QUILTY_WEB_ALERTS_TOPIC_ARN QUILTY_WEB_DEPLOY_BOUNDARY_ARN \
  QUILTY_WEB_CLOUDFRONT_LOG_BUCKET_DOMAIN QUILTY_WEB_ACM_CERT_ARN \
  QUILTY_RATE_LIMIT_TABLE QUILTY_IDEMPOTENCY_TABLE; do
  [ "${!v}" = "None" ] && printf -v "$v" '%s' ''
done

# Hard-gated values (sst.config.ts throws without them on the durable stage).
[ -n "$WAF_WEB_ACL_ARN" ] || die "WAF_WEB_ACL_ARN unresolved — has website-baseline been applied? (SSM /quilty/website/waf-web-acl-arn)"
[ -n "$QUILTY_WEB_ALERTS_TOPIC_ARN" ] || die "QUILTY_WEB_ALERTS_TOPIC_ARN unresolved (SSM /quilty/website/alerts-topic-arn)"
[ -n "$QUILTY_WEB_DEPLOY_BOUNDARY_ARN" ] || die "QUILTY_WEB_DEPLOY_BOUNDARY_ARN unresolved (SSM /quilty/website/deploy-boundary-arn — re-apply website-baseline if added recently)"
[ -n "$QUILTY_RATE_LIMIT_TABLE" ] || die "QUILTY_RATE_LIMIT_TABLE unresolved (SSM /quilty/website/rate-limit-table — re-apply website-baseline)"
[ -n "$QUILTY_IDEMPOTENCY_TABLE" ] || die "QUILTY_IDEMPOTENCY_TABLE unresolved (SSM /quilty/website/idempotency-table — re-apply website-baseline)"
note "WAF ACL:        ${WAF_WEB_ACL_ARN}"
note "alerts topic:   ${QUILTY_WEB_ALERTS_TOPIC_ARN}"
note "deploy boundary:${QUILTY_WEB_DEPLOY_BOUNDARY_ARN}"
note "rate-limit tbl: ${QUILTY_RATE_LIMIT_TABLE}"
note "idempotency tbl:${QUILTY_IDEMPOTENCY_TABLE}"

# Optional values — degrade with an explicit warning so the operator KNOWS the
# consequence (no access logs / raw CloudFront URL) rather than silently shipping it.
if [ -n "$QUILTY_WEB_CLOUDFRONT_LOG_BUCKET_DOMAIN" ]; then
  note "CF access logs: ${QUILTY_WEB_CLOUDFRONT_LOG_BUCKET_DOMAIN}"
else
  note "WARN: cloudfront-access-logs-bucket-domain unset — distribution will ship with NO access logs (Part D 4xx triage blind)."
fi
if [ -n "$QUILTY_WEB_ACM_CERT_ARN" ]; then
  note "ACM cert:       ${QUILTY_WEB_ACM_CERT_ARN}"
  # The www alias on the main distribution (sst.config.ts domain.aliases)
  # hard-requires the cert to carry the www SAN — CloudFront rejects an
  # alias the viewer cert doesn't cover, mid-deploy.
  cert_sans="$(aws acm describe-certificate --certificate-arn "$QUILTY_WEB_ACM_CERT_ARN" \
    --region "$REGION" --query 'Certificate.SubjectAlternativeNames' --output text 2>/dev/null || true)"
  case "$cert_sans" in
    *www.my-quilty.com*) note "cert SANs cover www.my-quilty.com ✓" ;;
    "") note "WARN: could not read cert SANs (permission?) — www-alias coverage unverified." ;;
    *)
      msg="cert ${QUILTY_WEB_ACM_CERT_ARN} does NOT cover www.my-quilty.com — the www alias will fail the deploy"
      [ "$EXECUTE" = 1 ] && die "$msg"
      note "WARN: $msg"
      ;;
  esac
else
  note "WARN: acm-cert-arn unset — deploy will serve the RAW CloudFront URL (no custom domain). Expected only for a pre-cert rehearsal; for B3 the cert must be ISSUED first."
fi

# Runtime secrets — VERIFY seeded, never export. The SSR Lambda fetches both
# at runtime via the Parameters-and-Secrets extension; this check only proves
# the go-live ceremony seeded real values. Values are read into locals for the
# placeholder test and never echoed; under a role without GetSecretValue
# (the deploy role is DescribeSecret-only for the CSRF key by design), fall
# back to the DescribeSecret seeded-heuristic with a warning.
check_secret_seeded() { # $1 = secret id, $2 = label, $3 = also check AWSPREVIOUS (true/false)
  local secret_id="$1" label="$2" check_previous="$3" val
  val="$(aws secretsmanager get-secret-value --secret-id "$secret_id" \
    --region "$REGION" --query SecretString --output text 2>/dev/null || true)"
  if [ -z "$val" ] || [ "$val" = "None" ]; then
    local changed created
    changed="$(aws secretsmanager describe-secret --secret-id "$secret_id" --region "$REGION" \
      --query LastChangedDate --output text 2>/dev/null || true)"
    created="$(aws secretsmanager describe-secret --secret-id "$secret_id" --region "$REGION" \
      --query CreatedDate --output text 2>/dev/null || true)"
    if [ -n "$changed" ] && [ "$changed" != "None" ] && [ "$changed" != "$created" ]; then
      note "WARN: ${label} value unreadable under this role — DescribeSecret says it was changed post-create (seeded heuristic). Placeholder check skipped."
      return 0
    fi
    [ "$EXECUTE" = 1 ] && die "${label} unresolved/unseeded (Secrets Manager ${secret_id})"
    note "WARN: ${label} unresolved (dry-run continues)"
    return 0
  fi
  if [[ "$val" == PLACEHOLDER* ]]; then
    die "${label} is still the PLACEHOLDER — seed it ('aws secretsmanager put-secret-value') per docs/runbooks/website_secret_rotation.md before deploying."
  fi
  note "${label}: <seeded, ${#val} chars> ✓"
  if [ "$check_previous" = "true" ]; then
    local prev
    prev="$(aws secretsmanager get-secret-value --secret-id "$secret_id" --version-stage AWSPREVIOUS \
      --region "$REGION" --query SecretString --output text 2>/dev/null || true)"
    if [[ -n "$prev" && "$prev" != "None" && "$prev" == PLACEHOLDER* ]]; then
      die "${label} AWSPREVIOUS still holds the (public!) PLACEHOLDER — the app verifies BOTH labels; rotate TWICE at activation (runbook §2)."
    fi
  fi
}
check_secret_seeded quilty/website/pseudonym-pepper "pepper" false
check_secret_seeded quilty/website/csrf-secret "csrf key" true

# Sentry — operator-supplied (outside AWS). The DSN + the CSP report URI are
# HARD gates (sst.config.ts throws without either on a durable stage — a
# report-only CSP with no sink silently collects no enforce-flip evidence).
# SENTRY_AUTH_TOKEN is OPTIONAL — next.config omits it when absent and just
# skips source-map upload (readable stack traces); not a deploy blocker.
[ -n "${NEXT_PUBLIC_SENTRY_DSN:-}" ] || die "NEXT_PUBLIC_SENTRY_DSN unset — export it (Sentry project DSN)"
[ -n "${SENTRY_CSP_REPORT_URI:-}" ] || die "SENTRY_CSP_REPORT_URI unset — export the dedicated Sentry CSP project's security endpoint (Project Settings → Security Headers)"
# Default-empty under set -u and export so the sst-deploy child process
# inherits it (value comes from the operator env; nothing is stored here).
: "${SENTRY_AUTH_TOKEN:=}"
export SENTRY_AUTH_TOKEN
if [ -n "$SENTRY_AUTH_TOKEN" ]; then
  note "Sentry DSN + CSP report URI + auth token: <from env> ✓"
else
  note "Sentry DSN + CSP report URI <from env> ✓ (no SENTRY_AUTH_TOKEN — source maps won't upload; not a blocker)"
fi
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
  SENTRY_CSP_REPORT_URI="$SENTRY_CSP_REPORT_URI" \
  SST_DEPLOY_GATE_PASSED='true' \
  WAF_WEB_ACL_ARN="$WAF_WEB_ACL_ARN" \
  QUILTY_WEB_DEPLOY_BOUNDARY_ARN="$QUILTY_WEB_DEPLOY_BOUNDARY_ARN" \
  QUILTY_WEB_ALERTS_TOPIC_ARN="$QUILTY_WEB_ALERTS_TOPIC_ARN" \
  QUILTY_WEB_CLOUDFRONT_LOG_BUCKET_DOMAIN="$QUILTY_WEB_CLOUDFRONT_LOG_BUCKET_DOMAIN" \
  QUILTY_WEB_ACM_CERT_ARN="$QUILTY_WEB_ACM_CERT_ARN" \
  QUILTY_RATE_LIMIT_TABLE="$QUILTY_RATE_LIMIT_TABLE" \
  QUILTY_IDEMPOTENCY_TABLE="$QUILTY_IDEMPOTENCY_TABLE" \
  SITE_FORCE_NOINDEX="$SITE_FORCE_NOINDEX" \
  pnpm sst deploy --stage "$STAGE" || deploy_rc=$?

# Restore alarms now (don't wait for EXIT) so the SEO gate below observes the
# real steady-state alarm posture; the trap stays as a backstop.
restore_alarms
suppressed_names=""

# --- route-manifest smoke gate (CloudFront distribution domain, pre-DNS-safe) --
# Probes EVERY route class with distinct server dependencies — env-var wiring
# is per-route in App Router, so a homepage-only probe proves nothing about
# the contact surface (the exact incident class this gate exists for: /en was
# 200 while /en/contact 500'd on a missing runtime secret). The apex aliases
# are written LATER (B4) so we hit the always-resolvable distribution domain
# with the real site Host (OpenNext validates the forwarded Host; the raw
# *.cloudfront.net host 400s). Distribution id comes from the cloudfront-5xx
# alarm the deploy just created.
site_host="${SITE_URL#http://}"; site_host="${site_host#https://}"; site_host="${site_host%%/*}"
cf_domain=""
gate_failures=0
gate_fail() { note "FAIL: $*"; gate_failures=$((gate_failures + 1)); }

# probe <method> <path> [extra curl args...] — sets probe_status,
# probe_headers (lowercased names, values intact), probe_body (GET only,
# first 4KB). One transport-level retry after 5s absorbs a cold-start
# timeout/hiccup without letting a persistent failure pass.
probe_status=""; probe_headers=""; probe_body=""
probe_once() {
  local method="$1" path="$2" host_override="$3"; shift 3
  local url="https://${cf_domain}${path}"
  local raw
  if [ "$method" = "GET" ]; then
    raw="$(curl -sS -m 30 -D - -o /tmp/quilty-smoke-body.$$ -H "Host: ${host_override}" "$@" "$url" 2>/dev/null | tr -d '\r')"
    probe_body="$(head -c 4096 /tmp/quilty-smoke-body.$$ 2>/dev/null || true)"
    rm -f /tmp/quilty-smoke-body.$$
  else
    raw="$(curl -sS -m 30 -D - -o /dev/null -X "$method" -H "Host: ${host_override}" "$@" "$url" 2>/dev/null | tr -d '\r')"
    probe_body=""
  fi
  probe_status="$(printf '%s' "$raw" | awk 'toupper($1) ~ /^HTTP\// {code=$2} END {print code}')"
  # substr(): header VALUES may themselves contain ': ' (Reporting-Endpoints does).
  probe_headers="$(printf '%s' "$raw" | awk '{ i = index($0, ": "); if (i > 1) print tolower(substr($0, 1, i-1)) ": " substr($0, i+2) }')"
}
probe() {
  local method="$1" path="$2"; shift 2
  probe_once "$method" "$path" "$site_host" "$@"
  if [ -z "$probe_status" ]; then
    sleep 5
    probe_once "$method" "$path" "$site_host" "$@"
  fi
}
expect_status() { # $1 label, $2 want
  if [ "$probe_status" != "$2" ]; then gate_fail "$1 returned ${probe_status:-<none>}, want $2"; else note "OK: $1 → $2"; fi
}
expect_header() { # $1 label, $2 header-name(lower), $3 substring (empty = present)
  local line
  line="$(printf '%s\n' "$probe_headers" | grep "^$2:" || true)"
  if [ -z "$line" ]; then gate_fail "$1: header $2 missing"; return; fi
  if [ -n "$3" ] && ! printf '%s' "$line" | grep -qi "$3"; then gate_fail "$1: header $2 lacks '$3' (got: ${line})"; fi
}

if [ "$deploy_rc" -eq 0 ]; then
  echo
  echo "[smoke-gate] route manifest against the distribution domain"
  dist_id="$(aws cloudwatch describe-alarms --region "$REGION" \
    --alarm-names "${ALARM_PREFIX}cloudfront-5xx" \
    --query "MetricAlarms[0].Dimensions[?Name=='DistributionId'].Value" \
    --output text 2>/dev/null || true)"
  if [ -z "$dist_id" ] || [ "$dist_id" = "None" ]; then
    # A skipped gate at go-live IS a failed gate — an unverified deploy must
    # not read as green just because the probe couldn't find its target.
    gate_fail "could not read distribution id from ${ALARM_PREFIX}cloudfront-5xx — smoke gate could not run."
    deploy_rc=1
  else
    cf_domain="$(aws cloudfront get-distribution --id "$dist_id" \
      --query 'Distribution.DomainName' --output text 2>/dev/null || true)"
    if [ -z "$cf_domain" ] || [ "$cf_domain" = "None" ]; then
      gate_fail "could not resolve CloudFront domain for ${dist_id} — smoke gate could not run."
      deploy_rc=1
    else
      # Post-invalidation propagation grace: one warm-up request, brief settle.
      probe GET "/en"; [ "$probe_status" = "200" ] || { sleep 10; }

      # 1. Apex locale redirect (curl does not follow redirects by default).
      probe GET "/"
      expect_status "GET / (locale redirect)" "307"
      expect_header "GET /" "location" "/en"

      # 1b. www→apex 301 at the edge (the viewer-request injection) — the
      # single riskiest new edge behavior; testable pre-DNS via the Host
      # header, exactly like every other probe. Encoded query value included
      # so a double-encoding regression in the injection surfaces here.
      probe_once GET "/some-path?q=a%20b" "www.my-quilty.com"
      if [ -z "$probe_status" ]; then
        sleep 5
        probe_once GET "/some-path?q=a%20b" "www.my-quilty.com"
      fi
      if [ "$probe_status" = "301" ]; then
        note "OK: www 301 → apex"
        expect_header "GET www" "location" "https://my-quilty.com/some-path"
        expect_header "GET www" "strict-transport-security" "max-age"
      elif [ "$probe_status" = "403" ] || [ "$probe_status" = "400" ]; then
        # Pre-cutover state: the www alias still lives on the OLD redirect
        # distribution, so the main distro rejects the Host. Informational
        # until the associate-alias cutover runs (go-live runbook).
        note "INFO: www alias not on this distribution yet (${probe_status}) — pre-cutover state."
      else
        gate_fail "GET www returned ${probe_status:-<none>}, want 301 (post-cutover) or 400/403 (pre-cutover)"
      fi

      # 2. Home renders with the full security-header stack + a real body.
      probe GET "/en"
      expect_status "GET /en" "200"
      expect_header "GET /en" "content-security-policy-report-only" ""
      expect_header "GET /en" "strict-transport-security" ""
      if [ -n "${SENTRY_CSP_REPORT_URI:-}" ]; then
        expect_header "GET /en" "reporting-endpoints" "csp-endpoint"
        expect_header "GET /en" "content-security-policy-report-only" "report-to"
      fi
      printf '%s' "$probe_body" | grep -qi "quilty" || gate_fail "GET /en body lacks the 'Quilty' marker (error shell?)"

      # 3. Contact page — the runtime-secret tripwire: 200 + a CSRF cookie mint.
      probe GET "/en/contact"
      expect_status "GET /en/contact" "200"
      expect_header "GET /en/contact" "set-cookie" "__Host-quilty_csrf"

      # 4. Health + readiness. /api/ready is 503 BY DESIGN until the live
      # dependency probes are wired (it returns synthetic-ok deps + degraded);
      # asserting 503 pins that contract so an accidental flip is caught.
      probe GET "/api/health"
      expect_status "GET /api/health" "200"
      probe GET "/api/ready"
      expect_status "GET /api/ready (degraded by design)" "503"

      # 5. 404 still renders (routing sane).
      probe GET "/definitely-not-a-page-smoke-probe"
      expect_status "GET <missing page>" "404"

      # 6. Contact POST executes end-to-end to a DETERMINISTIC 400 (Zod
      # validation, pre-secrets) — proves the server container constructs
      # (fail-closed guard not tripped) and the route handler runs. A 500
      # here is the missing-env incident class.
      probe POST "/api/contact" -H "content-type: application/json" --data '{}'
      expect_status "POST /api/contact {} (validation reject)" "400"

      # 7. SEO index posture (the original gate).
      probe GET "/en"
      tag="$(printf '%s\n' "$probe_headers" | grep '^x-robots-tag:' || true)"
      if [ "$SITE_FORCE_NOINDEX" = "true" ]; then
        case "$tag" in
          *noindex*) note "OK: placeholder phase — /en is noindex." ;;
          *) gate_fail "SITE_FORCE_NOINDEX=true but /en missing noindex." ;;
        esac
      else
        case "$tag" in
          *noindex*) gate_fail "serving noindex but SITE_FORCE_NOINDEX!=true — blocking." ;;
          *) note "OK: launched posture — /en is indexable." ;;
        esac
      fi

      if [ "$gate_failures" -gt 0 ]; then
        note "SMOKE GATE FAILED (${gate_failures} probe failure(s))."
        deploy_rc=1
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
if [ "$deploy_rc" -ne 0 ]; then
  last_good="$(git log --format='%h' -n 1 HEAD~1 2>/dev/null || echo '<sha>')"
  echo "ROLLBACK (no alias rollback exists for CloudFront+OpenNext — rollback IS a"
  echo "redeploy of the last good commit; docs/runbook/rollback.md):"
  echo "    git stash && git checkout ${last_good} && scripts/website-deploy-local.sh --execute"
fi
if [ -n "$cf_domain" ]; then
  echo "CloudFront distribution domain (for runbook B3 validate + B4 DNS cutover):"
  echo "    ${cf_domain}"
  echo "Next: validate https://${cf_domain} (curl -H 'Host: my-quilty.com'), then set"
  echo "      website_cloudfront_domain=\"${cf_domain}\" in dns/ and apply (B4)."
fi
echo "==============================================================="
exit "$deploy_rc"
