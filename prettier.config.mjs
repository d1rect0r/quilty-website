/**
 * Prettier 3 config (flat, ESM). Tailwind v4 class sorting via the
 * official plugin — keeps utility class ordering canonical so diffs
 * stay clean.
 */
const config = {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  arrowParens: 'always',
  bracketSpacing: true,
  jsxSingleQuote: false,
  plugins: ['prettier-plugin-tailwindcss'],
  // Tailwind v4 requires explicit pointer to the CSS entry containing
  // the @theme block. Without this, prettier-plugin-tailwindcss silently
  // no-ops on class sorting (Round-5 TS reviewer cross-check).
  tailwindStylesheet: './apps/web/app/globals.css',
  tailwindFunctions: ['cn', 'clsx', 'twMerge'],
  // Per-file overrides for content + MDX where line lengths are author-
  // controlled and shouldn't be reformatted aggressively.
  overrides: [
    {
      files: '*.md',
      options: { proseWrap: 'preserve' },
    },
    {
      files: '*.mdx',
      options: { proseWrap: 'preserve' },
    },
  ],
};

export default config;
