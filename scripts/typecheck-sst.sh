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
# after any `sst` command. We filter the tsc output to fail ONLY on
# `sst.config.ts` diagnostics: under a standalone tsc the vendored SST platform
# sources can emit @types/node version-skew errors that are not our concern and
# are not how SST itself compiles the config.
set -uo pipefail

if [ ! -f .sst/platform/config.d.ts ]; then
  echo "SKIP: .sst/platform not present — run 'pnpm sst install' first." >&2
  exit 0
fi

out="$(npx tsc --noEmit --skipLibCheck --strict \
  --target ES2022 --module ESNext --moduleResolution Bundler \
  sst.config.ts 2>&1 || true)"

if printf '%s\n' "$out" | grep -q 'sst\.config\.ts('; then
  printf '%s\n' "$out" | grep 'sst\.config\.ts('
  echo "FAIL: sst.config.ts has type errors (above)." >&2
  exit 1
fi

echo "OK: sst.config.ts typecheck clean."
