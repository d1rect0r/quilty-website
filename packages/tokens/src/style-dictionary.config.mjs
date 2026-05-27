import StyleDictionary from 'style-dictionary';
import { registerQuiltyTailwindV4Format } from './platforms/tailwind-v4-theme.mjs';

/**
 * Style Dictionary v5 build for @quilty/tokens.
 *
 * Authoritative format is DTCG 2025.10 JSON (tokens/**.tokens.json).
 * Custom format `css/quilty-tailwind-v4-globals` emits a single CSS
 * file matching the current apps/web/app/globals.css byte-for-byte
 * during the lift commit, verified by scripts/verify-css-diff.mjs.
 *
 * After adoption (the next commit in the migration sequence per
 * ADR-0020), apps/web imports `@quilty/tokens/dist/web/globals-generated.css`
 * directly; the byte-identical bar relaxes to "functional equivalence"
 * since the generated file becomes the canonical source.
 *
 * Why a hand-rolled CSS format instead of `css/variables` + the
 * built-in `transformGroup: 'css'`: Tailwind v4's `@theme { }` block
 * requires the variable declarations to be wrapped inside a Tailwind
 * directive, not a `:root` selector, so the default CSS format would
 * emit a structurally different file. The custom format below handles
 * `@theme`, `[data-theme='dark']`, and the inline base-reset block in
 * one pass.
 */

registerQuiltyTailwindV4Format();

const config = {
  log: {
    verbosity: 'silent',
    warnings: 'warn',
    errors: { brokenReferences: 'throw' },
  },
  source: ['tokens/primitives/**/*.tokens.json', 'tokens/semantic/**/*.tokens.json'],
  platforms: {
    'tailwind-v4-globals': {
      // We deliberately AVOID `transformGroup: 'css'` — that group's
      // `color/css` transform normalises CSS color keywords (e.g.,
      // `white` → `#ffffff`), which breaks byte-identical parity with
      // the source globals.css that keeps semantic literals like
      // `white` verbatim. We only need `name/kebab` to generate
      // `color-neutral-50` from `['color','neutral','50']`.
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
};

const sd = new StyleDictionary(config);
await sd.buildAllPlatforms();
