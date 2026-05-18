# Harness audit — quilty-website (M1 pre-scaffold)

> Reconstructed from the agent's deliverable returned during the round-5 review session
> on 2026-05-17 (the agent wrote a stub plan file and returned the full audit in chat).
> Reflects the harness state at that point; should be kept in sync if `.claude/` changes.

---

## Section 1: Pre-tool guard inventory

### `guard-bash.sh` (PreToolUse, matcher `Bash`, timeout 10s)

All matches operate on `$norm` (whitespace-collapsed copy of `tool_input.command`). All blocks exit code **2** (stderr surfaced to Claude). `set -euo pipefail`.

| # | Pattern | Block message |
|---|---|---|
| 1 | `--no-verify` anywhere | "pre-commit hooks are load-bearing for HIPAA + signing" |
| 2 | `--no-gpg-sign` anywhere | "commits must be SSH-signed" |
| 3 | `git config` or `git -c …` setting `commit.gpgsign=false`, `tag.gpgsign=false`, `user.signingkey`, `gpg.format`, or `gpg.ssh.*` | "git signing config mutation forbidden" |
| 4 | `git push` with `--force`, `--force-with-lease`, `-f`, or a `+ref:ref` refspec | "force-push forbidden (any flag form)" — **NOTE:** `--force-with-lease` is in `permissions.ask` but blocked here — the hook wins; contradiction to fix |
| 5 | `git push origin {main,master,production}` in any form | "direct push to protected branch forbidden" |
| 6 | `git reset --hard origin*` or `git reset --hard HEAD~*` | "destructive reset" |
| 7 | `sst deploy --stage prod*`/`production*` (with or without `pnpm` prefix) | "production deploy requires explicit user authorization" |
| 8 | `sst remove` / `pnpm sst remove` (any form, **including with `--stage`**) | "use /sst-destroy-previews skill" — **BUG: this blocks the skill itself** |
| 9 | `rm -rf` (any flag perm of `-r/-R/-f` / `--recursive --force`) targeting `/`, `~`, `$HOME`, `.git`, `/private`, `/Users/<user>` | "catastrophic delete" |
| 10 | `chmod` with `777`, `a+w`, `o+w`, `g+w,o+w`, `ugo+w` (with/without `-R`) | "world-writable permissions forbidden" |
| 11 | `(curl\|wget\|fetch) … \| (sh\|bash\|zsh\|fish\|python\|node\|perl)` (with optional `sudo`) | "pipe-to-shell forbidden" |
| 12 | Process substitution: `bash <(curl …)` | "process-substitution download-then-exec forbidden" |
| 13 | `cat/less/more/head/tail/bat/od/xxd/hexdump/strings/base64/grep/rg/ag` (or `$(cat …)`) reading `~/.ssh/`, `~/.aws/credentials`, `.env`, `.env.*`, `/etc/shadow`, `/private/etc/master.passwd` | "use Read tool which is policy-gated" |
| 14 | `git commit` triggers `gitleaks git --staged --no-banner --redact --exit-code 1` if `gitleaks` is on PATH | "gitleaks detected potential secret/PHI" — **silently no-op if gitleaks not installed** |

Command-start anchor: `CS='(^|[;&|\`(])[[:space:]]*'` — patterns trigger across `;`, `&&`, `||`, `|`, `$(...)`, backticks. Wider than just leading whitespace.

### `guard-write.sh` (PreToolUse, matcher `Write|Edit|MultiEdit`, timeout 5s)

Reads `tool_input.file_path`. Empty → exit 0. All blocks exit code **2**. Glob match (case statement), **not Edit-vs-Write differentiated** — applies to all three tools.

| # | Glob pattern | Block reason |
|---|---|---|
| 1 | `*/.claude/settings.json` or `*/.claude/settings.local.json` | "edits to Claude Code settings require human review" |
| 2 | `*/.claude/hooks/*.sh` or `*/.claude/hooks/*` | "edits to .claude/hooks/ require human review" |
| 3 | `*/.claude/agents/*.md` | "agent scopes are part of the security boundary" |
| 4 | `*/.claude/skills/*/SKILL.md` or `*/.claude/skills/*.md` | "skill instructions can change the policy posture" |
| 5 | `*/.claude/statusline.sh` or `*/.claude/CURRENT_PHASE` | "harness operational files require human review" |
| 6 | `*/apps/web/components/ui/*` | "shadcn primitives — wrap don't edit per D18" |

**Critical M1 finding:** the `components/ui/*` block triggers on **first creation** by Claude's `Write` tool. However, when `pnpm exec shadcn add <component>` writes files via its own CLI subprocess, the files are created by the shadcn CLI (not via Claude's `Write` tool) — so the PreToolUse Write hook does NOT fire. **shadcn `add` works fine; Claude attempting to directly Write a file under `components/ui/` is blocked.**

### `guard-prompt.sh` (UserPromptSubmit, timeout 10s)

Bypass tags `[allow-secret]`, `[allow-pii]`, `[allow-all]` short-circuit at line 16. Patterns: AWS access key, AWS secret key, GitHub PATs, OpenAI/Anthropic/Slack/Stripe live keys, PEM private key block, JWT shape, US SSN, 16-digit credit-card shape. **No PHI-text scan** — only well-known secret/PII shapes.

### `guard-test-author.sh` (test-author agent only)

Allow-list: `*/tests/*`, `*/__tests__/*`, `*.{test,spec}.{ts,tsx,js}`. Everything else → exit 2. Enforced even though the agent has Write/Edit tools.

---

## Section 2: Post-tool hook behavior

### `format-and-lint.sh` (PostToolUse, matcher `Write|Edit|MultiEdit`, timeout 60s)

- `set -uo pipefail` deliberately omits `-e` so the hook **never** exits non-zero (PostToolUse must exit 0)
- Bails on missing file or missing root `package.json` (line 20) — **guards the pre-M1 state**
- Runs on `.ts|.tsx|.js|.jsx|.mjs|.cjs|.css|.json|.md|.mdx`: `pnpm exec prettier --write --log-level=warn <file>`; also `pnpm exec eslint --fix --quiet <file>` for JS/TS
- Failures route to stderr ("PostToolUse cannot block; Claude please review")

### `typecheck-affected.sh` (PostToolUse, matcher `Write|Edit|MultiEdit`, timeout 90s)

- Same no-fail pattern (no `-e`)
- Bails on non-`.ts(x)`, missing `package.json`, OR neither `pnpm-workspace.yaml` nor `pnpm-lock.yaml` present — **guards pre-M1**
- Workspace mapping (line 34-38): path contains `apps/web/` → `pnpm --filter web typecheck`; `packages/ui/` → `pnpm --filter @quilty/ui typecheck`; `packages/shared-types/` → `pnpm --filter @quilty/shared-types typecheck`
- **Coupled invariant:** workspace `name:` fields MUST be `web`, `@quilty/ui`, `@quilty/shared-types`

---

## Section 3: SessionStart context injected (`session-context.sh`)

Fires on `startup|resume|clear|compact`. Timeout 15s. Outputs JSON `hookSpecificOutput.additionalContext`: **Branch**, **Dirty file count**, **Ahead/Behind upstream**, **Phase** (from `.claude/CURRENT_PHASE`), **Recent commits** (5), **Policy summary** (factual, not imperative — per the in-script comment about prompt-injection defenses).

---

## Section 4: Permissions analysis

`defaultMode: "acceptEdits"`. `disableBypassPermissionsMode: "disable"` — bypass-permissions mode cannot be enabled.

### Operations needing new permissions for M1 scaffold

| Operation | Status | Permission needed |
|---|---|---|
| `pnpm install` (first run) | **allow** | none |
| `pnpm exec shadcn init` | **allow** (`pnpm exec shadcn *`) | none |
| `pnpm exec shadcn add <component>` | **allow** | none |
| `pnpm dlx sst@latest init` | **ask** (`pnpm dlx:*`) | user OK once |
| `pnpm add <pkg>` | **ask** | user OK per package — bulk adds will be noisy |
| `pnpm sst dev/diff/secret list` | **allow** | none |
| `pnpm sst deploy --stage <non-prod>` | **ask** | user OK |
| `pnpm sst deploy --stage prod*` | **deny** | unreachable (use CI) |
| `git commit` | **ask** + gitleaks gate + signing | user OK + gitleaks-clean + signed |
| `git push` (non-protected branches) | **ask** | user OK |
| `git push origin main` | **deny** | unreachable |
| Husky `pnpm exec husky init` | **not allowlisted** | need `Bash(pnpm exec husky *)` added |
| `pnpm exec turbo *` | **not allowlisted** | need `Bash(pnpm exec turbo *)` added |
| Writing files in `.husky/` | **not in guard-write blocklist** | none |

---

## Section 5: MCP server inventory

| Name | Transport | Env var | Provides |
|---|---|---|---|
| `aws-docs` | stdio | none | `search_documentation`, `read_documentation`, `read_sections`, `recommend` |
| `context7` | http | `CONTEXT7_API_KEY` | Version-pinned library docs |
| `github` | http | `GITHUB_PAT` | PR/issue/run ops |
| `sentry` | http | OAuth first-connect | Error/RUM data |
| `playwright` | stdio | none | Browser automation |

Missing tokens → MCP server starts but fails on first auth-required call.

---

## Section 6 + 7: Sub-agents + Skills

All 8 reviewers + 10 skills inventoried. Reviewers are read-only (Read/Grep/Glob/Bash). `test-author` has Write/Edit on test paths only.

Skills with `disable-model-invocation: true` (user-only): `audit-a11y`, `audit-csp`, `sst-destroy-previews`, `sst-preview`.

---

## Section 8: Hook failure modes during M1 scaffold

All hooks gracefully bail when the workspace isn't fully scaffolded yet (no root `package.json`, no workspace lockfile). Format/lint/typecheck hooks emit stderr noise on misconfigured invocations but never block.

`pnpm exec shadcn add` writes via CLI subprocess — bypasses Write guard cleanly. Direct Claude `Write` calls to `apps/web/components/ui/*` are blocked.

---

## Section 9: M1 scaffold workflow plan

Order optimized to minimize hook noise and permission prompts:

1. **Bootstrap (one-time, manual):** SSO login, env vars, gitleaks installation, SSH signing key
2. **Repo-root scaffolding (Claude Write):** pnpm-workspace.yaml, root package.json, turbo.json, tsconfig.base.json — no hooks block
3. **First `pnpm install`:** allowlist; no prompt
4. **App workspace:** `apps/web/package.json` with `typecheck` script BEFORE writing any TS file
5. **Tailwind v4 + shadcn init:** `pnpm add tailwindcss@4 @tailwindcss/postcss` (ask), `pnpm exec shadcn init` (allow), `pnpm exec shadcn add ...` (allow)
6. **Workspace packages:** `packages/shared-types/package.json` empty target (`packages/ui/` dropped per D69)
7. **SST scaffold:** write `sst.config.ts` by hand (cheaper for permission noise than `pnpm dlx`)
8. **First commit + push at sprint boundary:** ask + gitleaks + SSH-signed + manual co-author trailer

---

## Synthesis

### TOP-5 harness behaviors that constrain M1 scaffold

1. **Every dependency add prompts.** `pnpm add:*`, `pnpm dlx:*` in asklist. M1 will need ~15-20 confirmations — batch into 5-6 grouped commands.
2. **`guard-bash.sh` blocks `--force-with-lease`** despite asklist allowing it. Hook wins. Remove the asklist entry to fix the contradiction.
3. **`sst-destroy-previews` skill is dead on arrival.** `guard-bash.sh` line 66-67 blocks all `sst remove` variants including `--stage`. Must add `--stage <non-prod>` exception. **User patch required** (Claude can't edit `.claude/hooks/`).
4. **`pnpm exec *` allowlist is enumerated.** Husky/Turbo fall through to ask. Add `Bash(pnpm exec husky *)` and `Bash(pnpm exec turbo *)` to allowlist.
5. **PostToolUse hooks are root-anchored.** `format-and-lint.sh` runs prettier/eslint from repo root; root-level configs (`prettier.config.mjs`, `eslint.config.mjs`) are required for both `apps/web` and `packages/*`.

### Permissions to add before scaffold (in `settings.local.json`)

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm exec husky *)",
      "Bash(pnpm exec turbo *)",
      "Bash(pnpm exec husky-init)",
      "Bash(pnpm dlx create-next-app *)",
      "Bash(pnpm dlx sst@latest init)",
      "Bash(pnpm dlx sst init)"
    ]
  }
}
```

### Sequencing requirements

1. Root `package.json` MUST exist before either post-tool hook stops being a no-op
2. `pnpm-workspace.yaml` OR `pnpm-lock.yaml` MUST exist before `typecheck-affected.sh` stops being a no-op
3. Workspace `name:` fields MUST be exactly `web`, `@quilty/ui`, `@quilty/shared-types` — hardcoded in typecheck hook
4. `typecheck` script MUST exist in each workspace `package.json` before TS files are written
5. shadcn `add` (subprocess) is the only way to land files in `apps/web/components/ui/` — direct Claude Writes blocked
6. Co-authored-by trailer is manual (`includeCoAuthoredBy: false`) — Claude must append it in every commit body

### Harness gaps to fix in flight

- **Gap 1 (load-bearing):** `guard-bash.sh` `sst remove` rule makes `/sst-destroy-previews` unusable
- **Gap 2:** `--force-with-lease` contradiction between asklist and `guard-bash.sh`
- **Gap 3:** `gitleaks` PreCommit gate is silent if `gitleaks` not installed
- **Gap 4:** `guard-prompt.sh` only catches secrets, not PHI text
- **Gap 5:** `pnpm exec *` allowlist enumeration is brittle (add Husky/Turbo before they're needed)
- **Gap 6:** `format-and-lint.sh` doesn't filter by workspace path — runs prettier/eslint at root for every file
