#!/usr/bin/env node
/* eslint-disable no-console -- CLI script; console is the canonical output channel. */
/**
 * OpenAPI → TypeScript codegen (ADR-0003 + ADR-0017).
 *
 * Reads the Rust backend's two OpenAPI 3.1 specs from the cross-repo
 * `quilty-aws` checkout and emits `paths` + `components` types into
 * `packages/shared-types/src/generated/`. The website's BFF + Server
 * Actions consume the types via `@quilty/shared-types`.
 *
 * Per the M1.6 plan: this is the LOCAL codegen pre-CI. The full
 * publish-shared-types.yml CI workflow lives in `quilty-aws/.github/
 * workflows/` (M5 activation per ADR-0003); until then, running this
 * script locally before a release-candidate keeps the shared-types
 * package fresh.
 *
 * Usage:
 *   node apps/web/scripts/codegen-api-types.mjs
 *
 * Env:
 *   QUILTY_AWS_PATH — override for the quilty-aws repo location
 *                     (default: ../quilty-aws relative to this repo)
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '../../..');

const quiltyAwsPath = process.env.QUILTY_AWS_PATH ?? resolve(repoRoot, '../quilty-aws');

const SPECS = [
  {
    source: resolve(quiltyAwsPath, 'docs/auth/auth_v2_openapi.yaml'),
    cached: resolve(repoRoot, 'packages/shared-types/spec/auth_v2_openapi.yaml'),
    output: resolve(repoRoot, 'packages/shared-types/src/generated/auth.ts'),
  },
  {
    source: resolve(quiltyAwsPath, 'docs/api/openapi.yaml'),
    cached: resolve(repoRoot, 'packages/shared-types/spec/sync_openapi.yaml'),
    output: resolve(repoRoot, 'packages/shared-types/src/generated/sync.ts'),
  },
];

let failed = false;

for (const { source, cached, output } of SPECS) {
  if (!existsSync(source)) {
    console.warn(`[codegen] WARN — spec not found at ${source}; skipping.`);
    failed = true;
    continue;
  }

  // Copy the spec into the website repo's `packages/shared-types/spec/`
  // so the workspace is self-contained at commit time (the codegen
  // output + the source-of-truth YAML travel together).
  mkdirSync(dirname(cached), { recursive: true });
  copyFileSync(source, cached);

  mkdirSync(dirname(output), { recursive: true });

  console.log(
    `[codegen] ${cached.replace(repoRoot + '/', '')} → ${output.replace(repoRoot + '/', '')}`,
  );
  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      'web',
      'exec',
      'openapi-typescript',
      cached,
      '-o',
      output,
      '--immutable',
      '--enum',
    ],
    { stdio: 'inherit', cwd: repoRoot },
  );

  if (result.status !== 0) {
    console.error(`[codegen] FAIL — openapi-typescript exited ${result.status} on ${source}`);
    failed = true;
  }
}

if (failed) {
  console.error(
    '[codegen] One or more specs failed to generate. Verify QUILTY_AWS_PATH points at a checked-out quilty-aws clone.',
  );
  process.exit(1);
}

console.log('[codegen] OK — generated types are at packages/shared-types/src/generated/*.ts');
