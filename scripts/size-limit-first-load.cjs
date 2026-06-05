/**
 * Authoritative shared-first-load file set for the size-limit budgets.
 *
 * Why this exists: a route's real first-load JS is the route's own leaf
 * chunk PLUS the shared chunks the browser downloads on every cold visit
 * (framework + runtime + shared vendor split). The shared set must be read
 * from Next's own `build-manifest.json` — NOT guessed with hardcoded
 * `framework-*` / `main-*` globs.
 *
 * The reason hardcoded globs are wrong here: Next 16's webpack build emits
 * the React + framework chunk under a content-hash name (e.g.
 * `9e2e33d7-<hash>.js`), not `framework-<hash>.js`, and splits a second
 * shared vendor chunk (the Sentry/OpenTelemetry instrumentation graph).
 * Globs of `framework-*`/`main-*`/`webpack-*` matched only `webpack-*` +
 * `main-app-*` — ~5 kB gz of an actual ~127 kB gz shared baseline — so
 * every per-route first-load entry undercounted by ~122 kB gz and the
 * budgets were effectively measuring the leaf chunk alone.
 *
 * `rootMainFiles` + `polyfillFiles` are the manifest fields Next populates
 * with exactly the files loaded ahead of any route. Reading them keeps the
 * measurement correct across Next/webpack chunk-naming changes.
 *
 * Verification: this is build-config tooling (peer to `.size-limit.cjs`
 * and `.dependency-cruiser.cjs`). It is exercised on every CI run by
 * `pnpm size`, which fails the build if this throws or if the corrected
 * measurement breaches a budget. The fail-closed branches below guarantee
 * a missing/empty manifest aborts the run rather than silently
 * undercounting.
 */
const fs = require('fs');
const path = require('path');

// Resolve from this file's location so the helper is cwd-independent
// (`pnpm size` runs from the repo root; the size-limit-action also invokes
// it from the base-branch checkout).
const NEXT_DIR = path.join(__dirname, '..', 'apps', 'web', '.next');
const BUILD_MANIFEST = path.join(NEXT_DIR, 'build-manifest.json');

// Path prefix size-limit consumes (repo-root-relative, matching the
// per-route globs in .size-limit.cjs).
const PUBLIC_PREFIX = 'apps/web/.next/';

/**
 * @returns {{ sharedMain: string[], polyfills: string[] }}
 *   sharedMain — shared chunks every modern browser downloads on first
 *     load (framework + webpack runtime + shared vendor + main-app),
 *     excluding polyfills.
 *   polyfills — legacy-only `nomodule` polyfill bundle, budgeted on its
 *     own so a regression is still caught without inflating the
 *     modern-browser first-load number.
 *
 * Fail-closed: throws (rather than returning an empty/partial set that
 * would silently undercount) if the manifest is missing or malformed.
 */
function readSharedFirstLoad() {
  if (!fs.existsSync(BUILD_MANIFEST)) {
    throw new Error(
      `.size-limit.cjs: ${BUILD_MANIFEST} not found. Run \`pnpm --filter web build\` before \`pnpm size\`.`,
    );
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(BUILD_MANIFEST, 'utf8'));
  } catch (cause) {
    throw new Error(`.size-limit.cjs: failed to parse ${BUILD_MANIFEST}: ${cause.message}`);
  }

  const rootMainFiles = Array.isArray(manifest.rootMainFiles) ? manifest.rootMainFiles : [];
  const polyfillFiles = Array.isArray(manifest.polyfillFiles) ? manifest.polyfillFiles : [];

  if (rootMainFiles.length === 0) {
    throw new Error(
      '.size-limit.cjs: build-manifest.json rootMainFiles is empty — the shared first-load ' +
        'baseline would be undercounted. Refusing to measure (fail-closed).',
    );
  }

  const toPublicPath = (file) => `${PUBLIC_PREFIX}${file}`;
  return {
    sharedMain: rootMainFiles.map(toPublicPath),
    polyfills: polyfillFiles.map(toPublicPath),
  };
}

module.exports = { readSharedFirstLoad };
