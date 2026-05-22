# M1 Post-Scaffold Checklist — manual actions Claude cannot perform

> The M1 sprint (Commits 1-12) shipped 12 commits of docs + scaffold +
> spines via Claude Code. The harness deliberately blocks Claude from
> editing certain files. **You** need to perform the steps below before
> the next sprint starts.

## 1. Patch `.claude/hooks/guard-bash.sh` for `sst remove --stage <non-prod>`

The harness gap discovered in Round-5 audit: `guard-bash.sh` line 66-67
blocks every `sst remove` invocation including stage-scoped ones, which
makes the `/sst-destroy-previews` skill (and the
`deploy.yml cleanup-preview` job under local-test scenarios) impossible
to run from Claude sessions.

The patch carves an exception for `--stage` arguments that don't match
`prod*` or `production*`. Production removal stays blocked.

**Apply this patch manually** (Claude can't edit `.claude/hooks/*`):

```diff
--- a/.claude/hooks/guard-bash.sh
+++ b/.claude/hooks/guard-bash.sh
@@ -63,8 +63,12 @@ if [[ "$norm" =~ ... sst deploy --stage prod ... ]]; then
   block "production deploy requires explicit user authorization"
 fi

-if [[ "$norm" =~ ${CS}(pnpm[[:space:]]+)?sst[[:space:]]+remove([[:space:]]|$) ]]; then
-  block "sst remove destroys stack resources; use /sst-destroy-previews skill for preview cleanup."
+# Allow `sst remove --stage <non-prod>` for preview cleanup.
+# Still block: bare `sst remove`, `sst remove --stage prod*` / `production*`.
+if [[ "$norm" =~ ${CS}(pnpm[[:space:]]+)?sst[[:space:]]+remove([[:space:]]+--stage[[:space:]]+(prod|production)[a-zA-Z0-9_-]*|[[:space:]]*$) ]]; then
+  block "sst remove against prod stage (or stage-less) destroys production-account resources; explicit user action required."
+fi
```

After patching:

1. `chmod +x .claude/hooks/guard-bash.sh` (preserve executable bit)
2. Test locally: `echo '{"tool_input":{"command":"pnpm sst remove --stage preview-pr-42"}}' | python3 .claude/hooks/guard-bash.sh` should exit 0 (allowed).
3. Test the block still works: `echo '{"tool_input":{"command":"pnpm sst remove --stage production"}}' | python3 .claude/hooks/guard-bash.sh` should exit 2 (blocked).

## 2. Bump `.claude/CURRENT_PHASE`

`guard-write.sh` blocks Claude from editing this file. **You** bump
when M1 is accepted and we move into M2 prep:

    echo M2 > .claude/CURRENT_PHASE
    git add .claude/CURRENT_PHASE
    git commit -m "chore(claude): bump phase M1 -> M2"

## 3. Append `.claude/settings.local.json` permission additions

The pre-commit chain in Commit 9 introduced `pnpm exec husky` +
`pnpm exec turbo` invocations. The harness allowlist in
`.claude/settings.json` covers `pnpm exec prettier`, `pnpm exec eslint`,
`pnpm exec tsc`, etc. — but does NOT include the two new commands.

Append to `.claude/settings.local.json` (this file is gitignored;
Claude can write to it; you copy the snippet below):

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm exec husky *)",
      "Bash(pnpm exec turbo *)",
      "Bash(pnpm exec lint-staged *)",
      "Bash(pnpm exec velite *)",
      "Bash(pnpm exec playwright *)",
      "Bash(pnpm exec vitest *)",
      "Bash(pnpm dlx sst@latest init)",
      "Bash(pnpm dlx create-next-app *)"
    ]
  }
}
```

## 4. Create `.env.example` from the runbook template

The harness deny list (`.claude/settings.json` `deny` block) prohibits
Claude from writing any `.env.*` file. The template below should land
at `apps/web/.env.example` (commit it; `.gitignore` excludes only
`.env.local` not `.env.example`).

```env
# Quilty Website — environment variable template.
# Copy to apps/web/.env.local for local dev. Never commit .env.local.

# ── Site config ────────────────────────────────────────────────────
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# ── Sentry (D42a) — public DSN baked into client bundle ────────────
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_INGEST_HOST=https://*.ingest.us.sentry.io
SENTRY_CSP_REPORT_URI=

# ── PostHog (D42b) — activated at M3 with consent ──────────────────
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_PROJECT_API_KEY=

# ── Cognito (D6) — wired in M6 ─────────────────────────────────────
COGNITO_USER_POOL_ID=
COGNITO_USER_POOL_REGION=us-east-1
COGNITO_CLIENT_ID=
COGNITO_CLIENT_SECRET=
COGNITO_DOMAIN=https://auth.my-quilty.com

# ── Feature flags (D43) ────────────────────────────────────────────
FEATURE_FLAG_NEW_HOMEPAGE_HERO=false
FEATURE_FLAG_EXPERIMENTAL_SUBSCRIPTION=false
FEATURE_FLAG_POSTHOG_CLIENT_ENABLED=false
FEATURE_FLAG_SENTRY_REPLAY_BOOST=false

# ── Security (D58 + D60) ───────────────────────────────────────────
HSTS_PHASE=m1

# ── AWS (SST 4.x) ──────────────────────────────────────────────────
AWS_PROFILE=quilty-dev
AWS_REGION=us-east-1
SST_STAGE=dev
SST_DEPLOY_GATE_PASSED=false
```

## 5. Authorize the sprint-boundary push

The plan held all 12 M1 commits locally (per
`feedback_push_per_phase`). When you've reviewed the local commit
batch, push manually:

    git push origin main

Once pushed, CI activates: lint + typecheck + test + e2e + build run
on the GitHub Actions runner. Address any CI failures before continuing
to the next sprint.

## 6. Install Husky on first clone (one-time per workstation)

`prepare: "husky"` in root `package.json` runs Husky's install command
during `pnpm install`. On the first clone:

    pnpm install
    # Husky auto-installs git hooks via `prepare`. Verify:
    ls -la .git/hooks/pre-commit
    # Should be a symlink or thin wrapper pointing into .husky/

## 7. Run the full pre-push smoke test

After Husky installs:

    pnpm install --frozen-lockfile
    pnpm typecheck   # green
    pnpm lint        # green
    pnpm test        # green (vitest)
    pnpm format:check  # green
    pnpm --filter web exec velite build --config ../../velite.config.ts
    pnpm build       # green (Next.js build)

Optional but recommended:

    pnpm --filter web exec playwright install --with-deps chromium webkit
    pnpm test:e2e    # green (full smoke + security + a11y + seo)

## 8. Configure GitHub repository settings before activating deploys

For when the next sprint flips the `if: false` gates in `deploy.yml`:

- [ ] Create GitHub Environments: `preview` + `production`
- [ ] Add per-environment secrets:
  - `preview`: `AWS_DEPLOY_ROLE_ARN_PREVIEW`
  - `production`: `AWS_DEPLOY_ROLE_ARN_DEV`, `SENTRY_AUTH_TOKEN`
- [ ] Add per-environment vars:
  - both: `NEXT_PUBLIC_SENTRY_DSN`
  - `preview`: `NEXT_PUBLIC_SITE_URL_PREVIEW`
- [ ] Set branch protection on `main`:
  - Require status checks before merge: `lint`, `typecheck`, `test`,
    `test-e2e`, `build`
  - Require signed commits ✓
  - Require linear history ✓
  - Require pull request reviews (1 approval) — when team grows
- [ ] Configure environment approval gates:
  - `production`: required reviewer = repo owner (one-time approval
    per main-push deploy)
  - `preview`: no approval required (auto-deploy on PR)

## 9. Pre-launch external accounts (later, but track now)

These don't block M1 closeout but are needed before the next sprint
can deploy meaningfully:

- [ ] Sentry organization + project created → DSN populated
- [ ] Sentry BAA signed (Business tier; verify before sending any
      replay data per D42a)
- [ ] PostHog Cloud organization + Boost add-on activated → DSN
      populated (activates at M3 with ConsentState)
- [ ] PostHog BAA signed
- [ ] GitHub Packages npm registry token scoped to read
      `@quilty/api-types` (when OpenAPI codegen activates at M5)
- [ ] Cloudflare Turnstile site key/secret (M6 auth signup form)

## 10. Verify nothing broken before declaring M1 done

After steps 1-9:

    git log --oneline -12 | head -12
    # Should show f591146 → ... → 986849c (with this commit + any
    # follow-up patches)

    pnpm install --frozen-lockfile
    pnpm typecheck && pnpm lint && pnpm test && pnpm build
    # All green.

    git status
    # Clean (no uncommitted changes)

If all green: M1 sprint is officially closed. Bump
`.claude/CURRENT_PHASE` to `M2` (step 2 above) and we move on.

## 11. Provision the `security@my-quilty.com` mailbox before the public DNS cut-over

The static `/.well-known/security.txt` file declares
`Contact: mailto:security@my-quilty.com`. The mailbox must exist before
the file becomes publicly reachable — researchers + automated tooling
will start emailing the moment the file is crawled. **Pre-merge gate
for the public-DNS deploy:**

1. Provision `security@my-quilty.com` via the managed-mailbox provider
   (M365 today per the BAA inventory at `docs/runbook/baa-inventory.md`;
   cross-repo provisioning lives in `quilty-m365/`).
2. Verify a test message reaches the security on-call mailbox.
3. Document the SLA in the on-call runbook (3 business days
   acknowledgement per the policy page).

Until the mailbox exists, route `security@` to an already-monitored
inbox via a temporary alias so no report falls into a silent-discard
window.

## Things to expect at the M2 kickoff

- [ ] Real content lands in the 7 placeholder marketing pages
- [ ] Lighthouse CI wired (perf budget guard)
- [ ] First real Sentry test error captured
- [ ] First real Web Vitals data point appears in CloudWatch + Sentry
- [ ] Marketing block library exercised by composing a real page from
      MDX frontmatter via `<BlocksRenderer>`
- [ ] M3 identity-discovery work begins (voice + visual iteration —
      brand palette, typography, hero variants)
