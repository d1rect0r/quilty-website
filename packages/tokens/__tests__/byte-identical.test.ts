/**
 * Byte-identical integration check.
 *
 * Runs the Style Dictionary build in-process against the JSON sources,
 * then asserts the emitted CSS matches `apps/web/app/globals.css`
 * byte-for-byte. This is the canonical migration guard for the
 * tokens-lift commit and the source-vs-committed drift check after
 * adoption (per ADR-0020 Decision G).
 *
 * Co-locating the check with the unit test suite means `pnpm verify`
 * exercises it without a bespoke CI step — the test fails the same
 * way a unit-test failure would, with a clear actionable diff.
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import StyleDictionary from 'style-dictionary';
import { registerQuiltyTailwindV4Format } from '../src/platforms/tailwind-v4-theme.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const COMMITTED_GLOBALS = resolve(repoRoot, 'apps/web/app/globals.css');

describe('byte-identical migration guard', () => {
  it('generated CSS matches apps/web/app/globals.css byte-for-byte', async () => {
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
          files: [
            {
              destination: 'globals-generated.css',
              format: 'css/quilty-tailwind-v4-globals',
            },
          ],
        },
      },
    });
    const platformOut = await sd.formatPlatform('web');
    const first = platformOut[0];
    const generated = typeof first?.output === 'string' ? first.output : '';
    const committed = await readFile(COMMITTED_GLOBALS, 'utf8');
    expect(generated).toBe(committed);
  });
});
