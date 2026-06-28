#!/usr/bin/env bash
# Typecheck sst.config.ts against the generated SST platform types.
#
# Why a dedicated script: sst.config.ts lives at the repo root, is NOT in any
# workspace tsconfig `include`, and is excluded from `type-coverage` — so the
# normal `turbo run typecheck` never checks it. Its only other gate is
# `sst deploy`/`sst diff` (which compile it), i.e. deploy time. This script is
# the PR-time early-warning so config type errors (e.g. a wrong CdnArgs field)
# surface in review instead of at the first deploy.
#
# Requires the generated `.sst/platform/` types (the `/// <reference>` at the
# top of sst.config.ts). Run `sst install` first in CI; locally they exist
# after any `sst` command. We filter the tsc output to fail ONLY on OUR config
# sources — sst.config.ts AND the infra/ modules it imports (infra/monitoring.ts):
# under a standalone tsc the vendored SST platform sources can emit @types/node
# version-skew errors that are not our concern and are not how SST itself
# compiles the config. infra/monitoring.ts is excluded from `turbo run typecheck`
# (not in any workspace tsconfig include), so this is its only PR-time gate too.
set -uo pipefail

if [ ! -f .sst/platform/config.d.ts ]; then
  echo "SKIP: .sst/platform not present — run 'pnpm sst install' first." >&2
  exit 0
fi

# tsc follows imports, so passing sst.config.ts also compiles infra/monitoring.ts.
out="$(npx tsc --noEmit --skipLibCheck --strict \
  --target ES2022 --module ESNext --moduleResolution Bundler \
  sst.config.ts 2>&1 || true)"

# Fail on diagnostics in either our config entrypoint or the infra/ modules it pulls
# in. Anchored to line-start so a node_modules path that merely CONTAINS `/infra/…ts(`
# can't false-match; the char class allows nested infra/ paths too.
ours='^(sst\.config\.ts|infra/[A-Za-z0-9_/.-]+\.ts)\('
if printf '%s\n' "$out" | grep -Eq "$ours"; then
  printf '%s\n' "$out" | grep -E "$ours"
  echo "FAIL: sst.config.ts (or an infra/ module it imports) has type errors (above)." >&2
  exit 1
fi

echo "OK: sst.config.ts + infra/ typecheck clean."
