/**
 * Tests for the custom Style Dictionary CSS format. The byte-identical
 * integration check lives in `byte-identical.test.ts`; this suite
 * covers the SMALL invariants that, if broken, cause downstream
 * verification failures with surface-level error messages.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import StyleDictionary from 'style-dictionary';
import {
  registerQuiltyTailwindV4Format,
  pathToVarName,
  refPathToVarName,
  emitGlobalsCss,
  FORMAT_NAME,
} from '../src/platforms/tailwind-v4-theme.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_GLOBS = [
  resolve(__dirname, '../tokens/primitives/**/*.tokens.json'),
  resolve(__dirname, '../tokens/semantic/**/*.tokens.json'),
];

async function buildCss(): Promise<string> {
  const sd = new StyleDictionary({
    log: { verbosity: 'silent' },
    source: SOURCE_GLOBS,
    platforms: {
      web: {
        transforms: ['name/kebab'],
        buildPath: 'dist/web/',
        files: [{ destination: 'globals-generated.css', format: FORMAT_NAME }],
      },
    },
  });
  const out = await sd.formatPlatform('web');
  expect(out).toHaveLength(1);
  const first = out[0];
  return typeof first?.output === 'string' ? first.output : '';
}

describe('tailwind-v4-theme helpers', () => {
  it('pathToVarName joins segments with hyphens prefixed by --', () => {
    expect(pathToVarName(['color', 'neutral', '50'])).toBe('--color-neutral-50');
    expect(pathToVarName(['spacing', 'page-x'])).toBe('--spacing-page-x');
  });

  it('refPathToVarName converts a DTCG dot-path ref into a CSS variable name', () => {
    expect(refPathToVarName('color.neutral.900')).toBe('--color-neutral-900');
    expect(refPathToVarName('color.bg.surface')).toBe('--color-bg-surface');
  });
});

describe('css/quilty-tailwind-v4-globals format', () => {
  beforeAll(() => {
    // Idempotent — safe to call before each test file; the function
    // itself guards against duplicate registration.
    registerQuiltyTailwindV4Format();
  });

  it('registerQuiltyTailwindV4Format is idempotent across repeated calls', () => {
    // The first beforeAll call registered the format; calling again
    // must not throw (the canonical Style Dictionary v5 behaviour
    // before the guard was added).
    expect(() => registerQuiltyTailwindV4Format()).not.toThrow();
    expect(() => registerQuiltyTailwindV4Format()).not.toThrow();
  });

  it('emits a string containing the @import + @theme directives + dark selector', async () => {
    const css = await buildCss();
    expect(css).toContain("@import 'tailwindcss';");
    expect(css).toContain('@theme {');
    expect(css).toContain("[data-theme='dark'] {");
    expect(css).toContain('--color-neutral-50: oklch(98.4% 0.003 247.86);');
    expect(css).toContain('--color-bg-surface: var(--color-neutral-50);');
  });

  it('preserves the literal "white" color keyword (does not normalise to #ffffff)', async () => {
    const css = await buildCss();
    expect(css).toContain('--color-bg-elevated: white;');
    expect(css).not.toContain('#ffffff');
  });

  it('emits dark-mode overrides with the SAME CSS variable names as light (cascade-only)', async () => {
    const css = await buildCss();
    // The dark.color.bg.surface DTCG path emits as --color-bg-surface,
    // NOT --dark-color-bg-surface, so the cascade override works.
    expect(css).toMatch(
      /\[data-theme='dark'\] \{[\s\S]*--color-bg-surface: var\(--color-neutral-950\);/,
    );
    expect(css).not.toMatch(/--dark-color-bg-surface/);
  });

  it('throws a legible error when emitGlobalsCss receives a dictionary missing a required path', () => {
    // Empty dictionary -> every `get()` call should surface the
    // canonical "token missing: <path>" diagnostic, not an undefined-
    // value emission that silently passes byte-identical until the
    // test snapshots are refreshed.
    const emptyDictionary = { allTokens: [] };
    expect(() => emitGlobalsCss(emptyDictionary)).toThrow(/token missing: color\.neutral\.50/);
  });
});
