/**
 * Drift guard for the committed generated CSS.
 *
 * After the adoption commit per ADR-0020 Decision G step 2,
 * `apps/web/app/globals.css` is a one-line `@import` shim and the
 * canonical CSS lives at
 * `packages/tokens/dist/web/globals-generated.css` (committed to the
 * repo so fresh checkouts can resolve the import without first running
 * the tokens build).
 *
 * This test rebuilds the CSS in-process from the JSON sources, then
 * asserts the result matches the committed dist file byte-for-byte.
 * The failure mode is a PR that changed a JSON source value without
 * re-running `pnpm --filter @quilty/tokens build` — caught at CI test
 * time rather than at apps/web build time (which would surface as a
 * subtle visual regression).
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import StyleDictionary from 'style-dictionary';
import {
  registerQuiltyTailwindV4Format,
  FORMAT_NAME,
} from '../src/platforms/tailwind-v4-theme.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMITTED_DIST = resolve(__dirname, '../dist/web/globals-generated.css');

describe('byte-identical drift guard (JSON sources -> committed dist)', () => {
  it('regenerating CSS from JSON sources yields the committed dist file', async () => {
    registerQuiltyTailwindV4Format();
    const sd = new StyleDictionary({
      log: { verbosity: 'silent' },
      source: [
        resolve(__dirname, '../tokens/primitives/**/*.tokens.json'),
        resolve(__dirname, '../tokens/semantic/**/*.tokens.json'),
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
    const committed = await readFile(COMMITTED_DIST, 'utf8');
    expect(generated).toBe(committed);
  });
});
