#!/usr/bin/env node
/**
 * verify-css-diff.mjs — drift guard.
 *
 * After the adoption commit per ADR-0020 Decision G step 2,
 * `apps/web/app/globals.css` is a one-line `@import` shim. The
 * canonical CSS lives at
 * `packages/tokens/dist/web/globals-generated.css` (committed to the
 * repo so fresh checkouts can resolve the import without first
 * running the tokens build).
 *
 * This script regenerates the CSS via Style Dictionary and exits
 * non-zero if the output differs from the committed dist file —
 * catching the failure mode where a JSON source was edited without
 * re-running `pnpm --filter @quilty/tokens build`.
 *
 * The in-process equivalent runs in
 * `packages/tokens/__tests__/byte-identical.test.ts`; this script
 * exists for terminal-driven workflows (a developer running
 * `pnpm verify` locally before pushing).
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, '..');

const COMMITTED = resolve(packageRoot, 'dist/web/globals-generated.css');

// Rebuild fresh into a temp buffer for the diff. We don't shell out
// to `node src/style-dictionary.config.mjs` because that would
// overwrite the committed file before the comparison.
const { registerQuiltyTailwindV4Format, FORMAT_NAME } = await import(
  resolve(packageRoot, 'src/platforms/tailwind-v4-theme.mjs')
);
const StyleDictionary = (await import('style-dictionary')).default;

registerQuiltyTailwindV4Format();
const sd = new StyleDictionary({
  log: { verbosity: 'silent' },
  source: [
    resolve(packageRoot, 'tokens/primitives/**/*.tokens.json'),
    resolve(packageRoot, 'tokens/semantic/**/*.tokens.json'),
  ],
  platforms: {
    web: {
      transforms: ['name/kebab'],
      buildPath: 'dist/web/',
      files: [{ destination: 'globals-generated.css', format: FORMAT_NAME }],
    },
  },
});

const platformOut = await sd.formatPlatform('web');
const first = platformOut[0];
const generated = typeof first?.output === 'string' ? first.output : '';

let committed;
try {
  committed = await readFile(COMMITTED, 'utf8');
} catch (err) {
  if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
    console.error(`verify-css-diff: committed dist file is missing at ${COMMITTED}`);
    console.error('  fix: pnpm --filter @quilty/tokens build  (then stage + commit the file)');
    process.exit(2);
  }
  throw err;
}

if (generated === committed) {
  console.log('verify-css-diff: byte-identical ✓');
  process.exit(0);
}

console.error('verify-css-diff: DRIFT — JSON sources do not regenerate the committed dist file');
console.error(`  committed: ${COMMITTED} (${committed.length} bytes)`);
console.error(`  fresh build: ${generated.length} bytes`);

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
  console.error(`    committed:  ${JSON.stringify(comLines[firstDiff])}`);
  console.error(`    fresh build: ${JSON.stringify(genLines[firstDiff])}`);
}

console.error('  fix: pnpm --filter @quilty/tokens build  (and stage the updated dist file)');

process.exit(1);
