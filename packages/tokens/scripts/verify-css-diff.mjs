#!/usr/bin/env node
/**
 * verify-css-diff.mjs — byte-identical guard.
 *
 * Compares `packages/tokens/dist/web/globals-generated.css` against
 * `apps/web/app/globals.css` and exits non-zero if they differ. Used
 * as the migration safety check for the D.2 lift commit per ADR-0020.
 *
 * After adoption (the next commit in the migration), apps/web's
 * globals.css imports from the generated file; this script is kept
 * to detect drift between the JSON sources and the committed
 * generated output (CI runs `pnpm --filter @quilty/tokens build` then
 * this script — if the JSON sources changed without re-running the
 * build, the diff surfaces immediately).
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '../../..');

const GENERATED = resolve(repoRoot, 'packages/tokens/dist/web/globals-generated.css');
const COMMITTED = resolve(repoRoot, 'apps/web/app/globals.css');

const [generated, committed] = await Promise.all([
  readFile(GENERATED, 'utf8'),
  readFile(COMMITTED, 'utf8'),
]);

if (generated === committed) {
  console.log('verify-css-diff: byte-identical ✓');
  process.exit(0);
}

console.error('verify-css-diff: DRIFT — generated CSS differs from committed globals.css');
console.error(`  generated: ${GENERATED} (${generated.length} bytes)`);
console.error(`  committed: ${COMMITTED} (${committed.length} bytes)`);

const genLines = generated.split('\n');
const comLines = committed.split('\n');
const max = Math.max(genLines.length, comLines.length);
const firstDiff = (() => {
  for (let i = 0; i < max; i += 1) {
    if (genLines[i] !== comLines[i]) return i;
  }
  return -1;
})();

if (firstDiff !== -1) {
  console.error(`  first diverging line: ${firstDiff + 1}`);
  console.error(`    committed: ${JSON.stringify(comLines[firstDiff])}`);
  console.error(`    generated: ${JSON.stringify(genLines[firstDiff])}`);
}

process.exit(1);
